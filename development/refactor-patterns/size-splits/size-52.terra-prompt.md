# Terra job size-52: split 4 Tovu file(s) by responsibility (size limits)

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
### tovu:apps/admin/src/features/taxonomy/Taxonomy.tsx
- **Over:** file 690 lines · `namespaceList` 146 · `<arg of taxonomies.map>` 111
- **Phase:** after-move (MOVE-AFTER host ports + Publi…) · **Batch:** size-52
- **Tests:** `apps/admin/src/features/taxonomy/__tests__/Taxonomy.unit.test.tsx`, `apps/admin/src/features/taxonomy/__tests__/taxonomy-agent-drive.unit.test.tsx`, `apps/admin/src/features/taxonomy/__tests__/embed-header-alignment.unit.test.tsx`, `apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `TaxonomyProps`, `TaxonomyPageHeader*`, `TermDeleteDialog*`, `TaxonomyDeleteDialog*`, `TaxonomyNotices*`, `Taxonomy` | screen shell + dialogs (stays) |
| B | `NewTermFormProps`, `NewTermForm`, `NewTaxonomyFormProps`, `NewTaxonomyForm` | create forms |
| C | `MergeTermSectionProps`, `MergeIdleStep*`, `MergePlannedStep*`, `MergeConfirmedStep*`, `MergeTermSection`, `TermDetailPanelProps`, `TermDetailPanel` | term detail + merge flow |
| D | `namespaceList` | per-taxonomy groups with term rows |

- **Splits:**
  1. NEW `Taxonomy-forms.tsx` — Moves unit B. Exports `NewTermForm`, `NewTermFormProps`, `NewTaxonomyForm`, `NewTaxonomyFormProps`.
  2. NEW `Taxonomy-term-detail.tsx` — Moves unit C. Exports `TermDetailPanel`, `TermDetailPanelProps`, `MergeTermSectionProps`.
  3. NEW `Taxonomy-namespace-list.tsx` — Moves `namespaceList` (+ its "Extracted so both branches" doc); imports `NewTermForm` from step 1. Exports `namespaceList`. Inside it, above `namespaceList`:
     - SUB-COMPONENT `TaxonomyGroupHeader({ group, deleteState, t, menuPortalContainer, taxonomyMenuHandle }): ReactNode` ← `<div className="taxonomy-namespace-group-header">` (title, copy-embed button, `TaxonomyRowMenu`).
     - HELPER `taxonomyTermItems({ group, byId, takeTermHandle, selectedTermId, setSelectedTermId, deleteState, t, … }: TaxonomyTermItemsInput): ReactNode` — a plain function **called synchronously** (not a JSX component) ← the `group.terms.map(...)` inside `<ul className="settings-row-list taxonomy-term-list">`. In `namespaceList`, replace the two lines `const termHandle = termHandles[termHandleIndex]; termHandleIndex += 1;` by a local `takeTermHandle()` closure that does exactly those two statements and returns `termHandle`; the helper calls it at the same point.
- **Importers to update:** none outside the file (only props types were exported, no external users).
- **After:** `Taxonomy.tsx` ~265; `namespaceList` ~45; map callback ~45; new files ~135 / ~190 / ~175.
- **Risks / notes:** `termHandleIndex` is a render-time counter across groups — it MUST stay evaluated in render order; that is why `taxonomyTermItems` is a plain function, not a component. `deleteState` type: import from the hook file. MOVE-AFTER: the screen moves to a taxonomy module later; this split keeps the same file set movable together.

### tovu:apps/admin/src/features/taxonomy/TaxonomyRowMenu.hooks.ts
- **Over:** `useTaxonomyRowMenu` 102 (file 105)
- **Phase:** after-move (DELETE-AFTER-PARITY, legacy twin) · **Batch:** size-52
- **Tests:** `apps/admin/src/features/taxonomy/__tests__/TaxonomyRowMenu.hooks.unit.test.tsx`
- **Responsibility map:** open/active state + refs (stays) · popup positioning (`useLayoutEffect`) · outside-click/focus close effect · keyboard handlers (stay).
- **Splits:**
  1. SUB-HOOK `useRowMenuPosition({ open, triggerRef, menuRef, setPosition }: UseRowMenuPositionInput): void` (same file, above `useTaxonomyRowMenu`) ← the `useLayoutEffect(() => {` that uses `open,triggerRef,menuRef,setPosition` (~L34–58), verbatim.
- **Importers to update:** none.
- **After:** `useTaxonomyRowMenu` ~78; file ~110.
- **Risks / notes:** call the sub-hook at the exact spot of the old `useLayoutEffect` (before the two `useEffect`s) so effect order is unchanged. DELETE-AFTER-PARITY.

### tovu:apps/admin/src/features/taxonomy/TermPicker.tsx
- **Over:** `TermPicker` 132 (file 205)
- **Phase:** after-move (MOVE-AFTER taxonomy module) · **Batch:** size-52
- **Tests:** `apps/admin/src/features/taxonomy/__tests__/TermPicker.unit.test.tsx`, `apps/admin/src/features/posts/__tests__/PostEditor.unit.test.tsx`, `apps/admin/src/features/pages/__tests__/PageEditor.unit.test.tsx`, `apps/admin/src/features/collections/__tests__/CollectionEntryEditor.dynamic-field.unit.test.tsx`
- **Responsibility map:** hook + early return (stays) · agent handle ids (`termIds` … `searchHandles`) · the groups list `<div className="term-picker-groups">` · actions `<span className="editor-actions term-picker-actions">`.
- **Splits:**
  1. HELPER `buildTermPickerHandles({ taxonomies }: BuildTermPickerHandlesInput): TermPickerHandles` (same file, above `TermPicker`) ← `const termIds = …` through `const searchHandles = …` (with the "Term ids are database row ids" comment). Returns `{ termHandleById, moreHandles, searchHandles, addTriggerHandles, addInputHandles, addButtonHandles }`.
  2. SUB-COMPONENT `TermPickerGroups({ t, taxonomies, subject, handles, …the picker fields the block reads… }): ReactNode` ← `<div className="term-picker-groups">` block (renders `TermChecklist`). Pass picker fields individually (read the block for the list: e.g. `toggle`, `selected`, add-term state/handlers) — not the whole `picker`.
  `TermPicker` keeps hook, destructure, `if (hidden) return null;`, the handles call, the loading/empty branches and the actions span.
- **Importers to update:** none.
- **After:** `TermPicker` ~45; `TermPickerGroups` ~85; file ~230.
- **Risks / notes:** `vi.mock` of this module in `posts/__tests__/posts-i18n.unit.test.ts`, `posts/__tests__/PostEditor.unit.test.tsx`, `posts/__tests__/post-editor-agent-drive.unit.test.tsx`, `pages/__tests__/PageEditor.unit.test.tsx`, `pages/__tests__/PageEditor.preview-remount.unit.test.tsx` — they replace `TermPicker` wholesale; nothing moves out of the module, so mocks still apply. The `!` in `termHandles[index]!` is existing code — moved as-is.

### tovu:apps/admin/src/features/themes/ThemeExplore.tsx
- **Over:** file 1020 lines · `ThemeExploreContent` 287
- **Phase:** after-move (MIXED; STAY-PRODUCT: everything except…) · **Batch:** size-52
- **Tests:** `apps/admin/src/features/themes/__tests__/ThemeExplore.unit.test.tsx`, `apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `ThemeExploreProps`, `VIEWS`, `VIEW_TABS`, `themeExplorePreviewNotice`, `ThemeExploreHtmlPane`, `ThemeExploreMainPane`, `ThemeExploreFullscreenDialog`, `ThemeExplore`, `ThemeExploreContent`, `ThemeExplorePreview` | screen + main pane (stays) |
| B | `handleFileRowRenameKeyDown`, `ThemeExploreModifiedMarker`, `themeFileCopyLabel`, `ThemeExploreFileRow`, `ThemeExploreFileGroupTabs`, `ThemeExploreShowAllToggle`, `ThemeExploreFileList` | file picker tray |
| C | `ThemeExploreDirectionsNotice`, `ThemeExploreCopyTip`, `ThemeExploreStatusNotice`, `PageRenameWarningBody`, `DeleteFileWarningBody`, `ResetFileWarningBody` | notices + confirm-dialog bodies |
| D | `isApplePlatform`, `canSaveSelectedFile`, `themeExploreSaveLabel`, `themeExploreResetLabel`, `ThemeExploreToolbarButtons`, `ThemeExplorePreviewControls`, `ThemeExploreToolbarActions`, `ThemeExplorePublishToggle` | toolbar |

- **Splits:**
  1. NEW `ThemeExplore-file-list.tsx` — Moves unit B. Exports `ThemeExploreFileList`.
  2. NEW `ThemeExplore-notices.tsx` — Moves unit C. Exports all six.
  3. NEW `ThemeExplore-toolbar.tsx` — Moves unit D (+ the 2026-08-11 toolbar-restructure doc). Exports `ThemeExploreToolbarButtons`, `ThemeExploreToolbarActions`, `ThemeExplorePublishToggle`.
  4. `ThemeExploreContent` (48-line hook destructure is the blocker). Plan (explicit rule-9 exception, same as PageEditor): `const explore = useThemeExploreHook(…same args…);` then NEW `ThemeExplore-sections.tsx` with SUB-COMPONENTS that take `{ explore }` (controller type exported by the theme-explore hooks file) plus the local values they read: `ThemeExploreHeaderSection({ explore, selectedFile, publishState, onViewTabsKeyDown, wrap, toggleWrap })` ← the header comment block + `<div className="page-header theme-explore-header">` + the shared error/notice block; `ThemeExploreWorkspace({ explore, selectedFile, previewMode, previewSrc, device, setDevice, previewWidth, fullscreen, fullscreenTriggerRef, wrap })` ← `<div className="theme-explore">`; `ThemeExploreConfirmDialogs({ explore, selectedFile })` ← the three `<ConfirmDialog`. `ThemeExploreContent` keeps all hook calls in order (incl. the STAYS LOCAL `useDevicePreviewDevice` with its comment, the fullscreen hook, `useTabBarKeyboard`, preview hook, `useCodeWrap`), the two early returns, the three derived locals, `<ThemeExploreFullscreenDialog`, and the section calls.
- **Importers to update:** none outside the file (moved names were private).
- **After:** `ThemeExplore.tsx` ~300; `ThemeExploreContent` ~70; new files ~235 / ~120 / ~170 / ~200.
- **Risks / notes:** step 4 rewrites identifiers to `explore.x` — **Opus should execute step 4** (or owner OKs passing the controller). Steps 1–3 are mechanical (Terra). Survey: most of this stays product after the move.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/admin/src/features/taxonomy/Taxonomy.tsx apps/admin/src/features/taxonomy/TaxonomyRowMenu.hooks.ts apps/admin/src/features/taxonomy/TermPicker.tsx apps/admin/src/features/themes/ThemeExplore.tsx <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
