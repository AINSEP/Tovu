# Baseline — `src/server` + `src/assistant`, 2026-08-20

Scope chosen by the owner: gate these two areas, then drive them to 100%.
Measured at `81f88354` (+ one local commit `06c1d6cf` from a concurrent session).

## Complexity, at the hard 9/9 ceiling

Measured the same way `check-src-complexity-drift.ts` measures: ESLint with
`complexity` and `sonarjs/cognitive-complexity` hard-overridden to `error`/9,
tests/measurements excluded. **Cross-checked against the real gate — it reports
the identical 98 for routes, so the method matches.**

| area | violations | files | gated? |
|---|--:|--:|---|
| `src/server/routes` | 98 | 64 | YES — ratchet, baseline 105 |
| `src/server` (non-route) | 21 | — | **no** |
| `src/assistant` | 31 | — | **no** |
| **ungated total** | **52** | | |

### The gate is green *and* there are 98 violations. Both are true.

`check:src-complexity-drift` passes because it is a **ratchet**: it grandfathered the
105 violations that existed on 2026-08-17 into `development/scripts/src-complexity-debt.json`
and only fails on violation 106. 98 of the 105 still reproduce; **7 are stale and the gate
already prints them as deletable** — free ratchet tightening, no code change.

### Shape split of the 64 route files — most should NOT be refactored

```
30 files  FLAT WIRING  (cyclomatic high, cognitive 0)  -> long ?? / ?. chains; leave unless a table helps
 2 files  NESTED ONLY  (cognitive only)                -> extract functions
32 files  BOTH                                         -> real nesting; THIS is the work
```

Worst 8 by peak score:

| cyc | cog | file |
|--:|--:|---|
| 20 | 33 | `src/server/routes/admin/connectors/put-config.ts` |
| 26 | 20 | `src/server/routes/admin/media/update.ts` |
| 25 | 25 | `src/server/routes/admin/settings/register-definitions.ts` |
| 22 | 10 | `src/server/routes/admin/media/upload.ts` |
| 17 | 22 | `src/server/routes/admin/assistant/put-execution-credential.ts` |
| 20 | 18 | `src/server/routes/admin/settings/set.ts` |
| 19 | 16 | `src/server/routes/admin/newsletter/update-campaign.ts` |
| 18 | 16 | `src/server/routes/admin/settings/clear.ts` |

## Coverage

Run: `node --import tsx --test --test-concurrency=2 --experimental-test-coverage`
over `src/server/**/*.test.ts` + `src/assistant/**/*.test.ts`. Exit 0.
**Peak RSS 1.43 GB** (vs the 5.4 GB unbounded run that had to be killed — concurrency 2
is load-bearing, see `development/scripts/ci-local.sh`).

| area | files | line | branch | funcs | at 100% |
|---|--:|--:|--:|--:|--:|
| `src/server/routes` | 221 | 94.44% | 72.71% | 96.10% | 14/221 |
| `src/server` (non-route) | 82 | 94.94% | 85.06% | **77.65%** | 46/82 |
| `src/assistant` | 50 | 99.24% | 89.94% | 95.13% | 22/50 |
| **target (both, no routes)** | **132** | **96.84%** | **87.17%** | **83.02%** | **68/132** |

**`src/assistant` is nearly done** — 99.24% line, 95.13% funcs. Small lift to 100%.
**`src/server` non-route's weak axis is functions, 77.65%** — not lines.

### The single biggest hole

`src/server/http/site/render.ts` — 2305 lines, **124 uncovered functions**, 59.6% func
coverage. It alone is most of the non-route gap.

### METHOD WARNING — a scoped run UNDERSTATES coverage

Files in these areas are also exercised by tests living in other directories. Measured
directly on `render.ts`:

| test set run | line | branch | funcs |
|---|--:|--:|--:|
| `src/server/**` + `src/assistant/**` only | 82.4% | 81.8% | 59.6% |
| `src/features/theme/**` only | 82.5% | 59.7% | **20.1%** |

Neither set alone is the truth; the union is higher than either. **Do not set a gate
floor from a scoped run** — it will flag genuinely-tested code, which is exactly the
failure mode §6.4 of the 2026-08-20 handoff warned about. Capture the floor from a run
that includes every test that touches the area.

## Reusable machinery (do not build new scripts)

| need | already exists | change required |
|---|---|---|
| complexity ratchet | `development/scripts/check-src-complexity-drift.ts` | `const SCOPE = "src/server/routes"` → list of scopes |
| coverage floor | `development/scripts/check-route-coverage-floor.ts` | `FLOOR` + scope filter → per-area table |
| coverage ratchet | `development/scripts/check-route-coverage-diff.ts` | same |
| test-failure baseline | `development/scripts/check-test-baseline.ts` | already takes the baseline path as argv |
| segment ordering | `npm run triage:churn-hotspots` | none |

Also: `eslint.config.mjs` sets `complexity` and `sonarjs/cognitive-complexity` to
`warn`/15 repo-wide, which **cannot fail CI**. That is why the debt accumulated unseen.
