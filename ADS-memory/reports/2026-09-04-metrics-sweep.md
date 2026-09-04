# Code metrics sweep — non-complexity metrics, 2026-09-04

STATUS: in progress

Dispatched task: run `development/scripts/code-metrics.py --skip complexity,cognitive_complexity,coverage`
across four first-party app scopes, one at a time, while five refactor agents share this
machine. Complexity/cognitive-complexity are already covered by the 2026-09-04 complexity
inventory (`ADS-memory/reports/2026-09-04-complexity-inventory.md` and
`ADS-memory/.local-artifacts/metrics/2026-09-04-complexity/`) and are not re-measured here.
Coverage is skipped because the on-disk lcov is 14+ days stale and known-corrupt.

Metrics this run actually produces (per scope): `duplication`, `type_safety`, `dead_code`,
`coupling`, `blast_radius`, `circular_dependencies`, `api_surface`, `churn`, `hotspots`
(expected UNAVAILABLE here — it needs the skipped `complexity` data), `change_coupling`.

## Machine-safety log

- Pre-start check: `node --import tsx --test` count = 0, no active test runner. Largest node
  RSS ~118MB (website dev server), nothing test-sized. Proceeded without waiting.
- (further waits/checks logged here per scope as they happen)

## Scope 1 — `apps/site-chat/src`

STATUS: pending

## Scope 2 — `packages/sdk/src`

STATUS: pending

## Scope 3 — `apps/admin/src`

STATUS: pending

## Scope 4 — `apps/website/src`

STATUS: pending

## Known-trap checklist (filled in as scopes complete)

1. `dead_code` / knip broken for `apps/website` (`--directory` needs a `package.json` that
   doesn't exist there) — TBD per scope.
2. knip true-positive rate ~15% even when it runs — treat all rows as hypotheses.
3. knip without `--directory` scans the whole repo — verify actual scope per run.
4. `drizzle*` exclusion glob (not just `drizzle`) must be in effect for duplication — TBD.
5. Vendored `node_modules` in `apps/website/src/features/theme/__tests__/fixtures/astro-bundler-probe/` — check duplication/type-safety output for third-party paths.
6. Churn/hotspot paths can be stale identities post-restructure — quote the script's own exclusion count, don't re-derive.

## Ranked actionable findings

TBD — filled in after all scopes complete.

## Metrics unavailable / untrustworthy

TBD.
