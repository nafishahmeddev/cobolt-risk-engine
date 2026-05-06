# Risk Engine

## Overview

The risk engine evaluates every transaction against up to 8 independent AML rules, computes a cumulative score, and returns an allow/block decision.

Which rules run depends on the transaction type — configured via a reverse lookup in `services/risk/rules/index.ts`.

## Assessment Flow

```
┌─────────────────────────────────────────────────────────┐
│                    assessTransaction()                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Validate request payload (Zod, route layer)         │
│                                                         │
│  2. fetchOrCreateProfile()                              │
│     └── RiskProfile.findOne({ userRef })                │
│         ├── found → return existing                     │
│         └── not found → create new profile              │
│               status: active, riskTier: low             │
│                                                         │
│  3. evaluateAllRules(ctx)  ── Promise.allSettled ──┐    │
│     ┌──────────────────────────────────────────────┘    │
│     │                                                   │
│     │  VELOCITY_SPIKE       ● ──┐                       │
│     │  HIGH_FREQUENCY       ● ──┤                       │
│     │  SIZE_EXCEED          ● ──┤── parallel             │
│     │  SANCTIONED_WALLET    ● ──┤                       │
│     │  CROSS_BORDER_SURGE   ● ──┤  (DEPOSIT only)       │
│     │  WALLET_CLUSTER       ● ──┤                       │
│     │  MARKET_EVENT         ● ──┘  (BUY_CRYPTO only)    │
│     │                                                   │
│     └── failed rules → safe default (not triggered)     │
│                                                         │
│  4. computeScore()                                      │
│     └── sum triggered weights, cap at 100               │
│                                                         │
│  5. scoreToRiskLevel()                                  │
│     └── score → risk level band                         │
│                                                         │
│  6. allowTransaction()                                  │
│     └── low/medium → true, high/critical → false        │
│                                                         │
│  7. RiskLedger.create()  (append-only, never mutate)    │
│                                                         │
│  8. updateProfileAsync()  (fire-and-forget)             │
│     └── EWMA rolling average, wallet list, riskTier     │
│                                                         │
│  9. dispatchNotifications()  (if any rules triggered)   │
│     └── Slack (#risk-alerts) + Email (risk-team)        │
│                                                         │
│ 10. Return { assessId, allow, riskLevel, score, rules } │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Rules per Transaction Type

| Rule | DEPOSIT | BUY_CRYPTO | WITHDRAW_CRYPTO |
|---|:---:|:---:|:---:|
| VELOCITY_SPIKE | ✓ | ✓ | ✓ |
| HIGH_FREQUENCY | ✓ | ✓ | ✓ |
| SIZE_EXCEED | ✓ | ✓ | ✓ |
| SANCTIONED_WALLET | ✓ | ✓ | ✓ |
| WALLET_CLUSTER | ✓ | ✓ | ✓ |
| CROSS_BORDER_SURGE | ✓ | | |
| MARKET_EVENT | | ✓ | |

Configured in `RULES_BY_TYPE` inside `services/risk/rules/index.ts`. TypeScript's `Record<TransactionType, RuleName[]>` enforces all types are covered.

---

## Scoring

### Point Weights

| Alert Level | Points |
|-------------|--------|
| MEDIUM | 10 |
| HIGH | 25 |
| CRITICAL | 40 |

Cumulative score is capped at **100**.

### Risk Bands

| Score Range | Risk Level | Decision |
|-------------|------------|----------|
| 0–25 | low | Allow |
| 26–50 | medium | Allow |
| 51–80 | high | Block |
| 81–100 | critical | Block |

---

## AML Rules

All applicable rules run in parallel via `Promise.allSettled`. Each rule receives the transaction context and a snapshot of the user's risk profile.

### 1. VELOCITY_SPIKE

**Detects:** Transaction amount far exceeding user's typical pattern.

**Logic:**
- Amount > EUR 250,000 (25,000,000 minor units) → **HIGH** (25 pts)
- Amount ≥ 300% of 30-day rolling average → **MEDIUM** (10 pts)

First transaction (no 30-day average yet) does not trigger.

| Constant | Value |
|---|---|
| `ABSOLUTE_THRESHOLD` | 25,000,000 (EUR 250k) |
| `THIRTY_DAY_MULTIPLIER` | 3 |

---

### 2. HIGH_FREQUENCY

**Detects:** Rapid transaction bursts from the same user.

**Logic:**
- ≥ 10 transactions in 10 minutes → **MEDIUM** (10 pts)
- ≥ 30 transactions in 1 hour → **MEDIUM** (10 pts)

Counts queried live from `risk_ledger` by `userRef`.

| Constant | Value |
|---|---|
| `TEN_MIN_LIMIT` | 10 |
| `ONE_HOUR_LIMIT` | 30 |

---

### 3. SIZE_EXCEED

**Detects:** Transaction outside the user's declared size profile or large amounts from new accounts.

**Logic:**
- Account age < 30 days AND amount > EUR 100,000 → **HIGH** (25 pts)
- Amount > 200% of `declaredTransactionSize` (if set) → **HIGH** (25 pts)

| Constant | Value |
|---|---|
| `NEW_ACCOUNT_DAYS` | 30 |
| `NEW_ACCOUNT_THRESHOLD` | 10,000,000 (EUR 100k) |
| `DECLARED_MULTIPLIER` | 2 |

---

### 4. SANCTIONED_WALLET

**Detects:** Any interaction with a sanctioned or blacklisted address.

**Logic:**
- Checks `walletId`, `counterpartyRef` (if set), and `toWalletId` (if set)
- Any match → **CRITICAL** (40 pts)

**Stub:** Currently returns `false`. Integrate with OFAC/Chainalysis/Elliptic in production.

---

### 5. CROSS_BORDER_SURGE

**Detects:** Anomalous spike in cross-border transaction volume.

**Applies to:** `DEPOSIT`

**Logic:**
- `crossBorderCount24h` < 5 → not triggered
- Estimated volume (`amount × crossBorderCount24h`) > 150% of `crossBorderBaseline` → **MEDIUM** (10 pts)

| Constant | Value |
|---|---|
| `MIN_COUNT_24H` | 5 |
| `VOLUME_SURGE_RATIO` | 1.5 |

---

### 6. WALLET_CLUSTER

**Detects:** Multiple wallets linked to the same user — Sybil / coordinated wallet patterns.

**Logic:**
- `profile.walletIds.length` ≥ 3 → **HIGH** (25 pts)

| Constant | Value |
|---|---|
| `MIN_WALLETS` | 3 |

---

### 7. MARKET_EVENT

**Detects:** Large transaction immediately before a known market-moving event.

**Applies to:** `BUY_CRYPTO`

**Logic:**
- Amount ≤ EUR 100,000 → not triggered
- Amount > EUR 100,000 AND market event exists within 24h for `currency` → **HIGH** (25 pts)

**Stub:** `checkMarketEvent()` currently returns `false`. Integrate with market events feed in production.

| Constant | Value |
|---|---|
| `LARGE_TX_THRESHOLD` | 10,000,000 (EUR 100k) |

---

## Risk Profile

Stored in `risk_profiles` collection. One document per `userRef`.

| Field | Type | Description |
|---|---|---|
| `userRef` | string | Unique user identifier (indexed) |
| `walletIds` | string[] | All wallets linked to this user |
| `status` | enum | `active`, `flagged`, `blocked` |
| `riskTier` | enum | `low`, `medium`, `high`, `critical` |
| `onboardedAt` | Date | When user first appeared |
| `declaredTransactionSize` | number | Expected tx size (set externally) |
| `thirtyDayAverage` | number | EWMA of transaction amounts |
| `crossBorderBaseline` | number | Baseline cross-border volume |
| `crossBorderCount24h` | number | Cross-border transactions in last 24h |
| `totalAssessments` | number | Lifetime assessment count |
| `lastAssessedAt` | Date | Most recent assessment timestamp |

### Rolling Average (EWMA)

```
newAverage = oldAverage × 0.97 + amount × 0.03
```

Initialized to the first transaction amount. Updated asynchronously after each assessment via `updateProfileAsync()` (fire-and-forget, logged on error).

---

## Risk Ledger

Stored in `risk_ledger` collection. **Append-only** — never updated or deleted.

| Field | Type | Description |
|---|---|---|
| `assessId` | string | Unique ID (`risk_` prefix) |
| `userRef` | string | User identifier (indexed) |
| `walletId` | string | Source wallet |
| `counterpartyRef` | string | Optional counterparty |
| `chain` | string | Blockchain (crypto types) |
| `toWalletId` | string | Destination wallet (crypto types) |
| `amount` | number | Amount in minor units |
| `currency` | string | ISO 4217 code |
| `transactionType` | string | `DEPOSIT`, `BUY_CRYPTO`, `WITHDRAW_CRYPTO` |
| `score` | number | Cumulative risk score 0–100 |
| `riskLevel` | enum | `low`, `medium`, `high`, `critical` |
| `allow` | boolean | Assessment decision |
| `triggeredRules` | string[] | Names of triggered rules |
| `ruleResults` | array | Full result per rule (rule, triggered, alertLevel, detail) |
| `createdAt` | Date | Assessment timestamp (indexed) |

---

## Notifications

Sent concurrently via `dispatchNotifications()` using `Promise.allSettled` whenever at least one rule triggers.

**Slack (`#risk-alerts`):**

```
✅ Risk Assessment #1a2b3c4d
User: `usr_abc123`  Level: HIGH  Score: 65/100  Decision: Blocked
Rules: VELOCITY_SPIKE, SIZE_EXCEED
```

**Email (`risk-team@company.com`):**

```
Subject: [HIGH] Risk Assessment — risk_01JV...

Assessment ID : risk_01JV...
User          : usr_abc123
Risk Level    : HIGH
Score         : 65/100
Decision      : Blocked
Rules         : VELOCITY_SPIKE, SIZE_EXCEED
```

---

## Rule Execution Guarantees

- All applicable rules run in parallel via `Promise.allSettled`
- No rule depends on another rule's output
- A rule that throws returns a safe non-triggered default with the error in `detail`
- Each rule receives a profile snapshot taken at assessment start — mid-assessment changes are not visible
- All thresholds defined as named constants at the top of each rule file

## Audit Trail

Every assessment produces an immutable `risk_ledger` record containing the full transaction context, profile snapshot at time of assessment, individual results for all evaluated rules, the computed score, risk level, and decision. Complete audit trail for regulatory compliance.
