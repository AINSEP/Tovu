HARD RULE (first): stop before ~250k tokens of context. If you get close, commit what is done (explicit paths), write a REMAINING list in your report, and stop. Stopping early at a committed point is always correct.

# OPUS job, stage 02b: merge Tovu<->Tovu duplicates

EXECUTOR: Opus (not Terra). Why: each row is two Tovu copies that may have diverged; choosing the survivor and reconciling behaviour is judgment.

## Repos
- Tovu clone: `/Users/la/Programming/tovu-terra-d1` (branch `design-d1`). Jini clone: `/Users/la/Programming/jini-terra-d1`. Work ONLY in these two. Never read-modify-write `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini` (the live trees); never run `npm run link:jini`, `npm install` or `pnpm install` yourself.
- BOOTSTRAP: `AI-Dev-Shop/AGENTS.md` is missing in these clones. That is expected: do not look for it, do not stop, proceed with this prompt.
- If this job edits Jini, the runner must give you `/Users/la/Programming/jini-terra-d1` as a writable directory; if it is read-only, stop and say so.

## Input
`development/refactor-patterns/move-to-jini/stage-02b.files.tsv` (87 rows, 5.3k lines). Columns: path, loc, action, pkg, subpath, exists_now, feature, label, home, was, route. The `label`/`home` text names the twin. The `route` column says why a row is here when the designer moved it from stage 01 or 02 (empty = a plain Tovu<->Tovu DEDUPE row):
- `02b: ADAPTER-INLINE` (from stage 01): the survey asks to inline or fold the file into its caller(s), move a fake into tests, or offers alternatives. This is NOT a dead-file delete. Find every importer with an extension-agnostic search (`rg -n -e "['\"][^'\"]*/<stem>(\.(js|mjs|cjs|jsx|ts|tsx|mts|cts))?['\"]" apps development`; Tovu imports `.ts` paths directly, e.g. `apps/desktop/src/main/updates/desktop-updater.ts:7,9` imports `../../auto-update-controller.ts`). Fold the code into the named caller keeping every binding it provides (presence checks, default deps, exported types other files use), every why-comment (move it with the code) and every test (repoint the test to the caller, or move the fake into the test support folder the survey names). Delete the file only when no importer is left. If the fold would push the caller past 10 cyclomatic/cognitive complexity or 100 lines per function, keep the file and record STAYS with the reason.
- `02b: consolidate the Tovu copies first`: merge the Tovu twins into ONE Tovu module first (this stage). The Jini move the survey mentions afterwards is NOT part of this job: record it for the ledger as `waits_on: stage:02b` with the Jini home from `home`.
- `02b: visual swap onto an existing Jini component`: replace the Tovu modal/confirm/lightbox with the named Jini component. These change what the user sees: after the swap, LOOK at the screen in the real running admin via Claude in Chrome (never a headless screenshot; the coordinator names the local site). Keep focus, Escape and confirm behaviour identical; a difference you cannot remove is BLOCKED with one line.

## Do
Per row: find the twin, diff behaviour (read both, not just names). Survivor = the copy that is generic enough for both callers and already follows `(required, optional = {})`; if both are generic and the code is not Tovu-specific, put the survivor where the survey says (some name a Jini home: then it is a stage-12 MOVE instead, report it and skip). Merge differences only when one copy has a verified bug fix the other lacks (write the failing test first: red, then green). Repoint callers, delete the other copy, keep comments.
Write a 1-line decision per row in your report (survivor, why). Same rules and checks as Terra stage 02 (`development/refactor-patterns/move-to-jini/stage-02.terra-prompt.md` sections "Rules" and "Done check"), with one difference: you DO commit, `git add -- <paths> && git commit -F msg -- <paths>`, ending the message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never push.
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
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), or SKIPPED (why). Use the row's path as the key. Every row not DONE also gets `waits_on:` (`path:<tovu path>`, `stage:<NN>`, `owner:<Dn>`, or `design:<one line>`), and every file or symbol that moved gets a line `SUCCESSOR <old path>[#symbol] -> <new path>[#symbol]`; the coordinator copies both into `ledger.tsv` / `successors.tsv`.
2. The gate outputs (before/after).
3. Commits (sha + repo) or, if `.git` was read-only, the changed paths.
4. Anything surprising, in one line each. Do not paste diffs.
