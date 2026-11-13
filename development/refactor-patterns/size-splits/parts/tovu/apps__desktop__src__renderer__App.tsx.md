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
