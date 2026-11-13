HARD RULE (first): stop before ~250k tokens of context. If you get close, commit what is done (explicit paths), write a REMAINING list in your report, and stop. Stopping early at a committed point is always correct.

# OPUS job, stage 13: check the MOVE-AFTER preconditions, hand READY rows to Terra

EXECUTOR: Opus first (judgment: is the precondition met?), then a Terra run per batch using the generated MOVE prompt.

## Repos
- Tovu clone: `/Users/la/Programming/tovu-terra-d1` (branch `design-d1`). Jini clone: `/Users/la/Programming/jini-terra-d1`. Work ONLY in these two. Never read-modify-write `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini` (the live trees); never run `npm run link:jini`, `npm install` or `pnpm install` yourself.
- BOOTSTRAP: `AI-Dev-Shop/AGENTS.md` is missing in these clones. That is expected: do not look for it, do not stop, proceed with this prompt.
- If this job edits Jini, the runner must give you `/Users/la/Programming/jini-terra-d1` as a writable directory; if it is read-only, stop and say so.

Preconditions (check each; stop and report if one fails):
1. Stages 06-12 landed (each row's precondition usually names a file that one of them moved). 2. Ratchet gate exits 0 (below).

## Input (two modes)
- FIRST RUN: `development/refactor-patterns/move-to-jini/stage-13.files.tsv` (271 rows, 36.5k lines). The `label` column is `MOVE-AFTER(<precondition>)`, the `home` column names the destination and host contract; 108 rows name no package.
- RETRY RUN (the coordinator says "retry"): `development/refactor-patterns/move-to-jini/stage-13r.files.tsv`, written by `node development/refactor-patterns/move-to-jini/stage-lists.mjs --retry` after a stage lands. It holds WAITING rows from ANY stage whose `waits_on` dependency has now landed (columns as above plus `waits_on`, `origin_stage`). The coordinator runs a retry after stage 14 and after EACH stage-15 batch, and once more before stage 16. Example: `post/preview-tool.ts` waits on `post.ts`, which stage 15 splits; its ledger row is `waits_on: stage:15-cms`, so it returns in the retry after the cms batch.
Paths are successor-applied (`was` = the survey path); judge the precondition against the CURRENT path.

## Owner gate D2 (persistent; applies to every row, symbol and fallback in this job)
Owner decision D2 (may `@jini-ai/core` hold runtime helpers outside `core/contracts/`?) is OPEN; its default is WAIT. Until the coordinator replaces this block with the owner's answer:
- A row or symbol whose destination is `@jini-ai/core` outside a `contracts` subpath, or whose survey text names core as its home for runtime code, WAITS: do not move it, do not split it, and do NOT choose another package for it (not "the nearest domain package", not a new package). Report it as WAITING with `waits_on: owner:D2`.
- Not affected: types and interfaces under `@jini-ai/core/contracts/*`, and IMPORTING an existing `@jini-ai/core` export.


## Do (no code edits in this job)
1. Per row, classify the precondition and check it against the CURRENT trees:
   - "after <file> moves" / "after <file>": met when that Tovu file no longer exists and its code is exported from Jini (`rg` the names in `/Users/la/Programming/jini-terra-d1/packages/*/src`).
   - "after Jini hardening/parity of X": met only when the Jini symbol now has the behaviour the survey says it lacked (read the code; cite file:line).
   - "after an owner decision": not met; list the decision.
   - unclear: not met; one line why.
   Every row not met gets a machine-checkable `waits_on`: `path:<tovu path that must be gone>`, `stage:<id>` (e.g. `stage:15-cms` when it waits on a stage-15 split), `owner:<Dn>`, or `design:<one line>` (design rows never auto-retry: list them for the coordinator).
2. For rows that are met, fill `pkg` and `subpath` (existing export keys only; a new subpath = stage-12 kind D, list it separately) and write them to `development/refactor-patterns/move-to-jini/stage-13.ready.tsv` (same columns as the stage lists). A met row whose action is MIXED goes to a stage-15 split batch instead (`development/refactor-patterns/move-to-jini/stage-15/<batch>.split.tsv`), never to the MOVE prompt. Rows not met go to `development/refactor-patterns/move-to-jini/stage-13.waiting.tsv` with `reason` and `waits_on` columns, and their ledger lines go in the report (Report item 1).
3. Generate the Terra prompt: `cd /Users/la/Programming/tovu-terra-d1 && python3 development/refactor-patterns/move-to-jini/write-prompts.py --move-stage 13 --input development/refactor-patterns/move-to-jini/stage-13.ready.tsv`, which writes `development/refactor-patterns/move-to-jini/stage-13.terra-prompt.md` with the same template as stages 06-11 and a fresh pre-check table. If the READY set is over ~40 files, split it into batches by package (`stage-13a.ready.tsv`, ...; `--move-stage 13a`). In a RETRY run, prefix every file with the retry number the coordinator gives (`stage-13r1.ready.tsv`, `stage-13r1.waiting.tsv`, `--move-stage 13r1`) so earlier runs are never overwritten.
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
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), WAITING, or SKIPPED (why). Use the row's `was` path if set, else its path, as the key. Every row that is not DONE also gets `waits_on:` = what must land first: `path:<tovu path>` (a file that must be gone), `stage:<id>` (e.g. `stage:15-cms`), `owner:<Dn>`, or `design:<one line>`. The coordinator copies these into `development/refactor-patterns/move-to-jini/ledger.tsv`; rows come back automatically when their dependency lands (`stage-lists.mjs --retry`).
   Every file or symbol you moved or renamed: one line `SUCCESSOR <old path>[#symbol] -> <new path or @jini-ai specifier>[#symbol]` (the coordinator copies them into `successors.tsv` so later stage lists follow the code).
2. The gate outputs (before/after).
3. Commits (sha + repo) or, if `.git` was read-only, the changed paths.
4. Anything surprising, in one line each. Do not paste diffs.
