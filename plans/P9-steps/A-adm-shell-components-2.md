# A-adm-shell-components-2 — adm-shell-components → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:36 T:38. Depends on: A-adm-shell-components-1, A-adm-other-1, A-adm-shell-lib-2, A-adm-shell-lib-3, A-adm-other-2, A-adm-other-3. Est: J 73 min, T 32 min.

## J — move verbatim into Jini (11 files, 587 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/components/device-preview-icons.tsx` | `packages/admin/src/shell/components/device-preview-icons.tsx` | 80 |  |
| `apps/admin/src/components/DevicePreview/DevicePreviewFrame.tsx` | `packages/admin/src/shell/components/DevicePreview/DevicePreviewFrame.tsx` | 40 |  |
| `apps/admin/src/components/InstallTabCard/InstallTabCard.tsx` | `packages/admin/src/shell/components/InstallTabCard/InstallTabCard.tsx` | 176 |  |
| `apps/admin/src/components/MailStatusBanner/hooks/use-mail-status-banner.hooks.ts` | `packages/admin/src/shell/components/MailStatusBanner/hooks/use-mail-status-banner.hooks.ts` | 77 | W2 |
| `apps/admin/src/components/PlainTextBlocks.tsx` | `packages/admin/src/shell/components/PlainTextBlocks.tsx` | 34 |  |
| `apps/admin/src/components/ServerRestartingBanner/hooks/use-server-connection-status.hooks.ts` | `packages/admin/src/shell/components/ServerRestartingBanner/hooks/use-server-connection-status.hooks.ts` | 21 | W1 |
| `apps/admin/src/components/TemplateSource/template-source-dependencies.hooks.ts` | `packages/admin/src/shell/components/TemplateSource/template-source-dependencies.hooks.ts` | 42 |  |
| `apps/admin/src/components/WidgetConfigFields/widget-config-fields-port.hooks.ts` | `packages/admin/src/shell/components/WidgetConfigFields/widget-config-fields-port.hooks.ts` | 22 |  |
| `apps/admin/src/components/WidgetPickerDialog/widget-picker-port.hooks.ts` | `packages/admin/src/shell/components/WidgetPickerDialog/widget-picker-port.hooks.ts` | 24 | W1 |
| `apps/admin/src/components/DevicePreview/DevicePreviewToggle.tsx` | `packages/admin/src/shell/components/DevicePreview/DevicePreviewToggle.tsx` | 53 |  |
| `apps/admin/src/components/ServerRestartingBanner/ServerRestartingBanner.tsx` | `packages/admin/src/shell/components/ServerRestartingBanner/ServerRestartingBanner.tsx` | 18 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./shell/components/DevicePreview/DevicePreviewFrame"]
- "@jini-ai/admin" exports["./shell/components/DevicePreview/DevicePreviewToggle"]
- "@jini-ai/admin" exports["./shell/components/InstallTabCard/InstallTabCard"]
- "@jini-ai/admin" exports["./shell/components/MailStatusBanner/hooks/use-mail-status-banner.hooks"]
- "@jini-ai/admin" exports["./shell/components/PlainTextBlocks"]
- "@jini-ai/admin" exports["./shell/components/ServerRestartingBanner/ServerRestartingBanner"]
- "@jini-ai/admin" exports["./shell/components/TemplateSource/template-source-dependencies.hooks"]
- "@jini-ai/admin" exports["./shell/components/WidgetConfigFields/widget-config-fields-port.hooks"]
- "@jini-ai/admin" exports["./shell/components/WidgetPickerDialog/widget-picker-port.hooks"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (6, 285 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/components/__tests__/device-preview-icons.unit.test.tsx`
- `apps/admin/src/components/__tests__/DevicePreview.unit.test.tsx`
- `apps/admin/src/components/InstallTabCard/__tests__/InstallTabCard.unit.test.tsx`
- `apps/admin/src/components/InstallTabCard/__tests__/use-zip-drop.hooks.unit.test.tsx`
- `apps/admin/src/components/__tests__/PlainTextBlocks.unit.test.tsx`
- `apps/admin/src/components/__tests__/ServerRestartingBanner.unit.test.tsx`


## T — Tovu repoint: delete the 11 sources, rewrite every importer (24 lines)

```
apps/admin/src/components/WidgetConfigFields/MediaContentEditor.tsx:16  '../DevicePreview/DevicePreviewFrame' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreviewFrame'
apps/admin/src/features/email/EmailTemplateEditor.tsx:11  '../../components/DevicePreview/DevicePreviewFrame' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreviewFrame'
apps/admin/src/features/pages/PageEditor.tsx:21  '../../components/DevicePreview/DevicePreviewFrame' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreviewFrame'
apps/admin/src/features/posts/editor/preview/PostPreview.tsx:2  '../../../../components/DevicePreview/DevicePreviewFrame' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreviewFrame'
apps/admin/src/features/themes/ThemeExplore.tsx:12  '../../components/DevicePreview/DevicePreviewFrame' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreviewFrame'
apps/admin/src/features/plugins/AddAgentPluginPanel.tsx:3  '../../components/InstallTabCard/InstallTabCard' -> '@jini-ai/admin/shell/components/InstallTabCard/InstallTabCard'
apps/admin/src/features/plugins/AddPluginPanel.tsx:3  '../../components/InstallTabCard/InstallTabCard' -> '@jini-ai/admin/shell/components/InstallTabCard/InstallTabCard'
apps/admin/src/features/skills/Skills.tsx:12  '../../components/InstallTabCard/InstallTabCard' -> '@jini-ai/admin/shell/components/InstallTabCard/InstallTabCard'
apps/admin/src/components/MailStatusBanner/MailStatusBanner.tsx:6  './hooks/use-mail-status-banner.hooks' -> '@jini-ai/admin/shell/components/MailStatusBanner/hooks/use-mail-status-banner.hooks'
apps/admin/src/components/__tests__/MailStatusBanner.unit.test.tsx:13  '../MailStatusBanner/hooks/use-mail-status-banner.hooks' -> '@jini-ai/admin/shell/components/MailStatusBanner/hooks/use-mail-status-banner.hooks'
apps/admin/src/features/plugins/AgentPluginRow.tsx:7  '@/components/PlainTextBlocks' -> '@jini-ai/admin/shell/components/PlainTextBlocks'
apps/admin/src/features/skills/SkillRow.tsx:1  '@/components/PlainTextBlocks' -> '@jini-ai/admin/shell/components/PlainTextBlocks'
apps/admin/src/components/TemplateSource/__tests__/use-template-source.hooks.unit.test.ts:6  '../template-source-dependencies.hooks' -> '@jini-ai/admin/shell/components/TemplateSource/template-source-dependencies.hooks'
apps/admin/src/components/TemplateSource/use-template-source.hooks.ts:7  './template-source-dependencies.hooks' -> '@jini-ai/admin/shell/components/TemplateSource/template-source-dependencies.hooks'
apps/admin/src/components/WidgetConfigFields/widget-config-fields-dependencies.hooks.ts:9  './widget-config-fields-port.hooks' -> '@jini-ai/admin/shell/components/WidgetConfigFields/widget-config-fields-port.hooks'
apps/admin/src/components/EmbedInsertControl/EmbedInsertControl.hooks.tsx:2  '../WidgetPickerDialog/widget-picker-port.hooks' -> '@jini-ai/admin/shell/components/WidgetPickerDialog/widget-picker-port.hooks'
apps/admin/src/components/WidgetPickerDialog/WidgetPickerDialog.hooks.tsx:14  './widget-picker-port.hooks' -> '@jini-ai/admin/shell/components/WidgetPickerDialog/widget-picker-port.hooks'
apps/admin/src/components/WidgetPickerDialog/widget-picker-dependencies.hooks.ts:3  './widget-picker-port.hooks' -> '@jini-ai/admin/shell/components/WidgetPickerDialog/widget-picker-port.hooks'
apps/admin/src/components/__tests__/GalleryInsertControl.unit.test.tsx:5  '../WidgetPickerDialog/widget-picker-port.hooks' -> '@jini-ai/admin/shell/components/WidgetPickerDialog/widget-picker-port.hooks'
apps/admin/src/features/email/EmailTemplateEditor.tsx:12  '../../components/DevicePreview/DevicePreviewToggle' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreviewToggle'
apps/admin/src/features/pages/PageEditor.tsx:22  '../../components/DevicePreview/DevicePreviewToggle' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreviewToggle'
apps/admin/src/features/posts/editor/view-bar/PostEditorViewBar.tsx:6  '../../../../components/DevicePreview/DevicePreviewToggle' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreviewToggle'
apps/admin/src/features/themes/ThemeExplore.tsx:13  '../../components/DevicePreview/DevicePreviewToggle' -> '@jini-ai/admin/shell/components/DevicePreview/DevicePreviewToggle'
apps/admin/src/main.tsx:16  './components/ServerRestartingBanner/ServerRestartingBanner' -> '@jini-ai/admin/shell/components/ServerRestartingBanner/ServerRestartingBanner'
```

## Tovu tests that must stay green (3; import lines are repointed above, assertions untouched)
- `apps/admin/src/components/TemplateSource/__tests__/use-template-source.hooks.unit.test.ts`
- `apps/admin/src/components/__tests__/GalleryInsertControl.unit.test.tsx`
- `apps/admin/src/components/__tests__/MailStatusBanner.unit.test.tsx`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/admin/src/components/MailStatusBanner/hooks/use-mail-status-banner.hooks.ts` (2)
- `apps/admin/src/components/ServerRestartingBanner/hooks/use-server-connection-status.hooks.ts` (1)
- `apps/admin/src/components/WidgetPickerDialog/widget-picker-port.hooks.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/admin/src/components/MailStatusBanner/hooks/use-mail-status-banner.hooks.ts:14: export const MAIL_BANNER_DISMISSED_KEY = "tovu.admin.mail-status-banner.dismissed";
apps/admin/src/components/ServerRestartingBanner/hooks/use-server-connection-status.hooks.ts:9: unreachable: "Can't reach the Tovu server. It will retry when you try again.",
```

## Hook-injection gate (Jini `check:hook-injection`)
- `apps/admin/src/components/device-preview-icons.tsx` imports a custom hook module directly; in Jini the hook must arrive as a prop from the host (owner CI rule). Keep the hook file beside it; the Tovu screen that renders it passes the hook. If that needs more than a prop added at the single call site, STOP and report.
- `apps/admin/src/components/DevicePreview/DevicePreviewFrame.tsx` imports a custom hook module directly; in Jini the hook must arrive as a prop from the host (owner CI rule). Keep the hook file beside it; the Tovu screen that renders it passes the hook. If that needs more than a prop added at the single call site, STOP and report.
- `apps/admin/src/components/InstallTabCard/InstallTabCard.tsx` imports a custom hook module directly; in Jini the hook must arrive as a prop from the host (owner CI rule). Keep the hook file beside it; the Tovu screen that renders it passes the hook. If that needs more than a prop added at the single call site, STOP and report.
- `apps/admin/src/components/DevicePreview/DevicePreviewToggle.tsx` imports a custom hook module directly; in Jini the hook must arrive as a prop from the host (owner CI rule). Keep the hook file beside it; the Tovu screen that renders it passes the hook. If that needs more than a prop added at the single call site, STOP and report.
- `apps/admin/src/components/ServerRestartingBanner/ServerRestartingBanner.tsx` imports a custom hook module directly; in Jini the hook must arrive as a prop from the host (owner CI rule). Keep the hook file beside it; the Tovu screen that renders it passes the hook. If that needs more than a prop added at the single call site, STOP and report.

## Class names (Jini packages use `jini-*`)
- `apps/admin/src/components/DevicePreview/DevicePreviewFrame.tsx`: rename its own class names to `jini-<block>__<element>` in the same commit as the matching CSS selectors; list every rename in the step report
- `apps/admin/src/components/InstallTabCard/InstallTabCard.tsx`: rename its own class names to `jini-<block>__<element>` in the same commit as the matching CSS selectors; list every rename in the step report
- `apps/admin/src/components/PlainTextBlocks.tsx`: rename its own class names to `jini-<block>__<element>` in the same commit as the matching CSS selectors; list every rename in the step report
- `apps/admin/src/components/DevicePreview/DevicePreviewToggle.tsx`: rename its own class names to `jini-<block>__<element>` in the same commit as the matching CSS selectors; list every rename in the step report

## Named mutation
in the Jini copy of `InstallTabCard.tsx`, negate the first `if (` condition of its first exported function; `InstallTabCard.unit.test.tsx` must go red, then revert
