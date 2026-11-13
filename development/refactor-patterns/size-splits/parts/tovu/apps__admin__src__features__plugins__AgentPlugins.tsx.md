### tovu:apps/admin/src/features/plugins/AgentPlugins.tsx
- **Over:** `AgentPlugins` 110 (file 366)
- **Phase:** after-move (DELETE-AFTER-PARITY) · **Batch:** size-54
- **Tests:** `apps/admin/src/features/plugins/__tests__/AgentPlugins.unit.test.tsx`, `apps/admin/src/features/plugins/__tests__/AgentPluginsAddTab.unit.test.tsx`, `apps/admin/src/features/plugins/__tests__/agent-plugin-update.unit.test.tsx`
- **Responsibility map:** `AgentPlugins` = hooks + pending-disable state (stays) · tab model `const tabs: SettingsDialogTab[] = [` (54) · dialog + confirm render (stays).
- **Splits:**
  1. HELPER `buildAgentPluginTabs({ t, controller, agentPluginInstallPort, uninstallNoteId, onToggleEnabled, onRequestToggleEnabled, onRequestRemove, locale, installController }: BuildAgentPluginTabsInput): SettingsDialogTab[]` (same file, above `AgentPlugins`) ← `const tabs: SettingsDialogTab[] = [` … `];` with its comments. `AgentPlugins` calls it at the same spot.
- **Importers to update:** none.
- **After:** `AgentPlugins` ~58; file ~370.
- **Risks / notes:** types of `controller` / `installController`: use `ReturnType<…>` of the existing hooks or their exported types. DELETE-AFTER-PARITY.
