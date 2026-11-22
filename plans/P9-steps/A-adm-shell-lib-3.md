# A-adm-shell-lib-3 — adm-shell-lib → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:28 T:37. Depends on: none (only already-Jini code). Est: J 63 min, T 120 min.

## J — move verbatim into Jini (9 files, 562 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/lib/queued-daemon-start.ts` | `packages/admin/src/shell/lib/queued-daemon-start.ts` | 46 |  |
| `apps/admin/src/lib/router.ts` | `packages/admin/src/shell/lib/router.ts` | 155 | W3 |
| `apps/admin/src/lib/server-failure.ts` | `packages/admin/src/shell/lib/server-failure.ts` | 8 |  |
| `apps/admin/src/lib/server-reconnect.ts` | `packages/admin/src/shell/lib/server-reconnect.ts` | 166 | W1 |
| `apps/admin/src/lib/settings-effective-reads.ts` | `packages/admin/src/shell/lib/settings-effective-reads.ts` | 65 |  |
| `apps/admin/src/lib/slug-redirect-path.ts` | `packages/admin/src/shell/lib/slug-redirect-path.ts` | 39 |  |
| `apps/admin/src/lib/translation-entry.ts` | `packages/admin/src/shell/lib/translation-entry.ts` | 14 |  |
| `apps/admin/src/lib/unchanged-save-warning.ts` | `packages/admin/src/shell/lib/unchanged-save-warning.ts` | 41 |  |
| `apps/admin/src/lib/unique-id.ts` | `packages/admin/src/shell/lib/unique-id.ts` | 28 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./shell/lib/queued-daemon-start"]
- "@jini-ai/admin" exports["./shell/lib/router"]
- "@jini-ai/admin" exports["./shell/lib/server-failure"]
- "@jini-ai/admin" exports["./shell/lib/server-reconnect"]
- "@jini-ai/admin" exports["./shell/lib/settings-effective-reads"]
- "@jini-ai/admin" exports["./shell/lib/slug-redirect-path"]
- "@jini-ai/admin" exports["./shell/lib/translation-entry"]
- "@jini-ai/admin" exports["./shell/lib/unchanged-save-warning"]
- "@jini-ai/admin" exports["./shell/lib/unique-id"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (4, 414 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/lib/__tests__/queued-daemon-start.unit.test.ts`
- `apps/admin/src/lib/__tests__/router.unit.test.ts`
- `apps/admin/src/lib/__tests__/slug-redirect-path.unit.test.ts`
- `apps/admin/src/lib/__tests__/unchanged-save-warning.unit.test.ts`


## T — Tovu repoint: delete the 9 sources, rewrite every importer (132 lines)

```
apps/admin/src/lib/__tests__/durable-run-subscription.unit.test.ts:4  '../queued-daemon-start' -> '@jini-ai/admin/shell/lib/queued-daemon-start'
apps/admin/src/lib/assistant-transport.ts:5  './queued-daemon-start' -> '@jini-ai/admin/shell/lib/queued-daemon-start'
apps/admin/src/App.hooks.ts:24  './lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/App.tsx:20  './lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/__measurements__/forms-harness.tsx:5  '../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/__tests__/app-boot-request-volume.test.tsx:10  '../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/__tests__/unit/app-hooks-admin-webmcp.unit.test.tsx:10  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/__tests__/unit/app-stream-wiring.unit.test.tsx:5  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/components/AssistantDock/hooks/composer-discovery.hooks.ts:8  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/components/MailStatusBanner/MailStatusBanner.tsx:4  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/components/TemplateSource/TemplateSourceModal.hooks.ts:1  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/components/TemplateSource/__tests__/TemplateSourceModal.unit.test.tsx:7  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/components/TemplateSource/__tests__/TemplateSourceModal.unit.test.tsx:10  '../../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/components/__tests__/AssistantDock.hooks.unit.test.tsx:71  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/admin-ui/AdminUi.tsx:4  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/ai-assistant/hooks/use-ai-assistant.hooks.ts:5  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/analytics/Analytics.tsx:3  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/collections/__tests__/use-collection-entry-editor.unit.test.tsx:11  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/collections/__tests__/use-collection-entry-editor.unit.test.tsx:32  '../../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts:10  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/consent/ConsentOverviewTab.tsx:2  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/consent/CookieConsent.tsx:6  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/consent/__tests__/CookieConsent.unit.test.tsx:4  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/consent/__tests__/CookieConsent.unit.test.tsx:11  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/consent/__tests__/CookieConsent.unit.test.tsx:11  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/dashboard/Dashboard.tsx:3  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/database/Database.hooks.ts:1  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/database/Database.tsx:13  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/database/__tests__/Database.unit.test.tsx:10  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/database/__tests__/Database.unit.test.tsx:49  '../../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/database/__tests__/use-timeline-section.unit.test.tsx:6  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/database/__tests__/use-timeline-section.unit.test.tsx:24  '../../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/database/hooks/use-timeline-section.hooks.ts:6  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/deployment/Deployment.hooks.ts:1  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/deployment/Deployment.tsx:4  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/deployment/StaticSiteTab.tsx:9  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/email/Email.tsx:10  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/email/EmailTemplateEditor.tsx:13  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/email/EmailTemplatesTab.tsx:4  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/email/__tests__/EmailTemplateEditor.unit.test.tsx:8  '../../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/email/hooks/use-email-templates.hooks.ts:3  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/import-export/ImportExport.tsx:4  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/integrations/__tests__/IntegrationsRedirect.unit.test.tsx:6  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/integrations/hooks/use-integrations-redirect.hooks.ts:2  '../../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/library/Library.hooks.tsx:6  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/library/Library.tsx:9  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/media/__tests__/use-media-tabs.hooks.unit.test.tsx:4  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/media/hooks/use-media-item-link.hooks.ts:4  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/media/hooks/use-media-tabs.hooks.ts:1  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/menus/__tests__/MenuEditor.unit.test.tsx:8  '../../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts:6  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/observability/hooks/use-observability-tab.hooks.ts:3  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/pages/Pages.tsx:12  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/pages/ThemePageDetailsModal.tsx:4  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/pages/ThemePagesTab.tsx:7  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/pages/__tests__/Pages.unit.test.tsx:9  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/pages/__tests__/Pages.unit.test.tsx:29  '../../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/pages/__tests__/Pages.unit.test.tsx:28  '../../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:14  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/pages/hooks/use-pages.hooks.ts:5  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/pages/lib/theme-page-publish-state.ts:1  '../../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/plugins/AgentPluginLinkedLock.tsx:4  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/plugins/Plugins.tsx:8  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/plugins/hooks/use-agent-plugin-tab.hooks.ts:3  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/posts/Posts.tsx:11  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/posts/__tests__/Posts.unit.test.tsx:10  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/posts/__tests__/Posts.unit.test.tsx:22  '../../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/posts/__tests__/posts-agent-drive.unit.test.tsx:10  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:29  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/posts/hooks/use-posts.hooks.ts:7  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/providers/Providers.hooks.ts:1  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/providers/__tests__/Providers.unit.test.tsx:9  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/recovery/__tests__/Recovery.unit.test.tsx:8  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/recovery/__tests__/Recovery.unit.test.tsx:14  '../../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/recovery/__tests__/use-recovery.unit.test.ts:5  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/recovery/__tests__/use-recovery.unit.test.ts:14  '../../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/recovery/hooks/use-recovery-navigation.hooks.ts:3  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/recovery/hooks/use-recovery.hooks.ts:12  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/roles/Roles.hooks.tsx:4  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/security/AccessTokensTab.tsx:9  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/security/Security.hooks.ts:1  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/settings/SettingsUi.hooks.ts:4  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/settings/SettingsUi.tsx:129  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/sites/Sites.tsx:8  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/skills/use-skills-tabs.hooks.ts:3  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/source-control/ProvidersTab.tsx:6  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/source-control/SourceControl.hooks.ts:1  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/source-control/SourceControl.tsx:5  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/themes/ThemeExplore.tsx:15  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/themes/Themes.tsx:8  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/users/hooks/users-controller.hooks.ts:4  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/workspace/__tests__/WorkspaceRedirect.unit.test.tsx:5  '@/lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/workspace/hooks/use-workspace-redirect.hooks.ts:2  '../../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/integrations/jini-admin/forms-ports.ts:7  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/integrations/jini-admin/modules.hooks.ts:21  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/integrations/jini-admin/widgets-ports.ts:7  '../../lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/lib/__tests__/agent-navigation-entities.unit.test.ts:7  '../router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/lib/__tests__/agent-pages.unit.test.ts:4  '../router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/lib/agent-pages.ts:5  './router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/lib/browser-telemetry.ts:2  './router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/main.tsx:18  './lib/router' -> '@jini-ai/admin/shell/lib/router'
apps/admin/src/features/pages/hooks/page-editor-save.ts:9  '@/lib/server-failure' -> '@jini-ai/admin/shell/lib/server-failure'
apps/admin/src/features/posts/hooks/post-editor-messages.ts:2  '@/lib/server-failure' -> '@jini-ai/admin/shell/lib/server-failure'
apps/admin/src/components/ServerRestartingBanner/ServerRestartingBanner.tsx:1  '@/lib/server-reconnect' -> '@jini-ai/admin/shell/lib/server-reconnect'
apps/admin/src/components/ServerRestartingBanner/hooks/use-server-connection-status.hooks.ts:3  '@/lib/server-reconnect' -> '@jini-ai/admin/shell/lib/server-reconnect'
apps/admin/src/components/__tests__/ServerRestartingBanner.unit.test.tsx:5  '@/lib/server-reconnect' -> '@jini-ai/admin/shell/lib/server-reconnect'
apps/admin/src/lib/__tests__/admin-failure-channel.unit.test.ts:10  '../server-reconnect' -> '@jini-ai/admin/shell/lib/server-reconnect'
apps/admin/src/lib/__tests__/api-request.characterization.test.ts:6  '../server-reconnect' -> '@jini-ai/admin/shell/lib/server-reconnect'
apps/admin/src/lib/__tests__/server-reconnect.unit.test.ts:4  '../server-reconnect' -> '@jini-ai/admin/shell/lib/server-reconnect'
apps/admin/src/lib/admin-http/request.ts:6  '../server-reconnect' -> '@jini-ai/admin/shell/lib/server-reconnect'
apps/admin/src/features/analytics/__tests__/use-analytics.hooks.unit.test.ts:5  '@/lib/settings-effective-reads' -> '@jini-ai/admin/shell/lib/settings-effective-reads'
apps/admin/src/features/settings/api/settings-api.ts:4  '../../../lib/settings-effective-reads' -> '@jini-ai/admin/shell/lib/settings-effective-reads'
apps/admin/src/lib/execution-settings.ts:73  './settings-effective-reads' -> '@jini-ai/admin/shell/lib/settings-effective-reads'
apps/admin/src/lib/settings-refresh-bus.ts:1  './settings-effective-reads' -> '@jini-ai/admin/shell/lib/settings-effective-reads'
apps/admin/src/features/collections/hooks/use-collection-entry-editor.hooks.ts:11  '@/lib/slug-redirect-path' -> '@jini-ai/admin/shell/lib/slug-redirect-path'
apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts:8  '@/lib/slug-redirect-path' -> '@jini-ai/admin/shell/lib/slug-redirect-path'
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:15  '@/lib/slug-redirect-path' -> '@jini-ai/admin/shell/lib/slug-redirect-path'
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:30  '@/lib/slug-redirect-path' -> '@jini-ai/admin/shell/lib/slug-redirect-path'
apps/admin/src/integrations/jini-admin/widgets-module.hooks.ts:12  '../../lib/slug-redirect-path' -> '@jini-ai/admin/shell/lib/slug-redirect-path'
apps/admin/src/features/auth/auth-i18n.ts:1  '../../lib/translation-entry' -> '@jini-ai/admin/shell/lib/translation-entry'
apps/admin/src/features/dashboard/dashboard-i18n.ts:1  '../../lib/translation-entry' -> '@jini-ai/admin/shell/lib/translation-entry'
apps/admin/src/features/deployment/deployment-i18n.tsx:1  '../../lib/translation-entry' -> '@jini-ai/admin/shell/lib/translation-entry'
apps/admin/src/features/sites/site-transfer-i18n.ts:1  '../../lib/translation-entry' -> '@jini-ai/admin/shell/lib/translation-entry'
apps/admin/src/features/users/users-i18n.ts:1  '../../lib/translation-entry' -> '@jini-ai/admin/shell/lib/translation-entry'
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:17  '@/lib/unchanged-save-warning' -> '@jini-ai/admin/shell/lib/unchanged-save-warning'
apps/admin/src/features/posts/hooks/use-post-editor-ui.hooks.ts:3  '@/lib/unchanged-save-warning' -> '@jini-ai/admin/shell/lib/unchanged-save-warning'
apps/admin/src/components/EmbedInsertControl/EmbedInsertControl.hooks.tsx:5  '../../lib/unique-id' -> '@jini-ai/admin/shell/lib/unique-id'
apps/admin/src/features/email/hooks/use-email-overview.hooks.ts:6  '../../../lib/unique-id' -> '@jini-ai/admin/shell/lib/unique-id'
apps/admin/src/lib/admin-frontend-session.ts:2  './unique-id' -> '@jini-ai/admin/shell/lib/unique-id'
apps/admin/src/lib/assistant-transport-ag-ui.ts:35  './unique-id' -> '@jini-ai/admin/shell/lib/unique-id'
apps/admin/src/lib/assistant-transport.ts:11  './unique-id' -> '@jini-ai/admin/shell/lib/unique-id'
apps/admin/src/lib/widget-embed-extension.tsx:14  './unique-id' -> '@jini-ai/admin/shell/lib/unique-id'
```

## Tovu tests that must stay green (29; import lines are repointed above, assertions untouched)
- `apps/admin/src/__measurements__/forms-harness.tsx`
- `apps/admin/src/__tests__/app-boot-request-volume.test.tsx`
- `apps/admin/src/__tests__/unit/app-hooks-admin-webmcp.unit.test.tsx`
- `apps/admin/src/__tests__/unit/app-stream-wiring.unit.test.tsx`
- `apps/admin/src/components/TemplateSource/__tests__/TemplateSourceModal.unit.test.tsx`
- `apps/admin/src/components/__tests__/AssistantDock.hooks.unit.test.tsx`
- `apps/admin/src/components/__tests__/ServerRestartingBanner.unit.test.tsx`
- `apps/admin/src/features/analytics/__tests__/use-analytics.hooks.unit.test.ts`
- `apps/admin/src/features/collections/__tests__/use-collection-entry-editor.unit.test.tsx`
- `apps/admin/src/features/consent/__tests__/CookieConsent.unit.test.tsx`
- `apps/admin/src/features/database/__tests__/Database.unit.test.tsx`
- `apps/admin/src/features/database/__tests__/use-timeline-section.unit.test.tsx`
- `apps/admin/src/features/email/__tests__/EmailTemplateEditor.unit.test.tsx`
- `apps/admin/src/features/integrations/__tests__/IntegrationsRedirect.unit.test.tsx`
- `apps/admin/src/features/media/__tests__/use-media-tabs.hooks.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/MenuEditor.unit.test.tsx`
- `apps/admin/src/features/pages/__tests__/Pages.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/Posts.unit.test.tsx`
- `apps/admin/src/features/posts/__tests__/posts-agent-drive.unit.test.tsx`
- `apps/admin/src/features/providers/__tests__/Providers.unit.test.tsx`
- `apps/admin/src/features/recovery/__tests__/Recovery.unit.test.tsx`
- `apps/admin/src/features/recovery/__tests__/use-recovery.unit.test.ts`
- `apps/admin/src/features/workspace/__tests__/WorkspaceRedirect.unit.test.tsx`
- `apps/admin/src/lib/__tests__/admin-failure-channel.unit.test.ts`
- `apps/admin/src/lib/__tests__/agent-navigation-entities.unit.test.ts`
- `apps/admin/src/lib/__tests__/agent-pages.unit.test.ts`
- `apps/admin/src/lib/__tests__/api-request.characterization.test.ts`
- `apps/admin/src/lib/__tests__/durable-run-subscription.unit.test.ts`
- `apps/admin/src/lib/__tests__/server-reconnect.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/admin/src/lib/router.ts` (3)
- `apps/admin/src/lib/server-reconnect.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/admin/src/lib/router.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/admin/src/lib/server-reconnect.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/admin/src/lib/server-reconnect.ts:21: export const UPSTREAM_REFUSED_HEADER = "x-tovu-upstream-status";
```

## Named mutation
in the Jini copy of `server-reconnect.ts`, negate the first `if (` condition of its first exported function; `queued-daemon-start.unit.test.ts` must go red, then revert
