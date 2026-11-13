HARD RULE (first): stop before ~250k tokens of context. If you get close, commit what is done (explicit paths), write a REMAINING list in your report, and stop. Stopping early at a committed point is always correct.

# OPUS -> TERRA job, stage 15: split the MIXED files (function-level)

EXECUTOR: Opus writes a split spec per package batch; Terra applies each spec with the stage 06-11 mechanics. Largest stage (474 files, 145.3k lines): run it in batches, never all at once.

## Repos
- Tovu clone: `/Users/la/Programming/tovu-terra-d1` (branch `design-d1`). Jini clone: `/Users/la/Programming/jini-terra-d1`. Work ONLY in these two. Never read-modify-write `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini` (the live trees); never run `npm run link:jini`, `npm install` or `pnpm install` yourself.
- BOOTSTRAP: `AI-Dev-Shop/AGENTS.md` is missing in these clones. That is expected: do not look for it, do not stop, proceed with this prompt.
- If this job edits Jini, the runner must give you `/Users/la/Programming/jini-terra-d1` as a writable directory; if it is read-only, stop and say so.

Preconditions (check each; stop and report if one fails):
1. Stages 04, 06-14 landed (the ratchet below exits 0; their reports exist). 2. Tovu `node_modules` linked to `/Users/la/Programming/jini-terra-d1`.

## Owner gate D2 (persistent; applies to every row, symbol and fallback in this job)
Owner decision D2 (may `@jini-ai/core` hold runtime helpers outside `core/contracts/`?) is OPEN; its default is WAIT. Until the coordinator replaces this block with the owner's answer:
- A row or symbol whose destination is `@jini-ai/core` outside a `contracts` subpath, or whose survey text names core as its home for runtime code, WAITS: do not move it, do not split it, and do NOT choose another package for it (not "the nearest domain package", not a new package). Report it as WAITING with `waits_on: owner:D2`.
- Not affected: types and interfaces under `@jini-ai/core/contracts/*`, and IMPORTING an existing `@jini-ai/core` export.

The 40 rows naming `core` are covered by this gate: while it stands, their core symbols are not specced (list them as WAITING, `waits_on: owner:D2`); their other symbols may still be specced.

## Input
`development/refactor-patterns/move-to-jini/stage-15.files.tsv`. Batch order = fewest host contracts first, by package: http-kit, diagnostics, agent-runtime, agentic, mcp, desktop-host, plugins, integrations, db, user-management, daemon, agent-plugins, devops, chat, platform, admin, ui, cms, core (D2), then the 96 rows with no package (home decision per row, like stage 12 kind B). At most ~40 files per batch.

## Opus: the split spec (per batch), no code edits
Write `development/refactor-patterns/move-to-jini/stage-15/<batch>.split.tsv` with one row per symbol that moves: `path`, `symbol`, `kind` (function/type/const/class), `closure` (every same-file declaration the symbol needs, transitively, comma-separated; each closure member is either also a moving symbol row or is listed here and moves with it), `jini_pkg`, `export_key` (existing only; new = list separately as stage-12 kind D), `jini_file` (destination file path in Jini), `port` (name + members, `(required, optional = {})` shape, declared by the consumer, doc comment naming the binder), `api` (the public signature after the move; must be `(required, optional = {})`), `stays` (the Tovu symbols that stay in that file and call the Jini symbol), `tests` (Tovu tests that cover the symbol). Rules: a symbol moves only with its whole closure; a closure member that is also used by a `stays` symbol is NOT moved twice: it moves and the staying code imports it from Jini; never move a symbol that reads Tovu config, routes, env vars, `console.*` or feature modules unless that dependency becomes a port; the Tovu file keeps the product part plus the port binding and is never deleted by a split. Then generate the Terra prompt for the batch with the SPLIT template (never by copying the stage-06 MOVE prompt, which deletes whole files): `cd /Users/la/Programming/tovu-terra-d1 && python3 development/refactor-patterns/move-to-jini/write-prompts.py --split-batch <batch> --input development/refactor-patterns/move-to-jini/stage-15/<batch>.split.tsv`, which writes `development/refactor-patterns/move-to-jini/stage-15/<batch>.terra-prompt.md`. Commit the spec and prompt (explicit paths).

## Terra: apply the spec
The generated split prompt (symbol level): copy only the listed declarations and their closure into the Jini file, export them, declare the ports; in Tovu remove ONLY those declarations, import what the staying code still uses from Jini, keep every `stays` symbol byte-identical, keep the file. The ratchet gate must stay at 0. After each batch lands the coordinator appends `15-<batch>` to `development/refactor-patterns/move-to-jini/stages-landed.txt` and runs the stage-13 retry (rows waiting on that batch come back).

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

## Report (your final message)
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), WAITING, or SKIPPED (why). Use the row's `was` path if set, else its path, as the key. Every row that is not DONE also gets `waits_on:` = what must land first: `path:<tovu path>` (a file that must be gone), `stage:<id>` (e.g. `stage:15-cms`), `owner:<Dn>`, or `design:<one line>`. The coordinator copies these into `development/refactor-patterns/move-to-jini/ledger.tsv`; rows come back automatically when their dependency lands (`stage-lists.mjs --retry`).
   Every file or symbol you moved or renamed: one line `SUCCESSOR <old path>[#symbol] -> <new path or @jini-ai specifier>[#symbol]` (the coordinator copies them into `successors.tsv` so later stage lists follow the code).
2. The gate outputs (before/after).
3. Commits (sha + repo) or, if `.git` was read-only, the changed paths.
4. Anything surprising, in one line each. Do not paste diffs.
