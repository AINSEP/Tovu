# Terra job size-38: split 8 Jini file(s) by responsibility (size limits)

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
### jini:packages/admin/src/comments/controllers/comment-queue.controller.ts
- **Over:** `createCommentQueueController` 146
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/comments/__tests__/comment-queue.controller.unit.test.ts`, `packages/admin/src/comments/__tests__/comments-surface.unit.test.ts` (pkg `@jini-ai/admin`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `let firstPage`, `let morePages`, `let firstError`, `let moreError`, `let pageGeneration`, `let loadingMore`, `publishPages`, `resetMorePages`, `setStatus`, `settleFirstPage`, `isCurrentRead`, `readMorePage`, `loadMore` | page one + cursor-page accumulation (all six `let`s are read only by these) |
| B | `store`, `let permissions`, `busyRowIds`, `patchRowState`, `reloadAfterAction`, `stateFor`, `configure`, `onModerate`, `setPendingPurge`, `onPurge`, `dispose`, return | controller shell + row actions |

- **Splits:**
  1. HELPER `createQueuePaging({ store, api, getT }: CreateQueuePagingInput, { loadPage }: CreateQueuePagingOptions = {}): { publishPages(): void; resetMorePages(): void; setStatus: typeof setStatus; settleFirstPage: typeof settleFirstPage; loadMore: typeof loadMore; supersedeReads(): void }` — module level, above `createCommentQueueController`. Body = unit A statements verbatim, from `let firstPage: AdminCommentsQueuePage | null = null;` through `async function loadMore(` (keep the `resetMorePages` and `isCurrentRead` why-comments). Every read of `t` inside becomes `getT()` (because `configure` reassigns `t`). `supersedeReads()` = `pageGeneration++;` (the line `dispose` uses). `store` type: the `createControllerStore<CommentQueueState>` return type (use `ReturnType<typeof createControllerStore<CommentQueueState>>` only if no exported store type exists; check `createControllerStore`'s module for an exported `ControllerStore<T>` type first). `loadPage` type copied from the controller's optional param.
  2. In `createCommentQueueController`: after `let permissions = initialPermissions;` add `const paging = createQueuePaging({ store, api, getT: () => t }, { loadPage });` and destructure `{ publishPages, resetMorePages, setStatus, settleFirstPage, loadMore }`. `dispose` replaces `pageGeneration++;` with `paging.supersedeReads();`. Return object unchanged.
- **Importers to update:** none (no export moves).
- **After:** file ~160; `createCommentQueueController` ~65; `createQueuePaging` ~85.
- **Risks / notes:** statement order inside unit A must stay (closure `let`s initialised before functions run). `t` must be read through `getT()` everywhere in A (publishPages, loadMore catch) or a locale switch publishes stale copy. `busyRowIds` lock comment stays with `busyRowIds` in the controller.

### jini:packages/admin/src/comments/react/components/SettingsSection.tsx
- **Over:** `SettingsSection` 114
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/comments/react/__tests__/SettingsSection.unit.test.tsx`, `.../comments-states.unit.test.tsx`, `.../Comments.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `<div className="field-group">` (first, checkbox toggles, ~L35-57) | on/off comment options |
| B | `<div className="field-group">` (second, `field-row` numeric/limit inputs from `comments-max-depth`, ~L59-122) | numeric limits |
| C | rest of `SettingsSection` (hook call, guards, `<form>`, `editor-actions`) | screen shell |

- **Splits:**
  1. SUB-COMPONENT `CommentsToggleFields({ settings, saving, t }: CommentsToggleFieldsProps): JSX.Element` (same file, above `SettingsSection`) ← first `<div className="field-group">` verbatim. Props are exactly the names that JSX reads (check: `settings`, `saving`, `t`; add any other hook name it reads, typed from `useSettingsSection`'s return).
  2. SUB-COMPONENT `CommentsLimitFields({ settings, saving, t }: CommentsLimitFieldsProps): JSX.Element` ← second `<div className="field-group">` verbatim.
  3. `SettingsSection` renders `<CommentsToggleFields … />` and `<CommentsLimitFields … />` in place. No hook changes (state already lives in `useSettingsSection`).
- **Importers to update:** none.
- **After:** `SettingsSection` ~35; sub-components ~30 / ~68; file ~135.
- **Risks / notes:** inputs are uncontrolled form fields read by `onSubmit` via FormData if `name=` attributes are used — keep every attribute verbatim. Header why-comment on `SettingsSection` export stays.

### jini:packages/admin/src/forms/react/components/FieldAttributesDialog.tsx
- **Over:** `FieldAttributesDialog` 149
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/forms/react/__tests__/field-row-editing.unit.test.tsx`, `.../FieldSettingsSection.unit.test.tsx`, `.../use-field-attributes-dialog.hooks.unit.test.ts`, `packages/admin/src/forms/__tests__/field-settings.unit.test.ts` (pkg `@jini-ai/admin`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `<div className="field">` inside `<details className="field-settings-advanced">` (~L59-79) | CSS class input |
| B | `<div className="field-attrs-rows">` (~L81-146: datalist, `rows.map`, add-row button) | HTML attribute rows editor |
| C | rest (hooks, `<form>`, `FieldSettingsSection`, error, `editor-actions`) | dialog shell |

- **Splits:**
  1. SUB-COMPONENT `FieldClassNameInput({ className, onClassName, t }: FieldClassNameInputProps): JSX.Element` (same file, above) ← unit A verbatim incl. the "five-line explainer … ⓘ tip" comment.
  2. SUB-COMPONENT `FieldAttributeRows({ rows, addRow, t }: FieldAttributeRowsProps): JSX.Element` ← unit B verbatim. `rows` typed as the `useFieldAttributesView` return's `rows` (export that type from `use-field-attributes-dialog.hooks.ts` / wherever `useFieldAttributesView` lives if not already exported). Add any other names the block reads (check `displayName`, `fieldIndex`).
  3. Dialog renders both in place. Hooks untouched.
- **Importers to update:** none.
- **After:** `FieldAttributesDialog` ~60; `FieldAttributeRows` ~70; file ~180.
- **Risks / notes:** the "One dialog is ever open at a time" comment stays with `const { className, addRow, error, submit } = controller;`. `datalist id` must stay unique — still one instance.

### jini:packages/admin/src/forms/react/components/FormFieldsEditor.tsx
- **Over:** `FormFieldsEditor` 204 · `<arg of rows.map>` 110
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/forms/react/__tests__/field-row-editing.unit.test.tsx`, `.../use-form-fields-editor.hooks.unit.test.tsx`, `.../forms-view.hooks.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `<td data-label={t("ID")}>`, `"Label"`, `"Type"` cells | identity + type cells of one row |
| B | `<td data-label={t("Required")}>`, `"Max length"`, `"Settings"`, `form-field-remove-cell` | row options + actions cells |
| C | `<tr key={index}>` wrapper = `rows.map` callback | one field row |
| D | `<table>` head/tfoot, dialog, hooks | table shell |

- **Splits:**
  1. SUB-COMPONENT `FormFieldIdentityCells({ row, t }: FormFieldIdentityCellsProps): JSX.Element` (fragment `<>…</>`) ← the ID, Label, Type `<td>`s verbatim; reads the row fields (`field, index, isExisting, base, onId, onLabel, onType, typeGroups`) from `row`.
  2. SUB-COMPONENT `FormFieldOptionCells({ row, onChange, t }: FormFieldOptionCellsProps): JSX.Element` ← Required, Max length, Settings, remove `<td>`s verbatim (`onChange` only if the remove cell reads it).
  3. SUB-COMPONENT `FormFieldRow({ row, onChange, t }: FormFieldRowProps): JSX.Element` ← the `<tr key={index}>` element; renders 1 + 2. `row` type = element type of `useFormFieldsView`'s `rows` (export `FormFieldsViewRow` from `forms-view.hooks.ts` if not exported). The `rows.map` becomes `rows.map((row) => <FormFieldRow key={row.index} row={row} … />)` — key moves from `<tr>` to the component.
  4. `FormFieldsEditor` keeps table/thead/tfoot/dialog (incl. the "MAX LENGTH" header comment and the field-id uniqueness comment).
- **Importers to update:** none.
- **After:** `FormFieldsEditor` ~95; `FormFieldRow` ~15; cells ~45 / ~65; file ~230.
- **Risks / notes:** `ref` from row is a callback ref on an input — pass through `row`, unchanged. Destructuring in the old callback params disappears; inside sub-components destructure from `row` so JSX stays verbatim.

### jini:packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts
- **Over:** `useFormEditor` 151
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/forms/react/__tests__/use-form-editor.unit.test.tsx`, `.../use-form-editor.branches.unit.test.tsx`, `.../FormEditor.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `const seededFormIdRef`, `const seededControllerRef`, `useEffect(() => {` (seed) | seed editor state from the loaded form once per form/controller |
| B | `const updateMutation`, `const createMutation`, `const statusMutation`, `async function handleSave()`, `async function handleStatusToggle()`, `const saving`, `const error = visibleFormEditorError({` | persist (create/update/status) + visible error/saving |
| C | `const { isDirty } = useDirtyGuard(`, `const [leaveConfirmOpen, …]`, `const leave = {` | unsaved-changes leave guard |
| D | `const tabRefs`, `function onTabChange`, `function onTabsKeyDown` | tab navigation (ADR-063) |
| E | rest (state controller, setters, queries, `onModeChange`, `copyEmbed`, return) | hook shell |

- **Splits** (all SUB-HOOKS in this file, module level above `useFormEditor`, in this order):
  1. `useFormEditorSeed({ stateController, list, formId, isNew, form }: UseFormEditorSeedInput): void` ← unit A verbatim (its long "Seeds `form`/`name`…" comment moves with it). `props.formId` → `formId`.
  2. `useFormEditorPersistence({ port, list, formId, isNew, state, stateController, setForm, navigate, t }: UseFormEditorPersistenceInput): { saving: boolean; error: string | null; handleSave(): Promise<void>; handleStatusToggle(): Promise<void> }` ← unit B verbatim (state fields `name, slug, fields, notify, provider, mode, html, form` destructured from `state` at the top; "None of these invalidate `KEYS.form…`" comment moves). Use the exact `error` type `visibleFormEditorError` returns.
  3. `useFormLeaveGuard({ draft, isNew, navigate }: UseFormLeaveGuardInput): { isDirty: boolean; leave: <type of leave> }` ← unit C; `draft` = the `formEditorDraft({...})` value computed in `useFormEditor` (keep the "Same guard as the post and widget editors" comment on the `useDirtyGuard` line). If returning `leaveConfirmOpen` separately is required by the return object, include it.
  4. `useFormEditorTabs({ formId, tab, navigate, t }: UseFormEditorTabsInput): { tabRefs; onTabChange; onTabsKeyDown }` ← unit D (ADR-063 comment moves).
  5. `useFormEditor` calls them in the same order the statements ran (seed after `list`, persistence after seed, guard, tabs) and returns the same object.
- **Importers to update:** none (only `useFormEditor`/`useWiredFormEditor`/`FormEditorController` exported, unchanged).
- **After:** `useFormEditor` ~60; sub-hooks ~15 / ~55 / ~18 / ~14; file ~240.
- **Risks / notes:** hook call ORDER must be identical (React rules): sub-hooks replace the statements at their original position — persistence's three `useFetchMutation` sit where they were, before `useDirtyGuard`/`useState`. `handleSave` reads `stateController` — pass it, don't snapshot.

### jini:packages/admin/src/forms/react/pages/FormEditor.tsx
- **Over:** `FormEditor` 101
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/forms/react/__tests__/FormEditor.unit.test.tsx`, `.../FormEditor.field-settings.unit.test.tsx`, `.../FormEditorFieldsBody.unit.test.tsx`, `.../forms-agent-drive.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:** A = the tab strip `<div` inside the return (~L93-123: tab buttons + panels using `showTabs, tab, activeTab, onTabChange, tabRefs, onTabsKeyDown, formId, fieldsBody, answerColumns`) — fields/submissions tabs; B = rest (hook, guards, `fieldsBody`, header, `ConfirmDialog`) — screen shell.
- **Splits:**
  1. SUB-COMPONENT `FormEditorTabs({ tab, activeTab, onTabChange, tabRefs, onTabsKeyDown, formId, fieldsBody, answerColumns, t }: FormEditorTabsProps): JSX.Element` (same file, above `FormEditor`) ← unit A verbatim. Types from `FormEditorController` (`FormEditorController["tabRefs"]` etc.); `fieldsBody: ReactNode`.
  2. `FormEditor` renders `<FormEditorTabs … />` where the block was (keep the surrounding `showTabs`/`isNew` conditional in `FormEditor` if it wraps the div).
- **Importers to update:** none.
- **After:** `FormEditor` ~75; `FormEditorTabs` ~33.
- **Risks / notes:** `tabRefs` is a ref array mutated by callback refs — pass the same ref object.

### jini:packages/admin/src/forms/react/pages/FormsList.tsx
- **Over:** `FormsList` 107
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/forms/react/__tests__/use-forms-list.unit.test.tsx`, `.../FormsModule.unit.test.tsx`, `.../copy-polish.unit.test.tsx`, `.../forms-agent-drive.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:** A = `<DataTable<(typeof rows)[number]>` (~L85-143) — forms table; B = header `<div`, `<ConfirmDialog` and guards — screen shell.
- **Splits:**
  1. SUB-COMPONENT `FormsTable({ rows, rowSavingId, t }: FormsTableProps): JSX.Element` ← unit A verbatim, plus the "Form ids are stable and unique…" comment that sits above the return (it explains the table's row keys). `rows` type = `ReturnType<typeof useFormsListView>["rows"]` (export a named `FormsListRow` type from `forms-view.hooks.ts` if the hook already exports one; else use that ReturnType). Add any other names the block reads.
  2. `FormsList` renders `<FormsTable … />` in place.
- **Importers to update:** none.
- **After:** `FormsList` ~52; `FormsTable` ~60.
- **Risks / notes:** none beyond verbatim JSX.

### jini:packages/admin/src/media/controllers/library.controller.ts
- **Over:** `createLibraryController` 169
- **Phase:** now · **Batch:** size-38
- **Tests:** `packages/admin/src/media/__tests__/library-controller.test.ts`, `.../controllers.test.ts`, `.../parity-controllers.test.ts`, `.../qa-recovery.test.ts`, `packages/admin/src/media/react/__tests__/library-tab-hooks.test.tsx`, `.../qa-round2.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `let writes`, `let exclusiveWrite`, `function write(run, id?)` | serialized write queue with per-id reservation |
| B | returned `upload`, `trash`, `restore`, `requestPurge`, `cancelPurge`, `confirmPurge` | library mutations |
| C | store, read state, `cancelRetry`, `libraryView`, `acceptRead`, `failRead`, `load`, `settleLibrary`, `getSnapshot/subscribe/load/settleLibrary/setQuery/dispose` | reads + controller shell |

- **Splits:**
  1. HELPER `createSerialWriter({ store, beforeWrite, load }: CreateSerialWriterInput): (run: () => Promise<unknown>, id?: string) => Promise<boolean> | undefined` (module level above the controller; keep `write`'s exact return type) ← unit A verbatim. The line `generation++; readAbort?.abort(); cancelRetry();` becomes `beforeWrite();` (its "Starting a write clears other writes' failures" comment stays above it); the controller passes `beforeWrite: () => { generation++; readAbort?.abort(); cancelRetry(); }`. The existing `write(run, id)` positional signature is kept (it is existing code, not a new helper API).
  2. HELPER `createLibraryMutations({ store, api, write, dropPurged }: CreateLibraryMutationsInput): { upload; trash; restore; requestPurge; cancelPurge; confirmPurge }` ← the six methods verbatim (trash-asymmetry comment moves). In `confirmPurge`, the `if (library) { library = …; store.set(…libraryView…) }` block becomes `dropPurged({ id: item.id });` and the controller defines `dropPurged` (the block + its "A failed follow-up read must not leave…" comment) since it reassigns `library`.
  3. Return becomes `{ getSnapshot, subscribe, load, settleLibrary, setQuery, ...mutations, dispose }`.
- **Importers to update:** none.
- **After:** controller ~95; `createSerialWriter` ~35; `createLibraryMutations` ~45; file ~210.
- **Risks / notes:** `write` must stay ONE instance shared by all mutations (the `writes` chain serializes). `api.restore!` non-null is existing code — leave as is (moving it is allowed; do not add new ones). Controller lands near 100 — if `--check` still shows it over, STOP and report (do not improvise).

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/admin/src/comments/controllers/comment-queue.controller.ts packages/admin/src/comments/react/components/SettingsSection.tsx packages/admin/src/forms/react/components/FieldAttributesDialog.tsx packages/admin/src/forms/react/components/FormFieldsEditor.tsx packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts packages/admin/src/forms/react/pages/FormEditor.tsx packages/admin/src/forms/react/pages/FormsList.tsx packages/admin/src/media/controllers/library.controller.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
