# Terra job size-21: split 6 Jini file(s) by responsibility (size limits)

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
### jini:packages/admin/src/redirects/react/pages/RedirectsPage.tsx
- **Over:** `RedirectsPage` 111
- **Phase:** now · **Batch:** size-21
- **Tests:** `packages/admin/src/redirects/react/__tests__/Redirects.unit.test.tsx`, `.../redirects-binding.unit.test.tsx`, `.../copy-polish.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:** A = `<form className="card form-measure" onSubmit={submitCreate}>` (~62 lines) — create-redirect form; B = header, `DataTable`, `ConfirmDialog`, guards — list screen.
- **Splits:**
  1. SUB-COMPONENT `RedirectCreateForm({ submitCreate, saving, t }: RedirectCreateFormProps): JSX.Element` (same file, above) ← unit A verbatim; add any other hook names it reads (check `locale`, `error`). Types from the `useWiredRedirects` return.
- **Importers to update:** none.
- **After:** `RedirectsPage` ~52; `RedirectCreateForm` ~65.
- **Risks / notes:** form fields may be uncontrolled (FormData in `submitCreate`) — keep `name=`/`id=` attributes verbatim.

### jini:packages/admin/src/seo/react/pages/SeoPage.tsx
- **Over:** file 608 · `SeoDefaultsTab` 136
- **Phase:** now · **Batch:** size-21
- **Tests:** `packages/admin/src/seo/react/__tests__/Seo.unit.test.tsx`, `.../share-image-warning.unit.test.tsx`, `.../copy-polish.unit.test.tsx`, `.../seo-hooks-fallbacks.unit.test.tsx`, `.../use-seo-entry-panel.unit.test.ts`, `packages/admin/src/__tests__/fqfix-loading.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `SeoSectionProps`, `SeoSection` | titled left-rail group layout (shared by all tabs) |
| B | `EntryPickerProps`, `EntryPicker`, `issueStatusClass`, `AnalyzePanel`, `SeoEntryPanelProps`, `SeoEntryPanel`, `SeoCopy`, `SeoEntryFieldsProps`, `SeoEntryHead`, `SeoEntrySearchFields`, `SeoEntrySocialFields`, `SeoEntryXFields`, `SeoEntrySectionProps`, `SeoEntrySection` | per-entry overrides tab (picker, edit form, analyze) |
| C | `SeoDefaultsTab`, `SeoSitemapTab`, `SeoProps`, `Seo`, `seoTabPanel`, re-export/default | site-wide tabs + screen dispatch |

- **Splits:**
  1. NEW `pages/SeoPage-section.tsx` — job: shared titled group. Moves `SeoSectionProps`, `SeoSection` (+ their comment). Exports both. Imports nothing from SeoPage.
  2. NEW `pages/SeoPage-entry.tsx` — job: per-entry SEO tab. Moves all of unit B in its current order with every comment (incl. the REQ-06/07 ones). Imports `SeoSection` from `./SeoPage-section.js` and the hooks/components unit B uses (copy those import lines; drop now-unused ones from SeoPage). Exports `SeoEntrySection`, `SeoEntrySectionProps`, and every other name that was `export`ed (`EntryPickerProps`, `SeoEntryPanelProps`). Never imports SeoPage.
  3. SUB-COMPONENTS in SeoPage, above `SeoDefaultsTab`: `SeoDefaultsSearchSection({ t, locale, settings }: SeoDefaultsSectionProps)` ← `<SeoSection title={t({ locale: locale, key: "Search appearan…` block; `SeoDefaultsSocialSection({ t, locale, settings, defaultOgImage, setDefaultOgImage }: SeoDefaultsSocialSectionProps)` ← the "Social preview" `<SeoSection`; `SeoDefaultsCrawlingSection({ t, locale, settings }: SeoDefaultsSectionProps)` ← the "Crawling" `<SeoSection`. `t` typed as `SeoCopy` (import the type from `./SeoPage-entry.js`, or `ReturnType<typeof useSeoCopy>`). The actions `<div className="jini-editor-actions …">` stays in `SeoDefaultsTab`.
- **Importers to update:** `packages/admin/src/seo/react/hooks/SeoModuleTabs.ts` (`SeoEntrySection` → `../pages/SeoPage-entry.js`; `SeoDefaultsTab`, `SeoSitemapTab` stay), `packages/admin/src/seo/react/__tests__/share-image-warning.unit.test.tsx` (`SeoEntrySection` → `../pages/SeoPage-entry.js`). `seo/react/index.ts` only re-exports type `SeoProps` (stays) — `./seo/react` is a package entry but `SeoEntrySection` is not exported from it, so no re-export needed.
- **After:** SeoPage ~290; `SeoDefaultsTab` ~30; SeoPage-entry ~320; SeoPage-section ~20.
- **Risks / notes:** check `rg -n "vi\.mock" packages/admin/src/seo` for mocks of `pages/SeoPage` before moving. The file header paragraph (SPEC-008 §2.4) stays in SeoPage; copy the part describing the entry tab into SeoPage-entry's header.

### jini:packages/admin/src/widgets/react/pages/WidgetInstanceEditor.tsx
- **Over:** `WidgetInstanceEditor` 108
- **Phase:** now · **Batch:** size-21
- **Tests:** `packages/admin/src/widgets/react/__tests__/WidgetInstanceEditor.unit.test.tsx`, `.../use-widget-instance-editor.hooks.unit.test.ts`, `packages/admin/src/widgets/__tests__/instance-editor.controller.unit.test.ts` (pkg `@jini-ai/admin`)
- **Responsibility map:** A = header `<div className="page-header page-header-split"` with handle `widget-instance-header` (~43 lines: back link, title, Save) — editor header; B = message/title label/config form + guards — editor body.
- **Splits:**
  1. SUB-COMPONENT `WidgetInstanceHeader({ onBackClick, isNew, save, saving, t }: WidgetInstanceHeaderProps): JSX.Element` (same file, above) ← unit A verbatim (with the `page-header-split` comment above it, ~L64). Add any further names it reads (`widget`, `whereUsed`, `message`, `error`) — props are exactly what the JSX reads, typed from the hook return.
- **Importers to update:** none.
- **After:** `WidgetInstanceEditor` ~68; header ~45.
- **Risks / notes:** `export { widgetInstanceGuard }` re-export at top stays.

### jini:packages/admin/src/widgets/react/pages/WidgetRegionEditor.tsx
- **Over:** `WidgetRegionEditor` 117
- **Phase:** now · **Batch:** size-21
- **Tests:** `packages/admin/src/widgets/react/__tests__/WidgetRegionEditor.unit.test.tsx`, `.../use-widget-region-editor.hooks.unit.test.tsx`, `packages/admin/src/widgets/__tests__/region-editor.controller.unit.test.ts` (pkg `@jini-ai/admin`)
- **Responsibility map:** A = `<div className="jini-widget-region-placements">` (~70: empty state, placement list, add control) — placement list; B = header `<div` (`widget-region-editor-header`) + guards — screen shell.
- **Splits:**
  1. SUB-COMPONENT `RegionPlacementList({ placements, widgetTypes, toggleEnabled, placementHandles, moveAt, removeAt, WidgetAddControl, addPlacement, saving, t }: RegionPlacementListProps): JSX.Element` (same file, above) ← unit A verbatim (the file header already names `RegionPlacementList` — this realizes it). Types from `useWiredWidgetRegionEditor` return / `useWidgetsOptions()`.
- **Importers to update:** none.
- **After:** `WidgetRegionEditor` ~48; `RegionPlacementList` ~72.
- **Risks / notes:** `WidgetAddControl` is a component from a slot — pass it as a prop of type `ComponentType<…>` taken from the options type; keep JSX `<WidgetAddControl …/>` verbatim.

### jini:packages/admin/src/widgets/react/pages/WidgetRegions.tsx
- **Over:** `WidgetRegions` 107
- **Phase:** now · **Batch:** size-21
- **Tests:** `packages/admin/src/widgets/react/__tests__/WidgetRegions.unit.test.tsx`, `.../use-widget-regions.hooks.unit.test.tsx`, `.../use-widget-regions.wiring.unit.test.tsx` (pkg `@jini-ai/admin`)
- **Responsibility map:** A = header `<div` (`widget-regions-header`, ~51: back link, title, bind-a-region control) — header + bind control; B = `<DataTable` (~38) — region table.
- **Splits:**
  1. SUB-COMPONENT `WidgetRegionsHeader({ headerActions, newRegionKey, setNewRegionKey, bind, binding, error, t }: WidgetRegionsHeaderProps): JSX.Element` (same file, above) ← unit A verbatim; props = names the JSX reads.
- **Importers to update:** none.
- **After:** `WidgetRegions` ~58; header ~53.
- **Risks / notes:** none.

### jini:packages/admin/src/widgets/react/pages/WidgetsLibrary.tsx
- **Over:** `WidgetsLibrary` 130
- **Phase:** now · **Batch:** size-21
- **Tests:** `packages/admin/src/widgets/react/__tests__/WidgetsLibrary.unit.test.tsx`, `.../use-widgets-library.hooks.unit.test.tsx`, `.../use-widgets-library.wiring.unit.test.tsx`, `.../fetch-query-migration.test.ts` (pkg `@jini-ai/admin`)
- **Responsibility map:** A = `<div className="page-header">` (~37: kicker/title/description + create-type picker) — header + create control; B = `<DataTable` (~56) — widgets table; C = guards, notices, `ConfirmDialog` — shell.
- **Splits:**
  1. SUB-COMPONENT `WidgetsLibraryHeader({ headerActions, createType, setCreateType, widgetTypes, t }: WidgetsLibraryHeaderProps): JSX.Element` ← unit A verbatim.
  2. SUB-COMPONENT `WidgetsTable({ widgets, rowHandleById, statusLabel, requestTrash, t }: WidgetsTableProps): JSX.Element` ← unit B verbatim; props = names the JSX reads (check `trashing`).
- **Importers to update:** none.
- **After:** `WidgetsLibrary` ~45; header ~40; table ~60.
- **Risks / notes:** `export { WidgetsLibraryNotices }` re-export stays.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/admin/src/redirects/react/pages/RedirectsPage.tsx packages/admin/src/seo/react/pages/SeoPage.tsx packages/admin/src/widgets/react/pages/WidgetInstanceEditor.tsx packages/admin/src/widgets/react/pages/WidgetRegionEditor.tsx packages/admin/src/widgets/react/pages/WidgetRegions.tsx packages/admin/src/widgets/react/pages/WidgetsLibrary.tsx <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
