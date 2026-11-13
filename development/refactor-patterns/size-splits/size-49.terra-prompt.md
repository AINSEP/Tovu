# Terra job size-49: split 4 Tovu file(s) by responsibility (size limits)

Generated 2026-11-13 by `development/refactor-patterns/size-splits/assemble.mjs` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.

Repo: the Tovu clone you are given (Tovu only). `TOVU` below = that clone's root.

AFTER-MOVE: run this job only after the Tovu→Jini move work for these files has landed. If a file is gone, or `outline.mjs` no longer shows the declarations a fragment names, STOP that file and report it — the plan is stale for it.

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
### tovu:apps/admin/src/features/trash/hooks/use-trash.hooks.ts
- **Over:** `useTrash` 143 (file 191)
- **Phase:** after-move (MOVE-AFTER trash module) · **Batch:** size-49
- **Tests:** `apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx`, `apps/admin/src/features/trash/__tests__/Trash.unit.test.tsx`, `apps/admin/src/features/trash/__tests__/trash-i18n.unit.test.ts`
- **Responsibility map** (statements of `useTrash`): refresh subscription + users lookup (stay) · A paging (first page + accumulated "Load more" pages) · B selection reconcile · C restore/purge actions.
- **Splits** (SUB-HOOKS, same file, above `useTrash`, called in this order where the first statement of each group stood):
  1. `useTrashPages({ port, locale, invalidate, setActionError }: UseTrashPagesInput): TrashPages` ← `const firstPage = useFetchQuery({` (with the `staleTime: 0` comment), `morePages`/`moreCursor`/`loadingMore` states, `loadingMoreRef` (+ "latest call wins" comment), `pageSettlement`, `resetMorePages`, the refetch `useEffect`, `const items = …`, `loadMore`, `reloadAfterAction`, `refresh`. Returns `{ firstPage, items, moreCursor, loadingMore, loadMore, reloadAfterAction, refresh }`.
  2. `useTrashSelection({ items }): { selected, setSelected }` ← `selected` state + `visibleIds` + its reconcile `useEffect` (comment moves).
  3. `useTrashActions({ port, locale, items, selected, setSelected, reloadAfterAction, setActionError }): TrashActions` ← `notice`, `busy`, `purgeConfirmOpen` states, `selectedItems`, `onRestoreSelected`, `onPurgeConfirmed`.
  `useTrash` keeps `port/locale`, `invalidate`, `invalidateList` + subscription, `usersQuery`, `actorUsernames`, `actionError` state, the three calls, and `return {`.
- **Importers to update:** none.
- **After:** `useTrash` ~50; sub-hooks ~65 / ~15 / ~48; file ~205.
- **Risks / notes:** `useState` declaration order shifts between groups (stable across renders; no behaviour change). `firstPage` must be declared before `usersQuery`? No dependency — but keep `useTrashPages` call where `firstPage` was (before `usersQuery`) to keep fetch order identical. MOVE-AFTER: whole hook moves with the trash module; split holds.

### tovu:apps/admin/src/lib/browser-stream.ts
- **Over:** `startBrowserStream` 104 (file 150)
- **Phase:** after-move (MOVE-AFTER stream-activity, vi…) · **Batch:** size-49
- **Tests:** `apps/admin/src/lib/__tests__/browser-stream.unit.test.ts`
- **Responsibility map:** `startBrowserStream` is one closure state machine (`disposed`, `away`, `hiddenSince`, `stopConnection`, `stopTimer`, `lock`, `releaseLock`, `channel` are `let`s mutated by `halt`/`open`/`acquire`/`reconcile`/`reconcileTab`/listeners/`stop`). Its inline parameter types take ~8 counted lines.
- **Splits:**
  1. TYPES (same file, above the function): `interface StartBrowserStreamInput<Frame> { key: string; connect: …; receive?: … }` and `interface StartBrowserStreamOptions { ports?: BrowserStreamPorts; scope?: "origin" | "tab"; activity?: StreamActivity }`, copied exactly from the inline annotations. The signature becomes `startBrowserStream<Frame>({ key, connect, receive = () => {} }: StartBrowserStreamInput<Frame>, { ports = browserStreamPorts(), scope = "origin", activity }: StartBrowserStreamOptions = {}): () => void`. Body untouched.
- **Importers to update:** none (export the two interfaces only if eslint/tsc asks; nothing imports them).
- **After:** `startBrowserStream` ~96; file ~158.
- **Risks / notes:** no behaviour change. If the outline still counts > 100, stop: the body cannot be split without turning shared `let`s into an object (behaviour risk).
- **Owner exception candidate:** fallback only — the body is a single closure state machine whose steps all mutate shared locals; no helper can leave without carrying that state.

### tovu:apps/desktop/src/project-ipc.ts
- **Over:** file 1082 lines · `registerSiteIpcHandlers` 229
- **Phase:** after-move (MIXED) · **Batch:** size-49
- **Tests:** `apps/desktop/src/project-ipc.test.ts`, `project-ipc-dispatch.test.ts`, `add-site-button-wiring.test.ts`, `add-site-copy.test.ts`, `profile-isolation.test.ts`, `shared-sites-home.test.ts`, `agent-plugin-tokens.test.ts`, `desktop-reported-regressions.test.ts`, `copied-external-database.test.ts`, `main-shutdown-wiring.test.ts`, `main-project-wiring.test.ts`, `site-transitions.test.ts`, `runner-ipc-stubs.test.ts`, `main/boot/site-preview.test.ts` (desktop main runner). No `mock.module` of this file.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| T | every `interface`/`type` from `PresenceSender` … `AddSitePointerLike`, `SiteRecordDeps`, `SharedRunning`, `ProjectIpcDeps`, `SitePresence` | the ports/types all handlers share |
| R | `describeLastExit`, `siteLifecycle`, `siteRecordPresentation`, `siteExternalUrl`, `siteStatusDetail`, `siteExternalLauncher`, `siteDisplayName`, `siteRecordLifecycle`, `buildSiteRecord` | build one `SiteRecord` from a row + live state |
| S | `handleStart`, `explainMissingSiteDir`, `handleStop`, `stopExternalServer`, `stopSiteServer`, `markTransition` | start / stop one site's server |
| D | `foreignServerMessage`, `unreadableRegistryMessage`, `liveForeignServers`, `handleDelete`, `deleteProject`, `assertNoOtherServer`, `removeFromSharedCatalog`, `closeStoppedProject`, `eraseProjectDirectory` | guarded delete |
| L | `SITE_PRESENCE_CHANNEL`, `createSitePresence`, `scheduleSiteRetry`, `isHighSiteRss`, `siteRssOverTime`, `currentSiteRss`, `siteFailureDetails` + the closure functions `stateFor` … `maintainSite` inside `registerSiteIpcHandlers` | per-site runtime: retries, presence, idle sleep, RSS restart |
| C | `SITE_IPC_CHANNELS`, list/create/add/import/rename/locate/open/preview/rescan/folders handlers, `registerSiteIpcHandlers` | IPC verbs + registration (stays) |

- **Splits** (execution order; no new module imports `project-ipc.ts`):
  1. NEW `project-ipc-types.ts` — job: shared ports and types. Moves unit T verbatim with doc comments; `export` each. `SiteRecordDeps`/`SharedRunning` move too. Imports only types from other modules.
  2. NEW `project-ipc-site-record.ts` — job: one `SiteRecord` from a tracked row. Moves unit R. Exports `buildSiteRecord`, `siteRecordLifecycle` (and `describeLastExit` if C still needs it — rg).
  3. NEW `project-ipc-start-stop.ts` — job: start/stop a site's server. Moves unit S (keep the long `handleStop` "stop is one of them" history comment with it; copy the file-header paragraph that starts "`stop` is one of them" into its header). Exports `handleStart`, `handleStop`, `markTransition` if C uses it.
  4. NEW `project-ipc-delete.ts` — job: guarded erase of a site folder. Moves unit D. Exports `handleDelete`, `foreignServerMessage`, `unreadableRegistryMessage`.
  5. NEW `project-ipc-lifecycle.ts` — job: per-site runtime policy. Moves L's module functions + `createSitePresence` (exported) + `SITE_PRESENCE_CHANNEL` (exported). Lifts the closure into two factories sharing `ctx: SiteLifecycleContext = { deps, states, now, schedule, sleepMinutes, isDisposed: () => boolean, presence: () => SitePresence }`:
     - `createSiteStarts({ ctx }: { ctx: SiteLifecycleContext }): SiteStarts` ← `stateFor`, `cancel`, `manualStart`, `startSite`, `attemptStart`, `finishStart`, `recordFailure`, `onServerExit` verbatim, except `disposed` → `ctx.isDisposed()`, `states`/`now`/`schedule`/`deps` → `ctx.*`. Returns `{ stateFor, cancel, manualStart, startSite, recordFailure, onServerExit }`.
     - `requestIdleStop` → module level as is (reads no closure state).
     - `createSiteMaintenance({ ctx, starts }: CreateSiteMaintenanceInput): { notePresence; maintainSites }` ← `parkSite`, `notePresence`, `maintainSites`, `maintainSite` (`presence.has` → `ctx.presence().has`).
  6. IN `registerSiteIpcHandlers` (stays in `project-ipc.ts`): keep `now`/`schedule`/`sleepMinutes`/`states`/`let disposed`/`let maintenance`/`let keptAwake`; build `ctx` with `isDisposed: () => disposed` and `presence: () => presence` (the `const presence` is assigned before any IPC event can fire, same as today's hoisting). Lift four handler bodies to module-level functions above it: `handleKeepRunning({ deps, sender, input, starts, states })`, `handleSetHome({ deps })`, `handleSaveSettings({ deps, input })`, `handleRemoveFolder({ deps, input })` (error strings byte-identical). Every `deps.ipcMain.handle(...)` line stays, in the same order.
  7. Shrink the final `export { … }` block to what still lives here; `export type { … }` removed (types now come from `project-ipc-types.ts`).
- **Importers to update:** `apps/desktop/src/main/index.ts` (`ProjectSiteLifecycle` → `./project-ipc-types.ts`); `project-ipc.test.ts` (`buildSiteRecord`, `siteRecordLifecycle` → site-record; `handleDelete` → delete; `handleStart`, `handleStop` → start-stop; `createSitePresence` → lifecycle; `ProjectIpcDeps` → types); `main-shutdown-wiring.test.ts` (`handleStop`); `add-site-copy.test.ts`, `desktop-reported-regressions.test.ts`, `copied-external-database.test.ts` (`handleStart`); `add-site-button-wiring.test.ts`, `profile-isolation.test.ts`, `project-ipc-dispatch.test.ts` (`ProjectIpcDeps` type).
- **After:** `project-ipc.ts` ~470; `registerSiteIpcHandlers` ~75; `project-ipc-types.ts` ~190; `-site-record.ts` ~95; `-start-stop.ts` ~90; `-delete.ts` ~85; `-lifecycle.ts` ~230 (`createSiteStarts` ~90).
- **Risks / notes:** EXECUTE WITH FABLE/OPUS, not Terra: the lifecycle closure shares mutable `disposed`, `keptAwake`, `maintenance` and a `presence` ↔ `notePresence` mutual reference; swapping `disposed` reads for `ctx.isDisposed()` must not miss one (rg `disposed` in the moved bodies; 6 reads). `keptAwake` and `maintenance` stay in `registerSiteIpcHandlers` (read by `presence` options / `maintain`). Cycle check: start-stop imports site-record + types; lifecycle imports start-stop + types; delete imports types only. After-move: the survey marks the file MIXED — the generic retry/presence policy in `project-ipc-lifecycle.ts` is the likely Jini candidate; this split isolates it so the move takes that one file. `project-ipc.test.ts` parses `SITE_IPC_CHANNELS` from source — it stays in `project-ipc.ts`.

### tovu:apps/desktop/src/renderer/workspace-chat-transport.ts
- **Over:** `createWorkspaceChatTransport` 101 (file 303, under)
- **Phase:** after-move (MIXED) · **Batch:** size-49
- **Tests:** `apps/desktop/src/renderer/workspace-chat-transport.test.ts`, `use-workspace-chat-transport.hooks.render.test.ts`, `App.hooks.test.ts`, `use-site-actions.hooks.test.ts` (renderer runner). No mocks of the module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | body of the `bridge.onChatEvent((message) => { … })` callback | route one pushed chat message to its subscription (event → `applyRunEvent`; non-terminal close → error; close → settle + forget) |
| B | `records`, `offChatEvent` registration, `open`, `detach`, returned `startRun` / `reattachRun` / `fetchRunStatus` / `stopRun` / `dispose` | the transport (stays) |

- **Splits:**
  1. HELPER (same file, module level, directly above `createWorkspaceChatTransport`, below `wireCancelSignal`): `routeChatEventMessage({ records, message }: RouteChatEventMessageInput): void` ← the callback body verbatim (both error strings byte-identical; early `return`s unchanged). `RouteChatEventMessageInput = { records: Map<string, SubscriptionRecord>; message: WorkspaceChatEventMessage }`. In the function: `const offChatEvent = bridge.onChatEvent((message: WorkspaceChatEventMessage) => routeChatEventMessage({ records, message }));` — the "One listener per transport instance" comment stays above it.
- **Importers to update:** none (no export moves).
- **After:** `createWorkspaceChatTransport` ~84; `routeChatEventMessage` ~20; file ~306.
- **Risks / notes:** the callback must still return `undefined` (the arrow returns the helper's `void`). After-move: survey says MIXED — the payload translators (`translate*`, `payloadTranslators`, `applyRunEvent`) are the generic `@jini-ai/protocol` → `@jini-ai/chat` mapping likely to move; this split touches only the transport factory, so it still holds after that move.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/admin/src/features/trash/hooks/use-trash.hooks.ts apps/admin/src/lib/browser-stream.ts apps/desktop/src/project-ipc.ts apps/desktop/src/renderer/workspace-chat-transport.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
