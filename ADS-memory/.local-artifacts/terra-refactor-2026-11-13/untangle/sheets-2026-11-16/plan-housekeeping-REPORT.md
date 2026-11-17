# plan-housekeeping REPORT - xpkg lane sheets (2026-11-17, unattended plan-edit run)

Branch `plan/xpkg-lane-sheets-2026-11-16`. Base: `origin/refactor/terra` = `integ/merge-final-2026-11-16` (Tovu 232764af5, Jini 65d73b0d5). No product code edited; Jini tree left clean (scratch files deleted, `git status` empty).

## Done
- `scripts/census.mjs` re-run on Jini 65d73b0d5 (`--tests`): every INDEX §1 total unchanged (227 raw sites / 149 files, 46 pairs, 150 work sites in 32 pairs, 39 preset, 23 option C, 15 frozen, 20 stale manifest, 283 test files, 35 mock files). Only change: 5 R13 rows of `server/src/kernel-base.ts` (file 268 -> 257 lines). `census/merged/*` and `sites/*.sites.tsv` refreshed; INDEX §1 rewritten for the new base.
- `GUARDS.tsv`: new column `blob_refactor_terra_65d73b0d5` (146/149 = merge-a blob; `kernel-base.ts`, `compose-jini-kernel.ts` neither; `supervisor-node.ts` = merge-b; 0 missing).
- COMMON §Base re-pinned to refactor/terra; the Tovu ancestor check now uses 232764af5 (contains a28cb1bf). Both base `rg` STOP lines run on Tovu terra: both print nothing (pass).
- R6-R9 type definitions compiled against the real Jini packages: §1 (commerce: the wrapper, the runner type, the retyped step list, the Tovu binding with db's real `runMigrations`, options drift both ways), §2 (cms: `ColumnCatalogPort`, new factory with the edited cast, Tovu `listColumns` binding), §3 (`RateLimiter` + `RateLimitResult` in core, assignable both ways with http-kit's), §4 (`ExecuteCommandFn` <-> `executeCommand` both ways). All `tsc --noEmit` exit 0; negative control (object-shaped runner) fails with TS2322.
- Sheet fixes from the check: §1 now declares `PaymentsMigrationOptions` explicitly and imports `MigrationContext` (needed by two option fields, missing from the import line); §4 extends the EXISTING `cms/src/core/__tests__/execute-command-fn.typecheck.ts` (one direction already pinned) instead of creating a duplicate file.
- N1, R13a, R13c marked DONE with their Jini branch SHAs (not merged into refactor/terra yet).

## SHAs
- f2d735180 plan(xpkg sheets) housekeeping ... ; this report is the next commit.

## Commands run
| command | result |
|---|---|
| `node scripts/census.mjs /home/user/Jini <untangle> census/merged --tests` (Node 24.22.3) | exit 0; totals as above |
| `git hash-object` of every GUARDS.tsv path in Jini terra | 149 rows, 0 missing |
| `git merge-base --is-ancestor a28cb1bf 232764af5` (Tovu) | exit 0 |
| COMMON base `rg` lines on Tovu terra | both print nothing |
| `npx tsc -p <scratch tsconfig extending packages/{commerce,cms,core,http-kit}/tsconfig.json>` | 0 / 0 / 0 / 0 |
| negative control in commerce | TS2322 (expected) |
| `grep -n '^\|.*\\|' *.md` | prose only (no command in a table) |

## Left
- Still open (unchanged): OD-5, OD-6, OD-9, Q-G1/Q-G2; R7 P0b sheet not written; C12-OBS not landed.
- G-STALE-DEPS also has a pushed Jini branch `wave1/xpkg-G-STALE-DEPS` (e0c807ab report); not marked here (not in this run's brief).
- R13a's report notes a sheet slip: the infra pin lives in `shim-surface.test.ts`, not `surface.test.ts` (done run; no rewrite needed).

## Next step
Merge the wave-1 xpkg branches into refactor/terra (owner), re-run the census, then release wave 1's remaining sheets (G-TESTS setup, R6-R9, R10a, R12a, R12d, C9c).
