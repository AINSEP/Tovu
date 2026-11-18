# deps-split — revision 4 (rethink after three REJECTs)

Tip measured: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`, real setup (INDEX-v4 §Setup). Supersedes DESIGN.md, REVISION-2/3 and `sheets/`.

## Why 1-3 kept failing (one class)
Every revision needed something the repository does not provide: a frozen `deps.ts` across lanes, gate scripts that had to interpret base-red output, census TSVs and carry lists that had to stay true across 14 sheets, and pins that needed seams the code does not have. Each judge found the same thing in a new place: the machinery failed open, or a step could not finish.

## What v4 changes (and why it converges)
1. **No freeze. A stale sheet stops by itself.** A sheet finds its range by a unique anchor line and checks a **sha256 of the exact lines** (comments included) before editing. Other lanes may change `deps.ts`; only a change *inside this range* stops the sheet (STOP-STALE → regenerate that one sheet). Earlier slices never edit a later range: each slice replaces its range with **one call that destructures the same names**, so no other line changes. Anchors and hashes are verified on the tip for all 25 B-sheets.
2. **Repo commands only, fail-closed by construction.** Plain `set -euo pipefail` blocks with no pipes into gates, no `|| echo`, no output parsing. Base-red ratchets are compared with the parent by **their own flags**: `check:architecture --update` on the clean parent, then the plain check on the candidate (proved on the tip: exit 0 → exit 0); depcruise `--output-type baseline` on the parent, `--ignore-known` on the candidate (proved: exit 0). Any regression, by metric value or edge identity, exits non-zero in the tool itself.
3. **Order is preserved by construction, not by a list.** A slice is a contiguous run of root statements, moved verbatim in order, called at the same position. No slice contains an `await` (all 9 stay in the root, so no extra async turns) and no slice writes a root `let` (the 4 reassigned cells and their writes stay in the root).
4. **Deferred reads are enforced by the compiler plus one small test.** A binding declared later is passed as a getter `() => x`; passing it as a value is TS2448/TS2454 (probe: `tsc --strict` rejects `use({ b: later })` before `const later`). A root `let` is passed only as a getter. Each slice's characterization test pins (a) the call's place, (b) the moved statements' order, (c) that no getter is read at the slice's top level; each pin has a red-first mutation in the sheet.
5. **Nothing to carry.** Each sheet names its own inputs, outputs, imports (move vs copy), module helpers, source readers and debt rows, all taken from the tip. The only cross-sheet fact is order.
6. **Owner practices.** No re-export shells (nothing re-exported; M1/M3 repoint their 1 importer each); `(required, optional = {})` on every new function; hoisted closure placeholders (`Record<string, never>`) become module functions with real inputs; ≤50 lines / ≤500 per file enforced per new file by `eslint --rule` on the repo's size config; complexity by `check:complexity`; why-comments move with code and `check:why-comments --base <parent>` runs on the committed candidate.

## Answers to every finding (judges 1-3)
| finding (judge) | v4 answer |
|---|---|
| STOP checks fail open: `\|\| echo`, pipes, discarded runner status (J1-B1, J2-B3, J3-B2) | no output parsing; every gate is a repo command whose exit status is the verdict; the test runner is the `package.json` "test" line with explicit files, run unpiped |
| base-red architecture/boundaries judged by summary lines; misses hard regressions (J3-B2) | parent-relative using the tools' own baseline flags (above); the tool compares every metric and every edge |
| freeze cannot be enforced; lanes omitted; races with terra (J1-B2, J2-B4, J3-B3, J3 INDEX overlaps) | no freeze; range hash + unique anchor; `git pull --rebase` before push and re-run of steps 5-6 if `deps.ts` came in; a lane that edits a range makes that sheet STOP-STALE, nothing else |
| S0/S13 cannot finish; base test red before characterization (J1-B3, J2-B1, J3-B1) | no S0 baseline gate on someone else's tests; each sheet adds its own small source/AST test that passes on the slice by construction; the boot/reader test set is run on the tip (INDEX) |
| gates run on stale evidence/TSVs (J2-B2) | TSVs are evidence only (`v4/evidence/`), never compared |
| why-comments ran before commit (J2-B3) | runs after the local commit with `--base <parent>`; failure = `reset --soft`, fix, rerun |
| debt edits deferred / wrong shape (J2-B2, J3-B2) | debt rows change in the crossing commit; `size-debt.json` shrinks need no edit (a row only fails when gone: "Delete stale debt entry"); B05 moves one `catch-reads-error` count with exact rows |
| red history pushed (J3-B2) | push only after steps 5-6 pass; a failed candidate is reset, never pushed |
| owner limits pass with violations (56-line function) (J3-Major) | `eslint --rule max-lines-per-function 50` on every new file in the landing commit; B09, B10, B22 carry exact splits |
| async turns added (J1-Major S9/S10) | no slice contains `await` |
| behaviour pins miss seams (tracker, drain, OAuth, plugin-host probes) (J1-B3, J2-Major, J3-Major) | the `let` cells (`lifecycleTracker`, `routeDepsBuiltForPluginHost`, `formCollectionProviders`, `bindSharedApiOAuth`) and their writes/flushes/drain stay in the root unchanged; slices only receive getters, which test (c) pins; runtime behaviour is covered by the 67 real-boot tests |
| contextual typing lost; literal evaluation/overwrite order; self-reads (J1-B3, J1-Major S13) | literal runs (next run) are contiguous key runs typed `Pick<RouteDeps, keys>`, spreads stay in the root literal in place, self-reads are getters |
| source readers break (serving-app sort order etc.) (J3-Major) | each sheet lists the readers whose literals occur in its range; all 9 readers run every slice |
| `kernel` placement / stage over-grouping / one-call stages / Map split (J2-Major, J2/J3 over-engineering) | no stages; `kernel`, `storeBound` order kept (B02 starts after `kernel`); the trash Map moves whole except the size split B09 needs |
| singleton logger (J3-Major) | passed as an input (B06, B25); construction at the host boundary is out of scope |
| counts/ranges wrong in prose (J1/J2/J3 tables) | all numbers come from the census on the tip (`v4/evidence/census-2d82735a.json`, generator in `v4/evidence/`) |
| budget sums (J1/J2) | INDEX-v4 budget per sheet, B-sheets ≈1.4M total |

## Open (owner decisions, not hidden)
- **Root size.** After all slices the root is direct calls + 9 awaits + 4 `let` cells + the literal spread line: estimated 90-120 code lines, under the repo's 80 error only if the literal runs are short calls. ≤50 needs either phase functions between awaits (rejected as over-engineering by judges 2-3) or a size exception. Sheet R measures and asks.
- Types are derived by a mechanical rule from each input's declaration (stated in every sheet); they were not compiled per slice in this run. A rejected type may only be replaced by the type TypeScript names; anything else is STOP-TYPE.
- Not written in this run (time): M1-M3, literal runs L*, H2-H4, R. Their scope and order are fixed in INDEX-v4.
