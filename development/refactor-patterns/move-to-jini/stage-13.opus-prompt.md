HARD RULE (first): stop before ~250k tokens of context. If you get close, commit what is done (explicit paths), write a REMAINING list in your report, and stop. Stopping early at a committed point is always correct.

# OPUS job, stage 13: check the MOVE-AFTER preconditions, hand READY rows to Terra

EXECUTOR: Opus first (judgment: is the precondition met?), then a Terra run per batch using the generated MOVE prompt.

## Repos
- Tovu clone: `/Users/la/Programming/tovu-terra-d1` (branch `design-d1`). Jini clone: `/Users/la/Programming/jini-terra-d1`. Work ONLY in these two. Never read-modify-write `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini` (the live trees); never run `npm run link:jini`, `npm install` or `pnpm install` yourself.
- BOOTSTRAP: `AI-Dev-Shop/AGENTS.md` is missing in these clones. That is expected: do not look for it, do not stop, proceed with this prompt.
- If this job edits Jini, the runner must give you `/Users/la/Programming/jini-terra-d1` as a writable directory; if it is read-only, stop and say so.

Preconditions (check each; stop and report if one fails):
1. Stages 06-12 landed (each row's precondition usually names a file that one of them moved). 2. Ratchet gate exits 0 (below).

## Input
`development/refactor-patterns/move-to-jini/stage-13.files.tsv` (271 rows, 36.5k lines). The `label` column is `MOVE-AFTER(<precondition>)`, the `home` column names the destination and host contract; 108 rows name no package.

## Do (no code edits in this job)
1. Per row, classify the precondition and check it against the CURRENT trees:
   - "after <file> moves" / "after <file>": met when that Tovu file no longer exists and its code is exported from Jini (`rg` the names in `/Users/la/Programming/jini-terra-d1/packages/*/src`).
   - "after Jini hardening/parity of X": met only when the Jini symbol now has the behaviour the survey says it lacked (read the code; cite file:line).
   - "after an owner decision": not met; list the decision.
   - unclear: not met; one line why.
2. For rows that are met, fill `pkg` and `subpath` (existing export keys only; a new subpath = stage-12 kind D, list it separately) and write them to `development/refactor-patterns/move-to-jini/stage-13.ready.tsv` (same columns as the stage lists). Rows not met go to `development/refactor-patterns/move-to-jini/stage-13.waiting.tsv` with a `reason` column.
3. Generate the Terra prompt: `cd /Users/la/Programming/tovu-terra-d1 && python3 development/refactor-patterns/move-to-jini/write-prompts.py --move-stage 13 --input development/refactor-patterns/move-to-jini/stage-13.ready.tsv`, which writes `development/refactor-patterns/move-to-jini/stage-13.terra-prompt.md` with the same template as stages 06-11 and a fresh pre-check table. If the READY set is over ~40 files, split it into batches by package (`stage-13a.ready.tsv`, ...; `--move-stage 13a`).
4. The coordinator runs Terra on each generated prompt.

Rules: read-only in both repos except the files you write under `development/refactor-patterns/move-to-jini/`. Run no tests. Commit with `git add -- <paths> && git commit -F msg -- <paths>`; message `docs(refactor): stage 13 READY/waiting split (move-to-jini)`.

## Ratchet gate (stage 04 has landed: every count must be 0; run before and after, paste both)
```
cd /Users/la/Programming/tovu-terra-d1
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --include-type --max-scc 0 --max-pairs 0
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --app admin --include-type --max-scc 0 --max-pairs 0
```
Exit code 1 = you added a feature cycle. Find it with `--edges` and undo the import that made it (moved code must not import back up into a Tovu feature).

## Report (your final message)
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), or SKIPPED (why). Use the row's path as the key.
2. The gate outputs (before/after).
3. Commits (sha + repo) or, if `.git` was read-only, the changed paths.
4. Anything surprising, in one line each. Do not paste diffs.
