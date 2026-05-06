# Development

## Prerequisites

- Node >= 24
- MongoDB >= 7
- npm

## Setup

```bash
git clone <repo>
cd cobolt-risk-engine

cp .env-example .env.local
# edit .env.local with your values

npm install
npm run dev
```

## .env.local

```env
NODE_ENV=development
HTTP_PORT=3000
HTTP_HOST=0.0.0.0
SLACK_BOT_TOKEN=xoxb-your-token
EMAIL_API_URL=https://mailer.dcom.at/email
EMAIL_API_KEY=your-key
MONGODB_URI=mongodb://localhost:27017/cobolt-risk-engine
APP_API_KEY=sk-your-dev-key
```

## Commands

| Command | What It Does |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Type-check and compile to dist/ |
| `npm run start` | Run compiled output |
| `npm run lint` | Check lint and formatting |
| `npm run lint:fix` | Auto-fix lint and formatting |
| `npm run format` | Format all source files |

## Project Structure

```
src/
├── server.ts           # Entry point
├── app.ts              # Hono app + lifecycle
├── config/             # Zod env + risk thresholds
├── types/              # Shared TypeScript types + enums
├── database/           # MongoDB connections + models
├── middleware/         # Request ID, logging, auth, error handler
├── routes/            # API route handlers
├── services/          # Business logic (risk engine, slack, email)
└── utils/             # Logger, response helpers, trace, sanitize
```

## Adding a New Endpoint

1. Create a route file in `routes/v1/` or appropriate version
2. Define your Zod schema for validation
3. Use `zValidator` from `@hono/zod-validator`
4. Mount the router in `routes/v1/index.ts`

```ts
// routes/v1/example.ts
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { success } from "../../utils/response";
import { badRequest } from "../../utils/response";

const router = new Hono();

const schema = z.object({ name: z.string() });

router.post("/", zValidator("json", schema, (r, c) => {
  if (!r.success) return badRequest(c, "Validation failed", r.error.issues);
}), (c) => {
  const data = c.req.valid("json");
  return success(c, { message: `Hello ${data.name}` });
});

export { router };
```

```ts
// routes/v1/index.ts
router.route("/example", exampleRouter);
```

## Adding a New AML Rule

1. Add the rule name to `RuleName` enum in `src/types/risk.ts`
2. Create `services/risk/rules/my-rule.ts` — export one async function
3. Define all thresholds as named constants at the top of the file (no magic numbers inline)
4. Register in `services/risk/rules/index.ts`:
   - Add to `RULE_MAP` (name → function)
   - Add to the relevant `RULES_BY_TYPE` entries (which transaction types run this rule)

```ts
// services/risk/rules/my-rule.ts
import { AlertLevel, type RuleContext, RuleName, type RuleResult } from "../../../types/risk";

const MY_THRESHOLD = 10_000_000; // EUR 100,000 in minor units

export async function myRule(ctx: RuleContext): Promise<RuleResult> {
  if (ctx.amount > MY_THRESHOLD) {
    return { rule: RuleName.MY_RULE, triggered: true, alertLevel: AlertLevel.HIGH, detail: `Amount ${ctx.amount} exceeds threshold` };
  }
  return { rule: RuleName.MY_RULE, triggered: false, alertLevel: AlertLevel.HIGH, detail: "Within threshold" };
}
```

```ts
// services/risk/rules/index.ts — add to both maps
const RULE_MAP: Record<RuleName, RuleFn> = {
  // ...existing rules
  [RuleName.MY_RULE]: myRule,
};

const RULES_BY_TYPE: Record<TransactionType, RuleName[]> = {
  [TransactionType.DEPOSIT]: [...existingRules, RuleName.MY_RULE],
  // ...
};
```
