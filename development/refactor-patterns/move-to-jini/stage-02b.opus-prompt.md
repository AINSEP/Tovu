HARD RULE (first): stop before ~250k tokens of context. If you get close, commit what is done (explicit paths), write a REMAINING list in your report, and stop. Stopping early at a committed point is always correct.

# OPUS job, stage 02b: merge Tovu<->Tovu duplicates

EXECUTOR: Opus (not Terra). Why: each row is two Tovu copies that may have diverged; choosing the survivor and reconciling behaviour is judgment.

## Repos
- Tovu clone: `/Users/la/Programming/tovu-terra-d1` (branch `design-d1`). Jini clone: `/Users/la/Programming/jini-terra-d1`. Work ONLY in these two. Never read-modify-write `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini` (the live trees); never run `npm run link:jini`, `npm install` or `pnpm install` yourself.
- The Tovu clone has no AI-Dev-Shop bootstrap; that is expected, proceed.
- If this job edits Jini, the runner must give you `/Users/la/Programming/jini-terra-d1` as a writable directory; if it is read-only, stop and say so.

## Input
`development/refactor-patterns/move-to-jini/stage-02b.files.tsv` (47 rows, 3.3k lines; DEDUPE rows with no Jini package). The `label`/`home` text names the twin.

## Do
Per row: find the twin, diff behaviour (read both, not just names). Survivor = the copy that is generic enough for both callers and already follows `(required, optional = {})`; if both are generic and the code is not Tovu-specific, put the survivor where the survey says (some name a Jini home: then it is a stage-12 MOVE instead, report it and skip). Merge differences only when one copy has a verified bug fix the other lacks (write the failing test first: red, then green). Repoint callers, delete the other copy, keep comments.
Write a 1-line decision per row in your report (survivor, why). Same rules, checks and commit discipline as Terra stage 02 (`development/refactor-patterns/move-to-jini/stage-02.terra-prompt.md` sections "Rules" and "Done check").
## Cycle gate (run before and after; paste both outputs)
```
cd /Users/la/Programming/tovu-terra-d1
node development/refactor-patterns/move-to-jini/feature-cycles.mjs
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --include-type
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --app admin --include-type
```
The SCC sizes and mutual-pair counts after your change must be equal or smaller than before, in all three. If one grows, find the new edge with `--edges` and undo the import that made it.

Commit message: `refactor(tovu): merge duplicate Tovu helpers (move-to-jini stage 02b)`.
## Report (your final message)
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), or SKIPPED (why). Use the row's path as the key.
2. The gate outputs (before/after).
3. Commits (sha + repo) or, if `.git` was read-only, the changed paths.
4. Anything surprising, in one line each. Do not paste diffs.
