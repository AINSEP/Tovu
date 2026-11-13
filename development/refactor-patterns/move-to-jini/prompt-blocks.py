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
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), WAITING, or SKIPPED (why). Use the row's `was` path if set, else its path, as the key. Every row that is not DONE also gets `waits_on:` = what must land first: `path:<tovu path>` (a file that must be gone), `stage:<id>` (e.g. `stage:15-cms`), `owner:<Dn>`, or `design:<one line>`. The coordinator copies these into `development/refactor-patterns/move-to-jini/ledger.tsv`; rows come back automatically when their dependency lands (`stage-lists.mjs --retry`).
   Every file or symbol you moved or renamed: one line `SUCCESSOR <old path>[#symbol] -> <new path or @jini-ai specifier>[#symbol]` (the coordinator copies them into `successors.tsv` so later stage lists follow the code).
2. The gate outputs (before/after).
3. Commits (sha + repo) or, if `.git` was read-only, the changed paths.
4. Anything surprising, in one line each. Do not paste diffs.
"""

READY = f"""## READY check (per row, before editing it; mechanical)
A row is READY only if ALL hold; otherwise mark it BLOCKED with the reason and do not touch it:
1. The file exists at the listed path.
2. Every import in the file is one of: an npm package that is already in the TARGET Jini package's `package.json` `dependencies` or `peerDependencies`; `@jini-ai/core` (any subpath); the target package itself (becomes a relative import); `node:*`; another file in this stage's READY set for the same package (moves with it); or a type that the row's `home` column names as a host contract (becomes a port, see "Ports").
   BLOCKED triggers: a `#src/...` or relative import of a Tovu file outside that set; a VALUE import from any other `@jini-ai/<pkg>`; `express` or any `express` type; `react` when the destination folder is not a `react/` folder; `apps/desktop` Electron imports; a direct `console.*` call (see "Logging in moved code"); a destination covered by the D2 gate (WAITING, not BLOCKED).
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

# Owner decision D2 (runtime code in @jini-ai/core outside contracts/) is OPEN and its default is WAIT.
# Every generated prompt carries this block so no fallback path can turn an unanswered D2 into a move
# or into a different owner (review d1 #9). The coordinator lifts it only by editing this block.
D2_GATE = """## Owner gate D2 (persistent; applies to every row, symbol and fallback in this job)
Owner decision D2 (may `@jini-ai/core` hold runtime helpers outside `core/contracts/`?) is OPEN; its default is WAIT. Until the coordinator replaces this block with the owner's answer:
- A row or symbol whose destination is `@jini-ai/core` outside a `contracts` subpath, or whose survey text names core as its home for runtime code, WAITS: do not move it, do not split it, and do NOT choose another package for it (not "the nearest domain package", not a new package). Report it as WAITING with `waits_on: owner:D2`.
- Not affected: types and interfaces under `@jini-ai/core/contracts/*`, and IMPORTING an existing `@jini-ai/core` export.
"""

# Moved code must not call console.* itself: a Jini consumer without the host's log redaction would
# receive whatever the thrown error carries (review d1 #12). Logging goes through an injected port.
LOG_PORT = """## Logging in moved code
A moved file (or symbol) that calls `console.error|warn|log|info|debug` is BLOCKED here ("needs a log port": stage 12). Stage 12 replaces the call with an injected reporting port in the function's `required` object, e.g. `report: (required: { label: string; error: unknown }, optional?: Record<string, never>) => void`, documented "the host binds this to its redacting logger"; Jini code never falls back to `console`. Before changing that behaviour, a Tovu test pins today's logged output through the host binding (redaction included) and must stay green after.
"""

# Public Jini API takes (required, optional = {}) objects (owner rule). A moved export with a
# positional/scalar signature would publish the wrong shape (review d1 #11).
API_SHAPE = """## Public API shape (every exported function a row moves into Jini)
Jini's public functions take `(required: {...}, optional: {...} = {})`. The pre-check column lists each exported function of the row that does not (`API name(params)`); check the rest yourself. For each one:
- Convert it ONLY when all hold: at most 3 parameters; every caller (Tovu and Jini, tests included: `rg -n -w <name> apps /Users/la/Programming/jini-terra-d1/packages`) calls it directly as `name(...)` (never passed as a value, spread, `.call`/`.apply`, or re-exported under another name); at most 10 call sites; it is not a protocol hook called by a framework (Node loader `resolve`/`load`/`initialize`, a React component or `use*` hook).
- Mapping (mechanical): required parameters become fields of `required` with the SAME names (`decodeStrictBase64(value: string)` -> `decodeStrictBase64(required: { value: string }, _optional: Record<string, never> = {})`); optional or defaulted parameters become fields of `optional` with their defaults kept (`optional: { limit?: number } = {}` then `const { limit = 50 } = optional`). Rewrite EVERY call site (`decodeStrictBase64(x)` -> `decodeStrictBase64({ value: x })`). Update `@param x` doc lines to `@param required.x`; keep the rest of the doc comment.
- Any condition fails: the row is BLOCKED "API shape: <name>" (stage 12 decides the mapping). Never publish a positional export.
"""

# Own-package imports: rewrite to the DECLARING leaf file, never to an entry/barrel that will
# re-export the moved file (that is index -> moved -> index; review d1 #6).
OWN_PKG = """## Imports of the target package itself
Rewrite each `@jini-ai/<pkg>/<subpath>` (or `@jini-ai/<pkg>`) import of a moved file to a relative path to the file that DECLARES the imported name: open the subpath's entry file, follow its `export ... from` lines to the declaring file (at most 3 hops), and import that file. Never import an `index.ts`, `entry.ts` or any file whose only job is re-exporting, and never the entry file you are about to add this file to. If a name is declared in the entry file itself, the row is BLOCKED "own-entry import" (moving that declaration to a leaf is an Opus decision).
"""
