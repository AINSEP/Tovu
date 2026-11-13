HARD RULE (first): stop before ~250k tokens of context. If you get close, commit what is done (explicit paths), write a REMAINING list in your report, and stop. Stopping early at a committed point is always correct.

# FABLE/OPUS job, stage 14: harden the Jini survivor, then dedupe

EXECUTOR: Fable for the rows the coordinator marks HARD (auth, sessions, permissions, money, or 3+ listed behaviour differences); Opus for the rest. Split by the coordinator into batches of at most ~20 rows.

## Repos
- Tovu clone: `/Users/la/Programming/tovu-terra-d1` (branch `design-d1`). Jini clone: `/Users/la/Programming/jini-terra-d1`. Work ONLY in these two. Never read-modify-write `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini` (the live trees); never run `npm run link:jini`, `npm install` or `pnpm install` yourself.
- BOOTSTRAP: `AI-Dev-Shop/AGENTS.md` is missing in these clones. That is expected: do not look for it, do not stop, proceed with this prompt.
- If this job edits Jini, the runner must give you `/Users/la/Programming/jini-terra-d1` as a writable directory; if it is read-only, stop and say so.

Preconditions (check each; stop and report if one fails):
1. Stage 04 landed (ratchet below exits 0). 2. Tovu `node_modules` is linked to `/Users/la/Programming/jini-terra-d1` (stage 06 Preflight 2). 3. No other job is editing the same Jini package (ask the coordinator).

## Input
`development/refactor-patterns/move-to-jini/stage-14.files.tsv` (112 rows, 17.0k lines): DEDUPE-AFTER-HARDENING (33), DEDUPE-UNVERIFIED (17), DELETE-AFTER-PARITY (50), plus 12 DEDUPE rows the designer routed here from stage 02 (their `route` column starts with `14:`). `home` lists the Jini survivor and the behaviour differences the survey found (e.g. `useAdminShellSession` vs Tovu `useAdminSession`: bootstrap and permissions). Paths are successor-applied: e.g. `source-control/commit-site.ts` is listed at `site-backup/commit-site.ts` once stage 04 has landed (`was` keeps the survey path).

## Owner gate D2 (persistent; applies to every row, symbol and fallback in this job)
Owner decision D2 (may `@jini-ai/core` hold runtime helpers outside `core/contracts/`?) is OPEN; its default is WAIT. Until the coordinator replaces this block with the owner's answer:
- A row or symbol whose destination is `@jini-ai/core` outside a `contracts` subpath, or whose survey text names core as its home for runtime code, WAITS: do not move it, do not split it, and do NOT choose another package for it (not "the nearest domain package", not a new package). Report it as WAITING with `waits_on: owner:D2`.
- Not affected: types and interfaces under `@jini-ai/core/contracts/*`, and IMPORTING an existing `@jini-ai/core` export.


## Per row
0. Rows routed from stage 02 (`route` starts with `14:`): treat as DEDUPE-AFTER-HARDENING. `14: NEW-SURVIVOR` means Jini has no equivalent yet: the survivor is written in Jini test-first (step 3) as a NEW additive export on an EXISTING subpath (a new subpath = stage-12 kind D: report it), following the D2 gate, "Public API shape" and "Logging in moved code" rules of `development/refactor-patterns/move-to-jini/stage-06.terra-prompt.md`, then Tovu dedupes onto it (step 5).
1. DEDUPE-UNVERIFIED: first prove it is a duplicate (read both; same inputs, outputs, errors, side effects). Not a duplicate: reclassify (MIXED / STAY) in the report and stop on that row.
2. List each behaviour Tovu relies on that the Jini survivor lacks (cite Tovu file:line and Jini file:line).
3. For each: write the failing Jini test first and run it RED; then harden Jini ADDITIVELY (new optional parameter in the `optional` object, new port, or a fix that cannot change existing callers' results); run it GREEN; mutate the fix once to prove the test catches it, restore. A hardening that would change an existing Jini caller's behaviour: stop on that row, report it (owner decision).
4. Typecheck + build the Jini package, add `.changeset/move-to-jini-stage-14.md` lines (`minor`, new optional parameters named).
5. Tovu: as stage 02 (`development/refactor-patterns/move-to-jini/stage-02.terra-prompt.md` "What to do per row" steps 4-5): repoint, delete the Tovu copy, keep comments.
6. DELETE-AFTER-PARITY: parity proven by the tests from step 3 (or Jini already passing equivalent tests: cite them), then delete as stage 01 does.

## Ratchet gate (stage 04 has landed: every count must be 0; run before and after, paste both)
```
cd /Users/la/Programming/tovu-terra-d1
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --include-type --max-scc 0 --max-pairs 0
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --app admin --include-type --max-scc 0 --max-pairs 0
```
Exit code 1 = you added a feature cycle. Find it with `--edges` and undo the import that made it (moved code must not import back up into a Tovu feature).

## Rules for every edit
- Keep every comment. A comment that explains WHY moves with the code it explains; never delete one to make a move fit. Do not add new comments except the doc comments this prompt asks for.
- No new `as any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, non-null `!`, no lazy `await import()`.
- Do not change behaviour, error text, signatures or argument order unless this prompt says so. Functions keep the `(required, optional = {})` shape they have.
- Never `git add -A`, `git stash`, `git checkout -- <file>` or `git reset`. Other agents may share the tree.
- Run NO test suites and no repo-wide `tsc`. Allowed checks, one file at a time:
  - Tovu website/assistant/server test: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <one test file>`
  - Tovu admin test: `cd apps/admin && npx vitest run <one test file> --maxWorkers=2`
  - Jini test: `cd /Users/la/Programming/jini-terra-d1 && pnpm --filter @jini-ai/<pkg> exec vitest run <one test file> --maxWorkers=2`
  - Jini typecheck of a package you touched: `cd /Users/la/Programming/jini-terra-d1 && pnpm --filter @jini-ai/<pkg> exec tsc -p tsconfig.json --noEmit`
  - Lint: `npx eslint <changed files>` (no new errors).
  Single-file tests only. Leave nothing running; if a command hangs past 5 minutes, kill only the process you started.
- Commit with explicit paths: `git add -- <paths> && git commit -F msg -- <paths>` (one commit per repo per stage; message given below; end it with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). If `.git` is read-only in your sandbox, do not commit; list every changed path in the report instead. Never push.

Commit messages: Jini `fix(<pkgs>): parity for host duplicates (move-to-jini stage 14)`; Tovu `refactor(tovu): drop duplicates now covered by Jini (move-to-jini stage 14)` + `Jini-Base:` trailer.

## Report (your final message)
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), WAITING, or SKIPPED (why). Use the row's `was` path if set, else its path, as the key. Every row that is not DONE also gets `waits_on:` = what must land first: `path:<tovu path>` (a file that must be gone), `stage:<id>` (e.g. `stage:15-cms`), `owner:<Dn>`, or `design:<one line>`. The coordinator copies these into `development/refactor-patterns/move-to-jini/ledger.tsv`; rows come back automatically when their dependency lands (`stage-lists.mjs --retry`).
   Every file or symbol you moved or renamed: one line `SUCCESSOR <old path>[#symbol] -> <new path or @jini-ai specifier>[#symbol]` (the coordinator copies them into `successors.tsv` so later stage lists follow the code).
2. The gate outputs (before/after).
3. Commits (sha + repo) or, if `.git` was read-only, the changed paths.
4. Anything surprising, in one line each. Do not paste diffs.
5. Per row: differences found, tests added (path), Jini change in one line, or the owner decision needed.
