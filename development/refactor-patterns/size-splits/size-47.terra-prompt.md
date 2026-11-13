# Terra job size-47: split 4 Tovu file(s) by responsibility (size limits)

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
### tovu:apps/admin/src/features/deployment/StaticSiteTab.tsx
- **Over:** file 935 lines (no function over 100)
- **Phase:** after-move (MIXED) · **Batch:** size-47
- **Tests:** `apps/admin/src/features/deployment/__tests__/StaticSiteTab.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `StaticSiteTabProps`, `StaticSiteTab`, `GettingItOnlineCard`, `ManageAccessTokensLink` | tab shell + "Getting it online" card (stays) |
| B | `CopyLine`, `ExportRunCounts`, `ExportRunFailures`, `ExportRunResult`, `BuildExportCard`, `ExportTriggerAction` | static export build card + run result |
| C | `publishCredentialsSectionContent`, `PublishCredentialsSection`, `PublishCredentialFields`, `FieldLabel`, `CredentialFieldInput`, `TokenFieldHints`, `CredentialStepTodo`, `TemplateWithNode`, `CredentialStepDone`, `CredentialVerifyAction`, `CredentialTokenPicker` | Step 1: publish credential |
| D | `PublishFailureNotice`, `StaticPublishTargetFields`, `PublishPreviewAction`, `PublishTriggerAction`, `chosenCredentialIdForTarget`, `StaticPublishForm`, `PublishPreviewFacts` | Step 2: preview + publish form |

- **Splits:**
  1. NEW `StaticSiteTab-export.tsx` — job: build/export card. Moves unit B (+ the `@file` paragraph about the trigger+poll build; copy it to the new header). Exports `BuildExportCard`.
  2. NEW `StaticSiteTab-credentials.tsx` — job: the credential step. Moves unit C. Exports `PublishCredentialsSection`, `FieldLabel` (used by D).
  3. NEW `StaticSiteTab-publish-form.tsx` — job: preview + publish mini-form. Moves unit D; imports `FieldLabel` from step 2. Exports `StaticPublishForm`, `chosenCredentialIdForTarget` (used by `GettingItOnlineCard`).
  All JSDoc above each component moves with it. `StaticSiteTab.tsx` imports `BuildExportCard`, `PublishCredentialsSection`, `StaticPublishForm`, `chosenCredentialIdForTarget`. None of the new files imports `StaticSiteTab.tsx`.
- **Importers to update:** none outside the file (only `StaticSiteTab`/`StaticSiteTabProps` are exported and they stay).
- **After:** `StaticSiteTab.tsx` ~180; new files ~210 / ~350 / ~210.
- **Risks / notes:** no `vi.mock` of this module. Check each moved component's own imports (hooks from `./hooks/use-static-publish.hooks`, i18n) and carry only those it uses.

### tovu:apps/admin/src/features/deployment/hooks/use-static-publish.hooks.ts
- **Over:** `useStaticPublish` 150 (file 241)
- **Phase:** after-move (MIXED) · **Batch:** size-47
- **Tests:** `apps/admin/src/features/deployment/hooks/__tests__/use-static-publish.unit.test.tsx`, `apps/admin/src/features/deployment/__tests__/StaticSiteTab.unit.test.tsx`
- **Responsibility map:**

| unit | statements of `useStaticPublish` | job |
|---|---|---|
| A | `const targetsQuery = useFetchQuery(` … `async function checkPreview() {` | target choice, config fields, preview |
| B | `const query = useFetchQuery({ key: ["deployment", "publish"]` … `async function publish(` | publish run: seed, poll loop, trigger |
| C | `return {` | controller assembly |

- **Splits:**
  1. SUB-HOOK `usePublishTargetForm({ port, locale }: UsePublishTargetFormInput): PublishTargetForm` (same file, above `useStaticPublish`) ← unit A verbatim (incl. `invalidatePreview`, `setTarget`, `setConfigField`, `checkPreview` and the generation/duplicate-guard ref comments). Returns `{ targets, targetsError, target, selectedTarget, setTarget, configValues, setConfigField, projectName, setProjectName, preview, previewLoading, previewError, checkPreview }`.
  2. SUB-HOOK `usePublishRun({ port, locale, t, selectedTarget, configValues, projectName }: UsePublishRunInput): PublishRunState` ← unit B verbatim (seed effect, poll effect, `publish`). Returns `{ run, publishing, publishError, publishFailure, pollError, loadError, isPublishing, publish }` — exactly the names `return {` reads.
  3. `useStaticPublish(port, t, locale)` keeps its signature (exported, tests call it) and is: the two sub-hook calls in this order + the unchanged `return {`.
- **Importers to update:** none (no export moves).
- **After:** `useStaticPublish` ~32; `usePublishTargetForm` ~50; `usePublishRun` ~75; file ~250.
- **Risks / notes:** hook order is preserved (A before B). `publish` reads `selectedTarget`/`configValues`/`projectName` from the current render — passing them as inputs each render keeps that. Return-type interfaces are local (not exported).

### tovu:apps/admin/src/features/pages/PageEditor.tsx
- **Over:** file 1017 lines · `PageEditor` 220 · `PageEditorPane` 125
- **Phase:** after-move (MIXED) · **Batch:** size-47
- **Tests:** `apps/admin/src/features/pages/__tests__/PageEditor.unit.test.tsx`, `apps/admin/src/features/pages/__tests__/PageEditor.interactive-flush.unit.test.tsx`, `apps/admin/src/features/pages/__tests__/PageEditor.preview-remount.unit.test.tsx`, `apps/admin/src/features/themes/__tests__/theme-preview-dirty.unit.test.tsx`, `apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx`, `apps/admin/src/features/posts/__tests__/PostEditor.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `PageEditorProps`, `VIEWS`, `VIEW_TABS`, `PageEditorToolbarEnd`, `PageEditorTemplateModalGate`, `PageEditor` | editor shell (stays) |
| B | `PageEditorHeader`, `saveLabel`, `PageEditorActions` | header + save/publish/delete actions |
| C | `PageAutosaveRecoveryBanner`, `PageVersionConflictBanner`, `PageAutosaveStaleBanner`, `PageExternalChangeBanner`, `PageEditorNotices` | "something happened to your work" notices |
| D | `PageEditorPane`, `PagePreview`, `PagePreviewFab`, `PagePreviewFrame` | main pane surfaces + preview |

- **Splits:**
  1. NEW `PageEditor-notices.tsx` — Moves unit C. Exports `PageEditorNotices`, `PageExternalChangeBanner`.
  2. NEW `PageEditor-chrome.tsx` — Moves unit B. Exports `PageEditorHeader`, `PageEditorActions`.
  3. NEW `PageEditor-pane.tsx` — Moves unit D (+ the long `PagePreview` surface-choice doc and the Bug B / Slice B3 comment). Exports `PageEditorPane`. In it, hoist `PageEditorPane`'s inline parameter type to `interface PageEditorPaneProps` (same fields, same docs) — that alone takes ~60 lines out of the function; and SUB-COMPONENT `PageHtmlSurface({ htmlTextareaRef, draftHtml, setDraftHtml, setHtml, onHtmlScroll, t }): ReactNode` ← the body of `if (surface.kind === "html") {`.
  4. `PageEditor` (stays): the 70-line hook destructure is the blocker. Plan (explicitly allowed here, rule 9 exception): `const controller = usePageEditorHook(routeSlug);` then SUB-COMPONENTS above `PageEditor`, each taking `{ controller }` (type `PageEditorController` from `./hooks/use-page-editor.hooks`) and destructuring only what it renders: `PageEditorToolbar({ controller, onViewTabsKeyDown })` ← `<div className="page-editor-toolbar">` + `<PageEditorActions`; `PageEditorDialogs({ controller })` ← both `<ConfirmDialog` + `<PageEditorTemplateModalGate`. `PageEditor` keeps `useTabBarKeyboard` (above the early returns, comment kept), the two early returns, `<PageEditorHeader`, `<PageEditorNotices`, `<PageEditorPane` (props read as `controller.x`).
- **Importers to update:** `apps/admin/src/features/posts/PostEditor.tsx` (`PageExternalChangeBanner` → `../pages/PageEditor-notices`).
- **After:** `PageEditor.tsx` ~330; `PageEditor` ~90; `PageEditorPane` ~65; new files ~190 / ~185 / ~280.
- **Risks / notes:** `TermPicker` is `vi.mock`ed by PageEditor tests — unaffected. Step 4 changes many identifiers to `controller.x`; renders must stay identical — **Opus should execute step 4** (or owner OKs passing the controller). Lazy-loading test imports `PageEditor` by path: keep default/named export unchanged.

### tovu:apps/admin/src/features/plugins/AgentPluginRow.tsx
- **Over:** `AgentPluginRow` 138 (file 258)
- **Phase:** after-move (DELETE-AFTER-PARITY) · **Batch:** size-47
- **Tests:** `apps/admin/src/features/plugins/__tests__/AgentPluginRow.unit.test.tsx`, `apps/admin/src/features/plugins/__tests__/b15-row-panel-ownership.unit.test.tsx`, `apps/admin/src/features/plugins/__tests__/agent-plugin-sign-in-status.unit.test.tsx`, `apps/admin/src/features/plugins/__tests__/agent-plugin-update.unit.test.tsx`
- **Responsibility map:** `AgentPluginRow` JSX = A the expand toggle `<button` (glyph, heading, status/compat/blurb lines, chevron) · B `manage` slot + `<div className="agent-plugin-row-actions">` (state area, Inspect, honest-disabled Uninstall) · C detail panel `<div className="agent-plugin-row-detail"`.
- **Splits:**
  1. SUB-COMPONENT `AgentPluginRowToggle({ plugin, displayName, expanded, detailId, headingId, onToggleExpanded, agentHandleBase, Glyph, t, blurb }): ReactNode` (same file, above `AgentPluginRow`) ← the first `<button` inside `<div className="agent-plugin-row-main">` with all its inner comments.
  2. SUB-COMPONENT `AgentPluginRowActions({ plugin, displayName, t, locale, busy, stateControl, onInspect, uninstallNoteId, agentHandleBase, … }): ReactNode` ← from the "Outside the actions column" comment + `{manage ? …}` through the closing `</div>` of `agent-plugin-row-actions` (include `manage`). Exact prop list = the names that block reads (take them from `AgentPluginRow`'s destructure).
  `AgentPluginRow` keeps its destructure, `displayName`/`blurb`/`Glyph`/`useId` locals, the main wrapper and the detail panel.
- **Importers to update:** none.
- **After:** `AgentPluginRow` ~40; sub-components ~65 / ~55; file ~275.
- **Risks / notes:** `useId` calls stay in `AgentPluginRow` (ids passed down). Survey says DELETE-AFTER-PARITY — execute only if the delete slips.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/admin/src/features/deployment/StaticSiteTab.tsx apps/admin/src/features/deployment/hooks/use-static-publish.hooks.ts apps/admin/src/features/pages/PageEditor.tsx apps/admin/src/features/plugins/AgentPluginRow.tsx <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
