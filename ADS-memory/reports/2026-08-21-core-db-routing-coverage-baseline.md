# Coverage Baseline: `src/core`, `src/db`, `src/routing`

Status: **scoped measurement complete, combined-lcov cross-check PENDING** (coordinator's full-repo lcov had not appeared at
`/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/22748abd-e462-4141-8cda-5b81c09e41b6/scratchpad/full-repo.lcov`
as of this commit). This document will be updated in place once it lands. Per the dispatch brief's
measurement traps, a scoped number can only ever *understate* true coverage — so every number below is a
floor, not a ceiling.

## Command used

```
cd /Users/la/Programming/Tovu && TEST_CONCURRENCY=2 node --import tsx --test \
  --experimental-test-coverage \
  --test-reporter=lcov --test-reporter-destination=<scratchpad>/coredb-scoped.lcov \
  --test-reporter=dot --test-reporter-destination=stdout \
  "src/core/**/*.test.ts" "src/db/**/*.test.ts" "src/routing/**/*.test.ts"
```

All tests in scope passed (dot reporter: clean run, no failures) before this report was written.

## Area totals (scoped lcov)

| Area | Files w/ any coverage record | Lines | Functions | Branches |
|---|---|---|---|---|
| `src/core` | 21 of 25 source files | 2805/2862 (98.01%) | 137/150 (91.33%) | 314/336 (93.45%) |
| `src/db` | 28 of 37 source files | 8479/8520 (99.52%) | 463/466 (99.36%) | 757/813 (93.11%) |
| `src/routing` | 1 of 4 source files | 424/427 (99.30%) | 23/23 (100.00%) | 52/55 (94.55%) |

**Headline: this is already a well-tested area.** No file in the scoped run reads anywhere near 0%. The gaps
are narrow — a handful of zero-hit functions and zero-hit branch arms per file, not whole untested modules
(with one exception under investigation: `src/core/commands/revert.ts` at 80% lines / 67% functions / 47%
branches, the worst file in the set).

## Files never instrumented by the scoped run (0 records — NOT necessarily 0% real coverage, trap #2)

These 16 files produced no lcov record when running only `src/core|db|routing/**/*.test.ts`. Six are
interfaces/types/config with no runtime logic (correctly un-instrumentable, not a gap). The rest are real
runtime code that must be checked against the combined lcov before any test is written for them — per the
dispatch brief, `seo/tool-registrations.ts` read 0% scoped vs 99.62% combined in a prior session.

| File | Why it's absent from scoped lcov |
|---|---|
| `src/core/entry-refs/ports.ts` | interfaces only, no runtime statements — not a gap |
| `src/core/entry-refs/types.ts` | types only, no runtime statements — not a gap |
| `src/core/gated-mutations/ports.ts` | interfaces/types only, no runtime statements — not a gap |
| `src/core/index.ts` | pure barrel re-export, no logic of its own — not a gap |
| `src/routing/ports.ts` | interface only, no runtime statements — not a gap |
| `src/routing/types.ts` | types only, no runtime statements — not a gap |
| `src/routing/index.ts` | pure barrel re-export, no logic of its own — not a gap |
| `src/db/drizzle.config.ts` | drizzle-kit CLI config object, executed only by `npm run db:generate`, never imported by app code |
| `src/db/drizzle.database-journal.config.ts` | same, sidecar journal db generator |
| `src/db/sqlite/analytics-sink.sqlite.ts` | real repo code, no dedicated unit test in scope — **needs combined check** |
| `src/db/sqlite/composio-connector-credential-repo.sqlite.ts` | real repo code, no dedicated unit test in scope — **needs combined check** |
| `src/db/sqlite/content-watermark-adapter.ts` | real repo code, no dedicated unit test in scope — **needs combined check** |
| `src/db/sqlite/custom-credential-repo.sqlite.ts` | real repo code, no dedicated unit test in scope — **needs combined check** |
| `src/db/sqlite/external-mcp-repo.sqlite.ts` | real repo code, no dedicated unit test in scope — **needs combined check** |
| `src/db/sqlite/media-repo.sqlite.ts` | real repo code, no dedicated unit test in scope — **needs combined check** |
| `src/db/sqlite/origin-repo.sqlite.ts` | has `origin-repo.sqlite.import-boundary.test.ts` in scope, but that test name suggests import-boundary assertions only, not behavior coverage — **needs combined check** |

## Per-file BEFORE table (scoped lcov, all 50 files with a coverage record)

Function/branch names below are read from lcov `FN`/`FNDA` names and `BRDA` zero-hit counts, per the
dispatch brief's rule against trusting tsx-instrumented `DA:` line numbers for source navigation.

| File | Lines | Functions | Branches | Zero-hit functions | Zero-hit branch lines (lcov line:count) |
|---|---|---|---|---|---|
| src/core/commands/appliers.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/core/commands/index.ts | 100.00% | n/a (0 fns) | 100.00% | — | — |
| src/core/commands/repo.memory.ts | 100.00% | 100.00% | 91.67% (22/24) | — | 30:1, 32:1 |
| src/core/commands/revert.ts | 80.26% (122/152) | 66.67% (6/9) | 46.67% (7/15) | `<instance_members_initializer>`, `RevertConflictError`, `anonymous_8` | 17:1, 25:1, 28:1, 40:1, 46:1, 59:1, 76:1, 82:1 |
| src/core/embeds/marker.ts | 96.59% | 70.00% (7/10) | 96.15% | `withInnerContent`, `withInnerContentFinal`, `substituteMarkers` | 15:1 |
| src/core/entry-refs/extractor.ts | 99.32% | 100.00% | 93.33% (42/45) | — | 31:2, 62:1 |
| src/core/entry-refs/repo.memory.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/core/events/index.ts | 100.00% | n/a (0 fns) | 100.00% | — | — |
| src/core/events/memory-bus.ts | 98.39% | 89.47% (17/19) | 95.83% | `publishBatch`, `anonymous_6` | 30:1 |
| src/core/events/outbox-worker.ts | 92.31% | 100.00% | 75.00% (3/4) | — | 12:1 |
| src/core/extension-capability-vocabulary.ts | 100.00% | n/a (0 fns) | 100.00% | — | — |
| src/core/gated-mutations/actor-identity.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/core/gated-mutations/composition.ts | 95.35% | 42.86% (3/7) | 100.00% | `buildGatewayDeps`, `planHashOf`, `resolveActorClassIdentity`, `buildConfirmOnlyHooks` | — |
| src/core/gated-mutations/gateway.ts | 100.00% | 100.00% | 93.94% (31/33) | — | 56:1, 64:1 |
| src/core/gated-mutations/token.ts | 99.47% | 100.00% | 96.67% (29/30) | — | 38:1 |
| src/core/gated-mutations/watermark.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/core/operation-lock.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/core/publish-history-list-limit.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/core/rate-limit/rate-limit.ts | 99.69% | 100.00% | 91.67% (22/24) | — | 29:1, 33:1 |
| src/core/runtime-mode.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/core/tool-surface-exchanges.ts | 100.00% | 94.12% (16/17) | 97.62% (41/42) | `anonymous_7` | 28:1 |
| src/db/drift.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/migration/manifest.ts | 98.35% | 100.00% | 90.12% (73/81) | — | 121:1, 131:1, 138:1, 162:1, 176:1, 182:1, 188:1, 217:1 |
| src/db/migration/pg-fixture.ts | 98.67% | 100.00% | 41.67% (5/12) | — | 7:1, 9:1, 11:1, 13:1, 16:1, 17:1, 20:1 |
| src/db/migration/verify.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/postgres/db-ops.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/schema.postgres.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/schema.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/sqlite/change-set-repo.sqlite.ts | 100.00% | 100.00% | 80.00% (24/30) | — | 12:1, 17:1, 24:1, 29:1, 63:1, 64:1 |
| src/db/sqlite/composio-config-repo.sqlite.ts | 99.31% | 100.00% | 72.00% (18/25) | — | 7:1, 10:1, 16:1, 34:1, 36:1, 38:1, 40:1 |
| src/db/sqlite/content-db.ts | 93.94% | 75.00% (3/4) | 83.33% (5/6) | `seedContentDb` | 21:1 |
| src/db/sqlite/database-introspection-adapter.sqlite.ts | 100.00% | 100.00% | 82.00% (41/50) | — | 26:1, 30:1, 34:1, 36:1, 44:2, 46:1, 50:1, 51:1 |
| src/db/sqlite/database-journal-db.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/sqlite/database-journal-repo.ts | 98.48% | 95.83% (23/24) | 89.19% (33/37) | `markResolved` | 6:1, 16:1, 17:1, 68:1 |
| src/db/sqlite/database-journal-schema.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/sqlite/db-ops.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/sqlite/entry-refs-repo.sqlite.ts | 100.00% | 100.00% | 93.33% (14/15) | — | 40:1 |
| src/db/sqlite/execution-credential-repo.sqlite.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/sqlite/jsonb-column.ts | 97.13% | 100.00% | 90.00% (36/40) | — | 15:1, 25:1, 29:1, 43:1 |
| src/db/sqlite/media-provider-credential-repo.sqlite.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/sqlite/outbox-repo.sqlite.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/sqlite/publish-credential-repo.sqlite.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/sqlite/publish-history-repo.sqlite.ts | 100.00% | 100.00% | 93.55% (29/31) | — | 16:1, 21:1 |
| src/db/sqlite/repo-helpers.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/sqlite/site-credential-repo.sqlite.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/sqlite/source-control-credential-repo.sqlite.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/sqlite/vendor-credential-repo.sqlite.ts | 100.00% | 100.00% | 100.00% | — | — |
| src/db/sqlite/watermark.ts | 100.00% | 100.00% | 77.78% (7/9) | — | 15:1, 20:1 |
| src/db/sqlite/webhook-repo.sqlite.ts | 99.72% | 96.88% (31/32) | 89.80% (44/49) | `anonymous_30` | 34:1, 35:1, 99:1, 124:1, 134:1 |
| src/routing/routing.ts | 99.30% | 100.00% | 94.55% (52/55) | — | 15:1, 18:1, 76:1 |

## Worst file: `src/core/commands/revert.ts`

80.26% lines / 66.67% functions / 46.67% branches — clearly the weakest file in scope, warrants first attention
once tests begin. Zero-hit: `<instance_members_initializer>` (class field initializer, likely a private
field default), `RevertConflictError` (a custom error class/constructor — never thrown/constructed by any
in-scope test), `anonymous_8` (an inline arrow/callback). 8 distinct zero-hit branch arms.

## Next steps (in order)

1. Poll for `<scratchpad>/full-repo.lcov`; re-run the per-file table against it once available. Any file
   that reads materially higher there gets its "gap" downgraded or removed before a test is written.
2. For files confirmed to have a real gap in the combined lcov: read each zero-hit function's source (not
   its lcov line number), write the smallest test that exercises it, confirm the function's `FNDA` hit
   count and the branch's `BRDA` hit count both move off zero.
3. Start with `src/core/commands/revert.ts` (worst file) and the 16 never-instrumented files needing a
   combined check.
