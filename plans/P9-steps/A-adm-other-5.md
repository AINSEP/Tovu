# A-adm-other-5 — adm-other → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:34 T:35. Depends on: A-adm-shell-lib-3, A-adm-other-2, A-adm-shell-components-1. Est: J 81 min, T 43 min.

## J — move verbatim into Jini (14 files, 808 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/media/hooks/use-media-tabs.hooks.ts` | `packages/admin/src/screens/media/hooks/use-media-tabs.hooks.ts` | 73 |  |
| `apps/admin/src/features/menus/MenuEditor.hooks.tsx` | `packages/admin/src/screens/menus/MenuEditor.hooks.tsx` | 57 |  |
| `apps/admin/src/features/menus/page-link-rules.ts` | `packages/admin/src/screens/menus/page-link-rules.ts` | 91 |  |
| `apps/admin/src/features/observability/hooks/observability-status-port.hooks.ts` | `packages/admin/src/screens/observability/hooks/observability-status-port.hooks.ts` | 12 |  |
| `apps/admin/src/features/observability/hooks/recent-server-errors-port.hooks.ts` | `packages/admin/src/screens/observability/hooks/recent-server-errors-port.hooks.ts` | 13 |  |
| `apps/admin/src/features/observability/observability-visuals.tsx` | `packages/admin/src/screens/observability/observability-visuals.tsx` | 83 |  |
| `apps/admin/src/features/observability/recent-errors-rules.ts` | `packages/admin/src/screens/observability/recent-errors-rules.ts` | 237 | W1 |
| `apps/admin/src/features/plugins/hooks/plugin-install-port.hooks.ts` | `packages/admin/src/screens/plugins/hooks/plugin-install-port.hooks.ts` | 20 |  |
| `apps/admin/src/features/plugins/hooks/plugins-port.hooks.ts` | `packages/admin/src/screens/plugins/hooks/plugins-port.hooks.ts` | 34 |  |
| `apps/admin/src/features/plugins/hooks/use-agent-plugin-tab.hooks.ts` | `packages/admin/src/screens/plugins/hooks/use-agent-plugin-tab.hooks.ts` | 22 |  |
| `apps/admin/src/features/plugins/hooks/use-package-file-tree.hooks.ts` | `packages/admin/src/screens/plugins/hooks/use-package-file-tree.hooks.ts` | 120 |  |
| `apps/admin/src/features/plugins/PluginProviderSettingField.hooks.ts` | `packages/admin/src/screens/plugins/PluginProviderSettingField.hooks.ts` | 18 |  |
| `apps/admin/src/features/providers/Providers.hooks.ts` | `packages/admin/src/screens/providers/Providers.hooks.ts` | 7 |  |
| `apps/admin/src/features/skills/use-skills-tabs.hooks.ts` | `packages/admin/src/screens/skills/use-skills-tabs.hooks.ts` | 21 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./screens/media/hooks/use-media-tabs.hooks"]
- "@jini-ai/admin" exports["./screens/menus/MenuEditor.hooks"]
- "@jini-ai/admin" exports["./screens/menus/page-link-rules"]
- "@jini-ai/admin" exports["./screens/observability/hooks/observability-status-port.hooks"]
- "@jini-ai/admin" exports["./screens/observability/hooks/recent-server-errors-port.hooks"]
- "@jini-ai/admin" exports["./screens/observability/observability-visuals"]
- "@jini-ai/admin" exports["./screens/observability/recent-errors-rules"]
- "@jini-ai/admin" exports["./screens/plugins/PluginProviderSettingField.hooks"]
- "@jini-ai/admin" exports["./screens/plugins/hooks/plugin-install-port.hooks"]
- "@jini-ai/admin" exports["./screens/plugins/hooks/plugins-port.hooks"]
- "@jini-ai/admin" exports["./screens/plugins/hooks/use-agent-plugin-tab.hooks"]
- "@jini-ai/admin" exports["./screens/plugins/hooks/use-package-file-tree.hooks"]
- "@jini-ai/admin" exports["./screens/providers/Providers.hooks"]
- "@jini-ai/admin" exports["./screens/skills/use-skills-tabs.hooks"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (5, 496 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/features/menus/__tests__/MenuEditor.remove-hook.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/page-target-kind.unit.test.ts`
- `apps/admin/src/features/observability/__tests__/observability-visuals.unit.test.tsx`
- `apps/admin/src/features/observability/__tests__/recent-errors-rules.unit.test.ts`
- `apps/admin/src/features/plugins/__tests__/use-package-file-tree.hooks.unit.test.ts`


## T — Tovu repoint: delete the 14 sources, rewrite every importer (37 lines)

```
apps/admin/src/features/media/Media.hooks.tsx:3  './hooks/use-media-tabs.hooks' -> '@jini-ai/admin/screens/media/hooks/use-media-tabs.hooks'
apps/admin/src/features/media/Media.tsx:38  './hooks/use-media-tabs.hooks' -> '@jini-ai/admin/screens/media/hooks/use-media-tabs.hooks'
apps/admin/src/features/media/__tests__/use-media-tabs.hooks.unit.test.tsx:5  '../hooks/use-media-tabs.hooks' -> '@jini-ai/admin/screens/media/hooks/use-media-tabs.hooks'
apps/admin/src/features/media/hooks/use-media-item-link.hooks.ts:5  './use-media-tabs.hooks' -> '@jini-ai/admin/screens/media/hooks/use-media-tabs.hooks'
apps/admin/src/features/media/rules.ts:6  './hooks/use-media-tabs.hooks' -> '@jini-ai/admin/screens/media/hooks/use-media-tabs.hooks'
apps/admin/src/features/menus/MenuEditor.tsx:7  './MenuEditor.hooks' -> '@jini-ai/admin/screens/menus/MenuEditor.hooks'
apps/admin/src/features/menus/MenuEditor.tsx:9  './page-link-rules' -> '@jini-ai/admin/screens/menus/page-link-rules'
apps/admin/src/features/menus/MenuEditor.tsx:12  './page-link-rules' -> '@jini-ai/admin/screens/menus/page-link-rules'
apps/admin/src/features/menus/MenuPageLinkFields.hooks.ts:3  './page-link-rules' -> '@jini-ai/admin/screens/menus/page-link-rules'
apps/admin/src/features/menus/MenuPageLinkFields.tsx:2  './page-link-rules' -> '@jini-ai/admin/screens/menus/page-link-rules'
apps/admin/src/features/menus/__tests__/page-choices.hooks.unit.test.tsx:6  '../page-link-rules' -> '@jini-ai/admin/screens/menus/page-link-rules'
apps/admin/src/features/menus/hooks/menus-port.hooks.ts:2  '../page-link-rules' -> '@jini-ai/admin/screens/menus/page-link-rules'
apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts:15  '../page-link-rules' -> '@jini-ai/admin/screens/menus/page-link-rules'
apps/admin/src/features/menus/html-rules.ts:2  './page-link-rules' -> '@jini-ai/admin/screens/menus/page-link-rules'
apps/admin/src/features/observability/hooks/observability-status-dependencies.hooks.ts:3  './observability-status-port.hooks' -> '@jini-ai/admin/screens/observability/hooks/observability-status-port.hooks'
apps/admin/src/features/observability/hooks/use-observability-status.hooks.ts:9  './observability-status-port.hooks' -> '@jini-ai/admin/screens/observability/hooks/observability-status-port.hooks'
apps/admin/src/features/observability/hooks/recent-server-errors-dependencies.hooks.ts:5  './recent-server-errors-port.hooks' -> '@jini-ai/admin/screens/observability/hooks/recent-server-errors-port.hooks'
apps/admin/src/features/observability/hooks/use-recent-server-errors.hooks.ts:18  './recent-server-errors-port.hooks' -> '@jini-ai/admin/screens/observability/hooks/recent-server-errors-port.hooks'
apps/admin/src/features/observability/Observability.tsx:6  './observability-visuals' -> '@jini-ai/admin/screens/observability/observability-visuals'
apps/admin/src/features/observability/recent-errors-panel.tsx:4  './observability-visuals' -> '@jini-ai/admin/screens/observability/observability-visuals'
apps/admin/src/features/observability/hooks/use-recent-server-errors.hooks.ts:16  '../recent-errors-rules' -> '@jini-ai/admin/screens/observability/recent-errors-rules'
apps/admin/src/features/plugins/__tests__/PluginsAddTab.unit.test.tsx:8  '../hooks/plugin-install-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/plugin-install-port.hooks'
apps/admin/src/features/plugins/__tests__/plugin-install-preview-rules.unit.test.ts:5  '../hooks/plugin-install-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/plugin-install-port.hooks'
apps/admin/src/features/plugins/__tests__/plugin-ports.unit.test.ts:9  '../hooks/plugin-install-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/plugin-install-port.hooks'
apps/admin/src/features/plugins/__tests__/use-plugin-install.hooks.unit.test.ts:7  '../hooks/plugin-install-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/plugin-install-port.hooks'
apps/admin/src/features/plugins/hooks/plugin-install-dependencies.hooks.ts:3  './plugin-install-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/plugin-install-port.hooks'
apps/admin/src/features/plugins/hooks/use-plugin-install.hooks.ts:4  './plugin-install-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/plugin-install-port.hooks'
apps/admin/src/features/plugins/hooks/use-plugins.hooks.ts:14  './plugin-install-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/plugin-install-port.hooks'
apps/admin/src/features/plugins/rules.ts:9  './hooks/plugin-install-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/plugin-install-port.hooks'
apps/admin/src/features/plugins/hooks/plugins-dependencies.hooks.ts:7  './plugins-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/plugins-port.hooks'
apps/admin/src/features/plugins/hooks/use-plugin-provider-settings.hooks.ts:9  './plugins-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/plugins-port.hooks'
apps/admin/src/features/plugins/hooks/use-plugins.hooks.ts:11  './plugins-port.hooks' -> '@jini-ai/admin/screens/plugins/hooks/plugins-port.hooks'
apps/admin/src/features/plugins/AgentPlugins.tsx:29  './hooks/use-agent-plugin-tab.hooks' -> '@jini-ai/admin/screens/plugins/hooks/use-agent-plugin-tab.hooks'
apps/admin/src/features/plugins/PackageFilesModal.tsx:9  './hooks/use-package-file-tree.hooks' -> '@jini-ai/admin/screens/plugins/hooks/use-package-file-tree.hooks'
apps/admin/src/features/plugins/PluginProviderSettingField.tsx:1  './PluginProviderSettingField.hooks' -> '@jini-ai/admin/screens/plugins/PluginProviderSettingField.hooks'
apps/admin/src/features/providers/Providers.tsx:1  './Providers.hooks' -> '@jini-ai/admin/screens/providers/Providers.hooks'
apps/admin/src/features/skills/use-skills.hooks.ts:6  './use-skills-tabs.hooks' -> '@jini-ai/admin/screens/skills/use-skills-tabs.hooks'
```

## Tovu tests that must stay green (6; import lines are repointed above, assertions untouched)
- `apps/admin/src/features/media/__tests__/use-media-tabs.hooks.unit.test.tsx`
- `apps/admin/src/features/menus/__tests__/page-choices.hooks.unit.test.tsx`
- `apps/admin/src/features/plugins/__tests__/PluginsAddTab.unit.test.tsx`
- `apps/admin/src/features/plugins/__tests__/plugin-install-preview-rules.unit.test.ts`
- `apps/admin/src/features/plugins/__tests__/plugin-ports.unit.test.ts`
- `apps/admin/src/features/plugins/__tests__/use-plugin-install.hooks.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/admin/src/features/observability/recent-errors-rules.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/admin/src/features/observability/recent-errors-rules.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `recent-errors-rules.ts`, negate the first `if (` condition of its first exported function; `recent-errors-rules.unit.test.ts` must go red, then revert
