# lo-th report (wave2/lo-th, 2026-11-17)

**Result: SKIPPED all three sheets (TH-R1, TH-R2, TH-R3) at the prerequisite check. No product code changed in either repo.**

Base: `origin/refactor/terra` — Tovu 232764af5, Jini 65d73b0d5 (Jini branch `wave2/lo-th` created, nothing committed/pushed there).

## Why (sheet `TH-theme-rest.md`, plan `plan/left-out-areas-2026-11-16`)
The sheet's own header: "nothing here is dispatchable. All three items are in the design queue (findings 15, 16, 17)". It provides an inventory and the tests a design must carry, not an executable step list. Executing would mean inventing the design (e.g. which object owns watcher replacement, state lifetime for the publication store, trash workflow) — forbidden by "no improvised redesign". Each sheet also lists prerequisites that are unmet on terra (none is a BASE-RED reason).

## Checks run (Tovu root, on terra)
| check | command | result |
|---|---|---|
| Blob guards, all 11 files of `TH-R1/R2/R3.files.tsv` | `git hash-object <path>` vs the tsv blob column | all 11 MATCH (incl. theme-trash.ts e0504b00, 243 lines) |
| TH-R1 prereq: xpkg N1 (`@jini-ai/node-adapters` hosts `fs.watch` binding) | `ls Jini/packages` | NO `node-adapters` package (only `devops/.../static-export/node-adapters`, unrelated) → FAIL |
| TH-R1/R2 prereq: T-TH-05 landed | `rg -n "theme-files" apps/website/src/features/theme/asset-operations.ts theme-file-import.ts` | lines 3, 13, 28 still import `./theme-files.js` (T-TH-05 repoints these); lane T branch holds only T-TH-05/06 census/decls sidecars, no landed move → FAIL |
| TH-R3 prereq: T-TH-06 landed | same lane-T branch listing; `git log origin/refactor/terra` for T-TH-0x / K-07 / S4a / node-adapters commits | none found → FAIL |
| TH-R2 prereq: T-TH-07 design written; K-07; lane S S4a/S4b (trash SQL) | lane-T branch listing; terra log | no T-TH-07 sheet/design; no K-07/S4 commits on terra → FAIL |
| TH-R2 split step | `theme-trash.ts:128-155` | already VOID per housekeeping (28 lines) — nothing to do |

## Overlaps
None touched. Files of this area are claimed by lane T (T-TH-05/06/07/08) and `theme/index.ts` is lane T's barrel; any future TH-R work must go after lane T and regenerate `TH-R*.files.tsv`.

## Left / next step
- All of TH-R1, TH-R2, TH-R3 remain in the design queue. Next: an Opus design pass per sheet (estimates in the sheet: 80k / 60k / 70k) producing one-run executable sheets, after lane T T-TH-05/06/07, xpkg N1 (`@jini-ai/node-adapters`), and K-07 + S4a/S4b land. The sheet's own recommendation for TH-R1 (`createThemeWatcherSlot()` owned by the composition root) is the design question to answer first.
- Owner decisions file lists no ID for TH-R*; none needed to unblock beyond the prerequisites above.

## SHAs
Only this report commit on Tovu `wave2/lo-th` (see git log). No Jini commits.
