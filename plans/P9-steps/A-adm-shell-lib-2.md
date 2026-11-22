# A-adm-shell-lib-2 — adm-shell-lib → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:27 T:32. Depends on: none (only already-Jini code). Est: J 89 min, T 120 min.

## J — move verbatim into Jini (14 files, 784 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/lib/boot-token-fragment.ts` | `packages/admin/src/shell/lib/boot-token-fragment.ts` | 56 | W1 |
| `apps/admin/src/lib/content-refresh-bus.ts` | `packages/admin/src/shell/lib/content-refresh-bus.ts` | 103 |  |
| `apps/admin/src/lib/editor-failure-i18n.ts` | `packages/admin/src/shell/lib/editor-failure-i18n.ts` | 128 |  |
| `apps/admin/src/lib/editor-template-options.rules.ts` | `packages/admin/src/shell/lib/editor-template-options.rules.ts` | 12 |  |
| `apps/admin/src/lib/escape-owned-by-inner-layer.ts` | `packages/admin/src/shell/lib/escape-owned-by-inner-layer.ts` | 62 |  |
| `apps/admin/src/lib/external-entry-refresh.ts` | `packages/admin/src/shell/lib/external-entry-refresh.ts` | 68 |  |
| `apps/admin/src/lib/fetch-query/adapter-context.ts` | `packages/admin/src/shell/lib/fetch-query/adapter-context.ts` | 6 | W1 |
| `apps/admin/src/lib/live-tiptap-editor.ts` | `packages/admin/src/shell/lib/live-tiptap-editor.ts` | 23 |  |
| `apps/admin/src/lib/merge-locale-overlays.ts` | `packages/admin/src/shell/lib/merge-locale-overlays.ts` | 32 |  |
| `apps/admin/src/lib/page-lifecycle.ts` | `packages/admin/src/shell/lib/page-lifecycle.ts` | 51 |  |
| `apps/admin/src/lib/plain-text-blocks.ts` | `packages/admin/src/shell/lib/plain-text-blocks.ts` | 32 |  |
| `apps/admin/src/lib/playground-render-target-bus.ts` | `packages/admin/src/shell/lib/playground-render-target-bus.ts` | 88 |  |
| `apps/admin/src/lib/post-title-extension.ts` | `packages/admin/src/shell/lib/post-title-extension.ts` | 118 |  |
| `apps/admin/src/lib/query-suffix.ts` | `packages/admin/src/shell/lib/query-suffix.ts` | 5 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./shell/lib/boot-token-fragment"]
- "@jini-ai/admin" exports["./shell/lib/content-refresh-bus"]
- "@jini-ai/admin" exports["./shell/lib/editor-failure-i18n"]
- "@jini-ai/admin" exports["./shell/lib/editor-template-options.rules"]
- "@jini-ai/admin" exports["./shell/lib/escape-owned-by-inner-layer"]
- "@jini-ai/admin" exports["./shell/lib/external-entry-refresh"]
- "@jini-ai/admin" exports["./shell/lib/fetch-query/adapter-context"]
- "@jini-ai/admin" exports["./shell/lib/live-tiptap-editor"]
- "@jini-ai/admin" exports["./shell/lib/merge-locale-overlays"]
- "@jini-ai/admin" exports["./shell/lib/page-lifecycle"]
- "@jini-ai/admin" exports["./shell/lib/plain-text-blocks"]
- "@jini-ai/admin" exports["./shell/lib/playground-render-target-bus"]
- "@jini-ai/admin" exports["./shell/lib/post-title-extension"]
- "@jini-ai/admin" exports["./shell/lib/query-suffix"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (9, 835 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/lib/__tests__/boot-token-fragment.unit.test.ts`
- `apps/admin/src/lib/__tests__/content-refresh-bus.unit.test.ts`
- `apps/admin/src/lib/__tests__/escape-owned-by-inner-layer.unit.test.ts`
- `apps/admin/src/lib/__tests__/external-entry-refresh.unit.test.ts`
- `apps/admin/src/lib/__tests__/merge-locale-overlays.unit.test.ts`
- `apps/admin/src/lib/__tests__/page-lifecycle.unit.test.ts`
- `apps/admin/src/lib/__tests__/plain-text-blocks.unit.test.ts`
- `apps/admin/src/lib/__tests__/playground-render-target-bus.unit.test.ts`
- `apps/admin/src/lib/__tests__/post-title-extension.unit.test.ts`


## T — Tovu repoint: delete the 14 sources, rewrite every importer (96 lines)

```
apps/admin/src/App.hooks.ts:30  './lib/boot-token-fragment' -> '@jini-ai/admin/shell/lib/boot-token-fragment'
apps/admin/src/App.session.ts:7  './lib/boot-token-fragment' -> '@jini-ai/admin/shell/lib/boot-token-fragment'
apps/admin/src/__tests__/admin-boot-readers.test.tsx:10  '../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/components/AssistantDock/__tests__/use-messages-change-handler.unit.test.tsx:7  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/components/AssistantDock/hooks/messages-change.hooks.ts:5  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/components/__tests__/SitesSidebarNav.unit.test.tsx:9  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/dashboard/__tests__/use-dashboard-port.unit.test.ts:11  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/deployment/hooks/__tests__/use-static-export.unit.test.tsx:5  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/import-export/__tests__/ImportExport.unit.test.tsx:9  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/integrations/__tests__/use-integrations.unit.test.tsx:5  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/library/__tests__/use-library.hooks.unit.test.tsx:6  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/media/__tests__/use-media.hooks.unit.test.tsx:8  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/members/__tests__/use-members.hooks.unit.test.ts:5  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/members/hooks/members-controller.hooks.ts:5  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts:7  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/pages/__tests__/use-pages.unit.test.ts:5  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/plugins/__tests__/plugin-list-refresh.unit.test.ts:3  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/plugins/__tests__/use-plugins.hooks.unit.test.ts:8  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/posts/__tests__/post-editor-external-refresh.unit.test.tsx:5  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/posts/__tests__/use-posts.unit.test.ts:6  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/recovery/__tests__/use-recovery.unit.test.ts:6  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/security/hooks/__tests__/use-access-tokens.unit.test.tsx:7  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/security/hooks/use-copy-keys.hooks.ts:5  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/sites/__tests__/use-sites.hooks.unit.test.tsx:6  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/taxonomy/__tests__/use-taxonomy.unit.test.tsx:7  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/taxonomy/hooks/use-taxonomy.hooks.ts:4  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/themes/__tests__/theme-preview-refresh.unit.test.tsx:218  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/themes/__tests__/use-theme-explore.hooks.unit.test.ts:7  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/themes/__tests__/use-themes.hooks.unit.test.ts:11  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx:8  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/hooks/__tests__/use-content-refresh-subscription.hooks.test.ts:4  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/hooks/use-content-refresh-subscription.hooks.ts:3  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/chart-providers/__tests__/use-chart-registry.unit.test.tsx:8  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/__tests__/comments-ports.unit.test.ts:5  '../../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/__tests__/comments-swap.unit.test.tsx:9  '../../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/__tests__/forms-ports.unit.test.ts:4  '../../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/__tests__/forms-swap.unit.test.tsx:10  '../../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/__tests__/media-ports.unit.test.ts:3  '../../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/__tests__/redirects-ports.unit.test.ts:5  '../../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/__tests__/redirects-swap.unit.test.tsx:9  '../../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/__tests__/seo-ports.unit.test.ts:4  '../../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/__tests__/seo-swap.unit.test.tsx:13  '../../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/__tests__/widgets-ports.unit.test.ts:6  '../../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/__tests__/widgets-swap.unit.test.tsx:20  '../../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/comments-ports.ts:10  '../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/forms-ports.ts:8  '../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/media-ports.ts:7  '../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/redirects-ports.ts:8  '../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/seo-ports.ts:8  '../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/integrations/jini-admin/widgets-ports.ts:6  '../../lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/lib/__tests__/agent-pages.unit.test.ts:6  '@/lib/content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/lib/agent-pages.ts:7  './content-refresh-bus' -> '@jini-ai/admin/shell/lib/content-refresh-bus'
apps/admin/src/features/posts/posts-i18n.ts:1  '../../lib/editor-failure-i18n' -> '@jini-ai/admin/shell/lib/editor-failure-i18n'
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:16  '@/lib/editor-template-options.rules' -> '@jini-ai/admin/shell/lib/editor-template-options.rules'
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:32  '@/lib/editor-template-options.rules' -> '@jini-ai/admin/shell/lib/editor-template-options.rules'
apps/admin/src/lib/__tests__/editor-template-options.unit.test.ts:5  '../editor-template-options.rules' -> '@jini-ai/admin/shell/lib/editor-template-options.rules'
apps/admin/src/App.hooks.ts:48  './lib/escape-owned-by-inner-layer' -> '@jini-ai/admin/shell/lib/escape-owned-by-inner-layer'
apps/admin/src/hooks/use-external-entry-refresh.hooks.ts:3  '@/lib/external-entry-refresh' -> '@jini-ai/admin/shell/lib/external-entry-refresh'
apps/admin/src/features/observability/__tests__/use-queries-tab.hooks.unit.test.tsx:7  '@/lib/fetch-query/adapter-context' -> '@jini-ai/admin/shell/lib/fetch-query/adapter-context'
apps/admin/src/features/observability/hooks/use-queries-tab.hooks.ts:4  '@/lib/fetch-query/adapter-context' -> '@jini-ai/admin/shell/lib/fetch-query/adapter-context'
apps/admin/src/lib/fetch-query/__tests__/provider.unit.test.tsx:9  '../adapter-context' -> '@jini-ai/admin/shell/lib/fetch-query/adapter-context'
apps/admin/src/lib/fetch-query/provider.tsx:4  './adapter-context' -> '@jini-ai/admin/shell/lib/fetch-query/adapter-context'
apps/admin/src/features/posts/__tests__/post-editor-load-race.unit.test.tsx:10  '@/lib/live-tiptap-editor' -> '@jini-ai/admin/shell/lib/live-tiptap-editor'
apps/admin/src/features/posts/hooks/post-editor-file-upload.ts:4  '@/lib/live-tiptap-editor' -> '@jini-ai/admin/shell/lib/live-tiptap-editor'
apps/admin/src/features/posts/hooks/use-loaded-post-apply.hooks.ts:6  '@/lib/live-tiptap-editor' -> '@jini-ai/admin/shell/lib/live-tiptap-editor'
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:56  '@/lib/live-tiptap-editor' -> '@jini-ai/admin/shell/lib/live-tiptap-editor'
apps/admin/src/features/redirects/redirects-i18n.tsx:2  '../../lib/merge-locale-overlays' -> '@jini-ai/admin/shell/lib/merge-locale-overlays'
apps/admin/src/features/roles/roles-i18n.ts:2  '../../lib/merge-locale-overlays' -> '@jini-ai/admin/shell/lib/merge-locale-overlays'
apps/admin/src/features/source-control/source-control-i18n.ts:2  '../../lib/merge-locale-overlays' -> '@jini-ai/admin/shell/lib/merge-locale-overlays'
apps/admin/src/features/users/users-i18n.ts:3  '../../lib/merge-locale-overlays' -> '@jini-ai/admin/shell/lib/merge-locale-overlays'
apps/admin/src/features/widgets/widgets-i18n.ts:2  '../../lib/merge-locale-overlays' -> '@jini-ai/admin/shell/lib/merge-locale-overlays'
apps/admin/src/lib/admin-http/request.ts:5  '../page-lifecycle' -> '@jini-ai/admin/shell/lib/page-lifecycle'
apps/admin/src/components/PlainTextBlocks.tsx:3  '@/lib/plain-text-blocks' -> '@jini-ai/admin/shell/lib/plain-text-blocks'
apps/admin/src/components/AssistantDock/__tests__/RoutedA2uiSurfaceCard.contract.unit.test.tsx:8  '@/lib/playground-render-target-bus' -> '@jini-ai/admin/shell/lib/playground-render-target-bus'
apps/admin/src/components/AssistantDock/__tests__/RoutedA2uiSurfaceCard.unit.test.tsx:40  '@/lib/playground-render-target-bus' -> '@jini-ai/admin/shell/lib/playground-render-target-bus'
apps/admin/src/components/AssistantDock/__tests__/chart-provider.contract.unit.test.tsx:11  '@/lib/playground-render-target-bus' -> '@jini-ai/admin/shell/lib/playground-render-target-bus'
apps/admin/src/components/AssistantDock/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx:11  '@/lib/playground-render-target-bus' -> '@jini-ai/admin/shell/lib/playground-render-target-bus'
apps/admin/src/components/AssistantDock/hooks/use-routed-a2ui-surface-card.hooks.ts:7  '@/lib/playground-render-target-bus' -> '@jini-ai/admin/shell/lib/playground-render-target-bus'
apps/admin/src/features/playground/__tests__/Playground.canvas-lifecycle.unit.test.tsx:9  '@/lib/playground-render-target-bus' -> '@jini-ai/admin/shell/lib/playground-render-target-bus'
apps/admin/src/features/playground/__tests__/Playground.unit.test.tsx:8  '@/lib/playground-render-target-bus' -> '@jini-ai/admin/shell/lib/playground-render-target-bus'
apps/admin/src/features/playground/hooks/use-playground-canvas.hooks.ts:3  '@/lib/playground-render-target-bus' -> '@jini-ai/admin/shell/lib/playground-render-target-bus'
apps/admin/src/lib/__tests__/agent-screen-context.unit.test.ts:11  '../playground-render-target-bus' -> '@jini-ai/admin/shell/lib/playground-render-target-bus'
apps/admin/src/lib/agent-screen-context.ts:16  './playground-render-target-bus' -> '@jini-ai/admin/shell/lib/playground-render-target-bus'
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:28  '@/lib/post-title-extension' -> '@jini-ai/admin/shell/lib/post-title-extension'
apps/admin/src/lib/__tests__/media-embed-extension.unit.test.tsx:12  '../post-title-extension' -> '@jini-ai/admin/shell/lib/post-title-extension'
apps/admin/src/features/analytics/api/analytics-api.ts:3  '../../../lib/query-suffix' -> '@jini-ai/admin/shell/lib/query-suffix'
apps/admin/src/features/collections/api/collections-api.ts:2  '../../../lib/query-suffix' -> '@jini-ai/admin/shell/lib/query-suffix'
apps/admin/src/features/comments/api/comments-api.ts:3  '../../../lib/query-suffix' -> '@jini-ai/admin/shell/lib/query-suffix'
apps/admin/src/features/database/api/database-api.ts:2  '../../../lib/query-suffix' -> '@jini-ai/admin/shell/lib/query-suffix'
apps/admin/src/features/media/api/media-api.ts:3  '../../../lib/query-suffix' -> '@jini-ai/admin/shell/lib/query-suffix'
apps/admin/src/features/observability/api/observability-api.ts:3  '../../../lib/query-suffix' -> '@jini-ai/admin/shell/lib/query-suffix'
apps/admin/src/features/themes/api/themes-api.ts:3  '../../../lib/query-suffix' -> '@jini-ai/admin/shell/lib/query-suffix'
apps/admin/src/features/trash/api/trash-api.ts:3  '../../../lib/query-suffix' -> '@jini-ai/admin/shell/lib/query-suffix'
apps/admin/src/features/widgets/api/widgets-api.ts:3  '../../../lib/query-suffix' -> '@jini-ai/admin/shell/lib/query-suffix'
apps/admin/src/lib/durable-run-subscription.ts:6  './query-suffix' -> '@jini-ai/admin/shell/lib/query-suffix'
apps/admin/src/lib/publish-criteria-deep-link.ts:2  './query-suffix' -> '@jini-ai/admin/shell/lib/query-suffix'
```

## Tovu tests that must stay green (50; import lines are repointed above, assertions untouched)
- `apps/admin/src/__tests__/admin-boot-readers.test.tsx`
- `apps/admin/src/components/AssistantDock/__tests__/RoutedA2uiSurfaceCard.contract.unit.test.tsx`
- `apps/admin/src/components/AssistantDock/__tests__/RoutedA2uiSurfaceCard.unit.test.tsx`
- `apps/admin/src/components/AssistantDock/__tests__/chart-provider.contract.unit.test.tsx`
- `apps/admin/src/components/AssistantDock/__tests__/use-messages-change-handler.unit.test.tsx`
- `apps/admin/src/components/AssistantDock/__tests__/use-routed-a2ui-surface-card.hooks.unit.test.tsx`
- `apps/admin/src/components/__tests__/SitesSidebarNav.unit.test.tsx`
- `apps/admin/src/features/dashboard/__tests__/use-dashboard-port.unit.test.ts`
- `apps/admin/src/features/deployment/hooks/__tests__/use-static-export.unit.test.tsx`
- `apps/admin/src/features/import-export/__tests__/ImportExport.unit.test.tsx`
- `apps/admin/src/features/integrations/__tests__/use-integrations.unit.test.tsx`
- `apps/admin/src/features/library/__tests__/use-library.hooks.unit.test.tsx`
- `apps/admin/src/features/media/__tests__/use-media.hooks.unit.test.tsx`
- `apps/admin/src/features/members/__tests__/use-members.hooks.unit.test.ts`
- `apps/admin/src/features/observability/__tests__/use-queries-tab.hooks.unit.test.tsx`
- `apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts`
- `apps/admin/src/features/pages/__tests__/use-pages.unit.test.ts`
- `apps/admin/src/features/playground/__tests__/Playground.canvas-lifecycle.unit.test.tsx`
- `apps/admin/src/features/playground/__tests__/Playground.unit.test.tsx`
- `apps/admin/src/features/plugins/__tests__/plugin-list-refresh.unit.test.ts`
- `apps/admin/src/features/plugins/__tests__/use-plugins.hooks.unit.test.ts`
- `apps/admin/src/features/posts/__tests__/post-editor-external-refresh.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/post-editor-load-race.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/use-posts.unit.test.ts`
- `apps/admin/src/features/recovery/__tests__/use-recovery.unit.test.ts`
- `apps/admin/src/features/security/hooks/__tests__/use-access-tokens.unit.test.tsx`
- `apps/admin/src/features/sites/__tests__/use-sites.hooks.unit.test.tsx`
- `apps/admin/src/features/taxonomy/__tests__/use-taxonomy.unit.test.tsx`
- `apps/admin/src/features/themes/__tests__/theme-preview-refresh.unit.test.tsx`
- `apps/admin/src/features/themes/__tests__/use-theme-explore.hooks.unit.test.ts`
- `apps/admin/src/features/themes/__tests__/use-themes.hooks.unit.test.ts`
- `apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx`
- `apps/admin/src/hooks/__tests__/use-content-refresh-subscription.hooks.test.ts`
- `apps/admin/src/integrations/chart-providers/__tests__/use-chart-registry.unit.test.tsx`
- `apps/admin/src/integrations/jini-admin/__tests__/comments-ports.unit.test.ts`
- `apps/admin/src/integrations/jini-admin/__tests__/comments-swap.unit.test.tsx`
- `apps/admin/src/integrations/jini-admin/__tests__/forms-ports.unit.test.ts`
- `apps/admin/src/integrations/jini-admin/__tests__/forms-swap.unit.test.tsx`
- `apps/admin/src/integrations/jini-admin/__tests__/media-ports.unit.test.ts`
- `apps/admin/src/integrations/jini-admin/__tests__/redirects-ports.unit.test.ts`
- `apps/admin/src/integrations/jini-admin/__tests__/redirects-swap.unit.test.tsx`
- `apps/admin/src/integrations/jini-admin/__tests__/seo-ports.unit.test.ts`
- `apps/admin/src/integrations/jini-admin/__tests__/seo-swap.unit.test.tsx`
- `apps/admin/src/integrations/jini-admin/__tests__/widgets-ports.unit.test.ts`
- `apps/admin/src/integrations/jini-admin/__tests__/widgets-swap.unit.test.tsx`
- `apps/admin/src/lib/__tests__/agent-pages.unit.test.ts`
- `apps/admin/src/lib/__tests__/agent-screen-context.unit.test.ts`
- `apps/admin/src/lib/__tests__/editor-template-options.unit.test.ts`
- `apps/admin/src/lib/__tests__/media-embed-extension.unit.test.tsx`
- `apps/admin/src/lib/fetch-query/__tests__/provider.unit.test.tsx`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/admin/src/lib/boot-token-fragment.ts` (1)
- `apps/admin/src/lib/fetch-query/adapter-context.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/admin/src/lib/boot-token-fragment.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/admin/src/lib/post-title-extension.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `editor-failure-i18n.ts`, negate the first `if (` condition of its first exported function; `boot-token-fragment.unit.test.ts` must go red, then revert
