# Workflow

## Branching

```
main          ← production-ready, protected
  └── feat/*  ← new features
  └── fix/*   ← bug fixes
  └── chore/* ← maintenance, deps
```

```bash
git checkout -b feat/add-risk-endpoint
git checkout -b fix/circular-tx-bug
git checkout -b chore/upgrade-mongoose
```

## Development Loop

```bash
# 1. Start dev server
npm run dev

# 2. Make changes, server auto-reloads

# 3. Lint and type-check before committing
npm run lint
npm run build

# 4. Stage and commit
git add .
git commit -m "feat: add velocity spike rule"

# Commit hooks run automatically:
#   pre-commit  → biome check --write
#   commit-msg  → commitlint
```

## Commit Flow

```
git add .
git commit -m "feat: add risk assess endpoint"

  ▼ pre-commit hook
  biome check --write src/
  │
  ├── passes → continues
  └── fails  → commit aborted, fix issues

  ▼ commit-msg hook
  commitlint --edit
  │
  ├── passes → commit created
  └── fails  → message rejected, rewrite
```

## If Hooks Block You

```bash
# Skip hooks (only for emergencies)
git commit --no-verify -m "fix: wip"

# Fix a bad commit message
git commit --amend -m "fix: correct message"
```

## Before Pushing

```bash
# Final check
npm run build
npm run lint

# Push
git push origin feat/my-feature
```

## Pull Request

- Title follows commit convention: `feat: add risk assess endpoint`
- Description includes what and why
- Add `Closes #issue-number` if applicable
- Ensure build + lint pass in CI

## Code Review

- No `any` types
- No `@ts-ignore` or `@ts-expect-error`
- No magic numbers — define as named constants at the top of each rule file
- Every rule module exports exactly one async function
- All thresholds co-located with the rule that uses them
