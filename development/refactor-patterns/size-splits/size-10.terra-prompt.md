# Terra job size-10: split 5 Tovu file(s) by responsibility (size limits)

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
### tovu:apps/desktop/src/renderer/App.tsx
- **Over:** `App` 182 (file 237, under)
- **Phase:** now (STAY-WIRING) · **Batch:** size-10
- **Tests:** `apps/desktop/src/renderer/App.render.test.ts`, `App.sites-home.render.test.ts`, `App.workspace-start.render.test.ts`, `App.hooks.test.ts`, `App.hooks.render.test.ts`, `expanded-mode.test.ts`, `use-find-in-page.jsdom.test.ts`, `one-chat-fab-wiring.test.ts`, `site-error-feedback.test.ts` (renderer runner; complete with `rg -l "App" apps/desktop/src/renderer --glob '*.test.*'`). No `mock.module` of App.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `useTheme` … `useProjectMutations({` (L105-140) | inventory, tabs, nav, mutations (stays) |
| B | `const siteToast = useSiteToast` … `useImportHandoff({` (L142-155) | add-folder / import-website flow + toast |
| C | `const { expanded, toggleExpanded } = useExpanded` … `useProductScreen({` (L157-173) | what the shell chrome shows: expanded mode, find, zoom, tab-close ask, counts, product screen |
| D | `<TopNav …/>` + `<TabStrip …/>` JSX | top chrome |
| E | `<ImportWebsite …/>` JSX (20 lines of 1:1 forwarding from `liveImport` / `useAddSite`) | import page wiring |
| F | `<MainArea>`, `<CreateWebsiteHost>`, `<SiteWorkspaces>`, toast, closing comment | stays |

- **Splits** (execution order):
  1. NEW `apps/desktop/src/renderer/use-app-import-flow.hooks.ts` — job: the add-folder + import-website flow and its toast. `useAppImportFlow({ setProjects, lastCreated, handleCreate, openProjectTab, stopImporting, startImporting, applySiteRecord }: UseAppImportFlowInput): { siteToast; add; liveImport; openImportPage }` ← unit B verbatim (`add` = the whole `useAddSite(...)` result; `siteToast`, `liveImport`, `openImportPage` unchanged). Types of inputs = existing ones (`ReturnType<typeof useProjectMutations>["handleCreate"]`, etc.). In `App`: `const { siteToast, add, liveImport, openImportPage } = useAppImportFlow({ … });` at the same position; JSX reads `add.adding`/`add.addNotice`/… where it read the destructured names.
  2. NEW `apps/desktop/src/renderer/use-app-view.hooks.ts` — job: shell view state for the visible surface. `useAppView({ useExpanded, showSiteTab, showSitesHome, inSites, appearanceOpen, activeTab, visibleWorkspaceId, addNotice, setActiveId, setActiveTab, projects, closeProjectTab, applySiteRecord, isCreating, isImporting, activeId }: UseAppViewInput): { expanded; toggleExpanded; onSitesHome; selectedTab; tabNotice; find; zoom; showTopNav; showTabStrip; tabClose; runningCount; active }` ← unit C verbatim, in order; move `appScreen` (module fn) with it. The `find`/`zoom`/`chromeVisibility` "why" comments move word for word.
  3. SUB-COMPONENT `AppTopChrome` in `App.tsx` (above `App`), plain props `{ showTopNav, showTabStrip, activeId, onSitesHome, runningCount, theme, onThemeChange, onOpenAppearance, onSelectSection, useSiteSettings, openSites, selectedTab, onSelectSitesHome, onSelectTab, onCloseTab, importTab }` ← unit D; `App` builds `onSelectSitesHome`/`onSelectTab` lambdas and `importTabProps(...)` exactly as now and passes them. Move `importTabProps` stays where it is.
  4. SUB-COMPONENT `AppImportPage` in `App.tsx`, props `{ shown, onBack, liveImport, add }` (plan allows passing these two hook results whole: the element forwards 13 of their fields 1:1) ← unit E JSX incl. the two `clearFailure()` lambdas.
  5. Formatting only: write the `useNav(setActiveTab)` destructure and the `useProjectMutations({ … })` call each on ≤3 lines (same names, same order).
- **Importers to update:** none (no export moves; `appScreen` was module-private).
- **After:** `App` ~95; `App.tsx` ~245; `use-app-import-flow.hooks.ts` ~35; `use-app-view.hooks.ts` ~45.
- **Risks / notes:** hook call ORDER must stay identical — each sub-hook is called exactly where its first statement was. `useExpanded` is an injected prop hook; pass the function, never its result. `useRunnerNavigation` and `useProductScreen` return nothing but must stay inside `useAppView` in their original slots. The long "NO chat FAB" JSX comment stays in `App`.

### tovu:apps/desktop/src/renderer/CreateWebsiteOnboarding.tsx
- **Over:** `CreateWebsiteOnboarding` 136 (file 308, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-10
- **Tests:** `apps/desktop/src/renderer/CreateWebsiteOnboarding.test.ts`, `CreateWebsiteOnboarding.render.test.ts`, `CreateWebsiteOnboarding.database-options.render.test.ts`, `app/CreateWebsiteHost.render.test.ts` (renderer runner). No mocks of the module.
- **Responsibility map:**

| unit | statements / JSX | job |
|---|---|---|
| A | policy, `usePluginTokens`, `useForm(...)` destructure, `useDestination`, `showErrorFooter` | form state (stays; all hooks already injected) |
| B | `<div className="onboarding__intro">` | page intro + back link |
| C | first `<div className="onboarding-section">` (Website details: name input, destination hint, name error) | website name field |
| D | second `onboarding-section` with `<DatabasePicker …/>` | database choice (stays — 1:1 forwarding to `DatabasePicker`) |
| E | `<div className="onboarding__actions">` | error footer + Cancel / Create buttons |

- **Splits** (same file, sub-components at module level directly above `CreateWebsiteOnboarding`, in render order; plain props only):
  1. `OnboardingIntro({ onBack }: { onBack: () => void })` ← unit B JSX verbatim.
  2. `WebsiteNameSection({ name, nameError, setName, destinationHint }: WebsiteNameSectionProps)` ← unit C JSX verbatim (incl. `namePasteHandler({ setName })`, `autoFocus`). Prop types: `name: string; nameError: string | null` (use the `CreateWebsiteFormState` field types: `CreateWebsiteFormState["nameError"]` etc.), `destinationHint: ReturnType<typeof useNewSiteDir>`.
  3. `OnboardingActions({ showErrorFooter, formError, onBack, canCreate, isSubmitting }: OnboardingActionsProps)` ← unit E JSX verbatim.
  The commented-out "Owner 2026-10-06: hidden" JSX blocks stay in `CreateWebsiteOnboarding`, in place, word for word.
- **Importers to update:** none (no export moves).
- **After:** `CreateWebsiteOnboarding` ~97; file ~330; new sub-components ≤ 25 each.
- **Risks / notes:** `autoFocus` on the name input must stay on the same element (tests focus it). Keep the `useForm` doc comment above `CreateWebsiteOnboarding`. If the count lands at 101-103, also lift the `<h3>Database</h3>` head into `DatabasePicker`'s caller as a `DatabaseSectionHead()` sub-component (3 lines saved) — do not restructure `DatabasePicker`.

### tovu:apps/desktop/src/renderer/SiteGrid.tsx
- **Over:** file 505 lines (`SiteCard` 100 = at the limit, not over)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-10
- **Tests:** `apps/desktop/src/renderer/SiteGrid.jsdom.test.ts`, `SiteGrid.no-add-tile.render.test.ts`, `SiteGrid.status-title.render.test.ts`, `SiteGrid.hooks.test.ts`, `site-card-actions-wiring.test.ts`, `stalecard-paths.test.ts`, `sitesnest-card.test.ts`, `site-restart.test.ts`, `shell-bug-fixes.test.ts`, `App.sites-home.render.test.ts`, `app/MainContent.render.test.ts` (renderer runner). No mocks of the module.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `SiteGrid`, `siteListCopy`, `SiteCardList`, `SiteCard`, `SiteCardNotes`, `MissingFolderNotice` | the grid and one card's slots (stays) |
| B | `CardOverlays`, `CardConfirmOverlay`, `CardRenameOverlay` | the inline panels that replace a card's content: delete/stop confirm and rename form |
| C | `CardActions`, `SiteCardMenu` | the card's button row and ⋮ menu (stays) |

- **Splits:**
  1. NEW `apps/desktop/src/renderer/SiteGrid-card-overlays.tsx` — job: a card's inline confirm and rename panels. Moves `CardOverlays`, `CardConfirmOverlay`, `CardRenameOverlay` verbatim with their doc comments (the `role="group"` / stopPropagation "why" blocks and the rename `autoFocus` / Escape comments move word for word). Exports: `CardOverlays` only. Imports it needs: `SiteRecord` (type, `../contracts/project.js`), `SiteRenameState`, `renameInputKeyDown`, `showsInvalidNameHint` (`./use-site-rename.hooks.js`), `codeSpans`, `externalStopConfirm`, type `SitePower` (`./use-site-power.hooks.js`), types `CardOverlayMode`, `DeleteActionCopy` (`./SiteGrid.hooks.js`), `namePasteHandler` (`../contracts/site-name.js`). Header: one paragraph — "A site card's inline panels (delete/stop confirm, rename), split out of `SiteGrid.tsx`; the card is inert under them (see `SiteCard`)." Imports nothing from `SiteGrid.tsx`.
  2. In `SiteGrid.tsx`: `import { CardOverlays } from './SiteGrid-card-overlays.js';`; drop now-unused imports (`namePasteHandler`, `renameInputKeyDown`, `showsInvalidNameHint`, `codeSpans`, `externalStopConfirm`; keep the ones still used — check with rg). The comment in `SiteCardMenu` ("See `CardConfirmOverlay` below") becomes "See `CardConfirmOverlay` in `SiteGrid-card-overlays.tsx`".
- **Importers to update:** none (all three were module-private).
- **After:** `SiteGrid.tsx` ~380; `SiteGrid-card-overlays.tsx` ~140; largest function `SiteCard` 100 (unchanged).
- **Risks / notes:** the new `.tsx` lands in the coverage-floors "src renderer components" area automatically (dir-based); no `coverage-floors.json` edit needed. Keep the file header paragraph about the inline delete-confirm in `SiteGrid.tsx` as is.

### tovu:apps/desktop/src/renderer/app/SiteWorkspace.tsx
- **Over:** `SiteWorkspace` 121 (file 260, under)
- **Phase:** now (STAY-WIRING) · **Batch:** size-10
- **Tests:** `apps/desktop/src/renderer/app/SiteWorkspace.render.test.ts`, `app/SiteWorkspace.live-views.render.test.ts`, `app/SiteWorkspace.loading-overlay.render.test.ts`, `site-toolbar-wiring.test.ts`, `webview-partition-wiring.test.ts`, `App.workspace-start.render.test.ts`, `expanded-mode.test.ts`, `import-site-entry.test.ts` (renderer runner). No mocks of the module.
- **Responsibility map:**

| unit | statements / JSX | job |
|---|---|---|
| A | `const workspace = useSiteWorkspace(` … `const startPanel = running ? (` | tab state, composed guest ref, start panel (stays) |
| B | `<div className="workspace__nav">` (Back / Forward / Reload buttons) | browser-style history controls |
| C | `<div className="workspace__views">` (`SITE_SURFACES.map`) | Admin / Site surface toggle |
| D | rest of `workspace__bar`, guest-or-start-panel ternary | stays |

- **Splits** (same file; sub-components at module level directly below `SiteWorkspace`, beside `WorkspaceGuest` / `ExpandToggle`; plain props):
  1. `WorkspaceHistoryNav({ canGoBack, canGoForward, running, onBack, onForward, onReload }: WorkspaceHistoryNavProps)` ← unit B JSX verbatim (the "A browser's order: history first" comment moves with it). Call: `<WorkspaceHistoryNav canGoBack={workspace.history.canGoBack} canGoForward={workspace.history.canGoForward} running={running} onBack={workspace.goBack} onForward={workspace.goForward} onReload={workspace.reload} />`. Callback prop types = `() => void` (use the existing `ReturnType<typeof useSiteWorkspace>["goBack"]` etc. if `() => void` does not fit).
  2. `WorkspaceViewToggle({ surface, onSelect }: WorkspaceViewToggleProps)` ← unit C JSX verbatim incl. the `reportShellTelemetry(...)` call inside `onClick`; `onSelect` = `workspace.selectView`; `surface` typed as `(typeof SITE_SURFACES)[number]`.
- **Importers to update:** none (no export moves).
- **After:** `SiteWorkspace` ~83; file ~280; new sub-components ~33 and ~15.
- **Risks / notes:** button order, `title`/`aria-label` text and `disabled` expressions must be byte-identical (`site-toolbar-wiring.test.ts` asserts them). Telemetry stays inside the click handler, before `selectView`.

### tovu:apps/desktop/src/renderer/use-find-in-page.hooks.ts
- **Over:** `useFindInPage` 171 (file 344, under)
- **Phase:** now (survey label `?`) · **Batch:** size-10
- **Tests:** `apps/desktop/src/renderer/use-find-in-page.hooks.test.ts`, `use-find-in-page.jsdom.test.ts`, `app/FindBar.render.test.ts`, `shell-bug-fixes.test.ts`, `preload/preload-staleness.test.ts` (renderer runner; preload one = desktop main runner). No mocks of the module.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `useReducer`, `guests`, `queryScheduler`, `registerGuest`, `target`, `issueFind`, the four query/result effects, unmount effect, `close`, return | the find state machine (stays) |
| B | refs `inputElement`, `lastFindAt`, `reclaimTimer`, `restoringFocus`, `awaitingReport`, `composing`, `reclaimFrame`; callbacks `cancelReclaimFrame`, `reclaimUntilReported`, `clearReclaimTimer`, `attachBlurReclaim`, `detachBlurReclaim`, `inputRef` | keep focus in the find input while Chromium steals it (reclaim per frame + on blur, IME-aware) |
| C | `const previousGuestIdRef = useRef(activeGuestId);` + its `useEffect` | close the bar and clear the outgoing tab's highlights on a tab switch |

- **Splits** (same file, module level, directly above `useFindInPage`, in this order):
  1. SUB-HOOK `useFindFocusReclaim({ clock }: { clock: FindFocusClock }): FindFocusReclaim` ← unit B: the seven ref declarations (with their comments), `cancelReclaimFrame`, `reclaimUntilReported`, `clearReclaimTimer`, then `attachBlurReclaim` (its 10-line "Reclaims focus the moment Chromium takes it" comment moves word for word), `detachBlurReclaim`, `inputRef`. Returns `{ inputElement, lastFindAt, restoringFocus, awaitingReport, composing, cancelReclaimFrame, reclaimUntilReported, clearReclaimTimer, inputRef }` (`reclaimTimer`, `reclaimFrame`, `detachBlurReclaim`, `attachBlurReclaim` stay private). New non-exported `interface FindFocusReclaim` above it, field types = the existing `useRef`/`useCallback` result types (`MutableRefObject<HTMLInputElement | null>`, `MutableRefObject<boolean>`, `() => void`, `(node: HTMLInputElement | null) => void`). In `useFindInPage`: `const { inputElement, lastFindAt, restoringFocus, awaitingReport, composing, cancelReclaimFrame, reclaimUntilReported, clearReclaimTimer, inputRef } = useFindFocusReclaim({ clock });` placed right after `const guests = …` (where `inputElement` was declared).
  2. SUB-HOOK `useCloseOnGuestChange({ activeGuestId, open, guests, bridge, dispatch }: UseCloseOnGuestChangeInput): void` ← unit C verbatim (8-line "Closes (and clears the OUTGOING surface's own highlights)" comment + `biome-ignore` line move with it; `state.open` → `open`). Called at the same spot in `useFindInPage`. `dispatch: Dispatch<FindBarAction>`, `bridge: FindBridge | undefined` (same type as the destructured port).
- **Importers to update:** none (no export moves).
- **After:** `useFindInPage` ~85; `useFindFocusReclaim` ~80; `useCloseOnGuestChange` ~12; file ~360.
- **Risks / notes:** effect ORDER must stay: toggle → focus-on-open → subscribe → query → close-on-guest-change → unmount cleanup. `useFindFocusReclaim` holds no effects, so its hooks moving earlier only reorders refs/callbacks (stable every render). The existing `biome-ignore` comments are not eslint-disables; keep them verbatim, attached to the same dependency arrays. Keep `useCallback` dependency arrays byte-identical.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/desktop/src/renderer/App.tsx apps/desktop/src/renderer/CreateWebsiteOnboarding.tsx apps/desktop/src/renderer/SiteGrid.tsx apps/desktop/src/renderer/app/SiteWorkspace.tsx apps/desktop/src/renderer/use-find-in-page.hooks.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
