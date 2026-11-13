# Terra job size-02: split 8 Tovu file(s) by responsibility (size limits)

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
### tovu:apps/admin/src/features/deployment/hooks/use-publish-credentials.hooks.ts
- **Over:** `usePublishCredentials` 151 (file 247, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-02
- **Tests:** `apps/admin/src/features/deployment/hooks/__tests__/use-publish-credentials.unit.test.tsx`, `apps/admin/src/features/deployment/hooks/__tests__/use-publish-credentials-wired.unit.test.tsx`, `apps/admin/src/features/deployment/__tests__/StaticSiteTab.unit.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `usePublishCredentials` load block | fetch + seed credentials/executionMode once, load error |
| B | `formStates`, `patchRow`, `setField` | per-row draft form state |
| C | `selections`, `selectingRef`, `credentialsForProviderId`, `selectCredential`, `reconcileCredentials` | token-picker promotion |
| D | `rows` derivation | pure projection to `PublishCredentialRowState[]` |
| E | `savingRef`, `canSaveCredential`, `save`, `verify`, return | save/verify (stays in the hook) |

- **Splits** (same file, module level, above `usePublishCredentials`, in this order):
  1. SUB-HOOK `usePublishCredentialsLoad({ port, locale }: UsePublishCredentialsLoadInput): { credentials; setCredentials; executionMode; loadError }` ← `const query = useFetchQuery({ key: ["deployment", "publish-credentials"]…` through `const loadError = query.error ? publishCredentialsLoadErrorMessage(…` (incl. `seededRef` + its seeding `useEffect` and their "why" comment).
  2. SUB-HOOK `useCredentialRowForms({ targets, locale }: UseCredentialRowFormsInput): { formStates; patchRow; setField }` ← `const [formStates, setFormStates] = useState<Record<…` , `function patchRow(…`, `function setField(…` (keep `patchRow`'s comment). `patchRow`/`setField` keep their current positional signatures (existing closures, not new helpers).
  3. PURE HELPER `buildPublishCredentialRows({ credentials, targets, formStates, selections }: BuildPublishCredentialRowsInput): readonly PublishCredentialRowState[] | undefined` ← the initializer of `const rows: readonly PublishCredentialRowState[] | undefined =` (hook keeps `const rows = buildPublishCredentialRows({...})`).
  4. SUB-HOOK `useCredentialSelection({ port, locale, credentials, setCredentials }: UseCredentialSelectionInput): { selections; credentialsForProviderId; selectCredential }` ← `const [selections, setSelections] = useState<Partial<…` , `const selectingRef = useRef(…`, `function credentialsForProviderId(…`, `async function selectCredential(…`, `async function reconcileCredentials()` (with their "why" comments). `reconcileCredentials` is used only by `selectCredential` — confirm with rg inside the file before moving; if `save`/`verify` also call it, return it too.
  5. Hook order after split: load → row forms → `selectingRef`-free selection hook → `savingRef` → `canSaveCredential`/`save`/`verify` → `rows` → `credentialChangePending` → return. Keep the hook call order identical to today's state-declaration order (load, formStates, selections) so React hook order is stable.
- **Importers to update:** none (no export moves).
- **After:** file ~265; `usePublishCredentials` ~70; each sub-hook < 40.
- **Risks / notes:** `credentials` passed into `useCredentialSelection` is the current render value — same closure semantics as today. Type `RowFormState`/`SelectionState` stay in the file.

### tovu:apps/admin/src/features/integrations/Integrations.tsx
- **Over:** `Integrations` 156 (file 253, under)
- **Phase:** now (?) · **Batch:** size-02
- **Tests:** `apps/admin/src/features/integrations/__tests__/Integrations.unit.test.tsx`, `apps/admin/src/__tests__/unit/nav-wiring.unit.test.ts` (smoke)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `IntegrationCreateForm`, `IntegrationDeleteDialog` (exist) | form / confirm dialog |
| B | `<div className="integrations-tab-intro form-measure">` block | intro text + "Add webhook" button |
| C | `<DataTable rows={subscriptions}` … `/>` | subscriptions table incl. empty card + row menu |
| D | `Integrations` | hook call, loading/error, compose |

- **Splits** (same file, module level, above `Integrations`):
  1. SUB-COMPONENT `IntegrationsIntro({ formOpen, onOpenForm, t }: IntegrationsIntroProps): JSX.Element` ← the `<div className="integrations-tab-intro form-measure">` element (its `{/* No page/page-header … */}` comment moves with it, placed above the element inside the new component's return). `onOpenForm` = `() => setFormOpen(true)` passed from `Integrations`.
  2. SUB-COMPONENT `IntegrationsTable({ subscriptions, rowMenuHandles, onTogglePause, onRequestDelete, locale, t }: IntegrationsTableProps): JSX.Element` ← the whole `<DataTable rows={subscriptions}` element (with its `form-measure` "why" comment in `empty`). Inside, replace `onDelete: setPendingDelete` with `onDelete: onRequestDelete`; `Integrations` passes `onRequestDelete={setPendingDelete}`. Types: `subscriptions` = the hook's non-undefined `subscriptions` element type (reuse the existing type the hook exports; if none is exported, export the existing one from the hooks file — do not redeclare), `rowMenuHandles` = `ReturnType<typeof buildAgentListHandles>`, `t`/`locale` same types as `IntegrationCreateForm` uses.
  3. `Integrations` keeps: hook destructure, two early returns, `rowMenuHandles`, and a return of `<div className="integrations-tab-body">` + `IntegrationsIntro` + the `formOpen ? <IntegrationCreateForm …/> : null` + `IntegrationsTable` + `IntegrationDeleteDialog`.
- **Importers to update:** none (no export moves).
- **After:** file ~265; `Integrations` ~68; `IntegrationsTable` ~72; `IntegrationsIntro` ~18.
- **Risks / notes:** props only (rule 9) — no hook result object passed down. Agent handles (`integrations-toggle-create-form`, row menu prefix) unchanged.

### tovu:apps/admin/src/features/media/Media.tsx
- **Over:** file 1151 lines · `EditMediaPanel` 197 · `MediaLibraryPanel` 126
- **Phase:** now (?) · **Batch:** size-02
- **Tests:** `apps/admin/src/features/media/__tests__/Media.unit.test.tsx`, `media-item-deep-link.unit.test.tsx`, `media-order-by.unit.test.tsx`, `media-screen-states.unit.test.tsx`, `media-i18n.unit.test.ts`, `media-agent-drive.unit.test.tsx`, `media-grid-fit.unit.test.tsx`, `media-type-filter.unit.test.tsx`, `media-card-metadata.unit.test.tsx`, `media-tab-counts.unit.test.tsx`, `media-preview-click-lightbox.unit.test.tsx`, `media-html-attributes.unit.test.tsx` (all under `apps/admin/src/features/media/__tests__/`), `apps/admin/src/__measurements__/request-volume.measurement.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `PlaceholderIcon`, `EyeIcon`, `ExpandIcon`, `UploadIcon`, `PlayIcon` | inline SVG glyphs |
| B | `MediaPreviewProps`, `MediaPreview`, `MediaCardStage`, `MediaCardPicture`, `showMediaBackdrop`, `mediaShapeParts`, `MediaCardMetadata`, `MediaCardMenuProps`, `MediaCard`, `MediaCardTitle` | one grid card + its preview |
| C | `EditMediaPanelProps`, `EditMediaPanel`, `MediaEditRenderOverrideFields`, `MediaEditCopyRow`, `EDIT_MEDIA_MODAL_TITLE_ID`, `EditMediaModalProps`, `EditMediaModal` | metadata edit form + its dialog |
| D | `MediaToolbar`, `MediaOrderControl`, `MediaSizeControl` | library toolbar row controls |
| E | `MediaLightboxProps`, `MediaLightbox`, `MediaPurgeDialog`, `MediaGridOrEmpty`, `MediaTypeEmptyState`, `MediaTrashEmptyState`, `UntypedMediaNote`, `MediaLibraryPanel` | the "all/images/videos/trash" tab body |
| F | `MediaProps`, `ExternalProvidersPanel`, `MediaPageShell`, `Media` | screen shell + tab routing (stays) |

- **Splits** (in order; none of the moved names is exported today, so the only importers are the new siblings):
  1. NEW `Media-icons.tsx` — job: SVG glyphs. Moves unit A. Exports all five.
  2. NEW `Media-card.tsx` — job: a grid card and its preview. Moves unit B (with their "why" comments, incl. the 2026-09-30 expand-button comment above `MediaPreview`). Exports `MediaPreview`, `MediaCard`, `MediaPreviewProps`, `MediaCardMenuProps`. Imports icons from `./Media-icons`.
  3. NEW `Media-edit.tsx` — job: edit one item's metadata. Moves unit C. Exports `EditMediaModal` (and `EditMediaPanel` only if something outside needs it — today nothing does). Then HELPERS in `EditMediaPanel` (same new file, above it, plain props):
     - `MediaEditTextFields({ item, draft, setTitle, setAlt, setSlug, setCaption, setCredit, t }: MediaEditTextFieldsProps): JSX.Element` ← the first `<div className="field-row">` (Title/Alt) through the second `<div className="field-row">` (Caption/Credit), incl. the Slug field and its 2026-09-07 comment. Render as a fragment inside `field-group`.
     - `MediaEditLocationRows({ item, publicUrl, embedSnippet, urlCopied, embedCopied, hashCopied, copyUrl, copyEmbedCode, copyHash, t }: MediaEditLocationRowsProps): JSX.Element` ← from the `{/* User report: "where is the location of the asset?…` comment through the sha256 `<MediaEditCopyRow …/>` (all three comments move with it). Fragment.
     - `MediaEditActions({ saving, error, onSave, onCancel, t }: MediaEditActionsProps): JSX.Element` ← `<span className="editor-actions">` through the `{error ? (<span className="save-error" …` block. Fragment. (Check the button handlers' exact names in source; pass whatever they call today, e.g. `save`/`onCancel`.)
  4. NEW `Media-toolbar.tsx` — job: the order/size/upload controls row. Moves unit D. Add `type MediaToolbarFields = Pick<MediaController, "fileInputRef" | "altDraft" | "setAltDraft" | "selectedFileName" | "onFileChange" | "upload" | "uploading" | "uploadOpen" | "openUpload" | "closeUpload" | "uploadError" | "canUpload" | "t">` (exactly today's inline Pick) and make `MediaToolbar`'s props `{ activeTab: MediaContentTabId } & MediaToolbarFields` (same type). New SUB-COMPONENT `MediaLibraryControlsRow({ toolbar, activeTab, orderBy, setOrderBy, gridSize, setGridSize }: MediaLibraryControlsRowProps): JSX.Element` ← `<div className="toolbar media-order-row">` element (with its "One row: Order by…" comment), rendering `<MediaToolbar {...toolbar} activeTab={activeTab} />` and `t={toolbar.t}`. Pure helper `mediaToolbarFields({ fileInputRef, …, t }: MediaToolbarFields): MediaToolbarFields` returning a fresh object of exactly those 13 keys. Exports `MediaLibraryControlsRow`, `mediaToolbarFields`.
  5. NEW `Media-library.tsx` — job: the library tab body. Moves unit E. Exports `MediaLibraryPanel`. In `MediaLibraryPanel`: drop the 12 upload names from the destructure, call `const toolbar = mediaToolbarFields(props);`, replace the controls row with `<MediaLibraryControlsRow toolbar={toolbar} activeTab={activeTab} orderBy={orderBy} setOrderBy={setOrderBy} gridSize={gridSize} setGridSize={setGridSize} />`. The `key` comment above `EditMediaModal` and the "`items` MUST be the same array" comment stay in place.
  6. `Media.tsx` keeps unit F, imports `MediaLibraryPanel` from `./Media-library`. Copy the file-header paragraphs that describe the lightbox / card / edit modal into the matching new files' headers.
- **Importers to update:** none outside (`Media`, `MediaProps` stay; `index.ts` re-exports `Media` unchanged).
- **After:** `Media.tsx` ~150; `Media-icons.tsx` ~40; `Media-card.tsx` ~210; `Media-edit.tsx` ~370 (`EditMediaPanel` ~75); `Media-toolbar.tsx` ~170; `Media-library.tsx` ~290 (`MediaLibraryPanel` ~80).
- **Risks / notes:** `media-i18n.unit.test.ts` (L32, L148) parses `Media.tsx`'s SOURCE TEXT for `t()` keys — it keeps passing but stops checking keys that moved to the siblings (coverage loss). Test edits are banned beyond import paths: report it so the coordinator adds the sibling filenames to that list. No `vi.mock` of `../Media` found. Import order: icons ← card ← library; edit ← library; toolbar ← library; no sibling imports `Media.tsx`.

### tovu:apps/admin/src/features/media/hooks/use-edit-media-panel.hooks.ts
- **Over:** `useEditMediaPanel` 130 (file 185, under)
- **Phase:** now (?) · **Batch:** size-02
- **Tests:** `apps/admin/src/features/media/__tests__/use-edit-media-panel.hooks.unit.test.tsx`, smoke `apps/admin/src/features/media/__tests__/Media.unit.test.tsx`, `apps/admin/src/features/media/__tests__/media-html-attributes.unit.test.tsx`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `const [draft, setDraft] = useState<Required<MediaMetadataPatch>>({` + `function setTitle` … `function setHtmlAttributes` | metadata working copy + field setters |
| B | `hashCopied`/`urlCopied`/`embedCopied` states + `copyHash`, `copyUrl`, `copyEmbedCode` | copy-to-clipboard buttons |
| C | `const creators = useFetchQuery({`, `const userNames = useMemo(`, `const createdByLabel = …` | "Created by" label |
| D | `baselineRef`, `saveMutation`, `htmlAttributes*`, `save`, `error`, return | save (stays) |

- **Splits** (same file, module level, above `useEditMediaPanel`, in run order):
  1. SUB-HOOK `useMediaMetadataDraft({ item }: UseMediaMetadataDraftInput): { draft; setTitle; setSlug; setAlt; setCaption; setCredit; setWidth; setHeight; setCssClass; setHtmlAttributes }` ← `const [draft, setDraft] = useState<Required<MediaMetadataPatch>>({` and the nine `function setX(value: string)` setters. Return type = `Pick<EditMediaPanelController, "draft" | "setTitle" | … | "setHtmlAttributes">` if the controller fields match exactly; otherwise spell it out.
  2. SUB-HOOK `useMediaCopyActions({ item, publicUrl, embedSnippet }: UseMediaCopyActionsInput): { hashCopied; urlCopied; embedCopied; copyHash; copyUrl; copyEmbedCode }` ← the three `useState(false)` copied flags and `async function copyHash()`, `copyUrl()`, `copyEmbedCode()`. Call it right after `const embedSnippet = embedMarkerSnippet(…` (the two derived values move above the call; they are plain reads).
  3. SUB-HOOK `useMediaCreatedByLabel({ port, item, locale }: UseMediaCreatedByLabelInput): string` ← `const creators = useFetchQuery({` through `const createdByLabel = mediaCreatedByLabel({`.
  4. `useEditMediaPanel` keeps: props destructure, `useMediaMetadataDraft`, `baselineRef` (+ its "Frozen at mount" comment), `saveMutation`, `publicUrl`/`embedSnippet` (+ header-pointer comment), `useMediaCopyActions`, `htmlAttributesParsed`/`htmlAttributesError`, `save`, `error`, `useMediaCreatedByLabel`, return.
- **Importers to update:** none (no export moves).
- **After:** file ~200; `useEditMediaPanel` ~55; sub-hooks ≤ 40.
- **Risks / notes:** `draft`'s initializer and `baselineRef` both read `item` at mount — keep `useMediaMetadataDraft` called before `useRef(item)` so the "exactly like draft's own useState initializer" comment stays true. Hook call order changes only by grouping (copied-flag states move after `saveMutation`, as today).

### tovu:apps/admin/src/features/media/hooks/use-media.hooks.ts
- **Over:** `useMedia` 156 (file 208, under)
- **Phase:** now (?) · **Batch:** size-02
- **Tests:** `apps/admin/src/features/media/__tests__/use-media.hooks.unit.test.tsx`, `media-screen-states.unit.test.tsx`, `media-agent-drive.unit.test.tsx`, `Media.unit.test.tsx` (same folder), `apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `uploadMutation`, `trashMutation`, `purgeMutation`, `restoreFallback`, `restoreMutation`, `writes`, `clearOtherWriteErrors` | the four write mutations + "clear the others' errors" |
| B | `altDraft`, `fileInputRef`, `uploadInFlight`, `uploading`, `selectedFileName`, `uploadOpen`, `readError`, `onFileChange`, `upload`, `openUpload`, `uploadFailure`, `uploadError` | upload dialog flow |
| C | `pendingPurge`, `rowSavingId`, `trash`, `restore`, `purge` | per-row trash/restore/purge |
| D | `list`, `invalidate*`, refresh subscription, `editingId`, `lightboxIndex`, `orderBy`, `toggleEditing`, `onMetadataSaved`, `media`, `error`, return | list + screen state (stays) |

- **Splits** (same file, module level, above `useMedia`, in run order):
  1. SUB-HOOK `useMediaWrites({ port, list, locale }: UseMediaWritesInput): { uploadMutation; trashMutation; purgeMutation; restoreMutation; restoreFallback: string; clearOtherWriteErrors: (active: { reset: () => void }) => void }` ← `const uploadMutation = useFetchMutation({` through `function clearOtherWriteErrors(` (keep its "Clears the OTHER writes' failures" comment). Types: mutation types are whatever `useFetchMutation` infers — return them via `ReturnType` of the existing calls only if inference fails; prefer an inferred return type (no explicit annotation) for this sub-hook.
  2. SUB-HOOK `useMediaUpload({ uploadMutation, clearOtherWriteErrors, locale }: UseMediaUploadInput): { altDraft; setAltDraft; fileInputRef; uploading; selectedFileName; uploadOpen; setUploadOpen; onFileChange; upload; openUpload; uploadError }` ← the `altDraft`, `fileInputRef`, `uploadInFlight`, `uploading`, `selectedFileName`, `uploadOpen`, `readError` declarations (with the FileReader comment), `const onFileChange = useCallback(`, `async function upload(`, `function openUpload(`, `const uploadFailure =`, `const uploadError =` (with its comment).
  3. SUB-HOOK `useMediaRowActions({ trashMutation, restoreMutation, purgeMutation, clearOtherWriteErrors }: UseMediaRowActionsInput): { pendingPurge; setPendingPurge; rowSavingId; trash; restore; purge }` ← `const [pendingPurge, …`, `const [rowSavingId, …`, `async function trash(`, `async function restore(`, `async function purge(`.
  4. `useMedia` keeps: `list`, `invalidate`, `invalidateList` (+comment), `useContentRefreshSubscription`, `editingId`, `lightboxIndex`, `orderBy` (+comment), the three sub-hook calls (writes → upload → row actions), `toggleEditing`, `onMetadataSaved`, `media`, `error = visibleMediaError({…})`, return.
- **Importers to update:** none (no export moves).
- **After:** file ~225; `useMedia` ~70; `useMediaUpload` ~55; others ≤ 45.
- **Risks / notes:** `useMediaWrites` must be called before `useMediaUpload`/`useMediaRowActions` (they take its outputs); state hook order changes by grouping only. `upload`'s synchronous `uploadInFlight` guard and its comment move intact.

### tovu:apps/admin/src/features/menus/MenuEditor.tsx
- **Over:** `MenuEditor` 102 (file 424, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-02
- **Tests:** `apps/admin/src/features/menus/__tests__/MenuEditor.unit.test.tsx`, `MenuEditor.remove-hook.unit.test.tsx`, `menu-html-mode.unit.test.tsx`, `legacy-page-picker.unit.test.tsx`, `html-embed.unit.test.tsx`, `menu-authoring-ux.unit.test.tsx`, `menus-i18n.unit.test.ts` (same folder)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `MenuItemTargetFields`, `MenuItemAttrsFields`, `ItemRow`, `MenuModeTabs`, `MenuEditorHeader` (exist) | row / tabs / header markup |
| B | the `: ( <div className="menu-tree">` branch of `{mode === "html" ? (` | options-mode item tree + "+ Add item" |
| C | `MenuEditor` | hook call, loading/error, title row, mode switch |

- **Splits** (same file, module level, directly above `MenuEditor`):
  1. SUB-COMPONENT `MenuItemTree({ items, pages, onChangeAt, onRemoveAt, onAddChildAt, onMoveAt, onAddRootItem, t }: MenuItemTreeProps): JSX.Element` ← the `<div className="menu-tree">` element (incl. the "Secondary, not bare/primary" comment). Prop types: `MenuEditorController["items"]`, `["pageChoices"]`, `["changeAt"]`, `["removeAt"]`, `["addChildAt"]`, `["moveAt"]`, `["addRootItem"]`, `["t"]` (import the controller type from `./hooks/use-menu-editor.hooks` — already exported). `MenuEditor` renders `<MenuItemTree items={items} pages={pageChoices} onChangeAt={changeAt} … />` in the else branch.
- **Importers to update:** none (no export moves; `targetForKind` re-export untouched).
- **After:** file ~435; `MenuEditor` ~82; `MenuItemTree` ~28.
- **Risks / notes:** `ItemRow`'s `key={item.id}` and `path={[i]}` move unchanged. Props only (no `editor` object passed to the new component).

### tovu:apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts
- **Over:** `useMenuEditor` 190 (file 317, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-02
- **Tests:** `apps/admin/src/features/menus/__tests__/use-menu-editor.hooks.unit.test.tsx`, `MenuEditor.unit.test.tsx`, `menu-html-mode.unit.test.tsx`, `legacy-page-picker.unit.test.tsx`, `html-embed.unit.test.tsx`, `page-choices.hooks.unit.test.tsx`, `menu-authoring-ux.unit.test.tsx` (same folder), `apps/admin/src/__tests__/fqfix-editor-reopen.unit.test.tsx`
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `items` state + `changeAt`, `removeAt`, `addChildAt`, `moveAt`, `addRootItem` | tree edits |
| B | `needsPages`, `pageQueryFetch`, `pageQuery`, `pageChoices` | page options for page-link items |
| C | `hydratedRoute`, `loadNavigation`, the load `useEffect(() => { if (hydratedRoute.current === menuId)…` | route-param load + stale guard |
| D | `copyFeedback`, `copyHtmlEmbed` | copy HTML embed marker |
| E | `savingRef`, `saving`, `save` | save with re-entry + stale guards |
| F | rest (`isNew`, loader, `write`, form states, `original`, `useDirtyGuard`, `activeMenuIdRef`, `changeTitle`, `changeSlug`, `changeMode`, return) | form state (stays) |

- **Splits** (same file, module level, above `useMenuEditor`, in run order; repo ESLint loads no react-hooks plugin, so setters passed into sub-hooks raise no deps warnings):
  1. SUB-HOOK `useMenuItemsTree({ itemIdSource }: UseMenuItemsTreeInput): { items; setItems; changeAt; removeAt; addChildAt; moveAt; addRootItem }` ← `const [items, setItems] = useState<AdminMenuItem[]>([]);` + the five tree functions (signatures unchanged; they are returned closures).
  2. SUB-HOOK `useMenuPageChoices({ port, items }: UseMenuPageChoicesInput): AdminPage-list type of pageQuery.data | undefined` ← `const needsPages = hasPageLinks({ items });` through `const pageChoices = needsPages ? …`.
  3. SUB-HOOK `useMenuHtmlEmbedCopy({ menu, menuId, clipboard, slug, activeMenuIdRef, t, error, message }: UseMenuHtmlEmbedCopyInput): { copyFeedback; setCopyFeedback; copyHtmlEmbed }` ← `const [copyFeedback, setCopyFeedback] = useState<string | null>(null);` + `async function copyHtmlEmbed()`. Move `activeMenuIdRef` (+ its "Stale-response guard, save() half" comment and the `.current = menuId` line) up so it is declared before this call.
  4. SUB-HOOK `useMenuRouteLoad({ menuId, isNew, loader, navigate, slugEdited, setters }: UseMenuRouteLoadInput): void` with `interface MenuRouteLoadSetters { setCopyFeedback; setMenu; setTitle; setSlug; setItems; setMode; setHtml; setOriginal; setLoading; setError }` ← `const hydratedRoute = useRef<…>(undefined);`, `const loadNavigation = useRef(navigate);`, `loadNavigation.current = navigate;`, and the whole load `useEffect` (deps array `[menuId, isNew, loader]` unchanged; destructure `setters` at the top of the sub-hook). The 2026-08-12 "Stale-response guard" comment moves with `loadNavigation`.
  5. SUB-HOOK `useMenuSave({ menuId, isNew, menu, title, slug, items, mode, html, pageChoices, write, port, navigate, t, activeMenuIdRef, setMenu, setItems, setHtml, setOriginal, setMessage, setError }: UseMenuSaveInput): { saving: boolean; save: () => Promise<void> }` ← `const savingRef = useRef(false);` (+ S4a comment), `const [saving, setSaving] = useState(false);`, `async function save()`.
  6. Call order in `useMenuEditor`: isNew/fetchMenu/menuKey/loader/write → menu/title/slug/slugEdited → `useMenuItemsTree` → mode/html → `useMenuPageChoices` → message/error/loading/original → `activeMenuIdRef` → `useMenuHtmlEmbedCopy` → `useMenuRouteLoad` → `useDirtyGuard` → `useMenuSave` → changeTitle/changeSlug/changeMode → return.
- **Importers to update:** none (no export moves).
- **After:** file ~345; `useMenuEditor` ~80; `useMenuRouteLoad` ~55; `useMenuSave` ~45.
- **Risks / notes:** `save`'s `savingForMenuId` vs `activeMenuIdRef.current` guard must read the SAME ref object as `copyHtmlEmbed` — pass the ref, not `.current`. Hook order changes by grouping only.

### tovu:apps/admin/src/features/pages/Pages.tsx
- **Over:** `Pages` 169 (file 213, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-02
- **Tests:** `apps/admin/src/features/pages/__tests__/Pages.unit.test.tsx`, `apps/admin/src/features/pages/__tests__/ThemePagesTab.unit.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | the `<DataTable rows={pages}` element inside `{activeTab === "mine" ? (` | "My Pages" table: columns, empty card, row menu |
| B | `Pages` | hooks, local tab/sort chrome state, header, TabBar, theme tab, delete confirm |

- **Splits** (same file, module level, directly above `Pages`):
  1. SUB-COMPONENT `MyPagesTable({ pages, sort, onSortChange, rowMenuHandleById, onTogglePublish, onRequestDelete, locale, t }: MyPagesTableProps): JSX.Element` ← the whole `<DataTable rows={pages}` … `/>` element. Inside, `onSortChange={setSort}` → `onSortChange={onSortChange}`, the row-menu `togglePagePublish` → `onTogglePublish`, `onDelete: setPendingDelete` → `onDelete: onRequestDelete`. Types: `pages: AdminPost[]` (the narrowed type the existing comment names), `sort: DataTableSortState`, `onSortChange: (next: DataTableSortState) => void` (match `DataTable`'s prop type), `rowMenuHandleById` / `onTogglePublish` / `locale` / `t` = the types of the existing values (take them from the `use-pages` controller type via indexed access, e.g. `PagesController["togglePagePublish"]` — use the exported controller type name in `./hooks/use-pages.hooks`).
  2. `Pages` keeps everything else; the `"mine"` branch becomes `<>{error ? <div className="notice error">{error}</div> : null}<MyPagesTable … /></>`. The 2026-08-14 owner-ruling comment and the `sort` comment stay on the `useState` lines in `Pages` (that state is intentionally local chrome — do not move it to the hook).
- **Importers to update:** none (no export moves).
- **After:** file ~225; `Pages` ~85; `MyPagesTable` ~95.
- **Risks / notes:** `navigate` used inside the table cells is the module import — keep using it in `MyPagesTable`. Props only.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/admin/src/features/deployment/hooks/use-publish-credentials.hooks.ts apps/admin/src/features/integrations/Integrations.tsx apps/admin/src/features/media/Media.tsx apps/admin/src/features/media/hooks/use-edit-media-panel.hooks.ts apps/admin/src/features/media/hooks/use-media.hooks.ts apps/admin/src/features/menus/MenuEditor.tsx apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts apps/admin/src/features/pages/Pages.tsx <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
