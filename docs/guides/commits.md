# Commits

## Format

Every commit message must follow the Conventional Commits format:

```
<type>: <lowercase subject>

[optional body]
```

## Types

| Type | When to Use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Maintenance, deps, tooling |
| `docs` | Documentation only |
| `refactor` | Code change with no behavior change |
| `test` | Adding or fixing tests |
| `style` | Formatting, lint, whitespace |
| `ci` | CI/CD changes |
| `perf` | Performance improvement |
| `revert` | Revert a previous commit |

## Rules

- Subject must be lowercase
- Max 72 characters
- No period at end
- Use imperative mood ("add" not "added")

## Examples

```
feat: add velocity spike rule
fix: handle empty counterparty in circular check
chore: upgrade mongoose to 9.x
docs: add api examples to readme
refactor: extract scoring into separate module
test: add sanction exposure rule tests
```

## Enforcement

Commit messages are linted by commitlint via a husky `commit-msg` hook. Non-compliant messages are rejected.

```bash
npm run commitlint   # lint the last commit message
```
