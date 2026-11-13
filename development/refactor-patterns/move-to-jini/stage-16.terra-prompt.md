HARD RULE (first): stop before ~250k tokens of context. If you get close, stop at a consistent point (no half-moved row or edge), list DONE rows and a REMAINING list in your report, and stop. Stopping early at a consistent point is always correct.

# Terra job, stage 16: final gates and the one coordinated Jini 0.8.0 version bump (no publish)

READY when the coordinator says the owner said "merge". Self-contained. Background only: `development/refactor-patterns/move-to-jini/PLAN.md` section 4.

## Why
All moves landed while Tovu used the linked Jini clone. This job prepares the single lockstep release: version bump in Jini (0.7.x -> 0.8.0 via the changeset files the stages wrote) and the matching dependency ranges in Tovu. Publishing and relinking are the coordinator's steps after this job (owner decision D1: one final release, no prereleases).

## Repos
- Tovu clone: `/Users/la/Programming/tovu-terra-d1` (branch `design-d1`). Jini clone: `/Users/la/Programming/jini-terra-d1`. Work ONLY in these two. Never read-modify-write `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini` (the live trees); never run `npm run link:jini`, `npm install` or `pnpm install` yourself.
- BOOTSTRAP: `AI-Dev-Shop/AGENTS.md` is missing in these clones. That is expected: do not look for it, do not stop, proceed with this prompt.
- If this job edits Jini, the runner must give you `/Users/la/Programming/jini-terra-d1` as a writable directory; if it is read-only, stop and say so.

## Preconditions (stop and report if one fails)
1. `ls /Users/la/Programming/jini-terra-d1/.changeset/move-to-jini-stage-*.md` lists the stage release notes.
2. Ratchet gate (below) exits 0 for website and admin.
3. `git -C /Users/la/Programming/jini-terra-d1 status --short` and `git -C /Users/la/Programming/tovu-terra-d1 status --short` show nothing staged or modified (untracked files are fine).

## Do
1. Removals (the only breaking part of 0.8.0): only the exports listed in `development/refactor-patterns/move-to-jini/stage-16.remove-exports.tsv` (written by the coordinator: package, export key, symbol, proof that no Tovu or Jini code imports it). If the file is missing, remove nothing. For each row: `rg -n -w "<symbol>" /Users/la/Programming/jini-terra-d1/packages /Users/la/Programming/tovu-terra-d1/apps` must show only the declaration; then delete the export line (and the declaration if nothing else uses it). Add a `major`-free note to `.changeset/move-to-jini-stage-16.md` (`"@jini-ai/<pkg>": minor`, "Removed `<symbol>` from `<export key>`; it only served a host shim.").
2. Jini version: `cd /Users/la/Programming/jini-terra-d1 && pnpm changeset version`. Expect every `@jini-ai/*` package at `0.8.0` (the changeset config is `fixed: [["@jini-ai/*"]]`). Check: `grep -h '"version"' packages/*/package.json | sort | uniq -c` shows one line, `0.8.0`. Anything else: stop and report (do not hand-edit versions).
3. Per touched package: `pnpm --filter @jini-ai/<pkg> exec tsc -p tsconfig.json --noEmit` (packages listed in the changesets only).
4. Tovu ranges: in the root `package.json` and every `apps/*/package.json`, change each `"@jini-ai/<pkg>": "^0.7.0"` (or `^0.7.1`) to `"^0.8.0"`. Do not touch the lockfile and do not install.
5. Do NOT run `npm publish`, `pnpm publish`, `changeset publish`, `npm run unlink:jini`, `npm install` or any tag/push. Those are the coordinator's steps, in this order: publish 0.8.0 from the Jini root, `npm run unlink:jini`, install, published-package typecheck (Tovu's release gate), cloud suites.

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
  Single-file tests only: never run a whole suite, a glob or a directory. Leave nothing running (no watchers, servers or background jobs); if a command hangs past 5 minutes, kill only the process you started.
- Do NOT commit and do NOT push, in either repo: the coordinator reviews and commits. Your report lists every changed, added and deleted path per repo.

Change summaries for the coordinator's commits: Jini `chore(release): version packages 0.8.0 (move-to-jini)`; Tovu `chore(deps): @jini-ai/* ^0.8.0 (move-to-jini stage 16)`.

## Report (your final message)
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), or SKIPPED (why). Use the row's path as the key.
2. The gate outputs (before/after).
3. Changed, added and deleted paths per repo (you do not commit).
4. Anything surprising, in one line each. Do not paste diffs.
5. The version check output and the list of `package.json` files changed.
