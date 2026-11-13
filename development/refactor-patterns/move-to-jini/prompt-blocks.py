D = "development/refactor-patterns/move-to-jini"
TOVU = "/Users/la/Programming/tovu-terra-d1"
JINI = "/Users/la/Programming/jini-terra-d1"

BUDGET = """HARD RULE (first): stop before ~250k tokens of context. If you get close, commit what is done (explicit paths), write a REMAINING list in your report, and stop. Stopping early at a committed point is always correct.
"""

REPOS = f"""## Repos
- Tovu clone: `{TOVU}` (branch `design-d1`). Jini clone: `{JINI}`. Work ONLY in these two. Never read-modify-write `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini` (the live trees); never run `npm run link:jini`, `npm install` or `pnpm install` yourself.
- BOOTSTRAP: `AI-Dev-Shop/AGENTS.md` is missing in these clones. That is expected: do not look for it, do not stop, proceed with this prompt.
- If this job edits Jini, the runner must give you `{JINI}` as a writable directory; if it is read-only, stop and say so.
"""

RULES = """## Rules for every edit
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
"""

# Terra jobs never commit (the coordinator does); Opus/Fable jobs commit with explicit paths.
RULES_TERRA = """## Rules for every edit
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
"""

RULES_OPUS = """## Rules for every edit
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
"""

CYCLE_GATE = f"""## Cycle gate (run before and after; paste both outputs)
```
cd {TOVU}
node {D}/feature-cycles.mjs
node {D}/feature-cycles.mjs --include-type
node {D}/feature-cycles.mjs --app admin --include-type
```
The SCC sizes and mutual-pair counts after your change must be equal or smaller than before, in all three. If one grows, find the new edge with `--edges` and undo the import that made it.
"""

REPORT = """## Report (your final message)
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), or SKIPPED (why). Use the row's path as the key.
2. The gate outputs (before/after).
3. Commits (sha + repo) or, if `.git` was read-only, the changed paths.
4. Anything surprising, in one line each. Do not paste diffs.
"""

READY = f"""## READY check (per row, before editing it; mechanical)
A row is READY only if ALL hold; otherwise mark it BLOCKED with the reason and do not touch it:
1. The file exists at the listed path.
2. Every import in the file is one of: an npm package that is already in the TARGET Jini package's `package.json` `dependencies` or `peerDependencies`; `@jini-ai/core` (any subpath); the target package itself (becomes a relative import); `node:*`; another file in this stage's READY set for the same package (moves with it); or a type that the row's `home` column names as a host contract (becomes a port, see "Ports").
   BLOCKED triggers: a `#src/...` or relative import of a Tovu file outside that set; a VALUE import from any other `@jini-ai/<pkg>`; `express` or any `express` type; `react` when the destination folder is not a `react/` folder; `apps/desktop` Electron imports.
3. The destination subpath `"./<subpath>"` exists in `{JINI}/packages/<pkg>/package.json` `exports` (empty subpath means the package root `"."`). A missing subpath is BLOCKED (new subpaths are an Opus decision).
4. No file with the same basename already exists in the destination folder.
5. The file has no string that only makes sense in Tovu (the word `Tovu`, `tovu`, a Tovu route like `/api/admin/v1`, a Tovu env var `TOVU_*`) outside comments. In comments, drop Tovu SPEC/ADR/U/D IDs and the word Tovu by rewording minimally ("the host"); if the sentence cannot survive that, BLOCKED.
"""

PORTS = """## Ports (only when the row's `home` column names a host contract)
Declare the port in the moved Jini file, typed structurally with only the members the code uses, with a doc comment naming who fulfils it:
```ts
/** <What it does>. Typically fulfilled by the host's composition root. */
export interface <Name>Port { <members copied from the Tovu dependency's used members> }
```
Add it to the function's existing `required` object as `<name>: <Name>Port` (no default value). In Tovu, pass the existing implementation at every call site (`rg` the function name). If the call sites are more than 5 or the implementation needs new wiring in `server/runtime/composition/*`, the row is BLOCKED instead.
"""
