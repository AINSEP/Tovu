HARD RULE (first): stop before ~250k tokens of context. If you get close, commit what is done (explicit paths), write a REMAINING list in your report, and stop. Stopping early at a committed point is always correct.

# OPUS -> TERRA job, stage 15: split the MIXED files (function-level)

EXECUTOR: Opus writes a split spec per package batch; Terra applies each spec with the stage 06-11 mechanics. Largest stage (474 files, 145.3k lines): run it in batches, never all at once.

## Repos
- Tovu clone: `/Users/la/Programming/tovu-terra-d1` (branch `design-d1`). Jini clone: `/Users/la/Programming/jini-terra-d1`. Work ONLY in these two. Never read-modify-write `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini` (the live trees); never run `npm run link:jini`, `npm install` or `pnpm install` yourself.
- BOOTSTRAP: `AI-Dev-Shop/AGENTS.md` is missing in these clones. That is expected: do not look for it, do not stop, proceed with this prompt.
- If this job edits Jini, the runner must give you `/Users/la/Programming/jini-terra-d1` as a writable directory; if it is read-only, stop and say so.

Preconditions (check each; stop and report if one fails):
1. Stages 04, 06-14 landed (the ratchet below exits 0; their reports exist). 2. Tovu `node_modules` linked to `/Users/la/Programming/jini-terra-d1`. 3. Owner decision D2 answered for the 40 rows naming `core` (default: send them to the nearest domain package instead).

## Input
`development/refactor-patterns/move-to-jini/stage-15.files.tsv`. Batch order = fewest host contracts first, by package: http-kit, diagnostics, agent-runtime, agentic, mcp, desktop-host, plugins, integrations, db, user-management, daemon, agent-plugins, devops, chat, platform, admin, ui, cms, core (D2), then the 96 rows with no package (home decision per row, like stage 12 kind B). At most ~40 files per batch.

## Opus: the split spec (per batch), no code edits
Write `development/refactor-patterns/move-to-jini/stage-15/<batch>.split.tsv` with one row per symbol that moves: `path`, `symbol`, `kind` (function/type/const/class), `jini_pkg`, `export_key` (existing only; new = list separately as stage-12 kind D), `port` (name + members, `(required, optional = {})` shape, declared by the consumer, doc comment naming the binder), `stays` (the Tovu part that stays and calls the Jini symbol), `tests` (Tovu tests that cover the symbol). Rules: a symbol moves only with everything it needs (same-file helpers, types); never move a symbol that reads Tovu config, routes, env vars or feature modules unless that dependency becomes a port; keep the Tovu file as the product part plus the port binding. Then generate a Terra prompt for the batch: copy `development/refactor-patterns/move-to-jini/stage-06.terra-prompt.md`, replace its Input/table section with the spec (symbol-level), and keep every other section unchanged. Commit the spec and prompt (explicit paths).

## Terra: apply the spec
Same as stages 06-11, at symbol level: move the listed symbols (and their doc comments) into the Jini file at the export's folder (one Jini file per Tovu file, same basename unless it clashes), export them, declare the ports, then in Tovu import the symbols from Jini and bind the ports at the call sites the spec names. The ratchet gate must stay at 0.

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
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), or SKIPPED (why). Use the row's path as the key.
2. The gate outputs (before/after).
3. Commits (sha + repo) or, if `.git` was read-only, the changed paths.
4. Anything surprising, in one line each. Do not paste diffs.
