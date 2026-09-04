# 2026-09-04 — Full Cyclomatic + Cognitive Complexity Inventory (ESLint, threshold 0)

STATUS: measurement in progress

## Purpose

Machine-generated, uncensored complexity distribution for all first-party Tovu application
code, using ESLint's `complexity` (cyclomatic) and `sonarjs/cognitive-complexity` rules run at
threshold **0** (not 9) so every function's score is captured, not just gate breaches. No
manual function reading. No test execution.

## Method

```
npx eslint --no-error-on-unmatched-pattern \
  --ignore-pattern '**/__tests__/**' --ignore-pattern '**/__measurements__/**' \
  --rule '{"complexity":["error",0],"sonarjs/cognitive-complexity":["error",0]}' \
  -f json -o <OUTFILE> <SCOPE>
```

Raw JSON per scope: `ADS-memory/.local-artifacts/metrics/2026-09-04-complexity/<scope-slug>.json`
(gitignored). Reference gate script (not modified): `development/scripts/check-src-complexity-drift.ts`.

Rows are joined per-function on `(filePath, line)`, never `(filePath, message)` — see
`check-src-complexity-drift.ts`'s header on the `agent-tools.ts`-style duplicate-message hazard.

Repo's enforced ceiling: **9** (hard-error), scoped to `apps/admin/src/**` in `eslint.config.mjs`
plus the `check-src-complexity-drift.ts` gate for the listed `apps/website` subtrees. This
inventory is not scoped to the gate's coverage — it runs the nine scopes below regardless of
which gate (if any) currently covers them.

## Scopes

| # | Scope | Status |
|---|-------|--------|
| 1 | `apps/website/src/features` | pending |
| 2 | `apps/website/src/server` | pending |
| 3 | `apps/website/src/platform` | pending |
| 4 | `apps/website/src/assistant` | pending |
| 5 | `apps/website/src/contracts` | pending |
| 6 | `apps/website/src/cli` | pending |
| 7 | `apps/admin/src` | pending |
| 8 | `apps/site-chat/src` | pending |
| 9 | `packages/sdk/src` | pending |

## Full distribution per scope

(pending)

## Count over the gate (>=10, i.e. failing the enforced ceiling of 9)

(pending)

## Ranked refactor table (cognitive >= 10, desc, top 150; full set in JSON)

(pending)

## High-on-both subset (cyclomatic >= 10 AND cognitive >= 10)

(pending)

## REVIEW-SHAPE flags (mechanical heuristic only — not adjudicated by reading code)

(pending)

## Failures / gaps

(pending)
