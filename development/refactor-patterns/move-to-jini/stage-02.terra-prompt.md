HARD RULE (first): stop before ~250k tokens of context. If you get close, commit what is done (explicit paths), write a REMAINING list in your report, and stop. Stopping early at a committed point is always correct.

# Terra job, stage 02: replace Tovu copies with the existing Jini export (DEDUPE)

READY. Self-contained. Background only: `development/refactor-patterns/move-to-jini/PLAN.md`.

## Why
The survey found Tovu code that duplicates something Jini already publishes. Tovu imports the Jini one and drops its copy. Jini does not change in this stage, so this needs no release.

## Repos
- Tovu clone: `/Users/la/Programming/tovu-terra-d1` (branch `design-d1`). Jini clone: `/Users/la/Programming/jini-terra-d1`. Work ONLY in these two. Never read-modify-write `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini` (the live trees); never run `npm run link:jini`, `npm install` or `pnpm install` yourself.
- The Tovu clone has no AI-Dev-Shop bootstrap; that is expected, proceed.
- If this job edits Jini, the runner must give you `/Users/la/Programming/jini-terra-d1` as a writable directory; if it is read-only, stop and say so.

## Input
`development/refactor-patterns/move-to-jini/stage-02.files.tsv` (45 rows). The `home` column names the Jini symbol(s) and package/subpath, e.g. "`AgentToolDefinition`/`AgentToolSideEffect` from `@jini-ai/core` (`core/src/agent-tools.ts:15,24`)"; the `label` column may name which Tovu symbols are duplicates.

## What to do per row
1. Identify the pairs: Tovu symbol -> Jini symbol, from `label` + `home`. If either side is not named explicitly, BLOCKED ("pair not named").
2. Prove the Jini symbol is exported from the INSTALLED package Tovu uses: `rg -n -w "<JiniName>" node_modules/@jini-ai/<pkg>/dist/<subpath or root>/index.d.ts` (follow `export * from` / `export { } from` lines one or two hops). Not exported: BLOCKED ("not in published Jini").
3. Prove they match: open the Jini declaration in `/Users/la/Programming/jini-terra-d1/packages/<pkg>/src/...`. Same parameter shape and return type, and for constants the same value. Differences in parameter ORDER or shape (Tovu positional vs Jini `(required, optional)`) are allowed only if the `home` text states the mapping; then rewrite each call accordingly. Any other difference: BLOCKED ("diverged: <one line>").
4. Repoint every importer of the Tovu symbol (`rg -n -w <TovuName> apps`) to `import { <JiniName> } from "@jini-ai/<pkg>/<subpath>"` (use `import type` for types; alias with `as` only if the Tovu name differs and renaming call sites would touch more than 20 lines).
5. Remove the Tovu declaration. If the Tovu file is left with no declarations (only imports/re-exports), delete it and repoint its remaining importers the same way. Its tests: a test that only tested the deleted Tovu copy is deleted (Jini has its own tests); otherwise repoint its import.

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
  Leave nothing running; if a command hangs past 5 minutes, kill only the process you started.
- Commit with explicit paths: `git add -- <paths> && git commit -F msg -- <paths>` (one commit per repo per stage; message given below; end it with the line `Co-Authored-By: Codex Terra <noreply@openai.com>`). If `.git` is read-only in your sandbox, do not commit; list every changed path in the report instead. Never push.

## Done check
- `rg -n -w <TovuName> apps` shows no declaration left for each DONE pair.
- `npx eslint <changed files>`; run each changed test file once.
## Cycle gate (run before and after; paste both outputs)
```
cd /Users/la/Programming/tovu-terra-d1
node development/refactor-patterns/move-to-jini/feature-cycles.mjs
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --include-type
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --app admin --include-type
```
The SCC sizes and mutual-pair counts after your change must be equal or smaller than before, in all three. If one grows, find the new edge with `--edges` and undo the import that made it.

Commit message: `refactor(tovu): import Jini instead of duplicate Tovu copies (move-to-jini stage 02)`.

## Report (your final message)
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), or SKIPPED (why). Use the row's path as the key.
2. The gate outputs (before/after).
3. Commits (sha + repo) or, if `.git` was read-only, the changed paths.
4. Anything surprising, in one line each. Do not paste diffs.
