# Coverage Baseline: `src/core`, `src/db`, `src/routing`

Status: **gap-fill pass complete (this session). Combined-lcov cross-check for the 16 never-instrumented
files below STILL NEVER ARRIVED** — `full-repo.lcov` never appeared at
`/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/22748abd-e462-4141-8cda-5b81c09e41b6/scratchpad/full-repo.lcov`
at any point across this entire session (polled repeatedly over ~90 minutes of wall-clock work). That
cross-check is the clearest next step for whoever picks this up — see "Still open" at the bottom. Per the
dispatch brief's measurement traps, a scoped number can only ever *understate* true coverage — so every
number in this document is a floor, not a ceiling.

## AFTER this session (jump to bottom for full detail)

| Area | Lines | Functions | Branches |
|---|---|---|---|
| `src/core` | 99.76% (was 98.01%) | **100.00%** (was 91.33%) | 95.93% (was 93.45%) |
| `src/db` | 99.69% (was 99.52%) | **100.00%** (was 99.36%) | 94.48% (was 93.11%) |
| `src/routing` | 99.30% (unchanged) | 100.00% (unchanged) | 94.55% (unchanged) |

**Every zero-hit function across all 50 previously-measured files is now closed.** 12 commits, all tests
green on every re-run. Two genuine flaky-test bugs found and fixed along the way (see below). Full
before/after table and remaining-gap disposition at the bottom of this file.

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

## Next steps (in order) — AS WRITTEN AT BASELINE TIME, superseded by "AFTER this session" below

1. ~~Poll for `<scratchpad>/full-repo.lcov`~~ — never arrived this session; still open.
2. ~~For files confirmed to have a real gap...~~ — done for every zero-hit function found in the scoped run.
3. ~~Start with `src/core/commands/revert.ts`...~~ — done, now 100%/100%/100%.

---

# AFTER this session (2026-08-21, same day)

## What got closed

Every zero-hit **function** found in the baseline scoped run is now covered, across all 3 areas. 12
commits (SHAs below), each a focused test addition or a real-bug fix, committed incrementally per the
shared-git-tree hard rules. Final scoped re-run (`TEST_CONCURRENCY=2`, same command as baseline): **all
tests green**, no failures, across two consecutive full passes.

| Area | Lines | Functions | Branches |
|---|---|---|---|
| `src/core` | 2855/2862 = 99.76% (was 98.01%) | 153/153 = **100.00%** (was 137/150 = 91.33%) | 354/369 = 95.93% (was 314/336 = 93.45%) |
| `src/db` | 8494/8520 = 99.69% (was 99.52%) | 467/467 = **100.00%** (was 463/466 = 99.36%) | 788/834 = 94.48% (was 757/813 = 93.11%) |
| `src/routing` | 424/427 = 99.30% (untouched) | 23/23 = 100.00% (untouched) | 52/55 = 94.55% (untouched) |

`src/routing/routing.ts` was not touched this session — its 3 zero-hit branches remain open (see table
below). Everything else in the "files with remaining gaps" table also remains open; only the files listed
under "Closed to 100%" and the zero-hit-function list were resolved.

## Files closed to 100% lines/functions/branches this session

- `src/core/commands/revert.ts` — was the worst file in the baseline (80.26% / 66.67% / 46.67%). Added a
  dedicated unit suite covering every precondition in the BR-05 ladder, multi-item descending-position
  apply order, the post-apply CAS re-check, and both outbox branches.
- `src/db/sqlite/composio-config-repo.sqlite.ts` — was 99.31% / 100% / 72.00% (18/25). Added the
  sealed:null/keyTail:null shape and every `parseAuthConfigIds` degradation path (invalid JSON,
  non-object JSON, non-string/empty entry values), via raw-SQL-inserted rows.

## Zero-hit functions closed (all of them — this was the headline gap)

| File | Function(s) | How |
|---|---|---|
| `src/core/embeds/marker.ts` | `withInnerContent`, `withInnerContentFinal`, `substituteMarkers` | new `marker.unit.test.ts` |
| `src/core/events/memory-bus.ts` | `publishBatch`, `subscribe`'s unsubscriber closure | added to existing `memory-bus.test.ts` |
| `src/core/gated-mutations/composition.ts` | `buildGatewayDeps`, `planHashOf`, `resolveActorClassIdentity`, `buildConfirmOnlyHooks` | added to existing `composition.unit.test.ts`, matching its own established per-primitive isolation pattern |
| `src/core/tool-surface-exchanges.ts` | `anonymous_7` (the lifetime timer's one-shot expiry callback) | traced via isolated FN/FNDA dump (see "Real bugs found" — this was a flaky-test issue, not a missing test) |
| `src/db/sqlite/content-db.ts` | `seedContentDb` | new `content-db-seed.unit.test.ts` |
| `src/db/sqlite/database-journal-repo.ts` | `markResolved` | added to existing `database-journal.integration.test.ts` |
| `src/db/sqlite/webhook-repo.sqlite.ts` | `anonymous_30` (claimPending's sort comparator — needs 2+ due rows to invoke) | added to existing `webhook-delivery-repo.sqlite.test.ts` |
| `src/core/commands/revert.ts` | `<instance_members_initializer>`, `RevertConflictError`, `anonymous_8` | closed as part of the full revert.ts rewrite above |

## Real bugs found: 2 timing-fragile tests in `tool-surface-exchanges.test.ts`

Both pre-existed this session (not introduced by it) and both were caught **live**, not by inspection:

1. **"the total-lifetime ceiling ends an exchange that stays busy forever"** — `idleTtlMs:30 /
   maxLifetimeMs:45`, delivering every 10ms. Traced `anonymous_7`'s 0-hits-scoped-vs-1-hit-isolated
   discrepancy to this test: under concurrent test-runner load, scheduling jitter can delay a `deliver()`
   past the idle deadline, so the exchange ends via the IDLE timer instead of the LIFETIME ceiling the
   test exists to prove. Both paths report `status:"expired"`, so the assertion passes either way while
   silently covering the wrong branch. Fixed by widening to `idleTtlMs:200 / maxLifetimeMs:260` / 20ms
   delivery.
2. **"the idle deadline resets on activity..."** — `idleTtlMs:40`, three 25ms sleeps (only a 15ms cushion
   per turn). This one didn't just miscover a branch — it **actually failed** in a real scoped re-run this
   session (`AssertionError: expected status:"received", got status:"expired"`). Fixed by widening to
   `idleTtlMs:300` / 60ms per turn.

Both fixes are pure test-margin changes; no production code touched. If this class of tight-margin timing
assertion exists elsewhere in the repo, it's worth a targeted sweep — this file alone had two.

## Commits (chronological, all on `general-work`, all via `git commit -F <file> -- <exact paths>`)

1. `ae40b7f1` — baseline measurement report (committed before any test was written)
2. `775a8593` — revert.ts unit suite (worst file → 100%/100%/100%)
3. `58f41c61` — marker.ts's 3 zero-hit functions
4. `ef60445c` — memory-bus.ts publishBatch + unsubscribe
5. `500aca2b` — composition.ts's 4 remaining primitives
6. `beeedc83` — content-db.ts seedContentDb
7. `8c91fe79` — database-journal-repo.ts markResolved
8. `6a79fa22` — webhook-repo.sqlite.ts claimPending sort comparator
9. `1f2d5e1f` — tool-surface-exchanges.ts timing fix #1 (lifetime ceiling)
10. `e6f45988` — pg-fixture.ts real-Postgres failure paths (5/12 → 9/13 branches)
11. `195dfb1b` — composio-config-repo.sqlite.ts → 100%/100%/100%
12. `19e8cb82` — tool-surface-exchanges.ts timing fix #2 (idle-reset test, caught mid-session)

## Files with remaining branch gaps — STILL OPEN, not yet triaged into the 4 disposition categories

Ran out of session budget before reaching these. None had zero-hit functions (that gap is fully closed);
all of the below are branch-only gaps. Numbers are from the final scoped re-run.

| File | Branches | Notes |
|---|---|---|
| `src/db/migration/manifest.ts` | 90.12% (73/81), 8 zero-hit | largest absolute gap remaining |
| `src/db/sqlite/database-introspection-adapter.sqlite.ts` | 82.00% (41/50), 8 zero-hit | |
| `src/db/sqlite/webhook-repo.sqlite.ts` | 90.20% (46/51), 5 zero-hit | claimPending's sort comparator now covered; other gaps remain |
| `src/db/sqlite/change-set-repo.sqlite.ts` | 80.00% (24/30), 6 zero-hit | |
| `src/db/sqlite/jsonb-column.ts` | 90.00% (36/40), 4 zero-hit | |
| `src/db/sqlite/database-journal-repo.ts` | 89.47% (34/38), 4 zero-hit | markResolved's own function is covered; other branches remain |
| `src/db/migration/pg-fixture.ts` | 69.23% (9/13), 4 zero-hit | improved from 41.67% this session (see commit 10); remainder is the PGPORT module-load-time branch (needs a subprocess to test) and DROP-succeeds-then-CREATE-fails (needs a seam or a TOCTOU race) — both genuinely hard without changing production code |
| `src/db/sqlite/watermark.ts` | 77.78% (7/9), 2 zero-hit | |
| `src/core/events/outbox-worker.ts` | 75.00% (3/4), 1 zero-hit | |
| `src/routing/routing.ts` | 94.55% (52/55), 3 zero-hit | not touched this session at all |
| `src/core/entry-refs/extractor.ts` | 93.33% (42/45), 2 zero-hit lines (one with 2 zero-hit branches) | |
| `src/core/gated-mutations/gateway.ts` | 93.94% (31/33), 2 zero-hit | |
| `src/db/sqlite/publish-history-repo.sqlite.ts` | 93.55% (29/31), 2 zero-hit | |
| `src/db/sqlite/entry-refs-repo.sqlite.ts` | 93.33% (14/15), 1 zero-hit | |
| `src/core/events/memory-bus.ts` | 93.33% (28/30), 2 zero-hit | its zero-hit functions are closed; these are separate branch gaps |
| `src/core/commands/repo.memory.ts` | 91.67% (22/24), 2 zero-hit | |
| `src/db/sqlite/content-db.ts` | 91.67% (11/12), 1 zero-hit | seedContentDb itself is now 100% function-covered; this is a leftover branch elsewhere in the file |
| `src/core/rate-limit/rate-limit.ts` | 91.67% (22/24), 2 zero-hit | |
| `src/core/gated-mutations/token.ts` | 96.67% (29/30), 1 zero-hit | |
| `src/core/embeds/marker.ts` | 96.88% (31/32), 1 zero-hit | its 3 zero-hit functions are closed; this is a leftover branch |
| `src/core/tool-surface-exchanges.ts` | 97.67% (42/43), 1 zero-hit | anonymous_7 is closed; this is a separate, still-open branch |

## Still open (full worklist for whoever continues)

1. **The combined-lcov cross-check never happened.** `full-repo.lcov` never appeared at the scratchpad path
   across this entire session. The 16 never-instrumented files from the baseline measurement (6 real
   runtime files needing a combined check: `analytics-sink.sqlite.ts`,
   `composio-connector-credential-repo.sqlite.ts`, `content-watermark-adapter.ts`,
   `custom-credential-repo.sqlite.ts`, `external-mcp-repo.sqlite.ts`, `media-repo.sqlite.ts`, plus
   `origin-repo.sqlite.ts`'s import-boundary-only test) are **still unresolved** — do not write tests for
   any of them until checked against a combined lcov; per the dispatch brief's own trap #2, a file this
   session found showing 0% scoped could easily read >90% combined.
2. **19 files above have real, uncategorized branch gaps.** None were triaged into the dead/type-required/
   no-seam/tooling-gated categories — that read-the-function-and-decide work is still needed per file.
   `manifest.ts` and `database-introspection-adapter.sqlite.ts` are the largest absolute gaps (8 zero-hit
   branches each).
3. **`src/routing/routing.ts`** (the one file in `src/routing`) was never opened this session — 3 zero-hit
   branches, completely untriaged.
4. Given this file's own experience with `tool-surface-exchanges.test.ts` (2 flaky timing tests found in
   one file), a repo-wide sweep for other `setTimeout`/`idleTtlMs`-style tight-margin tests may be worth a
   dedicated pass — these don't show up as coverage gaps in a healthy run, only under load, and only
   sometimes cause an outright failure (as the second one did) rather than a silent miscoverage (as the
   first one did).
