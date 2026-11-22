# A-adm-other-2 — adm-other → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:26 T:28. Depends on: none (only already-Jini code). Est: J 76 min, T 98 min.

## J — move verbatim into Jini (14 files, 542 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/import-export/api/import-export-api.types.ts` | `packages/admin/src/screens/import-export/api/import-export-api.types.ts` | 22 |  |
| `apps/admin/src/features/import-export/import-export-links.ts` | `packages/admin/src/screens/import-export/import-export-links.ts` | 19 |  |
| `apps/admin/src/features/menus/api/menus-api.types.ts` | `packages/admin/src/screens/menus/api/menus-api.types.ts` | 52 |  |
| `apps/admin/src/features/observability/api/observability-api.types.ts` | `packages/admin/src/screens/observability/api/observability-api.types.ts` | 54 |  |
| `apps/admin/src/features/observability/queries-panel.tsx` | `packages/admin/src/screens/observability/queries-panel.tsx` | 29 |  |
| `apps/admin/src/features/observability/recent-errors.css` | `packages/admin/src/screens/observability/recent-errors.css` | 103 | W1 |
| `apps/admin/src/features/plugins/api/plugins-api.types.ts` | `packages/admin/src/screens/plugins/api/plugins-api.types.ts` | 94 | W1 |
| `apps/admin/src/features/plugins/hooks/agent-plugin-memory-port.hooks.ts` | `packages/admin/src/screens/plugins/hooks/agent-plugin-memory-port.hooks.ts` | 11 |  |
| `apps/admin/src/features/plugins/hooks/use-plugin-row-focus.hooks.ts` | `packages/admin/src/screens/plugins/hooks/use-plugin-row-focus.hooks.ts` | 21 |  |
| `apps/admin/src/features/plugins/package-file-tree.ts` | `packages/admin/src/screens/plugins/package-file-tree.ts` | 11 |  |
| `apps/admin/src/features/plugins/provider-settings-dialog.css` | `packages/admin/src/screens/plugins/provider-settings-dialog.css` | 36 |  |
| `apps/admin/src/features/plugins/selected-skills.ts` | `packages/admin/src/screens/plugins/selected-skills.ts` | 30 |  |
| `apps/admin/src/features/providers/always-allow.css` | `packages/admin/src/screens/providers/always-allow.css` | 13 |  |
| `apps/admin/src/features/redirects/api/redirects-api.types.ts` | `packages/admin/src/screens/redirects/api/redirects-api.types.ts` | 47 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./screens/import-export/api/import-export-api.types"]
- "@jini-ai/admin" exports["./screens/import-export/import-export-links"]
- "@jini-ai/admin" exports["./screens/menus/api/menus-api.types"]
- "@jini-ai/admin" exports["./screens/observability/api/observability-api.types"]
- "@jini-ai/admin" exports["./screens/observability/queries-panel"]
- "@jini-ai/admin" exports["./screens/observability/recent-errors"]
- "@jini-ai/admin" exports["./screens/plugins/api/plugins-api.types"]
- "@jini-ai/admin" exports["./screens/plugins/hooks/agent-plugin-memory-port.hooks"]
- "@jini-ai/admin" exports["./screens/plugins/hooks/use-plugin-row-focus.hooks"]
- "@jini-ai/admin" exports["./screens/plugins/package-file-tree"]
- "@jini-ai/admin" exports["./screens/plugins/provider-settings-dialog"]
- "@jini-ai/admin" exports["./screens/plugins/selected-skills"]
- "@jini-ai/admin" exports["./screens/providers/always-allow"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (3, 276 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/features/observability/__tests__/queries-panel-default.unit.test.tsx`
- `apps/admin/src/features/plugins/__tests__/package-file-tree.unit.test.ts`
- `apps/admin/src/features/plugins/__tests__/selected-skills.unit.test.ts`


## T — Tovu repoint: delete the 14 sources, rewrite every importer (89 lines)

```
apps/admin/src/features/deployment/StaticSiteTab.tsx:15  '../import-export/api/import-export-api.types' -> '@jini-ai/admin/screens/import-export/api/import-export-api.types'
apps/admin/src/features/deployment/hooks/__tests__/static-export-dependencies.unit.test.ts:3  '@/features/import-export/api/import-export-api.types' -> '@jini-ai/admin/screens/import-export/api/import-export-api.types'
apps/admin/src/features/deployment/hooks/__tests__/use-static-export.unit.test.tsx:9  '@/features/import-export/api/import-export-api.types' -> '@jini-ai/admin/screens/import-export/api/import-export-api.types'
apps/admin/src/features/deployment/hooks/static-export-dependencies.hooks.ts:1  '@/features/import-export/api/import-export-api.types' -> '@jini-ai/admin/screens/import-export/api/import-export-api.types'
apps/admin/src/features/deployment/hooks/static-export-port.hooks.ts:1  '@/features/import-export/api/import-export-api.types' -> '@jini-ai/admin/screens/import-export/api/import-export-api.types'
apps/admin/src/features/deployment/hooks/use-static-export.hooks.ts:3  '@/features/import-export/api/import-export-api.types' -> '@jini-ai/admin/screens/import-export/api/import-export-api.types'
apps/admin/src/features/deployment/rules.ts:4  '../import-export/api/import-export-api.types' -> '@jini-ai/admin/screens/import-export/api/import-export-api.types'
apps/admin/src/features/import-export/api/import-export-api.ts:3  './import-export-api.types' -> '@jini-ai/admin/screens/import-export/api/import-export-api.types'
apps/admin/src/features/import-export/ImportExport.tsx:6  './import-export-links' -> '@jini-ai/admin/screens/import-export/import-export-links'
apps/admin/src/__tests__/fqfix-editor-reopen.unit.test.tsx:6  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx:5  '../../features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/components/WidgetConfigFields/widget-config-fields-dependencies.hooks.ts:3  '../../features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/components/WidgetConfigFields/widget-config-fields-port.hooks.ts:2  '../../features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/MenuEditor.hooks.tsx:1  './api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/MenuEditor.tsx:4  './api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/MenuPageLinkFields.hooks.ts:2  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/MenuPageLinkFields.tsx:1  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/__tests__/MenuEditor.header-characterization.unit.test.tsx:4  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/__tests__/MenuEditor.remove-hook.unit.test.tsx:4  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/__tests__/MenuEditor.unit.test.tsx:7  '../api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/__tests__/MenuPageLinkFields.hooks.unit.test.ts:4  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/__tests__/html-embed.unit.test.tsx:4  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/__tests__/legacy-page-picker.unit.test.tsx:3  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/__tests__/menu-authoring-ux.unit.test.tsx:6  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/__tests__/menu-html-mode.unit.test.tsx:5  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/__tests__/page-choices.hooks.unit.test.tsx:3  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/__tests__/page-link-fields.unit.test.tsx:3  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/__tests__/use-menu-editor.hooks.unit.test.tsx:4  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/__tests__/use-menus.hooks.unit.test.tsx:7  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/api/menus-api.ts:3  './menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/hooks/menus-dependencies.hooks.ts:3  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/hooks/menus-port.hooks.ts:1  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts:4  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/hooks/use-menus.hooks.ts:4  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/html-rules.ts:1  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/menus/page-link-rules.ts:1  '@/features/menus/api/menus-api.types' -> '@jini-ai/admin/screens/menus/api/menus-api.types'
apps/admin/src/features/observability/__tests__/Observability.unit.test.tsx:7  '@/features/observability/api/observability-api.types' -> '@jini-ai/admin/screens/observability/api/observability-api.types'
apps/admin/src/features/observability/__tests__/recent-errors-rules.unit.test.ts:3  '@/features/observability/api/observability-api.types' -> '@jini-ai/admin/screens/observability/api/observability-api.types'
apps/admin/src/features/observability/__tests__/use-recent-server-errors.hooks.unit.test.ts:4  '@/features/observability/api/observability-api.types' -> '@jini-ai/admin/screens/observability/api/observability-api.types'
apps/admin/src/features/observability/api/observability-api.ts:4  './observability-api.types' -> '@jini-ai/admin/screens/observability/api/observability-api.types'
apps/admin/src/features/observability/hooks/observability-status-dependencies.hooks.ts:1  '@/features/observability/api/observability-api.types' -> '@jini-ai/admin/screens/observability/api/observability-api.types'
apps/admin/src/features/observability/hooks/observability-status-port.hooks.ts:1  '@/features/observability/api/observability-api.types' -> '@jini-ai/admin/screens/observability/api/observability-api.types'
apps/admin/src/features/observability/hooks/recent-server-errors-dependencies.hooks.ts:3  '@/features/observability/api/observability-api.types' -> '@jini-ai/admin/screens/observability/api/observability-api.types'
apps/admin/src/features/observability/hooks/recent-server-errors-port.hooks.ts:1  '@/features/observability/api/observability-api.types' -> '@jini-ai/admin/screens/observability/api/observability-api.types'
apps/admin/src/features/observability/hooks/use-observability-status.hooks.ts:4  '@/features/observability/api/observability-api.types' -> '@jini-ai/admin/screens/observability/api/observability-api.types'
apps/admin/src/features/observability/hooks/use-recent-server-errors.hooks.ts:5  '@/features/observability/api/observability-api.types' -> '@jini-ai/admin/screens/observability/api/observability-api.types'
apps/admin/src/features/observability/recent-errors-rules.ts:1  '@/features/observability/api/observability-api.types' -> '@jini-ai/admin/screens/observability/api/observability-api.types'
apps/admin/src/features/observability/Observability.tsx:11  './queries-panel' -> '@jini-ai/admin/screens/observability/queries-panel'
apps/admin/src/features/observability/__tests__/queries-panel.unit.test.tsx:7  '../queries-panel' -> '@jini-ai/admin/screens/observability/queries-panel'
apps/admin/src/features/observability/recent-errors-panel.tsx:3  './recent-errors.css' -> '@jini-ai/admin/screens/observability/recent-errors'
apps/admin/src/features/integrations/api/integrations-api.types.ts:2  '../../plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/PluginPackageFilesModal.tsx:1  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/PluginProviderSettingField.hooks.ts:2  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/PluginProviderSettingField.tsx:5  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/PluginProviderSettingsDialog.tsx:6  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/PluginRow.tsx:4  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/Plugins.tsx:3  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/__tests__/Plugins.unit.test.tsx:7  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/__tests__/b15-row-panel-ownership.unit.test.tsx:7  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/__tests__/plugin-conflicts-rules.unit.test.ts:3  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/__tests__/plugin-ports.unit.test.ts:3  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/__tests__/plugin-provider-settings.unit.test.tsx:4  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/__tests__/plugins-rules.unit.test.ts:3  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/__tests__/use-plugin-package-files.hooks.unit.test.ts:4  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/__tests__/use-plugins.hooks.unit.test.ts:4  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/api/plugins-api.ts:3  './plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/hooks/plugin-install-port.hooks.ts:1  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/hooks/plugins-dependencies.hooks.ts:1  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/hooks/plugins-port.hooks.ts:1  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/hooks/use-plugin-provider-settings.hooks.ts:4  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/hooks/use-plugins.hooks.ts:4  '@/features/plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/plugins/rules.ts:2  './api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/features/skills/api.ts:3  '../plugins/api/plugins-api.types' -> '@jini-ai/admin/screens/plugins/api/plugins-api.types'
apps/admin/src/__tests__/fqfix-editor-reopen.unit.test.tsx:16  '@/features/plugins/hooks/agent-plugin-memory-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/agent-plugin-memory-port.hooks'
apps/admin/src/features/plugins/__tests__/agent-plugin-memory-panel.unit.test.tsx:8  '../hooks/agent-plugin-memory-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/agent-plugin-memory-port.hooks'
apps/admin/src/features/plugins/__tests__/agent-plugin-memory.hooks.unit.test.ts:7  '../hooks/agent-plugin-memory-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/agent-plugin-memory-port.hooks'
apps/admin/src/features/plugins/hooks/agent-plugin-memory-dependencies.hooks.ts:3  './agent-plugin-memory-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/agent-plugin-memory-port.hooks'
apps/admin/src/features/plugins/hooks/use-agent-plugin-memory.hooks.ts:8  './agent-plugin-memory-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/agent-plugin-memory-port.hooks'
apps/admin/src/features/plugins/PluginRow.tsx:10  './hooks/use-plugin-row-focus.hooks' -> '@jini-ai/admin/screens/plugins/hooks/use-plugin-row-focus.hooks'
apps/admin/src/features/plugins/PackageFilesModal.tsx:8  './package-file-tree' -> '@jini-ai/admin/screens/plugins/package-file-tree'
apps/admin/src/features/plugins/hooks/use-package-file-tree.hooks.ts:9  '../package-file-tree' -> '@jini-ai/admin/screens/plugins/package-file-tree'
apps/admin/src/features/plugins/rules.ts:8  './package-file-tree' -> '@jini-ai/admin/screens/plugins/package-file-tree'
apps/admin/src/features/plugins/PluginProviderSettingsDialog.tsx:12  './provider-settings-dialog.css' -> '@jini-ai/admin/screens/plugins/provider-settings-dialog'
apps/admin/src/components/AssistantDock/__tests__/composer-selected-skills.unit.test.tsx:13  '@/features/plugins/selected-skills' -> '@jini-ai/admin/screens/plugins/selected-skills'
apps/admin/src/components/AssistantDock/hooks/composer-skills.hooks.ts:5  '@/features/plugins/selected-skills' -> '@jini-ai/admin/screens/plugins/selected-skills'
apps/admin/src/components/AssistantDock/hooks/resolve-composer-discovery-outcome.ts:8  '@/features/plugins/selected-skills' -> '@jini-ai/admin/screens/plugins/selected-skills'
apps/admin/src/components/AssistantDock/hooks/run-context.hooks.ts:2  '@/features/plugins/selected-skills' -> '@jini-ai/admin/screens/plugins/selected-skills'
apps/admin/src/lib/assistant-transport.ts:4  '@/features/plugins/selected-skills' -> '@jini-ai/admin/screens/plugins/selected-skills'
apps/admin/src/features/providers/AlwaysAllowPanel.tsx:4  './always-allow.css' -> '@jini-ai/admin/screens/providers/always-allow'
```

## Tovu tests that must stay green (30; import lines are repointed above, assertions untouched)
- `apps/admin/src/__tests__/fqfix-editor-reopen.unit.test.tsx`
- `apps/admin/src/components/AssistantDock/__tests__/composer-selected-skills.unit.test.tsx`
- `apps/admin/src/features/deployment/hooks/__tests__/static-export-dependencies.unit.test.ts`
- `apps/admin/src/features/deployment/hooks/__tests__/use-static-export.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/MenuEditor.header-characterization.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/MenuEditor.remove-hook.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/MenuEditor.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/MenuPageLinkFields.hooks.unit.test.ts`
- `apps/admin/src/features/menus/__tests__/html-embed.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/legacy-page-picker.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/menu-authoring-ux.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/menu-html-mode.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/page-choices.hooks.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/page-link-fields.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/use-menu-editor.hooks.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/use-menus.hooks.unit.test.tsx`
- `apps/admin/src/features/observability/__tests__/Observability.unit.test.tsx`
- `apps/admin/src/features/observability/__tests__/queries-panel.unit.test.tsx`
- `apps/admin/src/features/observability/__tests__/recent-errors-rules.unit.test.ts`
- `apps/admin/src/features/observability/__tests__/use-recent-server-errors.hooks.unit.test.ts`
- `apps/admin/src/features/plugins/__tests__/Plugins.unit.test.tsx`
- `apps/admin/src/features/plugins/__tests__/agent-plugin-memory-panel.unit.test.tsx`
- `apps/admin/src/features/plugins/__tests__/agent-plugin-memory.hooks.unit.test.ts`
- `apps/admin/src/features/plugins/__tests__/b15-row-panel-ownership.unit.test.tsx`
- `apps/admin/src/features/plugins/__tests__/plugin-conflicts-rules.unit.test.ts`
- `apps/admin/src/features/plugins/__tests__/plugin-ports.unit.test.ts`
- `apps/admin/src/features/plugins/__tests__/plugin-provider-settings.unit.test.tsx`
- `apps/admin/src/features/plugins/__tests__/plugins-rules.unit.test.ts`
- `apps/admin/src/features/plugins/__tests__/use-plugin-package-files.hooks.unit.test.ts`
- `apps/admin/src/features/plugins/__tests__/use-plugins.hooks.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/admin/src/features/observability/recent-errors.css` (1)
- `apps/admin/src/features/plugins/api/plugins-api.types.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/admin/src/features/import-export/api/import-export-api.types.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/admin/src/features/observability/api/observability-api.types.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why
- `apps/admin/src/features/redirects/api/redirects-api.types.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/admin/src/features/observability/recent-errors.css:5: Tovu's `--surface`/`--fg`, and the tab follows whichever theme Jini resolves.
```

## Class names (Jini packages use `jini-*`)
- `apps/admin/src/features/observability/queries-panel.tsx`: rename its own class names to `jini-<block>__<element>` in the same commit as the matching CSS selectors; list every rename in the step report

## Named mutation
in the Jini copy of `recent-errors.css`, negate the first `if (` condition of its first exported function; `queries-panel-default.unit.test.tsx` must go red, then revert
