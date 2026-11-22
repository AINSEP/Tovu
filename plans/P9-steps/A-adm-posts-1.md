# A-adm-posts-1 — adm-posts → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:32 T:33. Depends on: A-adm-shell-components-1, A-adm-shell-lib-3. Est: J 79 min, T 119 min.

## J — move verbatim into Jini (14 files, 894 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/posts/api/posts-api.types.ts` | `packages/admin/src/posts/api/posts-api.types.ts` | 66 |  |
| `apps/admin/src/features/posts/editor/bubble-menu/bubble-menu-state.ts` | `packages/admin/src/posts/editor/bubble-menu/bubble-menu-state.ts` | 47 |  |
| `apps/admin/src/features/posts/editor/toolbar/toolbar-state.ts` | `packages/admin/src/posts/editor/toolbar/toolbar-state.ts` | 122 |  |
| `apps/admin/src/features/posts/hooks/use-post-url-dialog.hooks.ts` | `packages/admin/src/posts/hooks/use-post-url-dialog.hooks.ts` | 109 |  |
| `apps/admin/src/features/posts/post-editor-route-key.ts` | `packages/admin/src/posts/post-editor-route-key.ts` | 34 |  |
| `apps/admin/src/features/posts/post-url-dialog.css` | `packages/admin/src/posts/post-url-dialog.css` | 2 |  |
| `apps/admin/src/features/posts/PostAuthorFields.tsx` | `packages/admin/src/posts/PostAuthorFields.tsx` | 27 |  |
| `apps/admin/src/features/posts/PostEditor.hooks.ts` | `packages/admin/src/posts/PostEditor.hooks.ts` | 7 |  |
| `apps/admin/src/features/posts/PostPublishingFields.tsx` | `packages/admin/src/posts/PostPublishingFields.tsx` | 40 |  |
| `apps/admin/src/features/posts/editor/PostDeleteConfirmDialog.tsx` | `packages/admin/src/posts/editor/PostDeleteConfirmDialog.tsx` | 51 |  |
| `apps/admin/src/features/posts/editor/template/PostEditorTemplatePicker.tsx` | `packages/admin/src/posts/editor/template/PostEditorTemplatePicker.tsx` | 111 |  |
| `apps/admin/src/features/posts/editor/toolbar/toolbar-group-props.ts` | `packages/admin/src/posts/editor/toolbar/toolbar-group-props.ts` | 15 |  |
| `apps/admin/src/features/posts/hooks/posts-list-port.hooks.ts` | `packages/admin/src/posts/hooks/posts-list-port.hooks.ts` | 31 |  |
| `apps/admin/src/features/posts/hooks/use-post-editor-ui.hooks.ts` | `packages/admin/src/posts/hooks/use-post-editor-ui.hooks.ts` | 232 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./posts/PostAuthorFields"]
- "@jini-ai/admin" exports["./posts/PostEditor.hooks"]
- "@jini-ai/admin" exports["./posts/PostPublishingFields"]
- "@jini-ai/admin" exports["./posts/api/posts-api.types"]
- "@jini-ai/admin" exports["./posts/editor/PostDeleteConfirmDialog"]
- "@jini-ai/admin" exports["./posts/editor/bubble-menu/bubble-menu-state"]
- "@jini-ai/admin" exports["./posts/editor/template/PostEditorTemplatePicker"]
- "@jini-ai/admin" exports["./posts/editor/toolbar/toolbar-group-props"]
- "@jini-ai/admin" exports["./posts/editor/toolbar/toolbar-state"]
- "@jini-ai/admin" exports["./posts/hooks/posts-list-port.hooks"]
- "@jini-ai/admin" exports["./posts/hooks/use-post-editor-ui.hooks"]
- "@jini-ai/admin" exports["./posts/hooks/use-post-url-dialog.hooks"]
- "@jini-ai/admin" exports["./posts/post-editor-route-key"]
- "@jini-ai/admin" exports["./posts/post-url-dialog"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (4, 592 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/features/posts/__tests__/PostEditor.toolbar-probes.unit.test.ts`
- `apps/admin/src/features/posts/__tests__/use-post-url-dialog.hooks.unit.test.ts`
- `apps/admin/src/features/posts/__tests__/post-editor-route-key.unit.test.ts`
- `apps/admin/src/features/posts/__tests__/use-post-editor-ui.hooks.unit.test.tsx`


## T — Tovu repoint: delete the 14 sources, rewrite every importer (111 lines)

```
apps/admin/src/__tests__/fqfix-editor-reopen.unit.test.tsx:5  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/dashboard/Dashboard.tsx:1  '../posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/dashboard/__tests__/use-dashboard-port.unit.test.ts:7  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/dashboard/hooks/dashboard-dependencies.hooks.ts:5  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/dashboard/hooks/dashboard-port.hooks.ts:2  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/dashboard/hooks/use-dashboard.hooks.ts:6  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/dashboard/rules.ts:2  '../posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/Pages.tsx:8  '../posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/__tests__/PageEditor.interactive-flush.unit.test.tsx:10  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/__tests__/PageEditor.preview-remount.unit.test.tsx:19  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/__tests__/PageEditor.unit.test.tsx:8  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/__tests__/Pages.unit.test.tsx:10  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/__tests__/ThemePagesTab.unit.test.tsx:12  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/__tests__/html-tab-new-page.unit.test.ts:3  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/__tests__/page-editor-save.expected-version.unit.test.ts:4  '../../posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/__tests__/rules.unit.test.ts:4  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/__tests__/scriptblocks-controller.unit.test.ts:7  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/api/pages-api.ts:3  '../../posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/hooks/__tests__/page-editor-dependencies.unit.test.ts:3  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/hooks/__tests__/pages-dependencies.unit.test.ts:3  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/hooks/page-editor-dependencies.hooks.ts:4  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/hooks/page-editor-port.hooks.ts:2  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/hooks/page-editor-save.ts:8  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/hooks/pages-dependencies.hooks.ts:1  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/hooks/pages-port.hooks.ts:1  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:7  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/hooks/use-pages.hooks.ts:4  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/pages/rules.ts:6  '../posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/Posts.tsx:8  './api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/PostEditor.dom.characterization.unit.test.tsx:5  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/PostEditor.unit.test.tsx:9  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/Posts.unit.test.tsx:11  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/post-author.unit.test.tsx:3  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/post-cover-image.unit.test.tsx:4  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/post-editor-agent-drive.unit.test.tsx:9  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/post-editor-external-refresh.unit.test.tsx:4  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/post-editor-load-race.unit.test.tsx:4  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/post-editor-new-posts-navigation.unit.test.tsx:4  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/post-editor-save.rules.unit.test.ts:3  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/post-editor-state.rules.unit.test.ts:4  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/post-schedule-featured.unit.test.tsx:5  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/posts-agent-drive.unit.test.tsx:9  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/posts-list-dependencies.unit.test.ts:2  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/rules.unit.test.ts:20  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/use-post-editor-screen.hooks.unit.test.tsx:4  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/use-post-editor.hooks.unit.test.tsx:5  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/__tests__/use-posts.unit.test.ts:4  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/api/posts-api.ts:4  './posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/editor/PostEditorBody.tsx:1  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/editor/PostSavedPanels.tsx:1  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/editor/header/PostEditorHeader.tsx:5  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/editor/toolbar/Toolbar.tsx:4  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/editor/toolbar/insert-controls.tsx:6  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/hooks/post-editor-dependencies.hooks.ts:6  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/hooks/post-editor-messages.ts:5  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/hooks/post-editor-port.hooks.ts:3  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/hooks/post-editor-save.rules.ts:1  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/hooks/post-editor-state.rules.ts:2  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/hooks/posts-list-dependencies.hooks.ts:1  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/hooks/use-loaded-post-apply.hooks.ts:5  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/hooks/use-post-editor-screen.hooks.ts:6  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:22  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/hooks/use-posts.hooks.ts:6  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/rules.ts:5  './api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/themes/__tests__/theme-preview-dirty.unit.test.tsx:10  '@/features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/hooks/__tests__/editor-session-expiry.unit.test.ts:4  '../../features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/lib/__tests__/agent-navigation-entities.unit.test.ts:4  '../../features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/lib/admin-post-list-sort.ts:3  '../features/posts/api/posts-api.types' -> '@jini-ai/admin/posts/api/posts-api.types'
apps/admin/src/features/posts/editor/bubble-menu/BubbleFormattingMenu.tsx:8  './bubble-menu-state' -> '@jini-ai/admin/posts/editor/bubble-menu/bubble-menu-state'
apps/admin/src/features/posts/__tests__/PostEditor.dom.characterization.unit.test.tsx:11  '../editor/toolbar/toolbar-state' -> '@jini-ai/admin/posts/editor/toolbar/toolbar-state'
apps/admin/src/features/posts/editor/toolbar/Toolbar.tsx:13  './toolbar-state' -> '@jini-ai/admin/posts/editor/toolbar/toolbar-state'
apps/admin/src/features/posts/PostUrlDialog.tsx:3  './hooks/use-post-url-dialog.hooks' -> '@jini-ai/admin/posts/hooks/use-post-url-dialog.hooks'
apps/admin/src/features/posts/__tests__/PostUrlDialog.chromecheck.unit.test.tsx:4  '../hooks/use-post-url-dialog.hooks' -> '@jini-ai/admin/posts/hooks/use-post-url-dialog.hooks'
apps/admin/src/features/posts/editor/PostEditorBody.tsx:5  '../hooks/use-post-url-dialog.hooks' -> '@jini-ai/admin/posts/hooks/use-post-url-dialog.hooks'
apps/admin/src/features/posts/editor/bubble-menu/BubbleFormattingMenu.tsx:6  '../../hooks/use-post-url-dialog.hooks' -> '@jini-ai/admin/posts/hooks/use-post-url-dialog.hooks'
apps/admin/src/features/posts/editor/toolbar/Toolbar.tsx:6  '../../hooks/use-post-url-dialog.hooks' -> '@jini-ai/admin/posts/hooks/use-post-url-dialog.hooks'
apps/admin/src/features/posts/editor/toolbar/ToolbarFormattingGroup.tsx:3  '../../hooks/use-post-url-dialog.hooks' -> '@jini-ai/admin/posts/hooks/use-post-url-dialog.hooks'
apps/admin/src/features/posts/editor/toolbar/insert-controls.tsx:7  '../../hooks/use-post-url-dialog.hooks' -> '@jini-ai/admin/posts/hooks/use-post-url-dialog.hooks'
apps/admin/src/features/posts/__tests__/post-editor-external-refresh.unit.test.tsx:8  '../post-editor-route-key' -> '@jini-ai/admin/posts/post-editor-route-key'
apps/admin/src/features/posts/__tests__/post-editor-new-posts-navigation.unit.test.tsx:7  '../post-editor-route-key' -> '@jini-ai/admin/posts/post-editor-route-key'
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:31  '../post-editor-route-key' -> '@jini-ai/admin/posts/post-editor-route-key'
apps/admin/src/panels.tsx:5  './features/posts/post-editor-route-key' -> '@jini-ai/admin/posts/post-editor-route-key'
apps/admin/src/features/posts/PostUrlDialog.tsx:6  './post-url-dialog.css' -> '@jini-ai/admin/posts/post-url-dialog'
apps/admin/src/features/posts/PostSettingsDialog.tsx:8  './PostAuthorFields' -> '@jini-ai/admin/posts/PostAuthorFields'
apps/admin/src/features/posts/__tests__/post-author.unit.test.tsx:6  '../PostAuthorFields' -> '@jini-ai/admin/posts/PostAuthorFields'
apps/admin/src/features/posts/editor/bubble-menu/BubbleFormattingMenu.tsx:5  '../../PostEditor.hooks' -> '@jini-ai/admin/posts/PostEditor.hooks'
apps/admin/src/features/posts/editor/toolbar/ToolbarColorGroup.tsx:1  '../../PostEditor.hooks' -> '@jini-ai/admin/posts/PostEditor.hooks'
apps/admin/src/features/posts/editor/toolbar/ToolbarFormattingGroup.tsx:1  '../../PostEditor.hooks' -> '@jini-ai/admin/posts/PostEditor.hooks'
apps/admin/src/features/posts/editor/toolbar/ToolbarTypographyGroup.tsx:1  '../../PostEditor.hooks' -> '@jini-ai/admin/posts/PostEditor.hooks'
apps/admin/src/features/posts/editor/toolbar/insert-controls.tsx:4  '../../PostEditor.hooks' -> '@jini-ai/admin/posts/PostEditor.hooks'
apps/admin/src/features/posts/PostSettingsDialog.tsx:9  './PostPublishingFields' -> '@jini-ai/admin/posts/PostPublishingFields'
apps/admin/src/features/posts/__tests__/post-schedule-featured.unit.test.tsx:9  '../PostPublishingFields' -> '@jini-ai/admin/posts/PostPublishingFields'
apps/admin/src/features/posts/__tests__/posts-i18n.unit.test.ts:7  '../PostPublishingFields' -> '@jini-ai/admin/posts/PostPublishingFields'
apps/admin/src/features/posts/PostEditor.tsx:10  './editor/PostDeleteConfirmDialog' -> '@jini-ai/admin/posts/editor/PostDeleteConfirmDialog'
apps/admin/src/features/posts/hooks/use-post-editor-screen.hooks.ts:7  '../editor/PostDeleteConfirmDialog' -> '@jini-ai/admin/posts/editor/PostDeleteConfirmDialog'
apps/admin/src/features/posts/editor/header/PostEditorToolbarEnd.tsx:2  '../template/PostEditorTemplatePicker' -> '@jini-ai/admin/posts/editor/template/PostEditorTemplatePicker'
apps/admin/src/features/posts/editor/toolbar/ToolbarCharacterCount.tsx:1  './toolbar-group-props' -> '@jini-ai/admin/posts/editor/toolbar/toolbar-group-props'
apps/admin/src/features/posts/editor/toolbar/ToolbarColorGroup.tsx:3  './toolbar-group-props' -> '@jini-ai/admin/posts/editor/toolbar/toolbar-group-props'
apps/admin/src/features/posts/editor/toolbar/ToolbarFormattingGroup.tsx:5  './toolbar-group-props' -> '@jini-ai/admin/posts/editor/toolbar/toolbar-group-props'
apps/admin/src/features/posts/editor/toolbar/ToolbarTypographyGroup.tsx:3  './toolbar-group-props' -> '@jini-ai/admin/posts/editor/toolbar/toolbar-group-props'
apps/admin/src/features/posts/hooks/posts-list-dependencies.hooks.ts:5  './posts-list-port.hooks' -> '@jini-ai/admin/posts/hooks/posts-list-port.hooks'
apps/admin/src/features/posts/hooks/use-posts.hooks.ts:11  './posts-list-port.hooks' -> '@jini-ai/admin/posts/hooks/posts-list-port.hooks'
apps/admin/src/features/posts/PostSettingsDialog.tsx:7  './hooks/use-post-editor-ui.hooks' -> '@jini-ai/admin/posts/hooks/use-post-editor-ui.hooks'
apps/admin/src/features/posts/__tests__/PostEditor.dom.characterization.unit.test.tsx:9  '../hooks/use-post-editor-ui.hooks' -> '@jini-ai/admin/posts/hooks/use-post-editor-ui.hooks'
apps/admin/src/features/posts/__tests__/post-settings-dialog.unit.test.tsx:5  '../hooks/use-post-editor-ui.hooks' -> '@jini-ai/admin/posts/hooks/use-post-editor-ui.hooks'
apps/admin/src/features/posts/editor/preview/PostPreviewFrame.tsx:3  '../../hooks/use-post-editor-ui.hooks' -> '@jini-ai/admin/posts/hooks/use-post-editor-ui.hooks'
apps/admin/src/features/posts/editor/toolbar/Toolbar.tsx:5  '../../hooks/use-post-editor-ui.hooks' -> '@jini-ai/admin/posts/hooks/use-post-editor-ui.hooks'
apps/admin/src/features/posts/editor/toolbar/ToolbarFormattingGroup.tsx:2  '../../hooks/use-post-editor-ui.hooks' -> '@jini-ai/admin/posts/hooks/use-post-editor-ui.hooks'
apps/admin/src/features/posts/editor/toolbar/ToolbarOverflowMenu.tsx:3  '../../hooks/use-post-editor-ui.hooks' -> '@jini-ai/admin/posts/hooks/use-post-editor-ui.hooks'
apps/admin/src/features/posts/hooks/use-post-editor-screen.hooks.ts:20  './use-post-editor-ui.hooks' -> '@jini-ai/admin/posts/hooks/use-post-editor-ui.hooks'
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:61  './use-post-editor-ui.hooks' -> '@jini-ai/admin/posts/hooks/use-post-editor-ui.hooks'
```

## Tovu tests that must stay green (37; import lines are repointed above, assertions untouched)
- `apps/admin/src/__tests__/fqfix-editor-reopen.unit.test.tsx`
- `apps/admin/src/features/dashboard/__tests__/use-dashboard-port.unit.test.ts`
- `apps/admin/src/features/pages/__tests__/PageEditor.interactive-flush.unit.test.tsx`
- `apps/admin/src/features/pages/__tests__/PageEditor.preview-remount.unit.test.tsx`
- `apps/admin/src/features/pages/__tests__/PageEditor.unit.test.tsx`
- `apps/admin/src/features/pages/__tests__/Pages.unit.test.tsx`
- `apps/admin/src/features/pages/__tests__/ThemePagesTab.unit.test.tsx`
- `apps/admin/src/features/pages/__tests__/html-tab-new-page.unit.test.ts`
- `apps/admin/src/features/pages/__tests__/page-editor-save.expected-version.unit.test.ts`
- `apps/admin/src/features/pages/__tests__/rules.unit.test.ts`
- `apps/admin/src/features/pages/__tests__/scriptblocks-controller.unit.test.ts`
- `apps/admin/src/features/pages/hooks/__tests__/page-editor-dependencies.unit.test.ts`
- `apps/admin/src/features/pages/hooks/__tests__/pages-dependencies.unit.test.ts`
- `apps/admin/src/features/posts/__tests__/PostEditor.dom.characterization.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/PostEditor.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/PostUrlDialog.chromecheck.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/Posts.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/post-author.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/post-cover-image.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/post-editor-agent-drive.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/post-editor-external-refresh.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/post-editor-load-race.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/post-editor-new-posts-navigation.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/post-editor-save.rules.unit.test.ts`
- `apps/admin/src/features/posts/__tests__/post-editor-state.rules.unit.test.ts`
- `apps/admin/src/features/posts/__tests__/post-schedule-featured.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/post-settings-dialog.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/posts-agent-drive.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/posts-i18n.unit.test.ts`
- `apps/admin/src/features/posts/__tests__/posts-list-dependencies.unit.test.ts`
- `apps/admin/src/features/posts/__tests__/rules.unit.test.ts`
- `apps/admin/src/features/posts/__tests__/use-post-editor-screen.hooks.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/use-post-editor.hooks.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/use-posts.unit.test.ts`
- `apps/admin/src/features/themes/__tests__/theme-preview-dirty.unit.test.tsx`
- `apps/admin/src/hooks/__tests__/editor-session-expiry.unit.test.ts`
- `apps/admin/src/lib/__tests__/agent-navigation-entities.unit.test.ts`

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/admin/src/features/posts/api/posts-api.types.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Class names (Jini packages use `jini-*`)
- `apps/admin/src/features/posts/PostAuthorFields.tsx`: rename its own class names to `jini-<block>__<element>` in the same commit as the matching CSS selectors; list every rename in the step report
- `apps/admin/src/features/posts/PostPublishingFields.tsx`: rename its own class names to `jini-<block>__<element>` in the same commit as the matching CSS selectors; list every rename in the step report
- `apps/admin/src/features/posts/editor/template/PostEditorTemplatePicker.tsx`: rename its own class names to `jini-<block>__<element>` in the same commit as the matching CSS selectors; list every rename in the step report

## Named mutation
in the Jini copy of `use-post-editor-ui.hooks.ts`, negate the first `if (` condition of its first exported function; `use-post-editor-ui.hooks.unit.test.tsx` must go red, then revert
