# Cobat Risk Engine

Real-time AML transaction risk assessment API for third-party integrators.

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Hono 4 |
| Runtime | Node 24+, tsx |
| Database | MongoDB 7+ via Mongoose |
| Validation | Zod + @hono/zod-validator |
| Logger | Pino (pretty in dev, JSON in prod) |
| Auth | API key via Bearer / x-api-key |
| Slack | @slack/web-api |
| Lint | Biome |
| Hooks | Husky + commitlint |

## Getting Started

```bash
cp .env-example .env.local
# edit .env.local with your values
npm install
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Type-check + compile |
| `npm run start` | Run compiled output |
| `npm run lint` | Biome check |
| `npm run lint:fix` | Biome auto-fix |
| `npm run format` | Biome format |
| `npm run commitlint` | Lint last commit message |

## Commit Convention

Conventional Commits — enforced by husky + commitlint.

```
feat: add risk assessment endpoint
fix: resolve circular transaction false positive
chore: update dependencies
docs: add api examples
refactor: extract scorer module
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `ci`, `perf`, `revert`

## API

All routes prefixed with `/api`.

### Auth

Protected routes require `Authorization: Bearer <APP_API_KEY>` or `x-api-key` header.

### Endpoints

#### `GET /api/health`

Health check — no auth required.

```json
{ "success": true, "data": { "status": "ok", "uptime": 123, "timestamp": "..." } }
```

#### `POST /api/v1/risk/assess`

Assess a transaction for AML risk.

```json
{
  "userRef": "usr_abc123",
  "walletId": "0xdead...",
  "amount": 15000000,
  "currency": "EUR",
  "transactionType": "TRANSFER",
  "counterpartyRef": "0xbeef..."
}
```

Response:

```json
{
  "success": true,
  "data": {
    "assessId": "risk_01JV...",
    "allow": false,
    "riskLevel": "high",
    "score": 65,
    "triggeredRules": ["VELOCITY_SPIKE", "SIZE_DEVIATION"]
  }
}
```

### Validation Errors

```json
{
  "success": false,
  "message": "Validation failed",
  "error": { "code": "BAD_REQUEST", "details": [...] }
}
```

## Architecture

```
src/
├── server.ts                  # Entry point — connects DB, starts HTTP
├── app.ts                     # Hono app — middleware stack
├── config/
│   ├── env.ts                 # Zod-validated env vars
│   └── risk.ts                # All risk thresholds + weights
├── types/
│   ├── api.types.ts           # Response envelopes, error codes
│   └── risk.ts                # Enums + interfaces for risk domain
├── database/
│   ├── index.ts               # initDb(), closeDb()
│   └── primary/
│       ├── connection.ts      # Mongoose connection singleton
│       └── models/
│           ├── user.ts
│           ├── risk-profile.ts # Collection: risk_profiles
│           └── risk-ledger.ts  # Collection: risk_ledger (append-only)
├── middleware/
│   ├── request-id.ts          # X-Request-Id generation
│   ├── request-logger.ts      # Request/response logging + sanitize
│   ├── auth.ts                # API key validation
│   └── error-handler.ts       # Global error handler
├── routes/
│   ├── index.ts               # Version router
│   └── v1/
│       ├── risk.ts            # POST /v1/risk/assess
│       └── protected.ts       # Auth-gated sample routes
├── services/
│   ├── slack.ts               # Slack notification sender
│   ├── email.ts               # Email sender via multipart API
│   └── risk/
│       ├── index.ts           # assessTransaction() orchestrator
│       ├── scorer.ts          # Score → risk level → allow
│       └── rules/
│           ├── index.ts       # Parallel rule execution
│           ├── velocity-spike.ts
│           ├── transaction-frequency.ts
│           ├── circular-transaction.ts
│           ├── size-deviation.ts
│           ├── sanction-exposure.ts
│           ├── cross-border-anomaly.ts
│           ├── wallet-clustering.ts
│           └── market-event-risk.ts
└── utils/
    ├── logger.ts              # Pino instance
    ├── response.ts            # success(), error(), badRequest(), etc.
    ├── trace.ts               # AsyncLocalStorage request context
    └── sanitize.ts            # Secret redaction for logs
```

## Risk Engine

### Flow

```
Request → validation → load profile → run 8 rules (parallel) → score → persist ledger → update profile → notify
```

### Scoring

| Alert Level | Points |
|-------------|--------|
| Medium | 10 |
| High | 25 |
| Critical | 40 |

Capped at 100.

| Score | Risk Level | Decision |
|-------|------------|----------|
| 0–25 | Low | Allow |
| 26–50 | Medium | Allow |
| 51–80 | High | Block |
| 81–100 | Critical | Block |

All thresholds live in `src/config/risk.ts` — no magic numbers in rules.

### Rules

| Rule | Trigger |
|------|---------|
| VELOCITY_SPIKE | Amount >= 3x 30-day average or > EUR 250K |
| TRANSACTION_FREQUENCY | >= 10 tx in 10m or >= 30 tx in 1h |
| CIRCULAR_TRANSACTION | >= 3 cycles returning to origin wallet in 48h |
| SIZE_DEVIATION | Amount > 2x declared size or new account + > EUR 100K |
| SANCTION_EXPOSURE | Wallet or counterparty on blacklist |
| CROSS_BORDER_ANOMALY | >= 5 cross-border tx in 24h + volume spike > 150% |
| WALLET_CLUSTERING | >= 3 distinct wallets linked |
| MARKET_EVENT_RISK | > EUR 100K + market event in 24h window |

## Database

### risk_profiles

One document per userRef, upserted on every assess call.

```json
{
  "userRef": "usr_abc",
  "walletIds": ["0xdead..."],
  "status": "active",
  "riskTier": "low",
  "thirtyDayAverage": 500000,
  "totalAssessments": 42,
  "lastAssessedAt": "..."
}
```

### risk_ledger

Append-only, one document per assess call, never mutated.

```json
{
  "assessId": "risk_01JV...",
  "userRef": "usr_abc",
  "score": 65,
  "riskLevel": "high",
  "allow": false,
  "triggeredRules": ["VELOCITY_SPIKE"],
  "ruleResults": [...],
  "createdAt": "..."
}
```

## Notifications

When rules trigger, Slack + email sent to `#risk-alerts` / `risk-team@company.com`.

**Slack:**

```
✅ Risk Assessment #1a2b3c4d

User: usr_abc123
Risk Level: HIGH
Score: 65/100
Decision: Blocked

Triggered Rules: VELOCITY_SPIKE, SIZE_DEVIATION
```

**Email:**

```
Subject: [HIGH] Risk Assessment — risk_01JV...

Risk Assessment Result
═══════════════════════

Assessment ID: risk_01JV...
User:          usr_abc123
Risk Level:    HIGH
Score:         65/100
Decision:      Blocked

Triggered Rules: VELOCITY_SPIKE, SIZE_DEVIATION
---
Cobat Risk Engine
```

## Env Vars

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | development / staging / production |
| `HTTP_PORT` | Server port |
| `HTTP_HOST` | Server host |
| `SLACK_BOT_TOKEN` | Slack bot token |
| `EMAIL_API_URL` | Email service endpoint |
| `EMAIL_API_KEY` | Email service API key |
| `MONGODB_URI` | MongoDB connection string |
| `APP_API_KEY` | API authentication key |

## Type Safety

- TypeScript strict mode
- Zod schemas at every integration boundary (env, request, response)
- Enums instead of string unions across risk domain
- Zero `any` types, zero `as` casts, zero `@ts-ignore`
- Biome enforces no-explicit-any
