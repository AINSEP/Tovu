# plan-housekeeping REPORT - lanes K/T (2026-11-17, unattended plan-edit run)

Branch `plan/lanes-k-t-2026-11-16`. Base for every regenerated fact: `origin/refactor/terra` = `integ/merge-final-2026-11-16` (Tovu 232764af5, Jini 65d73b0d5). No product code edited.

## Done
- Regenerated every K/T sidecar (`.files/.decls/.fnsize/.importers/.tools/.census`) and both `INVENTORY.tsv` on a detached Tovu checkout of `origin/refactor/terra` with the plan's own generators.
- INDEX: size table (K 125 files / 17,467 lines, T 116 / 30,346), test counts, prerequisites K-04 / T-PO-02 (drift resolved), disjointness re-run note, new "Revision 4 housekeeping" section with a before/after table per sheet.
- No sheet moved by more than 1/3 (largest: K-04 lines 528 -> 539).
- `BLOB-DRIFT.tsv` rewritten as merge-a planning blob -> terra blob (K-04 `seo/agent-tools.ts`, T-PO-04 `post/reverters.ts`, T-TH-07 `theme/theme-trash.ts`).
- Sheets fixed for real terra changes: K-04 (`getSeoAgentToolCatalog` already split on terra), T-DESIGN-QUEUE (T-TH-07 1,737 lines, `createThemeTrashAdapter` already split), T-TH-01 (Jini 65d73b0d5 still has no `cms/src/theme`), K-TOOLS-PATTERN, T-PO-02.
- COMMON-KT: clones/base and the blob-guard line re-pinned to refactor/terra with `git merge-base --is-ancestor` checks.
- Bug-class sweep: no `\|` STOP command left in any table (`grep -n -F '\|'` hits prose only); S-FN50 eslint command already present in COMMON-KT.

## SHAs
- a5d9fdb3 plan(lanes K/T) housekeeping: regenerate every sidecar ... (this report is the next commit)

## Commands run (all from the Tovu terra worktree root unless noted)
| command | result |
|---|---|
| `python3 <dir>/scripts/gen.py <dir>` | exit 0 |
| `python3 <dir>/scripts/decls.py <dir>` | exit 0 |
| `node <dir>/scripts/symbols.cjs <dir>` (Node 24.22.3, TypeScript from /opt/node-tools) | exit 0 |
| disjointness proof from INDEX "Order" (2 commands, in `<dir>`) | both printed nothing |
| test-file count (same `is_test` rule as gen.py) | K 175 / 30,534, T 217 / 40,032 |
| `ls packages/cms/src/theme/index.ts` in Jini 65d73b0d5 | No such file (T-TH-01 still SKIPs) |
| `git merge-base --is-ancestor origin/wave1/kt-* origin/refactor/terra` | not ancestors (wave-1 report-only commits) |

## Left / blocker
- Wave 1 (K-01, K-02b, T-PO-01) ran on 2026-11-17 and all three STOPPED at COMMON-KT V1 "baseline red": Tovu `check:size`, `check:complexity`, `check:architecture`, `check:errors` are red on the unmodified refactor/terra tree. Owner decision recorded in INDEX (repair baselines first, or switch V1/V2 to a "no new line vs base output" gate). Not changed here.
- Unchanged open items: INDEX "What remains" 1-7, owner decisions D-K1 confirm, D-K2, D-T1..D-T6.

## Next step
Owner picks (a) or (b) for the baseline-red blocker; then re-dispatch wave 1 unchanged on refactor/terra.
