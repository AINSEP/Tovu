# Terra job size-44: split 8 Jini file(s) by responsibility (size limits)

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
### jini:packages/ui/src/features/memory/react/hooks/useMemoryExtractions.store.ts
- **Over:** `createExtractionHistoryStore` 144 (file 183)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/memory/__tests__/react/hooks/useMemoryExtractions.store.test.ts` (no mocks)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `MAX_ROWS`, `phaseProgress`, `mergeSameAttempt`, token/store interfaces | ordering rules + public types (unchanged) |
| B | `commitSnapshot` body math | reconcile a confirmed server snapshot against local rows (pure) |
| C | `upsertFrame` next-rows math | insert/merge one live frame into rows (pure) |
| D | `markPendingDelete`, `unmarkPendingDelete`, returned `beginDelete`/`settleDeleteSuccess`/`settleDeleteFailure` | per-id delete op lifecycle (never writes the store's `let`s) |
| E | rest of `createExtractionHistoryStore` | owns the mutable lets (`rows`, `clock`, `clearStamp`, `pendingClears`), frames, clear ops |

- **Splits** (same file, module level, above `createExtractionHistoryStore`):
  1. HELPER `reconcileSnapshot({ rows, confirmed, sinceClock, clearSupersedes, tombstones, pendingDeletes, rowStamp }: ReconcileSnapshotInput): { accepted: MemoryExtractionRecord[]; merged: MemoryExtractionRecord[] }` ← statements of `commitSnapshot` from `const accepted = clearSupersedes` through the `for (const row of accepted) { if (survivorIds.has…` merge loop. `commitSnapshot` keeps `const clearSupersedes = …`, calls the helper, then `const revision = commit(merged); for (const row of accepted) rowStamp.set(row.id, revision); return rows;` unchanged.
  2. HELPER `upsertRow({ rows, ev }: UpsertRowInput): MemoryExtractionRecord[]` ← `upsertFrame`'s `const at = rows.findIndex…` through the `if/else` that builds `next` (returns `next`). `upsertFrame` keeps `rowStamp.set(ev.id, commit(upsertRow({ rows, ev })));`.
  3. FACTORY `createDeleteOps({ getRows, commit, pendingDeletes, deferred, tombstone, applyFrame }: CreateDeleteOpsInput): Pick<ExtractionHistoryStore, 'beginDelete' | 'settleDeleteSuccess' | 'settleDeleteFailure'>` ← `markPendingDelete`, `unmarkPendingDelete` (with its "Returns true when this was the LAST…" comment, verbatim, as inner functions) and the three returned methods, with `rows` read through `getRows()` (each read site becomes `getRows()`; no commit sits between the two reads in `beginDelete`, so values are identical). The store's return object spreads `...createDeleteOps({ getRows: () => rows, commit, pendingDeletes, deferred, tombstone, applyFrame })` in the same key position. `beginClear` still reads `pendingDeletes.keys()` directly.
- **Importers to update:** none (no export moves).
- **After:** `createExtractionHistoryStore` ~92; file ~195.
- **Risks / notes:** `applyFrame`/`commit` are function declarations (hoisted) — pass them after they are declared, at the return statement. The non-null `!` already in `unmarkPendingDelete`/`rowStamp.get(...)!` moves as-is (pre-existing; do not add new ones). Key order of the returned object is not observable but keep it.

### jini:packages/ui/src/features/notifications/react/components/NotificationsTab.tsx
- **Over:** `NotificationsTab` 134 (file 239)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/notifications/react/components/__tests__/NotificationsTab.characterization.test.tsx`, `packages/ui/src/features/notifications/__tests__/react/components/NotificationsTab.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `useState` permission/testStatus, `toggleSound`, `toggleDesktop`, `sendTestNotification` | notification state + handlers |
| B | `label` + the 13 `const xxx = label({...})` lines | resolve label copy |
| C | JSX first `<div className="jini-settings-subsection">` | completion-sound section |
| D | JSX second `<div className="jini-settings-subsection">` | desktop-notification section |

- **Splits:**
  1. NEW `NotificationsTab.hooks.ts` (same folder) — job: tab state + handlers. `useNotificationsTab({ preferences, onChange, testNotificationTitle, testNotificationBody }: UseNotificationsTabInput): { permission, testStatus, toggleSound, toggleDesktop, sendTestNotification }` ← the two `useState` lines, `const t = useT()` copy needed by `sendTestNotification` (hook calls `useT()` itself), and the three handlers verbatim. Move type `TestStatus` there and export it (component imports it). Imports nothing from the original.
  2. HELPER `resolveNotificationsTabCopy({ labels, t }: ResolveNotificationsTabCopyInput): NotificationsTabCopy` (in NotificationsTab.tsx, above the component) ← `label` and the 13 label constants; returns an object with the same 13 names plus `label` (JSX uses `label` directly).
  3. SUB-COMPONENTS (same file, below `NotificationsTab`, next to `NotificationToggle`): `CompletionSoundSection` ← first subsection JSX; `DesktopNotificationsSection` ← second. Plain props: exactly the names each JSX block reads (outline `uses:` of the return); no hook-result object.
- **Importers to update:** none (no export moves; `NotificationsTabLabels`/`Props` stay).
- **After:** `NotificationsTab` ~25; file ~250; hooks file ~45.
- **Risks / notes:** `useT()` is then called in both the component and the hook (same context, same value) — acceptable, no behavior change. Keep `permission` initializer lambda verbatim.

### jini:packages/ui/src/features/panel-kit/hooks/use-settings-slice.hooks.ts
- **Over:** `useSettingsSlice` 125 (file 191)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/panel-kit/hooks/__tests__/use-settings-slice.hooks.test.tsx`, `packages/ui/src/features/panel-kit/hooks/__tests__/admin-lifecycles.test.tsx`, `packages/ui/src/features/execution/__tests__/react/hooks/use-execution-credential.lifecycle.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | refs `io`, `persisted`, `latest`, `timer`, `writes`, `saveTicket`, `hasUnsavedEdits`, `commits`, `mounted` + state | slice bookkeeping (stays) |
| B | `useEffect(() => {` initial load (~L304) | first load of the persisted value |
| C | `runSave`, unmount-flush effect, `onChange` | debounced save chain (stays) |
| D | `const refresh = useCallback(async () => {`, `const refreshPort = …`, its `useEffect` | external-notification re-read |

- **Splits** (same file, above `useSettingsSlice`):
  1. SUB-HOOK `useSettingsInitialLoad({ io, persisted, latest, hasUnsavedEdits, setValue, setLoadError, defaultValue }: UseSettingsInitialLoadInput<T>): void` ← the load `useEffect` with its "`defaultValue` is a module-level constant…" comment and deps array verbatim.
  2. SUB-HOOK `useSettingsRefresh({ options, io, timer, hasUnsavedEdits, mounted, commits, refreshSettlement, latest, persisted, setValue }: UseSettingsRefreshInput<T>): () => Promise<void>` ← `refresh` (with its doc comment), `const refreshPort = options.refreshPort;` (with comment) and the subscribe `useEffect`; returns `refresh`. Call it where `refresh` was declared (after `onChange`), so hook order is unchanged.
- **Importers to update:** none.
- **After:** `useSettingsSlice` ~65; file ~205.
- **Risks / notes:** hook call order must stay: mount effect, load effect, runSave, unmount effect, onChange, refresh, refreshPort effect. Refs are passed as `MutableRefObject`s (read `.current` at run time as before). Generic `T` flows through both input types.

### jini:packages/ui/src/features/panel-kit/hooks/use-standing-draft-autosave.hooks.ts
- **Over:** `useStandingDraftAutosave` 175 (file 229)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/panel-kit/hooks/__tests__/use-standing-draft-autosave.hooks.test.tsx`, `packages/ui/src/features/panel-kit/hooks/__tests__/admin-lifecycles.test.tsx`, `packages/ui/src/features/panel-kit/helpers/__tests__/standing-draft-local-backup.unit.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `staleBasis` state, `staleBasisRef`, `backupEntryIdRef`, `markStaleBasis`, `liftStaleGate`, `dropLocalBackup` | stale-basis gate + local-backup mirror |
| B | `recoverableDraft` state + mount/entry recovery `useEffect` (~L239) + `dismissRecoverable` + `comparedDraft` | recover a draft on entry open |
| C | `idleTimerRef`, `firstPendingAtRef`, `pendingDraftRef`, `clearPendingTimer` | pending debounce timer |
| D | `useEffect(() => () => flushPendingAutosave(false)…`, `pagehide` `useEffect` (~L410) | flush on exit |
| E | `writes`, `enqueue`, `preserveFailedSave`, `writeAutosave`, `scheduleAutosave`, `flushPendingAutosave`, `clearStandingDraft`, `supersedeBasis` | write pipeline (stays) |

- **Splits** (same file, above the hook, in this order):
  1. SUB-HOOK `useStaleBasisGate({ backup, entryId, backupPrincipalId }: UseStaleBasisGateInput): { staleBasis, setStaleBasis, staleBasisRef, backupEntryIdRef, markStaleBasis, liftStaleGate, dropLocalBackup }` ← unit A with all its comments.
  2. SUB-HOOK `usePendingAutosaveTimer(): { idleTimerRef, firstPendingAtRef, pendingDraftRef, clearPendingTimer }` ← unit C (keep the `pendingDraftRef` comment).
  3. SUB-HOOK `useDraftRecovery({ enabled, entryId, port, backup, backupPrincipalId, staleBasisRef, setStaleBasis, backupEntryIdRef, minBaseVersionRef, latestDraftRef }: UseDraftRecoveryInput): { recoverableDraft, setRecoverableDraft }` ← `recoverableDraft` `useState` + the recovery `useEffect` (comment + deps verbatim). `dismissRecoverable`/`comparedDraft` stay in the main hook.
  4. SUB-HOOK `useFlushAutosaveOnExit({ enabled, entryId, flushPendingAutosave }: UseFlushAutosaveOnExitInput): void` ← both unit-D effects with their long comments.
- **Importers to update:** none.
- **After:** `useStandingDraftAutosave` ~92; file ~250.
- **Risks / notes:** HOOK ORDER changes (state/refs created in a different order) — harmless on mount, but effect order must stay: recovery effect must still run before the flush effects; call `useDraftRecovery` where the recovery effect was (after `dropLocalBackup`), `useFlushAutosaveOnExit` after `flushPendingAutosave`. `minBaseVersionRef`/`latestDraftRef` must be declared before `useDraftRecovery` is called.

### jini:packages/ui/src/features/project-locations/react/components/ProjectLocationsTab.tsx
- **Over:** `ProjectLocationsTab` 103 (file 157)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/project-locations/react/components/__tests__/ProjectLocationsTab.characterization.test.tsx` (vi.mocks `useProjectLocationsTab` — unaffected, nothing moves out of the hook path), `packages/ui/src/features/project-locations/__tests__/react/components/ProjectLocationsTab.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `const notice = (() => {`, `errorNoticeByStatus`, `errorNotice` | map action result to a notice line |
| B | rest | render the tab |

- **Splits:**
  1. HELPER (same file, above the component) `resolveLocationNotices({ result, copy, t }: ResolveLocationNoticesInput): { notice: string | null; errorNotice: string | null }` ← the three statements of unit A; `copy` = the resolved labels object (`noFolderSelectedLabel`, `duplicateLabel`, `savedLabel`, `defaultSavedLabel`, `scanCompleteTemplate`, `saveErrorLabel`, `scanErrorLabel`). Keep `notice`'s IIFE return type as is.
- **Importers to update:** none.
- **After:** `ProjectLocationsTab` ~84; file ~165.
- **Risks / notes:** none beyond typing `copy` as `ReturnType<typeof resolveLabels>`.

### jini:packages/ui/src/features/project-locations/react/hooks/useProjectLocationsTab.ts
- **Over:** `useProjectLocationsTab` 119 (file 169)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/project-locations/react/hooks/__tests__/useProjectLocationsTab.characterization.test.ts`, `packages/ui/src/features/project-locations/__tests__/react/hooks/useProjectLocationsTab.test.ts`, smoke `packages/ui/src/features/project-locations/react/components/__tests__/ProjectLocationsTab.characterization.test.tsx` (mocks this module path — `useProjectLocationsTab` stays exported here, so fine)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `locations`/`drafts`/`loading` state, `portRef`, `locationsRef`, `draftsRef`, `alive` + its effect, initial-fetch `useEffect` (~L108) | load locations and keep run-time refs |
| B | `saving`/`result` state, default-id refs, `persist`, `addFolder`, `removeDraft`, `setDefaultLocationId` | edit + persist (stays) |

- **Splits:**
  1. SUB-HOOK (same file, above) `useLoadedLocations({ port }: UseLoadedLocationsInput): { locations, setLocations, drafts, setDrafts, loading, portRef, locationsRef, draftsRef, alive }` ← unit A statements, comment "Volatile values async callbacks need at RUN time…" moves with the refs (copy it again above the default-id refs that stay).
- **Importers to update:** none.
- **After:** `useProjectLocationsTab` ~80; file ~180.
- **Risks / notes:** useState order changes (`saving`/`result` after the sub-hook) — harmless. The mount `alive` effect must stay before the fetch effect (both inside the sub-hook, same order).

### jini:packages/ui/src/features/resource-dashboard/react/hooks/useResourceBoard.ts
- **Over:** `useResourceBoard` 176 (file 249)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/resource-dashboard/react/hooks/useResourceBoard.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `viewMode` state (~L109), `setViewMode` | persisted view mode |
| B | `selectMode`, `selected`, prune effect (~L134), leave-grid effect (~L139), `enterSelectMode`, `exitSelectMode`, `toggleSelected` | select mode |
| C | `openMenuId`, `menuContainerRef`, outside-click effect (~L150), `toggleMenu`, `closeMenu` | single-open kebab menu |
| D | `pendingKeys`, `actionError`, `isItemBusy`, `remove`, `duplicate` | per-item actions |
| E | items/loading/error/query/sort, `reload` + effect, `bulkDelete`, `visibleItems`, `kanbanColumns`, return | board data (stays) |

- **Splits** (same file, above `useResourceBoard`):
  1. SUB-HOOK `useBoardViewMode({ viewModeStorage, storageScopeKey, defaultViewMode }: UseBoardViewModeInput): { viewMode, setViewMode }` ← unit A.
  2. SUB-HOOK `useBoardSelection({ items, viewMode }: UseBoardSelectionInput): { selectMode, selected, enterSelectMode, exitSelectMode, toggleSelected }` ← unit B with both effect comments.
  3. SUB-HOOK `useBoardMenu(): { openMenuId, setOpenMenuId, menuContainerRef, toggleMenu, closeMenu }` ← unit C with the "Single-open-at-a-time kebab menu…" comment.
  4. SUB-HOOK `useBoardItemActions<TItem>({ port, setItems, setOpenMenuId }: UseBoardItemActionsInput<TItem>): { pendingKeys, setPendingKeys, actionError, setActionError, isItemBusy, remove, duplicate }` ← unit D (uses consts `ITEM_ACTION_KIND`, `REMOVE_FAILED_MESSAGE`, `DUPLICATE_FAILED_MESSAGE`).
  Call order in the main hook: data state + `reload` + its effect, then `useBoardViewMode`, `useBoardSelection`, `useBoardMenu`, `useBoardItemActions`, then `bulkDelete` etc. — keeps effect order load → prune → leave-grid → menu.
- **Importers to update:** none.
- **After:** `useResourceBoard` ~85; file ~270.
- **Risks / notes:** `viewMode` is now created after `reload` (state order only). `bulkDelete` keeps using `selected`, `setPendingKeys`, `exitSelectMode` from the sub-hook results. Check `setActionError` is also used by `bulkDelete`/return before trimming the returned set.

### jini:packages/ui/src/features/sketch-editor/react/components/SketchEditor.tsx
- **Over:** `SketchEditor` 109 (file 181)
- **Phase:** now · **Batch:** size-44
- **Tests:** `packages/ui/src/features/sketch-editor/__tests__/react/components/SketchEditor.test.tsx`, `packages/ui/src/features/sketch-editor/__tests__/react/dependencies-fake.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `useI18n`, `canvasWrapRef`, `useSketchThemeHook()`, scene hook destructure (~L134), save-workflow destructure (~L148), `useSketchDomEnhancements({`, `hasContent`, `canSave`, `saveStatus` | wire the editor's hooks (state/effects) |
| B | `return (` JSX | render canvas + toast |

- **Splits:**
  1. NEW `SketchEditor.hooks.ts` (same folder) — job: wire the editor hooks. `useSketchEditor({ props }: UseSketchEditorInput): SketchEditorView` ← unit A verbatim (incl. the "Calls the raw hook (not `useWiredSketchSaveWorkflow`)…" comment); returns every local the JSX reads (`t`, `locale`, `canvasWrapRef`, `theme`, `initialData`, `editorInstanceKey`, `handleChange`, `handleExcalidrawAPI`, `showSaved`, `exporting`, `toast`, `handleSave`, `handleExportImage`, `dismissToast`, `handleToastAction`, `canSave`, `saveStatus`, `Excalidraw`, `MainMenu`). Moves `resolveSaveStatus` there (only unit A uses it). Imports `SketchEditorProps` type from `./SketchEditor.js` — to avoid a cycle, move `SketchEditorProps` into the hooks file and re-export it from `SketchEditor.tsx` only if `SketchEditor.tsx` is a package-entry target (check `packages/ui/package.json` exports); otherwise update importers.
  2. `SketchEditor` keeps props destructuring (with defaults) and calls `useSketchEditor`.
- **Importers to update:** `SketchEditorProps` — `rg -n "SketchEditorProps" packages/ui/src` (feature `index.ts` barrel; update to the hooks path or keep the barrel line pointing to the new file).
- **After:** `SketchEditor` ~65; SketchEditor.tsx ~120; hooks file ~75.
- **Risks / notes:** defaults (`saving = false`, `dirty = false`) must be applied before passing into the hook — pass the destructured values, not raw props. `useSketchThemeHook` comes from `dependencies`/props; keep the call inside the hook unconditionally.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/ui/src/features/memory/react/hooks/useMemoryExtractions.store.ts packages/ui/src/features/notifications/react/components/NotificationsTab.tsx packages/ui/src/features/panel-kit/hooks/use-settings-slice.hooks.ts packages/ui/src/features/panel-kit/hooks/use-standing-draft-autosave.hooks.ts packages/ui/src/features/project-locations/react/components/ProjectLocationsTab.tsx packages/ui/src/features/project-locations/react/hooks/useProjectLocationsTab.ts packages/ui/src/features/resource-dashboard/react/hooks/useResourceBoard.ts packages/ui/src/features/sketch-editor/react/components/SketchEditor.tsx <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
