# AGENTS.md

## Commands

```bash
npm run dev        # tsx --watch --env-file=.env.local src/server.ts
npm run build      # tsc && tsc-alias
npm run lint       # biome check src/
npm run lint:fix   # biome check --write src/
npm run format     # biome format --write src/
```

No test framework installed.

## Framework & Config

- **Hono 4** with `@hono/node-server` — no express, no fastify
- **tsx** for dev — no bundler needed, direct TS execution
- **tsconfig**: `module: "esnext"`, `moduleResolution: "bundler"` — no `.js` in imports
- **Path alias**: `@app/*` → `./src/*` — resolved by `tsc-alias` at build, not at dev runtime
- **Biome**: `noExplicitAny` is error, `noUnusedVariables` is error, double quotes, semicolons always, trailing commas all
- **Husky** runs `biome check --write` on pre-commit, `commitlint` on commit-msg
- Requires **Node >= 24**

## Type Rules

- Zero `any` — use `unknown`, branded types, or generics
- Zero `@ts-ignore`, `@ts-expect-error`, `as any`
- **Enums everywhere** in risk domain — never string literals. Use `RiskLevel.HIGH`, `AlertLevel.CRITICAL`, `RuleName.VELOCITY_SPIKE`, `TransactionType.DEPOSIT`, `ProfileStatus.ACTIVE`
- Zod schemas at all integration boundaries (env, request, response)

## Response Format

Success: `{ success: true, message: string, data: T }`
Error: `{ success: false, message: string, error: { code: string, details?: unknown } }`

Helpers from `src/utils/response.ts`:
```ts
success(c, data)          // 200
created(c, data)          // 201
error(c, msg, code)       // 500
badRequest(c, msg, det.)  // 400
notFound(c, msg)          // 404
unauthorized(c)           // 401
forbidden(c)              // 403
```

## Architecture

```
src/server.ts  →  src/app.ts (Hono app)  →  routes/v1/  →  services/  →  database/primary/models/
```

- **Database models** register on `conn` at module load time (no init functions). Import `conn` from `../connection` and call `conn.model()` directly.
- **Risk rule modules**: each exports exactly one async `(ctx: RuleContext) => Promise<RuleResult>` function. Import thresholds from `config/risk.ts` — zero magic numbers.
- **Rules run** in `Promise.allSettled` via `services/risk/rules/index.ts`. Failed rules return safe defaults.
- **risk_ledger** is append-only — never update or delete documents.
- **Profile updates** are fire-and-forget (non-blocking, caught errors ignored).
- **All monetary values** in minor units (pence/cents) — no floats.

## Key Imports

```ts
import { zValidator } from "@hono/zod-validator";  // not custom wrapper
import { success, badRequest } from "../../utils/response";
import { logger } from "../../utils/logger";
import { getTrace } from "../../utils/trace";       // requestId in logs
import { sanitize } from "../../utils/sanitize";    // redact secrets
```

Validation pattern:
```ts
router.post("/", zValidator("json", schema, (r, c) => {
  if (!r.success) return badRequest(c, "Validation failed", r.error.issues);
}), handler);
```

Every log call includes `requestId` from `getTrace()`: `logger.info({ requestId, ... }, "message")`.

## Notifications

Slack + email sent when `triggeredRules.length > 0`. Human-readable format with emoji (Slack) and aligned columns (email).

## Auth

Protected routes use `Authorization: Bearer <APP_API_KEY>` or `x-api-key` header. Validate against `EnvConfig.APP_API_KEY`.

## Env

```
.env.local (ignored by git)
```
Required vars: `NODE_ENV`, `HTTP_PORT`, `HTTP_HOST`, `SLACK_BOT_TOKEN`, `EMAIL_API_URL`, `EMAIL_API_KEY`, `MONGODB_URI`, `APP_API_KEY`.
