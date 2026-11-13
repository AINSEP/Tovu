### tovu:apps/admin/src/features/plugins/AgentPluginRow.tsx
- **Over:** `AgentPluginRow` 138 (file 258)
- **Phase:** after-move (DELETE-AFTER-PARITY) · **Batch:** size-47
- **Tests:** `apps/admin/src/features/plugins/__tests__/AgentPluginRow.unit.test.tsx`, `apps/admin/src/features/plugins/__tests__/b15-row-panel-ownership.unit.test.tsx`, `apps/admin/src/features/plugins/__tests__/agent-plugin-sign-in-status.unit.test.tsx`, `apps/admin/src/features/plugins/__tests__/agent-plugin-update.unit.test.tsx`
- **Responsibility map:** `AgentPluginRow` JSX = A the expand toggle `<button` (glyph, heading, status/compat/blurb lines, chevron) · B `manage` slot + `<div className="agent-plugin-row-actions">` (state area, Inspect, honest-disabled Uninstall) · C detail panel `<div className="agent-plugin-row-detail"`.
- **Splits:**
  1. SUB-COMPONENT `AgentPluginRowToggle({ plugin, displayName, expanded, detailId, headingId, onToggleExpanded, agentHandleBase, Glyph, t, blurb }): ReactNode` (same file, above `AgentPluginRow`) ← the first `<button` inside `<div className="agent-plugin-row-main">` with all its inner comments.
  2. SUB-COMPONENT `AgentPluginRowActions({ plugin, displayName, t, locale, busy, stateControl, onInspect, uninstallNoteId, agentHandleBase, … }): ReactNode` ← from the "Outside the actions column" comment + `{manage ? …}` through the closing `</div>` of `agent-plugin-row-actions` (include `manage`). Exact prop list = the names that block reads (take them from `AgentPluginRow`'s destructure).
  `AgentPluginRow` keeps its destructure, `displayName`/`blurb`/`Glyph`/`useId` locals, the main wrapper and the detail panel.
- **Importers to update:** none.
- **After:** `AgentPluginRow` ~40; sub-components ~65 / ~55; file ~275.
- **Risks / notes:** `useId` calls stay in `AgentPluginRow` (ids passed down). Survey says DELETE-AFTER-PARITY — execute only if the delete slips.
