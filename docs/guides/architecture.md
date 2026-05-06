# Architecture

## Request Lifecycle

```
HTTP Request
  │
  ▼
requestId middleware        ← generates/reads X-Request-Id
  │                          ← wraps in AsyncLocalStorage trace context
  ▼
requestLogger middleware    ← logs method, path, query, body (sanitized)
  │
  ▼
route handler               ← auth middleware for protected routes
  │                          ← zValidator for payload validation
  ▼
service / orchestrator       ← business logic
  │
  ▼
response helper              ← success() / error() → structured JSON
  │
  ▼
HTTP Response
```

## Risk Engine Pipeline

```
assessTransaction(req)
  │
  ├── fetchOrCreateProfile()   ← RiskProfile.findOne or create
  │
  ├── evaluateAllRules(ctx)    ← Promise.allSettled, rules per type
  │     │
  │     │  DEPOSIT rules ──────────────────────────────────┐
  │     │    velocity-spike ──────────────────────────────┤
  │     │    high-frequency ──────────────────────────────┤
  │     │    size-exceed ─────────────────────────────────┤
  │     │    sanctioned-wallet ───────────────────────────┤
  │     │    cross-border-surge ──────────────────────────┤
  │     │    wallet-cluster ──────────────────────────────┤
  │     │                                                  │
  │     │  BUY_CRYPTO adds: market-event                  │
  │     │  WITHDRAW_CRYPTO: same 5 rules as DEPOSIT       │
  │     │                                                  │
  │     └── all settled ────────────────────────────────────┘
  │
  ├── computeScore()           ← weighted sum, cap 100
  ├── scoreToRiskLevel()       ← 0-25 low · 26-50 medium · 51-80 high · 81-100 critical
  ├── RiskLedger.create()      ← append-only immutable record
  ├── updateProfileAsync()     ← fire-and-forget, logs on error
  └── dispatchNotifications()  ← Slack + Email in parallel (if rules triggered)
```

## Key Patterns

### Layer Separation

```
routes/     → HTTP concerns only (parse, validate, respond)
services/   → business logic (pure functions, no HTTP)
database/   → data access (Mongoose models)
middleware/  → cross-cutting concerns (auth, logging)
```

### Rule Registry — Reverse Config

Rules are configured in two structures in `services/risk/rules/index.ts`:

```
RULE_MAP       RuleName → function     (register new rule implementations here)
RULES_BY_TYPE  TransactionType → RuleName[]  (configure which rules run per type)
```

TypeScript's `Record<TransactionType, RuleName[]>` and `Record<RuleName, RuleFn>` enforce exhaustiveness — all types and all rules must be covered at compile time.

### Error Handling

- Validation errors → `badRequest()` → 400 with Zod issues in `error.details`
- Auth errors → `unauthorized()` → 401
- Unhandled errors → `errorHandler` middleware → 500 with logged stack
- Rule failures → `Promise.allSettled` catches, returns safe non-triggered default

### Database

- Models register on the connection at module load time
- `risk_ledger` is append-only — never update or delete
- Profile updates are fire-and-forget (`updateProfileAsync`) — logged on error
- Collection names explicitly set (not auto-pluralized)

### Logging

- Structured JSON via Pino
- Every request gets a unique `requestId` (X-Request-Id)
- Trace context via AsyncLocalStorage — available anywhere in the call chain
- Secrets redacted via `sanitize()` before logging
- Dev: pino-pretty with colorized output
- Prod: JSON lines for log aggregation
