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
