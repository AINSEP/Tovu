# A-adm-shell-components-1 — adm-shell-components → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:28 T:29. Depends on: none (only already-Jini code). Est: J 82 min, T 39 min.

## J — move verbatim into Jini (14 files, 917 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/components/AdminFailureNotice/admin-failure-notice.css` | `packages/admin/src/shell/components/AdminFailureNotice/admin-failure-notice.css` | 14 |  |
| `apps/admin/src/components/AssistantDock/agent-failure-scanners.ts` | `packages/admin/src/shell/components/AssistantDock/agent-failure-scanners.ts` | 214 |  |
| `apps/admin/src/components/AssistantDock/hooks/chat-package-kind.ts` | `packages/admin/src/shell/components/AssistantDock/hooks/chat-package-kind.ts` | 111 | W5 |
| `apps/admin/src/components/AssistantDock/hooks/use-composer-send-stop-guard.hooks.ts` | `packages/admin/src/shell/components/AssistantDock/hooks/use-composer-send-stop-guard.hooks.ts` | 46 |  |
| `apps/admin/src/components/AssistantDock/hooks/useOverflowDetection.hooks.ts` | `packages/admin/src/shell/components/AssistantDock/hooks/useOverflowDetection.hooks.ts` | 80 |  |
| `apps/admin/src/components/ConfirmActionDialog.tsx` | `packages/admin/src/shell/components/ConfirmActionDialog.tsx` | 38 |  |
| `apps/admin/src/components/DevicePreview/DevicePreview.hooks.ts` | `packages/admin/src/shell/components/DevicePreview/DevicePreview.hooks.ts` | 171 |  |
| `apps/admin/src/components/InstallTabCard/install-tab-card.css` | `packages/admin/src/shell/components/InstallTabCard/install-tab-card.css` | 68 |  |
| `apps/admin/src/components/InstallTabCard/use-zip-drop.hooks.ts` | `packages/admin/src/shell/components/InstallTabCard/use-zip-drop.hooks.ts` | 33 |  |
| `apps/admin/src/components/line-icon.ts` | `packages/admin/src/shell/components/line-icon.ts` | 19 |  |
| `apps/admin/src/components/MailStatusBanner/mail-status-banner.css` | `packages/admin/src/shell/components/MailStatusBanner/mail-status-banner.css` | 31 |  |
| `apps/admin/src/components/ServerRestartingBanner/server-restarting-banner.css` | `packages/admin/src/shell/components/ServerRestartingBanner/server-restarting-banner.css` | 16 |  |
| `apps/admin/src/components/TemplateSource/template-source-port.hooks.ts` | `packages/admin/src/shell/components/TemplateSource/template-source-port.hooks.ts` | 24 |  |
| `apps/admin/src/components/TemplateSource/ViewTemplateButton.tsx` | `packages/admin/src/shell/components/TemplateSource/ViewTemplateButton.tsx` | 52 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./shell/components/AdminFailureNotice/admin-failure-notice"]
- "@jini-ai/admin" exports["./shell/components/AssistantDock/agent-failure-scanners"]
- "@jini-ai/admin" exports["./shell/components/AssistantDock/hooks/chat-package-kind"]
- "@jini-ai/admin" exports["./shell/components/AssistantDock/hooks/use-composer-send-stop-guard.hooks"]
- "@jini-ai/admin" exports["./shell/components/AssistantDock/hooks/useOverflowDetection.hooks"]
- "@jini-ai/admin" exports["./shell/components/ConfirmActionDialog"]
- "@jini-ai/admin" exports["./shell/components/DevicePreview/DevicePreview.hooks"]
- "@jini-ai/admin" exports["./shell/components/InstallTabCard/install-tab-card"]
- "@jini-ai/admin" exports["./shell/components/InstallTabCard/use-zip-drop.hooks"]
- "@jini-ai/admin" exports["./shell/components/MailStatusBanner/mail-status-banner"]
- "@jini-ai/admin" exports["./shell/components/ServerRestartingBanner/server-restarting-banner"]
- "@jini-ai/admin" exports["./shell/components/TemplateSource/ViewTemplateButton"]
- "@jini-ai/admin" exports["./shell/components/TemplateSource/template-source-port.hooks"]
- "@jini-ai/admin" exports["./shell/components/line-icon"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (5, 630 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/components/AssistantDock/__tests__/chat-package-kind.unit.test.ts`
- `apps/admin/src/components/AssistantDock/__tests__/use-composer-send-stop-guard.hooks.unit.test.tsx`
- `apps/admin/src/components/AssistantDock/hooks/__tests__/useOverflowDetection.hooks.unit.test.ts`
- `apps/admin/src/components/__tests__/DevicePreview.hooks.unit.test.ts`
- `apps/admin/src/components/TemplateSource/__tests__/ViewTemplateButton.unit.test.tsx`


## T — Tovu repoint: delete the 14 sources, rewrite every importer (38 lines)

```
apps/admin/src/components/AdminFailureNotice/AdminFailureNotice.tsx:5  './admin-failure-notice.css' -> '@jini-ai/admin/shell/components/AdminFailureNotice/admin-failure-notice'
apps/admin/src/components/AssistantDock/agent-failure.ts:4  './agent-failure-scanners' -> '@jini-ai/admin/shell/components/AssistantDock/agent-failure-scanners'
apps/admin/src/components/AssistantDock/hooks/composer-files.hooks.ts:1  './chat-package-kind' -> '@jini-ai/admin/shell/components/AssistantDock/hooks/chat-package-kind'
apps/admin/src/components/AssistantDock/AssistantDock.state.hooks.ts:14  './hooks/use-composer-send-stop-guard.hooks' -> '@jini-ai/admin/shell/components/AssistantDock/hooks/use-composer-send-stop-guard.hooks'
apps/admin/src/components/AssistantDock/OverflowAwareMcpUiSurfaceCard.tsx:4  './hooks/useOverflowDetection.hooks' -> '@jini-ai/admin/shell/components/AssistantDock/hooks/useOverflowDetection.hooks'
apps/admin/src/features/plugins/AgentPluginDisableConfirmDialog.tsx:1  '../../components/ConfirmActionDialog' -> '@jini-ai/admin/shell/components/ConfirmActionDialog'
apps/admin/src/features/plugins/PluginRemoveConfirmDialog.tsx:1  '../../components/ConfirmActionDialog' -> '@jini-ai/admin/shell/components/ConfirmActionDialog'
apps/admin/src/features/settings/ExternalMcpRemoveConfirmDialog.tsx:1  '../../components/ConfirmActionDialog' -> '@jini-ai/admin/shell/components/ConfirmActionDialog'
apps/admin/src/components/DevicePreview/DevicePreviewFrame.tsx:3  './DevicePreview.hooks' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks'
apps/admin/src/components/DevicePreview/DevicePreviewToggle.tsx:8  './DevicePreview.hooks' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks'
apps/admin/src/components/WidgetConfigFields/WidgetPreview.hooks.ts:2  '../DevicePreview/DevicePreview.hooks' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks'
apps/admin/src/components/device-preview-icons.tsx:3  './DevicePreview/DevicePreview.hooks' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks'
apps/admin/src/features/email/EmailTemplateEditor.tsx:10  '../../components/DevicePreview/DevicePreview.hooks' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks'
apps/admin/src/features/email/hooks/use-email-template-view.hooks.ts:7  '../../../components/DevicePreview/DevicePreview.hooks' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks'
apps/admin/src/features/pages/PageEditor.tsx:20  '../../components/DevicePreview/DevicePreview.hooks' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks'
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:13  '@/components/DevicePreview/DevicePreview.hooks' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks'
apps/admin/src/features/posts/editor/preview/PostPreview.tsx:1  '../../../../components/DevicePreview/DevicePreview.hooks' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks'
apps/admin/src/features/posts/editor/view-bar/PostEditorViewBar.tsx:5  '../../../../components/DevicePreview/DevicePreview.hooks' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks'
apps/admin/src/features/posts/hooks/use-post-editor-screen.hooks.ts:5  '../../../components/DevicePreview/DevicePreview.hooks' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks'
apps/admin/src/features/themes/ThemeExplore.tsx:11  '../../components/DevicePreview/DevicePreview.hooks' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks'
apps/admin/src/components/InstallTabCard/InstallTabCard.tsx:4  './install-tab-card.css' -> '@jini-ai/admin/shell/components/InstallTabCard/install-tab-card'
apps/admin/src/components/InstallTabCard/InstallTabCard.tsx:3  './use-zip-drop.hooks' -> '@jini-ai/admin/shell/components/InstallTabCard/use-zip-drop.hooks'
apps/admin/src/components/InstallTabCard/__tests__/use-zip-drop.hooks.unit.test.tsx:5  '../use-zip-drop.hooks' -> '@jini-ai/admin/shell/components/InstallTabCard/use-zip-drop.hooks'
apps/admin/src/features/plugins/hooks/use-agent-plugin-install.hooks.ts:6  '../../../components/InstallTabCard/use-zip-drop.hooks' -> '@jini-ai/admin/shell/components/InstallTabCard/use-zip-drop.hooks'
apps/admin/src/features/plugins/hooks/use-plugin-install.hooks.ts:6  '../../../components/InstallTabCard/use-zip-drop.hooks' -> '@jini-ai/admin/shell/components/InstallTabCard/use-zip-drop.hooks'
apps/admin/src/features/deployment/deployment-visuals.tsx:1  '../../components/line-icon' -> '@jini-ai/admin/shell/components/line-icon'
apps/admin/src/features/observability/observability-visuals.tsx:1  '../../components/line-icon' -> '@jini-ai/admin/shell/components/line-icon'
apps/admin/src/features/plugins/agent-plugins-visuals.tsx:1  '../../components/line-icon' -> '@jini-ai/admin/shell/components/line-icon'
apps/admin/src/features/plugins/plugins-visuals.tsx:1  '../../components/line-icon' -> '@jini-ai/admin/shell/components/line-icon'
apps/admin/src/features/roles/Roles.hooks.tsx:1  '../../components/line-icon' -> '@jini-ai/admin/shell/components/line-icon'
apps/admin/src/features/security/security-visuals.tsx:1  '../../components/line-icon' -> '@jini-ai/admin/shell/components/line-icon'
apps/admin/src/features/source-control/source-control-visuals.tsx:1  '../../components/line-icon' -> '@jini-ai/admin/shell/components/line-icon'
apps/admin/src/components/MailStatusBanner/MailStatusBanner.tsx:7  './mail-status-banner.css' -> '@jini-ai/admin/shell/components/MailStatusBanner/mail-status-banner'
apps/admin/src/components/ServerRestartingBanner/ServerRestartingBanner.tsx:4  './server-restarting-banner.css' -> '@jini-ai/admin/shell/components/ServerRestartingBanner/server-restarting-banner'
apps/admin/src/components/TemplateSource/template-source-dependencies.hooks.ts:1  './template-source-port.hooks' -> '@jini-ai/admin/shell/components/TemplateSource/template-source-port.hooks'
apps/admin/src/components/TemplateSource/use-template-source.hooks.ts:8  './template-source-port.hooks' -> '@jini-ai/admin/shell/components/TemplateSource/template-source-port.hooks'
apps/admin/src/features/pages/PageEditor.tsx:36  '../../components/TemplateSource/ViewTemplateButton' -> '@jini-ai/admin/shell/components/TemplateSource/ViewTemplateButton'
apps/admin/src/features/posts/editor/template/PostEditorTemplatePicker.tsx:1  '../../../../components/TemplateSource/ViewTemplateButton' -> '@jini-ai/admin/shell/components/TemplateSource/ViewTemplateButton'
```

## Tovu tests that must stay green (1; import lines are repointed above, assertions untouched)
- `apps/admin/src/components/InstallTabCard/__tests__/use-zip-drop.hooks.unit.test.tsx`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/admin/src/components/AssistantDock/hooks/chat-package-kind.ts` (5)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/admin/src/components/AssistantDock/hooks/chat-package-kind.ts:14: const PACKAGE_MARKER = /^(?:[^/]+\/)?(?:SKILL\.md|(?:jini|tovu)\.plugin\.json|plugin\.json)$/;
apps/admin/src/components/AssistantDock/hooks/chat-package-kind.ts:62: if (names.has("jini.plugin.json") || names.has("tovu.plugin.json")) return "site-plugin"; // tovu.plugin.json: legacy alias
apps/admin/src/components/AssistantDock/hooks/chat-package-kind.ts:98: const pluginRoots = new Set(roots.filter((root, index) => root && (paths[index] === `${root}plugin.json` || paths[index] === `${root}jini.pl
```

## Class names (Jini packages use `jini-*`)
- `apps/admin/src/components/ConfirmActionDialog.tsx`: rename its own class names to `jini-<block>__<element>` in the same commit as the matching CSS selectors; list every rename in the step report
- `apps/admin/src/components/TemplateSource/ViewTemplateButton.tsx`: rename its own class names to `jini-<block>__<element>` in the same commit as the matching CSS selectors; list every rename in the step report

## Named mutation
in the Jini copy of `agent-failure-scanners.ts`, negate the first `if (` condition of its first exported function; `chat-package-kind.unit.test.ts` must go red, then revert
