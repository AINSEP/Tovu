# Terra job size-39: split 2 Jini file(s) by responsibility (size limits)

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
### jini:packages/desktop-host/src/electron/updates/auto-update-controller.ts
- **Over:** `createAutoUpdateController` 116
- **Phase:** now (JINI 116) · **Batch:** size-39
- **Tests:** `src/__tests__/auto-update-controller.test.ts` (package `@jini-ai/desktop-host`). No test mocks the module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| S settings | `const clock` … `const messages` | resolve clock/timers/timing/copy from deps + options |
| L listeners | `if (isNativeUpdater(updater)) { updater.on(...` … `} else { … }` | register download/error listeners on either updater ABI |
| I install | `let installStarted = false;` + `startInstall` | hand installation to Squirrel with a fallback quit |
| C control | the remaining state, `onDownloaded`, `onError`, `otherInstances`, `heartbeat`, `check`, `tick`, `requestRestart`, returned API | update scheduling + quit policy (stays) |

- **Splits** (HELPERS in the same file, module level, directly above `createAutoUpdateController`, below `messageOf`):
  1. `function resolveUpdateSettings({ deps, options }: ResolveUpdateSettingsInput): UpdateSettings` with `interface UpdateSettings { now: () => number; timers: UpdateTimersPort; timing: UpdateTiming; messages: UpdateMessages }`. Body: the `clock`, `now`, `timers`, `timing` and `messages` statements verbatim, returning `{ now, timers, timing, messages }`. In the controller, `const { now, timers, timing, messages } = resolveUpdateSettings({ deps, options });` replaces those 5 lines. `startedAt = now()` stays right after it.
  2. `function registerUpdaterListeners({ updater, onDownloaded, onError }: RegisterUpdaterListenersInput): void`, holding unit L verbatim. Types: `updater: UpdaterLike; onDownloaded: (info: { version: string }) => void; onError: (error: unknown) => void`. The call goes at the same spot: `registerUpdaterListeners({ updater, onDownloaded, onError });`.
  3. `function createInstallHandoff({ updater, timers, timing, handles, log, messages, quit, isStopped }: CreateInstallHandoffInput): InstallHandoff` with `interface InstallHandoff { startInstall(required: { silent: boolean; relaunch: boolean }, _options?: Record<string, never>): boolean; started(): boolean }`. Body: `let installStarted = false;`, then `startInstall` verbatim with its doc comment and the "Arm before the handoff…" comment. Inside the fallback callback `if (!stopped) deps.quit();` becomes `if (!isStopped()) quit();`. Then `return { startInstall, started: () => installStarted };`. `log` takes the type of `deps.log`.
  - In the controller, delete `let installStarted = false;` and put `const install = createInstallHandoff({ updater, timers, timing, handles, log, messages, quit: () => deps.quit(), isStopped: () => stopped });` at that spot. Every read of `installStarted` (`onError`, `requestRestart`, `beforeFinalQuit` ×3) becomes `install.started()`. `startInstall(...)` becomes `install.startInstall(...)`.
- **Importers to update:** none (nothing new is exported).
- **After:** `createAutoUpdateController` about 92 lines. `createInstallHandoff` about 22, `registerUpdaterListeners` about 8, `resolveUpdateSettings` about 8. The file is about 255 counted lines.
- **Risks / notes:** `stopped` and `installStarted` are mutable `let`s. Every moved read goes through a getter (`isStopped()`, `install.started()`) evaluated at the same moment as before, so nothing is captured early. `quit` is wrapped as `() => deps.quit()` to keep the method-call form (`this`). Listener registration still runs during construction, in the same order relative to `updater.autoDownload`/`autoInstallOnAppQuit`.

### jini:packages/integrations/src/api-connections/host.ts
- **Over:** `createApiConnectionHost` 163 (file 222, under)
- **Phase:** now · **Batch:** size-39
- **Tests:** `rg -l "api-connections/host" packages/integrations --glob '*.test.*'` (run each, one at a time) + `pnpm --filter @jini-ai/integrations run typecheck`.
- **Responsibility map** (inner functions of `createApiConnectionHost`; all close over `required`):

| unit | statements (anchors) | job |
|---|---|---|
| A clients | `function clientFor(`, `function hostedCallbackUrl(`, `function byoCallbackUrl(`, `function hooksFor(`, `function serviceFor(` | resolve a connection's OAuth client, callback URLs, hooks and service |
| B honest records | `function tokensFor(`, `async function markReconnectRequired(`, `async function tokensForAnotherClient(`, `async function readHonestRecord(`, `const honestRecords` | read stored records without trusting tokens sealed for another client |
| C tool access | `async function declaredFor(`, `function accessTokensFor(`, `const toolConnections` | the connection port executable tools use |
| D host | state (`records`, `budgets`, `callbackInbox`, `pluginState`, `lastSignInAttempts`, `signInHandoffs`, `byoClients`), `listConnections`, `apiOriginsFor`, `requestedScopes`, `statusOf`, `sharedOAuth`, `prepareSignIn`, the return | compose the host |

- **Splits** (module-level factories above `createApiConnectionHost`, in order A, B, C; bodies word for word, comments move with each function):
  1. `createConnectionClients({ required, byoClients }: ConnectionClientsInput<State>): ConnectionClients` ← unit A; returns `{ clientFor, hostedCallbackUrl, byoCallbackUrl, hooksFor, serviceFor }`. Host: `const { clientFor, hostedCallbackUrl, byoCallbackUrl, hooksFor, serviceFor } = createConnectionClients({ required, byoClients });` placed where `clientFor` was declared (after `listConnections`).
  2. `createHonestRecords({ required, records, listConnections, clientFor }: HonestRecordsInput<State>): HonestRecords` ← unit B; returns `{ tokensFor, markReconnectRequired, readHonestRecord, honestRecords }`.
  3. `createToolConnections({ required, budgets, records, listConnections, serviceFor, markReconnectRequired, readHonestRecord }: ToolConnectionsInput<State>): { declaredFor, accessTokensFor, toolConnections }` ← unit C.
  Input fields = exactly the closure names each unit's bodies read (the outline's `uses:` is truncated at 14 names; the typecheck names any missing one). Types: `ConnectionClientsInput<State> = { required: ApiConnectionRuntimeHostDeps<State>; byoClients: WeakMap<DeclaredApiConnection, ByoClient | ApiConnectionError> }`, others alike; return types via `ReturnType<typeof createX>` are NOT allowed for the input side — declare inputs explicitly, outputs may be inferred.
- **Importers to update:** none (no export moves; `createApiConnectionHost` and `ApiConnectionHost` keep their signatures).
- **After:** `createApiConnectionHost` ~75; factories ~45 / ~30 / ~40; file ~240.
- **Risks / notes:** inner functions are hoisted today (function declarations), so a function used before its declaration line still works; after the split each factory call must come before the first use of anything it returns — order: `listConnections` → clients → honest records → `apiOriginsFor` → tool connections → rest. `byoClients` is one WeakMap shared by A and `listConnections`: pass the same instance, never create a second.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/desktop-host/src/electron/updates/auto-update-controller.ts packages/integrations/src/api-connections/host.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
