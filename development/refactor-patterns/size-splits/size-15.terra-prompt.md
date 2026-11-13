# Terra job size-15: split 8 Tovu file(s) by responsibility (size limits)

Generated 2026-11-13 by `development/refactor-patterns/size-splits/assemble.mjs` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.

Repo: the Tovu clone you are given (Tovu only). `TOVU` below = that clone's root.

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
### tovu:apps/admin/src/components/AssistantDock/AssistantDock.tsx
- **Over:** `AssistantDock` 154 (file 269, under)
- **Phase:** now (STAY-WIRING; survey also flags the `resolveComposerDiscoveryOutcome` re-export at the top — separate job, leave it) · **Batch:** size-15
- **Tests:** `apps/admin/src/__tests__/unit/app-chat-dock-drop-capture.unit.test.tsx`, `apps/admin/src/hooks/__tests__/tovu-execution-entry-points.integration.test.tsx`, `apps/admin/src/__tests__/admin-boot-readers.test.tsx`, plus every `apps/admin/src/components/AssistantDock/__tests__/*.test.tsx` that renders `AssistantDock` (`rg -l "AssistantDock\b" apps/admin/src/components/AssistantDock/__tests__`).
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `executionPolicy` … `runtime` (L355-395: execution config, pre-warm, BYOK, local-CLI selection, runtime access, agents placeholder, selected agent, runtime prefs) | which agent/runtime this dock runs |
| B | `composerCapabilities` … `folderPicker` (L402-438: discovery catalog, plugin/skill chips, discovery draft, send guard, voice, prompt requests, skill-only send, folder drop/picker) | composer state |
| C | renderers, chrome, chats, transport, attachments, run context, failure surface, empty state, refresh signal, JSX | compose (stays) |

- **Splits** (`hooks/AssistantDock.hooks.tsx` is already 1033 counted lines, so do NOT add to it; new sibling hook files in `apps/admin/src/components/AssistantDock/hooks/`, importing only from existing modules, never from `AssistantDock.tsx`):
  1. NEW `hooks/use-dock-execution.hooks.ts` — `useDockExecution({ locale, agentBridge, useExecutionConfigOverride, useExecutionPolicy, useByokRuntimeOverride, useLocalCliSelectionOverride, useRuntimeAccessOverride, runtimePreferences }: UseDockExecutionInput)` returning `{ executionPolicy, executionConfig, executionConfigRef, setExecutionConfig, handleExecutionModeChange, hasStoredAdminKey, configLoaded, readExecutionConfigForSend, pageActivationError, byokRuntime, handleByokModelChange, localCliSelection, handleLocalCliSelectionChange, readLocalCliSelectionForSend, pickerRuntimeAccess, selectedAgentAuth, runtimeAccess, agentsPlaceholder, selectedAgent, runtime }` ← statements `const executionPolicy = useTovuDockExecution(` through `const runtime = { ...runtimePreferences, visible: …`, in the same order, with their comments (D-21(b), pre-warm ownership, picker placeholder). `selectedDockAgent` is module-level in `AssistantDock.tsx` → move it (and its use) into this file (it is not exported; nothing else uses it — verify with rg).
  2. NEW `hooks/use-dock-composer.hooks.ts` — `useDockComposer({ mcpUiToolCaller, executionConfig, agentsPlaceholder, localCliSelection, skillInstall, onFolderDropCaptureReady, useComposerCapabilitiesOverride }: UseDockComposerInput)` returning `{ composerCapabilities, selectedPluginRefIds, addPluginRef, removePluginRef, selectedSkills, discoveryDraft, captureComposerClick, handleComposerDiscoverySelect, selectedPluginChips, voiceInput, skillOnlySend, folderDrop, folderPicker }` ← `const { composerCapabilities } = useComposerCapabilitiesSeam(` through `const folderPicker = useNativeFolderPicker(` incl. `useAssistantPromptRequests(voiceInput.composerHandle);` and all comments. `skillInstall` stays created in `AssistantDock` (used by attachments before) and is passed in.
  3. `AssistantDock` calls `useDockExecution` where `executionPolicy` was and `useDockComposer` where `composerCapabilities` was, destructuring the names the rest of the body / JSX reads (or reading them as `execution.x` / `composer.x` — pick destructuring to keep JSX text unchanged).
- **Importers to update:** none (no export moves).
- **After:** file ~215; `AssistantDock` ~95; `use-dock-execution.hooks.ts` ~45; `use-dock-composer.hooks.ts` ~45.
- **Risks / notes:** hook call ORDER must stay identical (React): `useBrowserAgentSettings`, chrome, confirm, display prefs, plugins, runtime prefs, settings dialog, permissions → execution group → chats/transport/attachments/skillInstall/validator → composer group → … . `chats` must be created after the execution group (it reads nothing from it, but `transport` reads `executionConfigRef` etc.). If the destructure of the 20 execution names keeps `AssistantDock` over 100, read them as `execution.<name>` at the use sites instead (mechanical, no other change).

### tovu:apps/admin/src/components/WidgetConfigFields/MediaContentEditor.hooks.ts
- **Over:** `useMediaContentEditor` 110 (file 202, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-15
- **Tests:** `apps/admin/src/components/WidgetConfigFields/__tests__/MediaContentEditor.unit.test.tsx`, `apps/admin/src/components/WidgetConfigFields/__tests__/MediaContentEditor.markup.unit.test.tsx`, `apps/admin/src/components/__tests__/WidgetPreview.unit.test.tsx`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `slugDraft`, `slugProblem` states + `function addSlug()` | add an item by slug |
| B | `htmlRef`, `gutterRef`, `pendingCaret`, the caret `useEffect`, `function insertHtml(snippet)` | raw-HTML textarea caret insert |
| C | library, stored/view state, `emit*`, `setItems`, `assetsBySlug`, picker state, `confirmPicker`, return | compose (stays) |

- **Splits** (same file, module level, above the hook):
  1. SUB-HOOK `useMediaSlugDraft({ state, library, setItems }: UseMediaSlugDraftInput): { slugDraft: string; setSlugDraftState; slugProblem; setSlugProblem; addSlug: () => void }` ← the two `useState` lines + `addSlug` (return the setters the return object uses today; check the `return {` for which ones).
  2. SUB-HOOK `useHtmlCaretInsert({ state, emit }: UseHtmlCaretInsertInput): { htmlRef; gutterRef; insertHtml: (snippet: string) => void }` ← `htmlRef`, `gutterRef`, `pendingCaret`, the `useEffect` reading `pendingCaret`/`htmlRef`, `insertHtml`.
- **Importers to update:** none.
- **After:** file ~215; `useMediaContentEditor` ~85.
- **Risks / notes:** `state`/`emit` are recomputed each render — pass current values (same closure semantics). Hook order changes only by grouping.

### tovu:apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts
- **Over:** `useVisitorCredentialForm` 145 (file 357, under)
- **Phase:** now (?) · **Batch:** size-15
- **Tests:** `apps/admin/src/features/ai-assistant/__tests__/use-visitor-credential-form.unit.test.ts`, `apps/admin/src/features/ai-assistant/__tests__/VisitorCredentialForm.unit.test.tsx`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | the hydration `useEffect(() => {` using `apiRef, setStored, setConfig, setLoadState` | load stored credential once |
| B | `discoveryConfig` + `storedEndpointMismatch` refs (and their `.current =` lines), the "Discovery on load" effect, `presetSuppliedEndpoint`, the "Debounced, key-driven model discovery" effect | model discovery |
| C | `writes`, `saveState`, `settingsSaveState`, `saveKey`, `saveSettings` | the two Save buttons on one serial lane |
| D | config/preset/port/discovery/connectionTest/stored/loadState/dirty, `editConfig`, derived flags, `runKeyTest`, `runTestConnection`, `selectPreset*`, `configuredIds`, return | compose (stays) |

- **Splits** (same file, module level, above the hook, after `runVisitorTestConnection`):
  1. SUB-HOOK `useVisitorCredentialHydration({ apiRef, setStored, setConfig, setLoadState }: UseVisitorCredentialHydrationInput): void` ← the hydration effect (its "Hydrate from the server once" comment moves with it; deps array unchanged).
  2. SUB-HOOK `useVisitorModelDiscovery({ port, config, stored, apiKey, baseUrl, protocol, storedKeyIsForOtherEndpoint, setDiscovery, setConfig }: UseVisitorModelDiscoveryInput): void` ← from `const discoveryConfig = useRef(config);` through the debounced discovery effect, incl. `presetSuppliedEndpoint` and its SECURITY GATE comment (verbatim). `port` is the `useRef` object — pass the ref.
  3. SUB-HOOK `useVisitorCredentialSaves({ apiRef, config, setStored, setConfig, setDirty }: UseVisitorCredentialSavesInput): { saveState: SaveState; settingsSaveState: SaveState; saveKey: () => void; saveSettings: () => void }` ← `saveState`/`settingsSaveState` `useState` lines, `const writes = useSerialWrites();` (+ "One lane for both Save buttons" comment), `saveKey`, `saveSettings`. (The "Nothing on this screen writes a credential except these two functions" comment moves here; `hasStoredKey` stays in the hook.)
- **Importers to update:** none.
- **After:** file ~375; `useVisitorCredentialForm` ~70; discovery sub-hook ~50.
- **Risks / notes:** the debounced-discovery effect's security gate depends on `presetSuppliedEndpoint` memo over `baseUrl` — keep it inside the same sub-hook. `MODEL_DISCOVERY_DEBOUNCE_MS` is module level — fine.

### tovu:apps/admin/src/features/collections/CollectionEntryEditor.tsx
- **Over:** `CollectionEntryEditor` 103 (file 400, under)
- **Phase:** now (?) · **Batch:** size-15
- **Tests:** `apps/admin/src/features/collections/__tests__/CollectionEntryEditor.unit.test.tsx`, `CollectionEntryEditor.dynamic-field.unit.test.tsx`, `collections-agent-drive.unit.test.tsx` (same folder)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | the `<label className="a11y-label-wrap">` title field (~L462) | entry title input |
| B | `EntryPageActions`, `EntrySlugField`, `EntryFieldsSection` (exist) | header actions / slug / dynamic fields |
| C | `CollectionEntryEditor` | hook call, guards, compose (stays) |

- **Splits** (same file, module level, above `CollectionEntryEditor`, after `EntrySlugField`):
  1. SUB-COMPONENT `EntryTitleField({ title, onTitleChange, t }: EntryTitleFieldProps): JSX.Element` ← the `<label className="a11y-label-wrap">` element; `setTitle` → `onTitleChange` inside. Types: `title: string`, `onTitleChange: (next: string) => void`, `t` = same type `EntrySlugField` takes.
- **Importers to update:** none.
- **After:** file ~410; `CollectionEntryEditor` ~94; `EntryTitleField` ~12.
- **Risks / notes:** keep any agent-handle spread / `aria-*` on the input verbatim.

### tovu:apps/admin/src/features/collections/Collections.tsx
- **Over:** file 556 lines · `Collections` 156
- **Phase:** now (?) · **Batch:** size-15
- **Tests:** `apps/admin/src/features/collections/__tests__/Collections.unit.test.tsx`, `collections-agent-drive.unit.test.tsx`, `use-new-content-type-dialog.unit.test.tsx`, `use-edit-fields-dialog.unit.test.tsx`, `use-lifecycle-confirm-dialog.unit.test.tsx`, `collections-i18n.unit.test.ts` (same folder), smoke `apps/admin/src/__tests__/unit/panels-render.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `ContentTypeFieldFieldsetProps`, `ContentTypeFieldFieldset`, `NewContentTypeDialogProps`, `NewContentTypeDialog`, `EditFieldsDialogProps`, `EditFieldsDialog`, `LifecycleConfirmDialogProps`, `LifecycleConfirmDialog`, `CollectionsDialogs` | the screen's three modals |
| B | `<DataTable` element in `Collections`' return | content-types table (columns, row menu, embed copy) |
| C | `CollectionsProps`, `Collections` | hook, loading/error, header, compose (stays) |

- **Splits:**
  1. NEW `Collections-dialogs.tsx` — job: the Collections modals. Moves unit A verbatim (incl. the `// ----` section comments' text as JSDoc where they describe a dialog). Exports `NewContentTypeDialog`, `EditFieldsDialog`, `LifecycleConfirmDialog`, their `*Props`, and `CollectionsDialogs` (+ a `CollectionsDialogsProps` type: today `CollectionsDialogs` takes a slice of `CollectionsProps` — if its param type references `CollectionsProps`, move the `dialogHooks` part it needs as `CollectionsDialogsProps` into the new file and have `CollectionsProps` reference it; never import back from `Collections.tsx`).
  2. SUB-COMPONENT in `Collections.tsx`, above `Collections`: `ContentTypesTable({ types, rowHandles, copiedKey, copyFallback, onCopyEmbedCode, onEditFields, onRequestLifecycle, locale, t }: ContentTypesTableProps): JSX.Element` ← the `<DataTable` element; replace `copyEmbedCode`→`onCopyEmbedCode`, `setEditingFieldsFor`→`onEditFields`, `setPendingLifecycle`→`onRequestLifecycle` inside (check the element for any other outer name it reads, e.g. `runLifecycle`, and add it as a prop). Types via the existing collections controller type indexed access.
- **Importers to update:** `apps/admin/src/features/collections/__tests__/use-new-content-type-dialog.unit.test.tsx` (`NewContentTypeDialog`), `use-edit-fields-dialog.unit.test.tsx` (`EditFieldsDialog`), `use-lifecycle-confirm-dialog.unit.test.tsx` (`LifecycleConfirmDialog`) → `../Collections-dialogs`. Comments mentioning `Collections.tsx`'s dialogs in `styles.css`/`Integrations.tsx` may stay (prose).
- **After:** `Collections.tsx` ~200 (`Collections` ~75); `Collections-dialogs.tsx` ~330; `ContentTypesTable` ~88.
- **Risks / notes:** `collections-i18n.unit.test.ts` — check whether it parses `Collections.tsx` source for `t()` keys (`rg -n "Collections.tsx" apps/admin/src/features/collections/__tests__/collections-i18n.unit.test.ts`); if it does, the moved dialog keys stop being covered — report it (test edit not allowed beyond import paths).

### tovu:apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts
- **Over:** `useCollectionEntryEditor` 199 (file 252, under)
- **Phase:** now (?) · **Batch:** size-15
- **Tests:** `apps/admin/src/features/collections/__tests__/use-collection-entry-editor.unit.test.tsx`, `CollectionEntryEditor.unit.test.tsx`, `CollectionEntryEditor.dynamic-field.unit.test.tsx` (same folder), `apps/admin/src/__measurements__/request-volume.measurement.test.tsx`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `invalidFields`, `validationError`, `setFieldValidity` | json-field validity (M2) |
| B | `list`, `contentType`, `loaded`, `loadError`, `seedExistingWorkingCopy`, `seededIdentityRef`, the seeding `useEffect` | load + seed working copy |
| C | `updateMutation`, `createMutation`, `saveExisting`, `save`, `saving` | save |
| D | `lastLifecycleOp`, `lifecycleMutation`, `publishWithSave`, `toggleLifecycle` | publish/unpublish (H2) |
| E | deps, `entry`/`title`/`slug`/`extFields`/`message` states, `editor`, `busy`, `error`, return | compose (stays) |

- **Splits** (same file, module level, above the hook, in run order):
  1. SUB-HOOK `useEntryFieldValidity(): { invalidFields: ReadonlySet<string>; validationError: string | null; setValidationError; setFieldValidity }` ← `const [invalidFields, …`, `const [validationError, …`, `const setFieldValidity = useCallback(` (with the M2 and "Stable setter" comments).
  2. SUB-HOOK `useEntryEditorLoad({ props, port, navigate, locale, editor, entry, slug, title, setEntry, setTitle, setSlug, setExtFields }: UseEntryEditorLoadInput): { contentType; loaded: boolean; loadError: string | null }` ← `const list = useFetchQuery({` through the seeding `useEffect` (incl. `seedExistingWorkingCopy`, `seededIdentityRef` and their comments).
  3. SUB-HOOK `useEntrySave({ props, port, locale, editor, contentType, entry, title, slug, extFields, invalidFields, setEntry, setMessage, setValidationError }: UseEntrySaveInput): { updateMutation; createMutation; saveExisting: (current: AdminEntry) => Promise<AdminEntry>; save: () => Promise<void>; saving: boolean }` ← `updateMutation`, `createMutation`, `saveExisting`, `save`, `saving` (list every outer name `save` reads per the outline `uses:` — it is truncated with `…`; read the body).
  4. SUB-HOOK `useEntryLifecycle({ port, props, locale, entry, invalidFields, saveExisting, setEntry, setMessage, setValidationError }: UseEntryLifecycleInput): { lastLifecycleOp; lifecycleMutation; toggleLifecycle }` ← `lastLifecycleOp` state (+ comment), `lifecycleMutation`, `publishWithSave` (+ H2 comment), `toggleLifecycle`.
  5. Hook keeps `busy` (reads `saving` + `lifecycleMutation.status`), `error = validationError ?? visibleEntryEditorError({…})`, return.
- **Importers to update:** none.
- **After:** file ~275; `useCollectionEntryEditor` ~65; sub-hooks ≤ 55.
- **Risks / notes:** state declaration order changes (`lastLifecycleOp`, validity state move into sub-hooks) — grouping only. `editor` (TipTap `useEditor`) must be created before the load/save hooks; pass the same instance.

### tovu:apps/admin/src/features/dashboard/Dashboard.tsx
- **Over:** `Dashboard` 106 (file 281, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-15
- **Tests:** `apps/admin/src/features/dashboard/__tests__/Dashboard.unit.test.tsx`, smoke `apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `<div className="page-header">` (~L238, 35 lines) | page header + its actions/banners |
| B | `<div className="dash-top">` | stats / appearance / activity (stays) |

- **Splits** (same file, module level, above `Dashboard`):
  1. SUB-COMPONENT `DashboardHeader({ canPublish, t, … }: DashboardHeaderProps): JSX.Element` ← the `<div className="page-header">` element; props = exactly the outer names that element reads (read it; per the outline candidates are `t`, `canPublish`; banners `SiteKeyWarningBanner`/`DefaultPasswordBanner` stay where they are today — move them only if they are inside that element, then add `showSiteKeyBanner`, `siteKeyBannerMessage`, `showDefaultPasswordBanner`, `dismissDefaultPasswordBanner` as props).
- **Importers to update:** none.
- **After:** file ~290; `Dashboard` ~75; `DashboardHeader` ~40.
- **Risks / notes:** `usePublishToLiveAvailable()` stays in `Dashboard` (hook), its result passed as `canPublish`.

### tovu:apps/admin/src/features/deployment/DockerfileTab.tsx
- **Over:** `DockerfileEditorCard` 132 (file 335, under)
- **Phase:** now (?) · **Batch:** size-15
- **Tests:** `apps/admin/src/features/deployment/__tests__/DockerfileTab.unit.test.tsx`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `<div className="card-head">` (~L253, 67 lines) | title, line count, unsaved badge, Copy/Download/Save actions |
| B | `<div className="deployment-card-body">` | status banner + textarea (stays) |

- **Splits** (same file, module level, directly above `DockerfileEditorCard`):
  1. SUB-COMPONENT `DockerfileCardHead({ draft, hasContent, isDirty, saved, copied, saving, exists, onCopy, onSave, t }: DockerfileCardHeadProps): JSX.Element` ← the `<div className="card-head">` element verbatim (it calls `countLines(draft)` and `downloadDockerfile(...)` — module functions, fine). Prop types = the same types `DockerfileEditorCard`'s destructured props already have (reuse by indexed access on its props type if it is named; otherwise spell them).
- **Importers to update:** none.
- **After:** file ~345; `DockerfileEditorCard` ~70; `DockerfileCardHead` ~72.
- **Risks / notes:** keep the "Copy/Download act on `draft`" comment on `hasContent` in `DockerfileEditorCard` and pass `hasContent` down.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/admin/src/components/AssistantDock/AssistantDock.tsx apps/admin/src/components/WidgetConfigFields/MediaContentEditor.hooks.ts apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts apps/admin/src/features/collections/CollectionEntryEditor.tsx apps/admin/src/features/collections/Collections.tsx apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts apps/admin/src/features/dashboard/Dashboard.tsx apps/admin/src/features/deployment/DockerfileTab.tsx <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
