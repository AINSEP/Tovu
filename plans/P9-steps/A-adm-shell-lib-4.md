# A-adm-shell-lib-4 — adm-shell-lib → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:33 T:34. Depends on: A-adm-shell-lib-3, A-adm-shell-lib-1, A-adm-posts-1, A-adm-shell-lib-2. Est: J 60 min, T 112 min.

## J — move verbatim into Jini (9 files, 426 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/lib/viewer-time-zone.ts` | `packages/admin/src/shell/lib/viewer-time-zone.ts` | 5 |  |
| `apps/admin/src/lib/widget-embed-placement-content.ts` | `packages/admin/src/shell/lib/widget-embed-placement-content.ts` | 39 |  |
| `apps/admin/src/lib/admin-frontend-session.ts` | `packages/admin/src/shell/lib/admin-frontend-session.ts` | 28 |  |
| `apps/admin/src/lib/admin-http/urls.ts` | `packages/admin/src/shell/lib/admin-http/urls.ts` | 13 |  |
| `apps/admin/src/lib/admin-post-list-sort.ts` | `packages/admin/src/shell/lib/admin-post-list-sort.ts` | 83 |  |
| `apps/admin/src/lib/agent-screen-context.ts` | `packages/admin/src/shell/lib/agent-screen-context.ts` | 114 |  |
| `apps/admin/src/lib/import-export-routes.ts` | `packages/admin/src/shell/lib/import-export-routes.ts` | 28 |  |
| `apps/admin/src/lib/settings-refresh-bus.ts` | `packages/admin/src/shell/lib/settings-refresh-bus.ts` | 82 |  |
| `apps/admin/src/lib/site-url.ts` | `packages/admin/src/shell/lib/site-url.ts` | 34 | W4 |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./shell/lib/admin-frontend-session"]
- "@jini-ai/admin" exports["./shell/lib/admin-http/urls"]
- "@jini-ai/admin" exports["./shell/lib/admin-post-list-sort"]
- "@jini-ai/admin" exports["./shell/lib/agent-screen-context"]
- "@jini-ai/admin" exports["./shell/lib/import-export-routes"]
- "@jini-ai/admin" exports["./shell/lib/settings-refresh-bus"]
- "@jini-ai/admin" exports["./shell/lib/site-url"]
- "@jini-ai/admin" exports["./shell/lib/viewer-time-zone"]
- "@jini-ai/admin" exports["./shell/lib/widget-embed-placement-content"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (3, 199 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/lib/__tests__/widget-embed-placement-content.unit.test.ts`
- `apps/admin/src/lib/__tests__/settings-refresh-bus.test.ts`
- `apps/admin/src/lib/__tests__/site-url.unit.test.ts`


## T — Tovu repoint: delete the 9 sources, rewrite every importer (102 lines)

```
apps/admin/src/features/analytics/Analytics.tsx:7  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/collections/CollectionEntries.tsx:9  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/dashboard/Dashboard.tsx:14  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/database/Database.tsx:20  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/database/rules.ts:7  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/deployment/StaticSiteTab.tsx:41  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/integrations/rules.ts:10  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/library/Library.tsx:23  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/pages/Pages.tsx:27  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/posts/Posts.tsx:21  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/recovery/Recovery.tsx:29  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/recovery/rules.ts:5  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/security/AccessTokensTab.tsx:36  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/security/OtherCredentialsSection.tsx:12  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/sites/SiteExportTab.tsx:13  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/sites/SiteImportTab.tsx:16  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/sites/__tests__/site-transfer-tabs.unit.test.tsx:8  '@/lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/source-control/ProvidersTab.tsx:18  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/trash/Trash.tsx:13  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/workspace/Workspace.tsx:8  '../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/features/workspace/__tests__/Workspace.unit.test.tsx:12  '../../../lib/viewer-time-zone' -> '@jini-ai/admin/shell/lib/viewer-time-zone'
apps/admin/src/lib/widget-embed-extension.hooks.ts:10  './widget-embed-placement-content' -> '@jini-ai/admin/shell/lib/widget-embed-placement-content'
apps/admin/src/App.hooks.ts:13  './lib/admin-frontend-session' -> '@jini-ai/admin/shell/lib/admin-frontend-session'
apps/admin/src/__tests__/unit/app-hooks-admin-webmcp.unit.test.tsx:9  '../../lib/admin-frontend-session' -> '@jini-ai/admin/shell/lib/admin-frontend-session'
apps/admin/src/__tests__/unit/app-stream-wiring.unit.test.tsx:4  '../../lib/admin-frontend-session' -> '@jini-ai/admin/shell/lib/admin-frontend-session'
apps/admin/src/components/AssistantDock/DockChatPane.tsx:3  '@/lib/admin-frontend-session' -> '@jini-ai/admin/shell/lib/admin-frontend-session'
apps/admin/src/components/AssistantDock/hooks/run-context.hooks.ts:1  '../../../lib/admin-frontend-session' -> '@jini-ai/admin/shell/lib/admin-frontend-session'
apps/admin/src/components/__tests__/AssistantDock.hooks.unit.test.tsx:9  '../../lib/admin-frontend-session' -> '@jini-ai/admin/shell/lib/admin-frontend-session'
apps/admin/src/features/sites/__tests__/site-card-preview.unit.test.tsx:4  '@/lib/admin-http/urls' -> '@jini-ai/admin/shell/lib/admin-http/urls'
apps/admin/src/features/sites/hooks/site-transfer-dependencies.hooks.ts:6  '@/lib/admin-http/urls' -> '@jini-ai/admin/shell/lib/admin-http/urls'
apps/admin/src/features/sites/hooks/use-site-card-preview.hooks.ts:12  '@/lib/admin-http/urls' -> '@jini-ai/admin/shell/lib/admin-http/urls'
apps/admin/src/integrations/jini-admin/media-ports.ts:4  '../../lib/admin-http/urls' -> '@jini-ai/admin/shell/lib/admin-http/urls'
apps/admin/src/lib/__tests__/api-remaining-endpoints.unit.test.ts:15  '../admin-http/urls' -> '@jini-ai/admin/shell/lib/admin-http/urls'
apps/admin/src/features/pages/Pages.tsx:1  '../../lib/admin-post-list-sort' -> '@jini-ai/admin/shell/lib/admin-post-list-sort'
apps/admin/src/features/pages/__tests__/rules.unit.test.ts:1  '../../../lib/admin-post-list-sort' -> '@jini-ai/admin/shell/lib/admin-post-list-sort'
apps/admin/src/features/posts/Posts.tsx:1  '../../lib/admin-post-list-sort' -> '@jini-ai/admin/shell/lib/admin-post-list-sort'
apps/admin/src/features/posts/__tests__/rules.unit.test.ts:1  '../../../lib/admin-post-list-sort' -> '@jini-ai/admin/shell/lib/admin-post-list-sort'
apps/admin/src/components/AssistantDock/hooks/run-context.hooks.ts:6  '@/lib/agent-screen-context' -> '@jini-ai/admin/shell/lib/agent-screen-context'
apps/admin/src/hooks/use-agent-screen-context.hooks.ts:8  '@/lib/agent-screen-context' -> '@jini-ai/admin/shell/lib/agent-screen-context'
apps/admin/src/lib/__tests__/agent-screen-context.unit.test.ts:10  '../agent-screen-context' -> '@jini-ai/admin/shell/lib/agent-screen-context'
apps/admin/src/App.tsx:23  './lib/import-export-routes' -> '@jini-ai/admin/shell/lib/import-export-routes'
apps/admin/src/lib/__tests__/import-export-routes.unit.test.ts:3  '../import-export-routes' -> '@jini-ai/admin/shell/lib/import-export-routes'
apps/admin/src/App.hooks.ts:46  './lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/App.session.ts:14  './lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/__tests__/admin-boot-readers.test.tsx:9  '../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/__tests__/app-boot-request-volume.test.tsx:8  '../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/AssistantDock/__tests__/chat-agent-plugin-preferences.adapter.unit.test.ts:4  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/AssistantDock/__tests__/execution-config-write.unit.test.ts:12  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/AssistantDock/__tests__/execution-config-write.unit.test.ts:9  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/AssistantDock/__tests__/use-chat-display-preferences.hooks.unit.test.ts:4  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/AssistantDock/__tests__/use-messages-change-handler.unit.test.tsx:8  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/AssistantDock/assistant-runtime-preferences.adapter.ts:3  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/AssistantDock/chat-agent-plugin-preferences.adapter.ts:3  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/AssistantDock/chat-display-preferences.adapter.ts:3  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/AssistantDock/execution-config-write.ts:6  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/AssistantDock/hooks/execution-config-ledger.hooks.ts:6  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/AssistantDock/hooks/execution-config.hooks.ts:7  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/AssistantDock/hooks/messages-change.hooks.ts:4  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/__tests__/AssistantDock.execution-refresh.unit.test.tsx:12  '../../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/__tests__/AssistantDock.hooks.unit.test.tsx:120  '../../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/__tests__/AssistantDock.hooks.unit.test.tsx:43  '../../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/components/__tests__/AssistantDock.load-recovery.unit.test.tsx:31  '../../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/features/ai-assistant/__tests__/AdminPermanentDeletes.unit.test.tsx:7  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/features/ai-assistant/__tests__/AdminSubagents.unit.test.tsx:10  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/features/ai-assistant/__tests__/VisitorToolsPanel.unit.test.tsx:8  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/features/ai-assistant/__tests__/use-admin-subagents.hooks.unit.test.tsx:9  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/features/ai-assistant/__tests__/use-assistant-owner-grant.hooks.unit.test.tsx:5  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/features/ai-assistant/hooks/use-assistant-owner-grant.hooks.ts:5  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/features/ai-assistant/hooks/use-visitor-tools.hooks.ts:5  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/hooks/__tests__/admin-locale-dependencies.hooks.test.ts:3  '../../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/hooks/__tests__/use-admin-appearance.unit.test.ts:9  '../../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/hooks/__tests__/use-admin-execution-credential.hooks.test.ts:6  '../../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/hooks/__tests__/use-admin-execution-credential.hooks.test.ts:326  '../../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/hooks/__tests__/use-admin-locale.hooks.test.ts:4  '../../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/hooks/__tests__/use-interface-preferences.hooks.test.ts:5  '../../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/hooks/__tests__/use-settings-slice.hooks.test.ts:4  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/hooks/__tests__/use-settings-slice.refresh.test.ts:5  '../../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/hooks/admin-locale-dependencies.hooks.ts:2  '../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/hooks/use-admin-appearance.hooks.ts:5  '../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/hooks/use-admin-execution-credential.hooks.ts:13  '../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/hooks/use-interface-preferences.hooks.ts:6  '../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/hooks/use-settings-slice.hooks.ts:6  '../lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/integrations/chart-providers/__tests__/use-chart-registry.unit.test.tsx:7  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/integrations/chart-providers/use-chart-registry.hooks.ts:8  '@/lib/settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/lib/__tests__/settings-effective-reads.integration.test.ts:8  '../settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/lib/__tests__/settings-events.unit.test.ts:3  '../settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/lib/settings-events.ts:26  './settings-refresh-bus' -> '@jini-ai/admin/shell/lib/settings-refresh-bus'
apps/admin/src/features/dashboard/Dashboard.tsx:2  '../../lib/site-url' -> '@jini-ai/admin/shell/lib/site-url'
apps/admin/src/features/media/api/media-api.ts:4  '../../../lib/site-url' -> '@jini-ai/admin/shell/lib/site-url'
apps/admin/src/features/pages/PageEditor.tsx:24  '../../lib/site-url' -> '@jini-ai/admin/shell/lib/site-url'
apps/admin/src/features/pages/Pages.tsx:10  '../../lib/site-url' -> '@jini-ai/admin/shell/lib/site-url'
apps/admin/src/features/pages/ThemePagesTab.tsx:8  '../../lib/site-url' -> '@jini-ai/admin/shell/lib/site-url'
apps/admin/src/features/pages/__tests__/Pages.unit.test.tsx:11  '@/lib/site-url' -> '@jini-ai/admin/shell/lib/site-url'
apps/admin/src/features/posts/Posts.tsx:9  '../../lib/site-url' -> '@jini-ai/admin/shell/lib/site-url'
apps/admin/src/features/posts/api/posts-api.ts:3  '../../../lib/site-url' -> '@jini-ai/admin/shell/lib/site-url'
apps/admin/src/features/posts/editor/header/PostEditorHeader.tsx:6  '../../../../lib/site-url' -> '@jini-ai/admin/shell/lib/site-url'
apps/admin/src/features/themes/ThemeExplore.tsx:14  '../../lib/site-url' -> '@jini-ai/admin/shell/lib/site-url'
apps/admin/src/features/themes/Themes.tsx:7  '../../lib/site-url' -> '@jini-ai/admin/shell/lib/site-url'
apps/admin/src/features/themes/hooks/use-theme-explore-preview.hooks.ts:2  '@/lib/site-url' -> '@jini-ai/admin/shell/lib/site-url'
apps/admin/src/integrations/jini-admin/__tests__/seo-ports.unit.test.ts:6  '../../../lib/site-url' -> '@jini-ai/admin/shell/lib/site-url'
apps/admin/src/integrations/jini-admin/seo-module.hooks.ts:9  '../../lib/site-url' -> '@jini-ai/admin/shell/lib/site-url'
apps/admin/src/integrations/jini-admin/seo-ports.ts:7  '../../lib/site-url' -> '@jini-ai/admin/shell/lib/site-url'
```

## Tovu tests that must stay green (36; import lines are repointed above, assertions untouched)
- `apps/admin/src/__tests__/admin-boot-readers.test.tsx`
- `apps/admin/src/__tests__/app-boot-request-volume.test.tsx`
- `apps/admin/src/__tests__/unit/app-hooks-admin-webmcp.unit.test.tsx`
- `apps/admin/src/__tests__/unit/app-stream-wiring.unit.test.tsx`
- `apps/admin/src/components/AssistantDock/__tests__/chat-agent-plugin-preferences.adapter.unit.test.ts`
- `apps/admin/src/components/AssistantDock/__tests__/execution-config-write.unit.test.ts`
- `apps/admin/src/components/AssistantDock/__tests__/use-chat-display-preferences.hooks.unit.test.ts`
- `apps/admin/src/components/AssistantDock/__tests__/use-messages-change-handler.unit.test.tsx`
- `apps/admin/src/components/__tests__/AssistantDock.execution-refresh.unit.test.tsx`
- `apps/admin/src/components/__tests__/AssistantDock.hooks.unit.test.tsx`
- `apps/admin/src/components/__tests__/AssistantDock.load-recovery.unit.test.tsx`
- `apps/admin/src/features/ai-assistant/__tests__/AdminPermanentDeletes.unit.test.tsx`
- `apps/admin/src/features/ai-assistant/__tests__/AdminSubagents.unit.test.tsx`
- `apps/admin/src/features/ai-assistant/__tests__/VisitorToolsPanel.unit.test.tsx`
- `apps/admin/src/features/ai-assistant/__tests__/use-admin-subagents.hooks.unit.test.tsx`
- `apps/admin/src/features/ai-assistant/__tests__/use-assistant-owner-grant.hooks.unit.test.tsx`
- `apps/admin/src/features/pages/__tests__/Pages.unit.test.tsx`
- `apps/admin/src/features/pages/__tests__/rules.unit.test.ts`
- `apps/admin/src/features/posts/__tests__/rules.unit.test.ts`
- `apps/admin/src/features/sites/__tests__/site-card-preview.unit.test.tsx`
- `apps/admin/src/features/sites/__tests__/site-transfer-tabs.unit.test.tsx`
- `apps/admin/src/features/workspace/__tests__/Workspace.unit.test.tsx`
- `apps/admin/src/hooks/__tests__/admin-locale-dependencies.hooks.test.ts`
- `apps/admin/src/hooks/__tests__/use-admin-appearance.unit.test.ts`
- `apps/admin/src/hooks/__tests__/use-admin-execution-credential.hooks.test.ts`
- `apps/admin/src/hooks/__tests__/use-admin-locale.hooks.test.ts`
- `apps/admin/src/hooks/__tests__/use-interface-preferences.hooks.test.ts`
- `apps/admin/src/hooks/__tests__/use-settings-slice.hooks.test.ts`
- `apps/admin/src/hooks/__tests__/use-settings-slice.refresh.test.ts`
- `apps/admin/src/integrations/chart-providers/__tests__/use-chart-registry.unit.test.tsx`
- `apps/admin/src/integrations/jini-admin/__tests__/seo-ports.unit.test.ts`
- `apps/admin/src/lib/__tests__/agent-screen-context.unit.test.ts`
- `apps/admin/src/lib/__tests__/api-remaining-endpoints.unit.test.ts`
- `apps/admin/src/lib/__tests__/import-export-routes.unit.test.ts`
- `apps/admin/src/lib/__tests__/settings-effective-reads.integration.test.ts`
- `apps/admin/src/lib/__tests__/settings-events.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/admin/src/lib/site-url.ts` (4)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/admin/src/lib/agent-screen-context.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/admin/src/lib/site-url.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/admin/src/lib/site-url.ts:29: const origin = import.meta.env.VITE_TOVU_SITE_URL ?? "https://localhost:3000";
```

## Named mutation
in the Jini copy of `agent-screen-context.ts`, negate the first `if (` condition of its first exported function; `widget-embed-placement-content.unit.test.ts` must go red, then revert
