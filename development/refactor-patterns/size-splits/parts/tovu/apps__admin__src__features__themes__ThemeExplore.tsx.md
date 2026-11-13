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
