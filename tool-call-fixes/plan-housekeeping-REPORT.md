# plan-housekeeping REPORT - tool-call fixes (2026-11-17, unattended plan-edit run)

Branch `plan/tool-call-fixes-2026-11-16`. Base: `origin/refactor/terra` = `integ/merge-final-2026-11-16` (Jini 65d73b0d5, Tovu 232764af5), checked out side by side as `/home/user/Jini` and `/home/user/Tovu` (detached). No product code edited; both checkouts left clean on the base (two throwaway local Jini commits used for the positive tests were abandoned, never pushed).

## Done
- Ran all 115 commands found in the 22 sheets (symbol checks, inventory lines, landed checks, acceptance checks) in the Jini root, Jini `packages/` and the Tovu root; ran every fenced block of `sheets/README.md` on both repos with an empty diff, and blocks 4.3-4.8, 4.15, 4.16, 4.17 against a planted-violation commit (all fired). Block 4.10 tested both ways (OPEN -> STOP; a copy with `DECIDED: yes` -> nothing).
- Fixed (INDEX "Housekeeping 2026-11-17", H1-H7): drift check failed open (H1); base + BLOBS re-pinned (H2, one blob changed: Tovu `agent-daemon-scope.ts`); landed checks now pass by exit code, new block 4.11 (H3); S7 two-file landed check split (H4); S5 `sideEffects` check fired wrongly, 723 lines on an empty diff (H5); S9 `randomUUID` check failed open on a missing file (H6); block 4.16 reported non-limit rules (H7).
- Marked DONE: S10, S14a, S15 (Jini `wave1/tc-*`, not merged into refactor/terra). Verified on those branches that the dependents' landed checks match (S11, S14b, S16a, S8 partly).

## SHAs
- f7ef630d plan(tool-call-fixes) housekeeping ... ; this report is the next commit.

## Commands run (summary; full per-command table was in the run scratchpad)
| command | result |
|---|---|
| 115 sheet commands x 3 directories | every symbol / inventory line matches in its intended directory; failures = landed checks of unmerged prerequisites (expected) + 2 placeholder templates (`<path>`) + the defects H4-H6 |
| README §1.1 ancestor checks (new pins) | `ok` `ok` |
| README §1.4 old form from Tovu root | stderr only, printed nothing = passed (H1) |
| README §1.4 new form | prints nothing on terra; prints `STOP: no BLOBS.tsv` with a wrong PLAN |
| block 4.10 for every sheet | STOP for S1 (OD-1), S12a/S13 (OD-8), S16b (OD-6), S2b (OD-2); nothing for the others |
| blocks 4.3-4.8, 4.15-4.17 on planted commit | each printed its violation |
| `git show origin/wave1/tc-S10\|S14a\|S15:<file> \| rg <landed pattern>` | 1 / 9 / 1 matches |

## Left (owner)
- README §1.5 makes a red Tovu `check:size` / `check:complexity` baseline a STOP. On refactor/terra both are red (17 / 23 lines; lanes K/T wave-1 reports), so every sheet with a Tovu part (S1, S2a, S4a, S4b, S5, S9, S11, S13, S14b, S17, ...) will stop at setup until the owner repairs the baselines or allows a "no new line vs base" gate. Not changed here.
- Open decisions unchanged: OD-1..OD-11 all OPEN.
- Merge the wave-1 tc branches, then S11, S14b, S16a become dispatchable.

## Next step
Owner decision on the Tovu baseline-red gate; merge wave1/tc-S10, tc-S14a, tc-S15; dispatch wave 1's remaining S1, S5, S17 after OD-1 (S1 only).
