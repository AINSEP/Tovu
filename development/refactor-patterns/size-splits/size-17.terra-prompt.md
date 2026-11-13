# Terra job size-17: split 4 Jini file(s) by responsibility (size limits)

Generated 2026-11-13 by `development/refactor-patterns/size-splits/assemble.mjs` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.

Repo: the Jini clone you are given (Jini only; never edit Tovu). `TOVU` below = the Tovu clone path the coordinator gives you (only for the read-only `outline.mjs` tool). Run `pnpm install --frozen-lockfile` once if `node_modules` is missing.

READY: these files are not reshaped by the Tovu→Jini move.

## Rules
Owner-approved 2026-11-13. These rules are binding for every `size-NN` job and every hard-file plan.
They are inlined into each Terra prompt, so a job needs nothing else.

## Limits and how lines are counted
- A file is over when it has more than **500** counted lines; a function (incl. a React component, hook,
  method, arrow) when it has more than **100**. Counted = non-blank after comments are removed (ESLint
  `max-lines` / `max-lines-per-function` with `skipBlankLines` + `skipComments`). Nested functions count
  on their own, and they also count inside their parent.
- Measure and check with the outline tool (read-only, TypeScript from `<root>/node_modules`):
  `node <TOVU>/development/refactor-patterns/size-splits/outline.mjs --root <repo with node_modules> <file>` prints
  every top-level declaration (range, counted lines, same-file names it uses) and, for each function over
  100, its body statements with `decl:` (locals it creates) and `uses:` (earlier locals/params it reads).
  `--check <files...>` prints only what is still over and exits 1 if anything is.
- Exempt (never split): `development/scripts/size-exceptions.json` (locale `*-i18n.ts(x)`, `i18n-common.ts`,
  `*.generated.*`, `migration(s)/`, plus listed entries). `composition/deps.ts` and `composition/app.ts`
  are NOT exempt.

## What a split is
1. **Split by responsibility, never by line number.** Each new module does one job you can name in a few
   words (its file name says it). Each helper does one step you can name. If a piece has no nameable job,
   it stays where it is.
2. **A long function becomes helper functions in the SAME file.** Helpers go at module level directly
   above the function they came from, in the order they run. A step that needs many of the function's
   locals becomes a helper that takes them as one object; for a React hook, a group of state + effects
   becomes a sub-hook `useXxx` in the same file. Only when the file itself is then over 500 do helpers
   move to a sibling file (as the plan says).
3. **A long file splits into sibling modules** in the same folder, named `<original-stem>-<job>.ts(x)`
   (or the name the plan gives). The original file keeps its own name and its main job, and imports
   what moved. No new folder unless the plan says so.
4. **Imports follow the move.** Every importer of a moved export imports it from its new module
   (find them with `rg -n "from ['\"].*<old-stem>(\.js)?['\"]"` across the repo, tests included). The old
   file does NOT re-export moved names — except when the old file is a package entry (a target in a
   `package.json` `exports` map, or an `index.ts` that is one): then it keeps `export { x } from "./new.js"`
   so the public API is unchanged.
5. **No import cycles.** A new module never imports the file it was cut out of. Types both sides need move
   into the new module (or a `<stem>-types.ts` sibling when the plan says so).
6. **Behaviour does not change.** Same statements, same order, same awaits, same error text, same exports
   from the package. Only what crosses a new boundary changes: locals become parameters / return values.
   Do not "improve" code you move.
7. **"Why" comments move with their code** — word for word, including the comment above a moved
   statement and the file header paragraph that explains a moved part (copy that paragraph into the new
   file's header; keep the original header's other paragraphs).
8. **Arguments: `(required, optional = {})`.** A new helper takes ONE destructured object of required
   inputs and, only if it has optional inputs, a second object defaulting to `{}`:
   `function applyRow({ row, store }: ApplyRowInput, { signal }: ApplyRowOptions = {}): Promise<void>`.
   No new positional primitive parameters. Name the input type `<Helper>Input` (and `<Helper>Options`)
   unless the plan names it. Sub-hooks follow the same rule.
9. **React components take props only.** State, effects, refs, callbacks and data loading live in
   `<Component>.hooks.ts` (or the existing hooks file the plan names). A component split into
   sub-components passes plain props; a sub-component never receives the whole hook result object unless
   the plan says so.
10. **Banned:** `eslint-disable` (any form), `as any`, `as unknown as`, non-null `!`, `@ts-ignore`,
    `@ts-expect-error`. If a type does not line up after a move, export the existing type from where it
    lives — never loosen it. A pre-existing `eslint-disable-next-line` / `biome-ignore` on a moved line moves
    with that line unchanged (the diff shows it moved, not added); never add a new one.
11. **Tests are not edited**, except an import path of a moved symbol. Before moving an export, run
    `rg -n "vi\.mock\(|mock\.module\(|jest\.mock\(" <test dirs of the file>`: if a test mocks the OLD module
    path and the code under test now gets the moved symbol from the NEW module, the mock stops applying —
    move the mock path in that test to the new module (the only other allowed test edit) and say so in the
    report.

## Running checks (no suites, nothing left running)
- Run ONLY the test files the plan lists for each file, one at a time, after that file is done:
  - Tovu `apps/website`, `packages/*`, `content/*`, `apps/site-chat`:
    `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <test file>`
  - Tovu `apps/admin`: `cd apps/admin && npx vitest run <path relative to apps/admin> --maxWorkers=2`
  - Tovu `apps/desktop` main (`src/` outside `renderer/`, `contracts/`):
    `cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=1 <file>`
  - Tovu `apps/desktop` renderer/contracts: `cd apps/desktop && node --import ./scripts/one-react.ts --import tsx --test --test-concurrency=1 <file>`
  - Jini: `pnpm --filter <package name> exec vitest run <path relative to the package> --maxWorkers=2`, then
    `pnpm --filter <package name> run typecheck` once per touched package (Jini packages are small enough).
- Tovu: no full `tsc` (admin tsc needs 2+ GB). Run `npx eslint <changed files>` (no new errors, no
  `max-lines`/`max-lines-per-function` warnings left on the planned items).
- Done check per file: `outline.mjs --check <original file> <new files>` → every planned item `OK`
  (an item the plan says stays over, e.g. an owner exception candidate, is listed in the report).
- No watch modes, no dev servers, no suites; kill nothing you did not start; leave nothing running.

## Commit and report
- One commit per file (or per tightly coupled pair the plan names), by explicit paths only:
  `git add -- <paths> && git commit -F msg -- <paths>`; message `refactor(<area>): split <file> by responsibility (size)`.
  Never push, never `git add -A`, never stash or checkout other files.
- If a plan step cannot be done as written (an anchor is missing, a cycle appears, a test fails and
  the cause is the split), stop that file, revert only that file's uncommitted changes
  (`git restore -- <its paths>`, delete its new files), and report it — never improvise a different split.
- Report: per file `OK` / `STOPPED (reason)`, new files, before → after counted lines, tests run with
  pass/fail counts, and any test-mock path you moved.

## For each file, in the order listed
1. `node $TOVU/development/refactor-patterns/size-splits/outline.mjs --root <repo with node_modules> <file>` — confirm every declaration / statement anchor the plan names exists. A missing anchor = STOP this file.
2. Complete the test list: `rg -l "<file stem>" <app or package dir> --glob '*.test.*'` (colocated tests are easy to miss); add any hit that exercises the file.
3. Run those tests once BEFORE editing (baseline). A test already failing is noted and compared after; it is not yours to fix.
4. Do the plan's steps in order. After the file: tests again (same pass count), `npx eslint <changed files>`, `outline.mjs --check <original> <new files>`, Jini: the package typecheck. Then commit that file.
5. Worked example of the expected style: `development/refactor-patterns/size-splits/EXAMPLE.md` in the Tovu clone (optional reading).

## Files
### jini:packages/daemon/src/http/xai.ts
- **Over:** file 510 lines (no function over 100)
- **Phase:** now · **Batch:** size-17
- **Package entry:** not an exports target; `./http` → `src/http/index.ts`. If index.ts re-exports `XaiSearchResponse` (or any moved name) from `./xai.js`, retarget that name to the new module (`rg -n "xai" src/http/index.ts`).
- **Tests:** `rg -l "http/xai|\.\./xai(\.js)?'" src` — run every hit (expected `src/http/__tests__/xai*.test.ts`) + `src/http/__tests__/index.test.ts`. Check `vi.mock` in those files for `./xai.js` before moving.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A (stays) | constants, `XaiInternalErrorContext`, `XaiHttpDeps`, `ResolvedXaiHttpDeps`, dep resolvers, OAuth listener state (`pendingOAuthStates`, `stopListener`, `oauthStartQueues`, `serializeOauthStart`), `redactError`, `toStoredOAuthToken`, `persistToken`, `handleListenerCallback`, all `xai*Route` consts, `parseXaiOauthComplete`, `callXaiSearch`, `registerXaiRoutes` | OAuth flow + routes |
| B | `isRecord`, `nonEmptyString`, `parseOptionalString`, `parseOptionalBoolean`, `parseOptionalStringArray`, `XaiSearchRequest`, `parseXaiSearch`, `XAI_SEARCH_OPTIONAL_FIELDS`, `isProvidedSearchValue`, `XaiSearchResponse`, `outputContentBlocks`, `extractAnswerText`, `urlCitationOf`, `extractUrlCitations`, `buildXSearchTool`, `XaiCallGuard`, `xaiCallFailure`, `postXaiResponses`, `readXaiJson` | Responses-API request/response shaping for `x_search` + body parsing |

- **Splits:**
  1. NEW `xai-search-payload.ts` — unit B verbatim, source order (the `// ----` section banners and every comment move). Exports what xai.ts uses (`isRecord`, `nonEmptyString`, `XaiSearchRequest`, `parseXaiSearch`, `XaiSearchResponse`, `extractAnswerText`, `extractUrlCitations`, `buildXSearchTool`, `XaiCallGuard`, `postXaiResponses`, `readXaiJson`). Imports nothing from xai.ts (confirm `DEFAULT_SEARCH_TIMEOUT_MS` etc. are not read by unit B; per outline they are not).
- **Importers to update:** `src/http/index.ts` only if it names a moved export; tests per rg above.
- **After:** xai.ts ~365; xai-search-payload ~150.
- **Risks / notes:** `callXaiSearch` and `xaiSearchRoute` stay (they need `ResolvedXaiHttpDeps`), so there is no cycle.

### jini:packages/daemon/src/store/event-log/sqlite.ts
- **Over:** `bindSqliteEventLog` 106
- **Phase:** now · **Batch:** size-17
- **Package entry:** IS the `./store/event-log/sqlite` exports target; no export moves, so its public surface is unchanged.
- **Tests:** `src/store/event-log/__tests__/sqlite.f1.test.ts` (+ any other file in that folder), `src/__tests__/slow-watchdog-resume.regression.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | statements in `bindSqliteEventLog` | job |
|---|---|---|
| A | `const getRunStmt = db.prepare…` through `const deleteRunStmt = …` (15 prepared statements) | prepare the SQL statements |
| B (stays) | options, schema exec, `appendTxn`, `replaySync`, `dropTxn`, return | event-log behaviour |

- **Splits:**
  1. HELPER `prepareEventLogStatements({ db }: PrepareEventLogStatementsInput): EventLogStatements` — module level above `bindSqliteEventLog` ← the 15 `db.prepare` statements verbatim (same generic type arguments, same SQL text), returning `{ getRunStmt, insertRunStmt, …, deleteRunStmt }`. `interface EventLogStatements` spells each field as `ReturnType<typeof db.prepare<…>>`'s concrete type (`Statement<[string], RunRow>` etc. from the SqliteDb port) — no `any`.
  2. `bindSqliteEventLog` calls it AFTER the schema `db.exec` (same order: schema first, then prepare) and destructures the names.
- **Importers to update:** none.
- **After:** `bindSqliteEventLog` ~64; helper ~44; file ~200.
- **Risks / notes:** preparing must stay after `db.exec(SQLITE_EVENT_LOG_SCHEMA)` (tables must exist). If the `SqliteDb` port has no exported statement type, export the existing one from where it is declared.

### jini:packages/daemon/src/surface-exchanges.ts
- **Over:** `createSurfaceExchangeStore` 119 (its `store` literal 109; the `open` method alone ~85)
- **Phase:** now · **Batch:** size-17
- **Package entry:** IS the `./surface-exchanges` exports target; no export moves.
- **Tests:** `src/__tests__/surface-exchanges.run-lifetime.test.ts`, `src/__tests__/injected-ports.test.ts`, `src/http/__tests__/surface-callback.test.ts`, `src/tool-recovery/__tests__/recovery.test.ts`, `recovery-branches.test.ts`, `src/agent-executor/__tests__/access-approval-transport.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `open({ binding, emit }, _optional = {})` method body | one exchange: inbox, waiters, idle/lifetime timers, send/receive/close |
| B (stays) | validation, `openExchanges`, `restoration`, `restore`, `deliver`, `findTypedAnswerTarget`, `size` | the store |

- **Splits:**
  1. HELPER `openSurfaceExchange({ binding, emit, deps, openExchanges, restoration, idleTtlMs, maxLifetimeMs }: OpenSurfaceExchangeInput): SurfaceExchange` (use the existing return type of `SurfaceExchangeStore['open']`; export it from its declaring module if it is not exported) — module level above `createSurfaceExchangeStore` ← the `open` body verbatim, incl. all inner comments. The method becomes `open({ binding, emit }, _optional = {}) { return openSurfaceExchange({ binding, emit, deps, openExchanges, restoration, idleTtlMs, maxLifetimeMs }); }`.
- **Importers to update:** none.
- **After:** `createSurfaceExchangeStore` ~35; `openSurfaceExchange` ~86; file ~200.
- **Risks / notes:** the pre-existing `waiters.shift()!` and `lifetime!.runId` non-null assertions move verbatim (not new). `deps` type: name the existing parameter type (inline object) as `SurfaceExchangeStoreDeps` in the same file.

### jini:packages/daemon/src/terminal-session.ts
- **Over:** `createTerminalSessionManager` 101
- **Phase:** now · **Batch:** size-17
- **Package entry:** re-exported by `src/index.ts` (`export * from './terminal-session.js'`); no export moves.
- **Tests:** `src/__tests__/terminal-session.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `const terminalService =` (~L210, 16 lines) | build the platform terminal service from options |
| B (stays) | `metadata`, `locks`, ownership check, CRUD/IO functions, return | per-principal session management |

- **Splits:**
  1. HELPER `createManagedTerminalService({ options }: CreateManagedTerminalServiceInput): ManagedTerminalService` (type = the initializer's current type; name it via the platform type it returns) — module level above the manager ← the `terminalService` initializer verbatim (its comment moves).
- **Importers to update:** none.
- **After:** `createTerminalSessionManager` ~86; helper ~18; file ~250.
- **Risks / notes:** pure construction; no ordering concern.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/daemon/src/http/xai.ts packages/daemon/src/store/event-log/sqlite.ts packages/daemon/src/surface-exchanges.ts packages/daemon/src/terminal-session.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
