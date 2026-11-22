# A-adm-other-3 — adm-other → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:27 T:29. Depends on: A-adm-other-1. Est: J 76 min, T 90 min.

## J — move verbatim into Jini (14 files, 996 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/features/seo/api/seo-api.types.ts` | `packages/admin/src/screens/seo/api/seo-api.types.ts` | 127 |  |
| `apps/admin/src/features/settings/api/settings-api.types.ts` | `packages/admin/src/screens/settings/api/settings-api.types.ts` | 16 |  |
| `apps/admin/src/features/settings/hooks/use-settings-active-tab-scroll.hooks.ts` | `packages/admin/src/screens/settings/hooks/use-settings-active-tab-scroll.hooks.ts` | 39 |  |
| `apps/admin/src/features/settings/user-interface-settings.css` | `packages/admin/src/screens/settings/user-interface-settings.css` | 10 |  |
| `apps/admin/src/features/skills/skill-drop.ts` | `packages/admin/src/screens/skills/skill-drop.ts` | 79 |  |
| `apps/admin/src/features/skills/skills-page-dictionary.ts` | `packages/admin/src/screens/skills/skills-page-dictionary.ts` | 259 |  |
| `apps/admin/src/features/skills/skills.css` | `packages/admin/src/screens/skills/skills.css` | 45 |  |
| `apps/admin/src/features/taxonomy/api/taxonomy-api.types.ts` | `packages/admin/src/screens/taxonomy/api/taxonomy-api.types.ts` | 51 |  |
| `apps/admin/src/features/taxonomy/html-rules.ts` | `packages/admin/src/screens/taxonomy/html-rules.ts` | 11 |  |
| `apps/admin/src/features/taxonomy/TaxonomyRowMenu.hooks.ts` | `packages/admin/src/screens/taxonomy/TaxonomyRowMenu.hooks.ts` | 163 |  |
| `apps/admin/src/features/trash/api/trash-api.types.ts` | `packages/admin/src/screens/trash/api/trash-api.types.ts` | 67 |  |
| `apps/admin/src/features/webmcp/browser-agent-settings.hooks.ts` | `packages/admin/src/screens/webmcp/browser-agent-settings.hooks.ts` | 60 | W1 |
| `apps/admin/src/features/widgets/api/widgets-api.types.ts` | `packages/admin/src/screens/widgets/api/widgets-api.types.ts` | 54 |  |
| `apps/admin/src/features/analytics/hooks/analytics-port.hooks.ts` | `packages/admin/src/screens/analytics/hooks/analytics-port.hooks.ts` | 15 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./screens/analytics/hooks/analytics-port.hooks"]
- "@jini-ai/admin" exports["./screens/settings/api/settings-api.types"]
- "@jini-ai/admin" exports["./screens/settings/hooks/use-settings-active-tab-scroll.hooks"]
- "@jini-ai/admin" exports["./screens/settings/user-interface-settings"]
- "@jini-ai/admin" exports["./screens/skills/skill-drop"]
- "@jini-ai/admin" exports["./screens/skills/skills"]
- "@jini-ai/admin" exports["./screens/skills/skills-page-dictionary"]
- "@jini-ai/admin" exports["./screens/taxonomy/TaxonomyRowMenu.hooks"]
- "@jini-ai/admin" exports["./screens/taxonomy/api/taxonomy-api.types"]
- "@jini-ai/admin" exports["./screens/taxonomy/html-rules"]
- "@jini-ai/admin" exports["./screens/trash/api/trash-api.types"]
- "@jini-ai/admin" exports["./screens/webmcp/browser-agent-settings.hooks"]
- "@jini-ai/admin" exports["./screens/widgets/api/widgets-api.types"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (2, 293 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/features/settings/__tests__/use-settings-active-tab-scroll.hooks.unit.test.tsx`
- `apps/admin/src/features/taxonomy/__tests__/TaxonomyRowMenu.hooks.unit.test.tsx`


## T — Tovu repoint: delete the 14 sources, rewrite every importer (84 lines)

```
apps/admin/src/features/settings/api/settings-api.ts:5  './settings-api.types' -> '@jini-ai/admin/screens/settings/api/settings-api.types'
apps/admin/src/features/settings/SettingsUi.tsx:135  './hooks/use-settings-active-tab-scroll.hooks' -> '@jini-ai/admin/screens/settings/hooks/use-settings-active-tab-scroll.hooks'
apps/admin/src/features/settings/UserInterfaceSettingsPanel.tsx:4  './user-interface-settings.css' -> '@jini-ai/admin/screens/settings/user-interface-settings'
apps/admin/src/components/AssistantDock/hooks/composer-files.hooks.ts:2  '@/features/skills/skill-drop' -> '@jini-ai/admin/screens/skills/skill-drop'
apps/admin/src/features/skills/__tests__/chat-drop.unit.test.tsx:5  '../skill-drop' -> '@jini-ai/admin/screens/skills/skill-drop'
apps/admin/src/features/skills/__tests__/skill-dialogs-and-row.unit.test.tsx:5  '../skill-drop' -> '@jini-ai/admin/screens/skills/skill-drop'
apps/admin/src/features/skills/skills-i18n.ts:4  './skills-page-dictionary' -> '@jini-ai/admin/screens/skills/skills-page-dictionary'
apps/admin/src/features/skills/SkillInstallConfirmation.tsx:8  './skills.css' -> '@jini-ai/admin/screens/skills/skills'
apps/admin/src/features/skills/Skills.tsx:16  './skills.css' -> '@jini-ai/admin/screens/skills/skills'
apps/admin/src/features/database/api/database-api.ts:3  '../../taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/database/hooks/migrate-forward-section-dependencies.hooks.ts:1  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/database/hooks/migrate-forward-section-port.hooks.ts:1  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/recovery/api/recovery-api.ts:2  '../../taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/recovery/hooks/restore-flow-dependencies.hooks.ts:1  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/recovery/hooks/restore-flow-port.hooks.ts:1  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/Taxonomy.tsx:1  './api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/TermPicker.tsx:4  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/__tests__/Taxonomy.unit.test.tsx:5  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/__tests__/TermPicker.unit.test.tsx:9  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/__tests__/html-embed.unit.test.tsx:5  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/__tests__/rules.unit.test.ts:3  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/__tests__/taxonomy-agent-drive.unit.test.tsx:6  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/__tests__/use-merge-term-section.stale-failures.unit.test.tsx:6  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/__tests__/use-merge-term-section.unit.test.tsx:7  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/__tests__/use-new-term-form.unit.test.tsx:7  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/__tests__/use-taxonomy-html-embed.unit.test.tsx:3  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/__tests__/use-term-detail-panel.unit.test.tsx:7  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/__tests__/use-term-picker.unit.test.tsx:8  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/api/taxonomy-api.ts:2  './taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/hooks/merge-term-section-port.hooks.ts:1  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/hooks/new-taxonomy-form-port.hooks.ts:1  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/hooks/new-term-form-port.hooks.ts:1  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/hooks/taxonomy-dependencies.hooks.ts:1  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/hooks/taxonomy-port.hooks.ts:1  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/hooks/term-picker-dependencies.hooks.ts:1  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/hooks/term-picker-port.hooks.ts:1  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/hooks/use-merge-term-section.hooks.ts:2  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/hooks/use-new-term-form.hooks.ts:2  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/hooks/use-taxonomy-html-embed.hooks.ts:2  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/hooks/use-taxonomy.hooks.ts:2  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/hooks/use-term-detail-panel.hooks.ts:2  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/hooks/use-term-list-reveal.hooks.ts:2  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/hooks/use-term-picker.hooks.ts:2  '@/features/taxonomy/api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/rules.ts:1  './api/taxonomy-api.types' -> '@jini-ai/admin/screens/taxonomy/api/taxonomy-api.types'
apps/admin/src/features/taxonomy/__tests__/html-embed.unit.test.tsx:9  '../html-rules' -> '@jini-ai/admin/screens/taxonomy/html-rules'
apps/admin/src/features/taxonomy/hooks/use-taxonomy-html-embed.hooks.ts:4  '../html-rules' -> '@jini-ai/admin/screens/taxonomy/html-rules'
apps/admin/src/components/AssistantDock/DockSettingsMenu.tsx:7  '@/features/taxonomy/TaxonomyRowMenu.hooks' -> '@jini-ai/admin/screens/taxonomy/TaxonomyRowMenu.hooks'
apps/admin/src/components/AssistantDock/__tests__/DockSettingsMenu.unit.test.tsx:5  '@/features/taxonomy/TaxonomyRowMenu.hooks' -> '@jini-ai/admin/screens/taxonomy/TaxonomyRowMenu.hooks'
apps/admin/src/features/taxonomy/TaxonomyRowMenu.tsx:5  './TaxonomyRowMenu.hooks' -> '@jini-ai/admin/screens/taxonomy/TaxonomyRowMenu.hooks'
apps/admin/src/features/trash/Trash.tsx:5  './api/trash-api.types' -> '@jini-ai/admin/screens/trash/api/trash-api.types'
apps/admin/src/features/trash/__tests__/Trash.unit.test.tsx:5  '@/features/trash/api/trash-api.types' -> '@jini-ai/admin/screens/trash/api/trash-api.types'
apps/admin/src/features/trash/__tests__/rules.unit.test.ts:2  '@/features/trash/api/trash-api.types' -> '@jini-ai/admin/screens/trash/api/trash-api.types'
apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx:5  '@/features/trash/api/trash-api.types' -> '@jini-ai/admin/screens/trash/api/trash-api.types'
apps/admin/src/features/trash/api/trash-api.ts:4  './trash-api.types' -> '@jini-ai/admin/screens/trash/api/trash-api.types'
apps/admin/src/features/trash/hooks/trash-dependencies.hooks.ts:3  '@/features/trash/api/trash-api.types' -> '@jini-ai/admin/screens/trash/api/trash-api.types'
apps/admin/src/features/trash/hooks/trash-port.hooks.ts:2  '@/features/trash/api/trash-api.types' -> '@jini-ai/admin/screens/trash/api/trash-api.types'
apps/admin/src/features/trash/hooks/use-trash.hooks.ts:3  '@/features/trash/api/trash-api.types' -> '@jini-ai/admin/screens/trash/api/trash-api.types'
apps/admin/src/features/trash/rules.ts:2  '@/features/trash/api/trash-api.types' -> '@jini-ai/admin/screens/trash/api/trash-api.types'
apps/admin/src/App.hooks.ts:12  './features/webmcp/browser-agent-settings.hooks' -> '@jini-ai/admin/screens/webmcp/browser-agent-settings.hooks'
apps/admin/src/__tests__/unit/app-hooks-admin-webmcp.unit.test.tsx:8  '../../features/webmcp/browser-agent-settings.hooks' -> '@jini-ai/admin/screens/webmcp/browser-agent-settings.hooks'
apps/admin/src/components/AssistantDock/AssistantDock.state.hooks.ts:15  '../../features/webmcp/browser-agent-settings.hooks' -> '@jini-ai/admin/screens/webmcp/browser-agent-settings.hooks'
apps/admin/src/components/__tests__/AssistantDock.unit.test.tsx:7  '../../features/webmcp/browser-agent-settings.hooks' -> '@jini-ai/admin/screens/webmcp/browser-agent-settings.hooks'
apps/admin/src/features/webmcp/BrowserAgentSettingsPanel.tsx:2  './browser-agent-settings.hooks' -> '@jini-ai/admin/screens/webmcp/browser-agent-settings.hooks'
apps/admin/src/features/webmcp/__tests__/browser-agent-settings.unit.test.tsx:6  '../browser-agent-settings.hooks' -> '@jini-ai/admin/screens/webmcp/browser-agent-settings.hooks'
apps/admin/src/features/webmcp/admin-page-tools.ts:7  './browser-agent-settings.hooks' -> '@jini-ai/admin/screens/webmcp/browser-agent-settings.hooks'
apps/admin/src/components/EmbedInsertControl/EmbedInsertControl.tsx:5  '../../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx:6  '../../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.hooks.tsx:4  '../../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.tsx:5  '../../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/components/WidgetPickerDialog/widget-picker-dependencies.hooks.ts:1  '../../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/components/WidgetPickerDialog/widget-picker-port.hooks.ts:1  '../../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/components/__tests__/EmbedInsertControl.unit.test.tsx:7  '../../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/components/__tests__/WidgetConfigFields.unit.test.tsx:8  '../../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/components/__tests__/WidgetPickerDialog.hooks.unit.test.tsx:6  '../../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/components/__tests__/WidgetPickerDialog.hooks.unit.test.tsx:279  '../../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/components/__tests__/WidgetPickerDialog.hooks.unit.test.tsx:279  '../../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/components/__tests__/agent-handle-batch3.unit.test.tsx:7  '../../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/features/widgets/api/widgets-api.ts:4  './widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/integrations/jini-admin/__tests__/widgets-swap.unit.test.tsx:18  '../../../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/integrations/jini-admin/widgets-module.hooks.ts:5  '../../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/lib/widget-embed-extension.hooks.ts:5  '../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/lib/widget-embed-extension.tsx:4  '../features/widgets/api/widgets-api.types' -> '@jini-ai/admin/screens/widgets/api/widgets-api.types'
apps/admin/src/features/analytics/hooks/analytics-dependencies.hooks.ts:3  './analytics-port.hooks' -> '@jini-ai/admin/screens/analytics/hooks/analytics-port.hooks'
apps/admin/src/features/analytics/hooks/use-analytics.hooks.ts:8  './analytics-port.hooks' -> '@jini-ai/admin/screens/analytics/hooks/analytics-port.hooks'
```

## Tovu tests that must stay green (25; import lines are repointed above, assertions untouched)
- `apps/admin/src/__tests__/unit/app-hooks-admin-webmcp.unit.test.tsx`
- `apps/admin/src/components/AssistantDock/__tests__/DockSettingsMenu.unit.test.tsx`
- `apps/admin/src/components/__tests__/AssistantDock.unit.test.tsx`
- `apps/admin/src/components/__tests__/EmbedInsertControl.unit.test.tsx`
- `apps/admin/src/components/__tests__/WidgetConfigFields.unit.test.tsx`
- `apps/admin/src/components/__tests__/WidgetPickerDialog.hooks.unit.test.tsx`
- `apps/admin/src/components/__tests__/agent-handle-batch3.unit.test.tsx`
- `apps/admin/src/features/skills/__tests__/chat-drop.unit.test.tsx`
- `apps/admin/src/features/skills/__tests__/skill-dialogs-and-row.unit.test.tsx`
- `apps/admin/src/features/taxonomy/__tests__/Taxonomy.unit.test.tsx`
- `apps/admin/src/features/taxonomy/__tests__/TermPicker.unit.test.tsx`
- `apps/admin/src/features/taxonomy/__tests__/html-embed.unit.test.tsx`
- `apps/admin/src/features/taxonomy/__tests__/rules.unit.test.ts`
- `apps/admin/src/features/taxonomy/__tests__/taxonomy-agent-drive.unit.test.tsx`
- `apps/admin/src/features/taxonomy/__tests__/use-merge-term-section.stale-failures.unit.test.tsx`
- `apps/admin/src/features/taxonomy/__tests__/use-merge-term-section.unit.test.tsx`
- `apps/admin/src/features/taxonomy/__tests__/use-new-term-form.unit.test.tsx`
- `apps/admin/src/features/taxonomy/__tests__/use-taxonomy-html-embed.unit.test.tsx`
- `apps/admin/src/features/taxonomy/__tests__/use-term-detail-panel.unit.test.tsx`
- `apps/admin/src/features/taxonomy/__tests__/use-term-picker.unit.test.tsx`
- `apps/admin/src/features/trash/__tests__/Trash.unit.test.tsx`
- `apps/admin/src/features/trash/__tests__/rules.unit.test.ts`
- `apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx`
- `apps/admin/src/features/webmcp/__tests__/browser-agent-settings.unit.test.tsx`
- `apps/admin/src/integrations/jini-admin/__tests__/widgets-swap.unit.test.tsx`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/admin/src/features/webmcp/browser-agent-settings.hooks.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/admin/src/features/webmcp/browser-agent-settings.hooks.ts:13: export const WEBMCP_PREFERENCE_KEY = "tovu.admin.webmcp.enabled";
```

## Named mutation
in the Jini copy of `skills-page-dictionary.ts`, negate the first `if (` condition of its first exported function; `use-settings-active-tab-scroll.hooks.unit.test.tsx` must go red, then revert
