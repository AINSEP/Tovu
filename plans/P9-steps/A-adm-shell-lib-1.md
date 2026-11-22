# A-adm-shell-lib-1 — adm-shell-lib → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:27 T:29. Depends on: none (only already-Jini code). Est: J 81 min, T 118 min.

## J — move verbatim into Jini (12 files, 729 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/lib/acceptance-cancellation.ts` | `packages/admin/src/shell/lib/acceptance-cancellation.ts` | 15 |  |
| `apps/admin/src/lib/addons-routes.ts` | `packages/admin/src/shell/lib/addons-routes.ts` | 79 | W2 |
| `apps/admin/src/lib/admin-boot-scope.ts` | `packages/admin/src/shell/lib/admin-boot-scope.ts` | 13 | W1 |
| `apps/admin/src/lib/admin-dev-origin.ts` | `packages/admin/src/shell/lib/admin-dev-origin.ts` | 40 | W3 |
| `apps/admin/src/lib/admin-draft-identity.ts` | `packages/admin/src/shell/lib/admin-draft-identity.ts` | 5 |  |
| `apps/admin/src/lib/admin-http/config.ts` | `packages/admin/src/shell/lib/admin-http/config.ts` | 5 |  |
| `apps/admin/src/lib/agent-screenshot-bus.ts` | `packages/admin/src/shell/lib/agent-screenshot-bus.ts` | 74 |  |
| `apps/admin/src/lib/agent-screenshot.ts` | `packages/admin/src/shell/lib/agent-screenshot.ts` | 283 | W3 |
| `apps/admin/src/lib/app-version.ts` | `packages/admin/src/shell/lib/app-version.ts` | 16 | W4 |
| `apps/admin/src/lib/ascii-slug.ts` | `packages/admin/src/shell/lib/ascii-slug.ts` | 8 |  |
| `apps/admin/src/lib/assistant-dock-bus.ts` | `packages/admin/src/shell/lib/assistant-dock-bus.ts` | 125 |  |
| `apps/admin/src/lib/block-atom-insert.ts` | `packages/admin/src/shell/lib/block-atom-insert.ts` | 66 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./shell/lib/acceptance-cancellation"]
- "@jini-ai/admin" exports["./shell/lib/addons-routes"]
- "@jini-ai/admin" exports["./shell/lib/admin-boot-scope"]
- "@jini-ai/admin" exports["./shell/lib/admin-dev-origin"]
- "@jini-ai/admin" exports["./shell/lib/admin-draft-identity"]
- "@jini-ai/admin" exports["./shell/lib/admin-http/config"]
- "@jini-ai/admin" exports["./shell/lib/agent-screenshot"]
- "@jini-ai/admin" exports["./shell/lib/agent-screenshot-bus"]
- "@jini-ai/admin" exports["./shell/lib/app-version"]
- "@jini-ai/admin" exports["./shell/lib/ascii-slug"]
- "@jini-ai/admin" exports["./shell/lib/assistant-dock-bus"]
- "@jini-ai/admin" exports["./shell/lib/block-atom-insert"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (8, 827 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/lib/__tests__/acceptance-cancellation.unit.test.ts`
- `apps/admin/src/lib/__tests__/addons-routes.unit.test.ts`
- `apps/admin/src/lib/__tests__/admin-boot-scope.unit.test.tsx`
- `apps/admin/src/lib/__tests__/admin-dev-origin.unit.test.ts`
- `apps/admin/src/lib/__tests__/agent-screenshot-bus.unit.test.ts`
- `apps/admin/src/lib/__tests__/agent-screenshot.unit.test.ts`
- `apps/admin/src/lib/__tests__/assistant-dock-bus.unit.test.ts`
- `apps/admin/src/lib/__tests__/block-atom-insert.unit.test.ts`


## T — Tovu repoint: delete the 12 sources, rewrite every importer (131 lines)

```
apps/admin/src/lib/__tests__/durable-run-subscription.unit.test.ts:5  '../acceptance-cancellation' -> '@jini-ai/admin/shell/lib/acceptance-cancellation'
apps/admin/src/lib/assistant-transport.ts:6  './acceptance-cancellation' -> '@jini-ai/admin/shell/lib/acceptance-cancellation'
apps/admin/src/App.tsx:22  './lib/addons-routes' -> '@jini-ai/admin/shell/lib/addons-routes'
apps/admin/src/features/integrations/hooks/use-integrations-redirect.hooks.ts:3  '../../../lib/addons-routes' -> '@jini-ai/admin/shell/lib/addons-routes'
apps/admin/src/lib/agent-pages.ts:6  './addons-routes' -> '@jini-ai/admin/shell/lib/addons-routes'
apps/admin/src/lib/import-export-routes.ts:1  './addons-routes' -> '@jini-ai/admin/shell/lib/addons-routes'
apps/admin/src/nav.ts:3  './lib/addons-routes' -> '@jini-ai/admin/shell/lib/addons-routes'
apps/admin/src/App.tsx:9  './lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/__tests__/admin-boot-readers.test.tsx:5  '../lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/admin-themes/use-admin-theme.hooks.ts:5  '../lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/components/AssistantDock/__tests__/AssistantDock.hooks.unit.test.tsx:26  '@/lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/components/AssistantDock/hooks/agents-inventory.hooks.ts:8  '@/lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/components/AssistantDock/hooks/composer-discovery.hooks.ts:10  '@/lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/components/AssistantDock/hooks/execution-config.hooks.ts:5  '@/lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/features/ai-assistant/hooks/use-assistant-owner-grant.hooks.ts:6  '@/lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/features/ai-assistant/hooks/use-visitor-tools.hooks.ts:4  '@/lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/features/dashboard/__tests__/use-dashboard-port.unit.test.ts:9  '@/lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/features/dashboard/hooks/use-dashboard.hooks.ts:14  '@/lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/features/sites/__tests__/use-site-transfer.hooks.unit.test.tsx:7  '@/lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/features/sites/hooks/use-site-export-state.hooks.ts:4  '@/lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/features/sites/hooks/use-site-import-state.hooks.ts:3  '@/lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/features/sites/hooks/use-sites-snapshot.hooks.ts:8  '@/lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/hooks/__tests__/use-admin-locale.hooks.test.ts:180  '../../lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/hooks/use-admin-appearance-snapshot.hooks.ts:3  '../lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/hooks/use-admin-locale.hooks.ts:7  '../lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/hooks/use-interface-preferences.hooks.ts:7  '../lib/admin-boot-scope' -> '@jini-ai/admin/shell/lib/admin-boot-scope'
apps/admin/src/lib/__tests__/api-connectors-policies-forms-seo-redirects-posts.unit.test.ts:3  '../admin-dev-origin' -> '@jini-ai/admin/shell/lib/admin-dev-origin'
apps/admin/src/lib/__tests__/api-connectors-policies-forms-seo-redirects-posts.unit.test.ts:14  '../admin-dev-origin' -> '@jini-ai/admin/shell/lib/admin-dev-origin'
apps/admin/src/lib/__tests__/site-url.unit.test.ts:3  '../admin-dev-origin' -> '@jini-ai/admin/shell/lib/admin-dev-origin'
apps/admin/src/lib/__tests__/site-url.unit.test.ts:16  '../admin-dev-origin' -> '@jini-ai/admin/shell/lib/admin-dev-origin'
apps/admin/src/lib/site-url.ts:1  './admin-dev-origin' -> '@jini-ai/admin/shell/lib/admin-dev-origin'
apps/admin/src/App.hooks.ts:5  './lib/admin-draft-identity' -> '@jini-ai/admin/shell/lib/admin-draft-identity'
apps/admin/src/App.session.ts:3  './lib/admin-draft-identity' -> '@jini-ai/admin/shell/lib/admin-draft-identity'
apps/admin/src/__tests__/unit/app-session-failure-reset.unit.test.tsx:6  '../../lib/admin-draft-identity' -> '@jini-ai/admin/shell/lib/admin-draft-identity'
apps/admin/src/features/pages/hooks/page-editor-dependencies.hooks.ts:1  '@/lib/admin-draft-identity' -> '@jini-ai/admin/shell/lib/admin-draft-identity'
apps/admin/src/features/posts/hooks/post-editor-dependencies.hooks.ts:1  '@/lib/admin-draft-identity' -> '@jini-ai/admin/shell/lib/admin-draft-identity'
apps/admin/src/lib/__tests__/admin-failure-channel.assistant-cold.unit.test.ts:4  '../admin-draft-identity' -> '@jini-ai/admin/shell/lib/admin-draft-identity'
apps/admin/src/lib/__tests__/admin-failure-channel.unit.test.ts:9  '../admin-draft-identity' -> '@jini-ai/admin/shell/lib/admin-draft-identity'
apps/admin/src/lib/__tests__/admin-failure-channel.unknown-route.unit.test.ts:4  '../admin-draft-identity' -> '@jini-ai/admin/shell/lib/admin-draft-identity'
apps/admin/src/lib/admin-failure-channel.ts:6  './admin-draft-identity' -> '@jini-ai/admin/shell/lib/admin-draft-identity'
apps/admin/src/App.hooks.ts:28  './lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/components/WidgetConfigFields/widget-config-fields-dependencies.hooks.ts:8  '../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/ai-assistant/api/ai-assistant-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/analytics/api/analytics-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/comments/api/comments-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/consent/settings.hooks.ts:2  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/content-analysis/__tests__/use-content-analysis.hooks.unit.test.tsx:5  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/content-analysis/hooks/content-analysis-dependencies.hooks.ts:2  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/deployment/api/deployment-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/email/api/mail-status-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/email/email-api.ts:3  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/forms/api/forms-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/fs-files/api/fs-files-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/import-export/api/import-export-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/import-export/hooks/git-backup-port.hooks.ts:3  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/integrations/api/integrations-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/media/api/media-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/members/api/members-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/members/hooks/members-controller.hooks.ts:3  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/menus/api/menus-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/observability/api/observability-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/pages/api/pages-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/plugins/api/plugins-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/plugins/hooks/agent-plugin-install-dependencies.hooks.ts:3  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/plugins/hooks/agent-plugin-memory-dependencies.hooks.ts:2  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/plugins/hooks/agent-plugin-surfaces-dependencies.hooks.ts:2  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/plugins/hooks/plugin-install-dependencies.hooks.ts:2  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/plugins/hooks/plugins-dependencies.hooks.ts:5  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/plugins/installed-skills-composer-source.ts:2  '../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/posts/api/posts-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/providers/api/providers-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/publish-content/api/publish-content-api.ts:2  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/roles/api/roles-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/security/api/security-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/settings/api/settings-api.ts:2  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/sites/api/sites-api.ts:2  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/sites/hooks/site-transfer-dependencies.hooks.ts:4  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/skills/api.ts:2  '../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/source-control/api/source-control-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/themes/api/themes-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/themes/theme-preview-refresh.ts:2  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/trash/api/trash-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/users/UsersPanel.tsx:4  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/users/api/users-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/users/hooks/users-controller.hooks.ts:5  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/widgets/api/widgets-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/features/workspace/api/workspace-api.ts:1  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/hooks/assistant-chats-dependencies.hooks.ts:15  '../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/integrations/chart-providers/chart-registry-dependencies.hooks.ts:3  '@/lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/integrations/jini-admin/__tests__/comments-ports.unit.test.ts:4  '../../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/integrations/jini-admin/comments-ports.ts:9  '../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/integrations/jini-admin/forms-ports.ts:6  '../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/integrations/jini-admin/media-ports.ts:5  '../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/integrations/jini-admin/redirects-ports.ts:7  '../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/integrations/jini-admin/seo-ports.ts:5  '../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/integrations/jini-admin/widgets-ports.ts:5  '../../lib/admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/lib/admin-http/request.ts:7  './config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/lib/admin-http/urls.ts:1  './config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/lib/assistant-permanent-deletes.ts:2  './admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/lib/assistant-subagents.ts:2  './admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/lib/visitor-tools.ts:2  './admin-http/config' -> '@jini-ai/admin/shell/lib/admin-http/config'
apps/admin/src/App.hooks.ts:23  './lib/agent-screenshot-bus' -> '@jini-ai/admin/shell/lib/agent-screenshot-bus'
apps/admin/src/__tests__/unit/app-hooks-admin-capability-executors.unit.test.tsx:4  '../../lib/agent-screenshot-bus' -> '@jini-ai/admin/shell/lib/agent-screenshot-bus'
apps/admin/src/__tests__/unit/app-hooks-announcements.unit.test.tsx:9  '../../lib/agent-screenshot-bus' -> '@jini-ai/admin/shell/lib/agent-screenshot-bus'
apps/admin/src/__tests__/unit/app-shell-chrome.unit.test.tsx:12  '../../lib/agent-screenshot-bus' -> '@jini-ai/admin/shell/lib/agent-screenshot-bus'
apps/admin/src/App.hooks.ts:22  './lib/agent-screenshot' -> '@jini-ai/admin/shell/lib/agent-screenshot'
apps/admin/src/__tests__/unit/app-hooks-admin-capability-executors.unit.test.tsx:5  '../../lib/agent-screenshot' -> '@jini-ai/admin/shell/lib/agent-screenshot'
apps/admin/src/features/settings/SettingsUi.tsx:139  '../../lib/app-version' -> '@jini-ai/admin/shell/lib/app-version'
apps/admin/src/features/settings/__tests__/SettingsUi.unit.test.tsx:13  '@/lib/app-version' -> '@jini-ai/admin/shell/lib/app-version'
apps/admin/src/lib/admin-failure-channel.ts:7  './app-version' -> '@jini-ai/admin/shell/lib/app-version'
apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx:17  '../../lib/ascii-slug' -> '@jini-ai/admin/shell/lib/ascii-slug'
apps/admin/src/features/ai-assistant/VisitorToolsPanel.tsx:14  '../../lib/ascii-slug' -> '@jini-ai/admin/shell/lib/ascii-slug'
apps/admin/src/features/deployment/rules.ts:5  '../../lib/ascii-slug' -> '@jini-ai/admin/shell/lib/ascii-slug'
apps/admin/src/features/media/hooks/media-dependencies.hooks.ts:6  '../../../lib/ascii-slug' -> '@jini-ai/admin/shell/lib/ascii-slug'
apps/admin/src/features/themes/hooks/themes-dependencies.hooks.ts:5  '../../../lib/ascii-slug' -> '@jini-ai/admin/shell/lib/ascii-slug'
apps/admin/src/App.hooks.ts:47  './lib/assistant-dock-bus' -> '@jini-ai/admin/shell/lib/assistant-dock-bus'
apps/admin/src/components/AssistantDock/__tests__/AssistantDock.hooks.unit.test.tsx:28  '@/lib/assistant-dock-bus' -> '@jini-ai/admin/shell/lib/assistant-dock-bus'
apps/admin/src/components/AssistantDock/__tests__/daemon-prewarm-error.unit.test.tsx:3  '@/lib/assistant-dock-bus' -> '@jini-ai/admin/shell/lib/assistant-dock-bus'
apps/admin/src/components/AssistantDock/__tests__/daemon-starting-label.integration.test.tsx:9  '@/lib/assistant-dock-bus' -> '@jini-ai/admin/shell/lib/assistant-dock-bus'
apps/admin/src/components/AssistantDock/hooks/assistant-transport.hooks.ts:2  '@/lib/assistant-dock-bus' -> '@jini-ai/admin/shell/lib/assistant-dock-bus'
apps/admin/src/components/AssistantDock/hooks/composer-discovery.hooks.ts:4  '@/lib/assistant-dock-bus' -> '@jini-ai/admin/shell/lib/assistant-dock-bus'
apps/admin/src/components/__tests__/AssistantDock.hooks.unit.test.tsx:112  '../../lib/assistant-dock-bus' -> '@jini-ai/admin/shell/lib/assistant-dock-bus'
apps/admin/src/features/ai-assistant/__tests__/AiAssistant.unit.test.tsx:7  '../../../lib/assistant-dock-bus' -> '@jini-ai/admin/shell/lib/assistant-dock-bus'
apps/admin/src/features/ai-assistant/__tests__/use-admin-assistant-switch.hooks.unit.test.ts:25  '../../../lib/assistant-dock-bus' -> '@jini-ai/admin/shell/lib/assistant-dock-bus'
apps/admin/src/features/ai-assistant/hooks/use-admin-assistant-switch.hooks.ts:3  '@/lib/assistant-dock-bus' -> '@jini-ai/admin/shell/lib/assistant-dock-bus'
apps/admin/src/features/sites/__tests__/use-site-transfer.hooks.unit.test.tsx:9  '@/lib/assistant-dock-bus' -> '@jini-ai/admin/shell/lib/assistant-dock-bus'
apps/admin/src/lib/__tests__/assistant-prompt-bus.unit.test.ts:6  '../assistant-dock-bus' -> '@jini-ai/admin/shell/lib/assistant-dock-bus'
apps/admin/src/lib/admin-frontend-session.ts:3  './assistant-dock-bus' -> '@jini-ai/admin/shell/lib/assistant-dock-bus'
apps/admin/src/lib/assistant-prompt-bus.ts:3  './assistant-dock-bus' -> '@jini-ai/admin/shell/lib/assistant-dock-bus'
apps/admin/src/lib/media-embed-extension.tsx:5  './block-atom-insert' -> '@jini-ai/admin/shell/lib/block-atom-insert'
apps/admin/src/lib/widget-embed-extension.tsx:5  './block-atom-insert' -> '@jini-ai/admin/shell/lib/block-atom-insert'
```

## Tovu tests that must stay green (24; import lines are repointed above, assertions untouched)
- `apps/admin/src/__tests__/admin-boot-readers.test.tsx`
- `apps/admin/src/__tests__/unit/app-hooks-admin-capability-executors.unit.test.tsx`
- `apps/admin/src/__tests__/unit/app-hooks-announcements.unit.test.tsx`
- `apps/admin/src/__tests__/unit/app-session-failure-reset.unit.test.tsx`
- `apps/admin/src/__tests__/unit/app-shell-chrome.unit.test.tsx`
- `apps/admin/src/components/AssistantDock/__tests__/AssistantDock.hooks.unit.test.tsx`
- `apps/admin/src/components/AssistantDock/__tests__/daemon-prewarm-error.unit.test.tsx`
- `apps/admin/src/components/AssistantDock/__tests__/daemon-starting-label.integration.test.tsx`
- `apps/admin/src/components/__tests__/AssistantDock.hooks.unit.test.tsx`
- `apps/admin/src/features/ai-assistant/__tests__/AiAssistant.unit.test.tsx`
- `apps/admin/src/features/ai-assistant/__tests__/use-admin-assistant-switch.hooks.unit.test.ts`
- `apps/admin/src/features/content-analysis/__tests__/use-content-analysis.hooks.unit.test.tsx`
- `apps/admin/src/features/dashboard/__tests__/use-dashboard-port.unit.test.ts`
- `apps/admin/src/features/settings/__tests__/SettingsUi.unit.test.tsx`
- `apps/admin/src/features/sites/__tests__/use-site-transfer.hooks.unit.test.tsx`
- `apps/admin/src/hooks/__tests__/use-admin-locale.hooks.test.ts`
- `apps/admin/src/integrations/jini-admin/__tests__/comments-ports.unit.test.ts`
- `apps/admin/src/lib/__tests__/admin-failure-channel.assistant-cold.unit.test.ts`
- `apps/admin/src/lib/__tests__/admin-failure-channel.unit.test.ts`
- `apps/admin/src/lib/__tests__/admin-failure-channel.unknown-route.unit.test.ts`
- `apps/admin/src/lib/__tests__/api-connectors-policies-forms-seo-redirects-posts.unit.test.ts`
- `apps/admin/src/lib/__tests__/assistant-prompt-bus.unit.test.ts`
- `apps/admin/src/lib/__tests__/durable-run-subscription.unit.test.ts`
- `apps/admin/src/lib/__tests__/site-url.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/admin/src/lib/addons-routes.ts` (2)
- `apps/admin/src/lib/admin-boot-scope.ts` (1)
- `apps/admin/src/lib/admin-dev-origin.ts` (3)
- `apps/admin/src/lib/agent-screenshot.ts` (3)
- `apps/admin/src/lib/app-version.ts` (4)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/admin/src/lib/admin-dev-origin.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/admin/src/lib/agent-screenshot-bus.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/admin/src/lib/agent-screenshot.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/admin/src/lib/app-version.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/admin/src/lib/admin-dev-origin.ts:21: export const ADMIN_DEV_SERVER_PORT: string = __TOVU_ADMIN_DEV_PORT__;
apps/admin/src/lib/app-version.ts:12: export const TOVU_ADMIN_VERSION = __TOVU_ADMIN_VERSION__;
```

## Named mutation
in the Jini copy of `agent-screenshot.ts`, negate the first `if (` condition of its first exported function; `agent-screenshot.unit.test.ts` must go red, then revert
