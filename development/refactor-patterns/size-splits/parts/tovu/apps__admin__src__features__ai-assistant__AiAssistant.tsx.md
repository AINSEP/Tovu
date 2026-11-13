### tovu:apps/admin/src/features/ai-assistant/AiAssistant.tsx
- **Over:** file 655 lines · `AiAssistant` 118 · `VisitorCredentialForm` 108
- **Phase:** after-move (MIXED; STAY-PRODUCT `AiAssistant` screen) · **Batch:** size-46
- **Tests:** `apps/admin/src/features/ai-assistant/__tests__/AiAssistant.unit.test.tsx`, `apps/admin/src/features/ai-assistant/__tests__/VisitorCredentialForm.unit.test.tsx`, `apps/admin/src/features/ai-assistant/__tests__/AdminExecutionMode.unit.test.tsx`, `apps/admin/src/features/ai-assistant/__tests__/AssistantDaemonRestart.unit.test.tsx`, `apps/admin/src/features/ai-assistant/__tests__/byok-no-key-message-i18n.unit.test.tsx`, `apps/admin/src/hooks/__tests__/tovu-execution-entry-points.integration.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `RoadmapItem`, `ROADMAP`, `TabIcon`, `RoadmapChecklist`, `AiAssistantLocaleSync`, `AiAssistantProps`, `AiAssistant` | screen shell + tabs (stays) |
| B | `AdminAssistantSwitch*`, `AdminExecutionMode*`, `resolve*Hook`, `resolveT`, `AssistantDaemonRestart*`, `assistantDaemonStatusMessage`, `assistantRestartResultMessage`, `adminExecutionByok` | admin-assistant controls (stays) |
| C | `VisitorCredentialKeyFooterProps`, `VisitorCredentialSettingsFooterProps`, `visitorCredentialKeyIdleMessage`, `visitorCredentialKeyStatusMessage`, `VisitorCredentialKeyActionsProps`, `VisitorCredentialKeyActions`, `VisitorCredentialKeyFooter`, `VisitorCredentialSettingsFooter`, re-export `visitorCredentialApiKeyPlaceholder`, `VisitorCredentialFormProps`, `VisitorCredentialForm`, `visitorPresetId` | site (visitor) provider credential form |

- **Splits:**
  1. NEW `apps/admin/src/features/ai-assistant/AiAssistant-visitor-credential.tsx` — job: the visitor assistant's provider credential form. Moves unit C with all comments (the long "The SITE's provider credential" block). `resolveT` is needed by both files: move `resolveT` into the new file and export it; `AiAssistant.tsx` imports it (no cycle). Exports: `VisitorCredentialForm`, `VisitorCredentialKeyActions`, `VisitorCredentialKeyFooter`, `VisitorCredentialSettingsFooter`, `visitorCredentialKeyStatusMessage`, `visitorCredentialApiKeyPlaceholder` (re-export moves with it), `resolveT`.
  2. SUB-COMPONENT in new file above `VisitorCredentialForm`: `VisitorProviderPicker({ providerSelectId, t, preset, selectPresetById, providerGroups }): ReactNode` ← the first `<div className="visitor-inline-field">` (Provider `<select>` with its `providerGroups.map` options) and its comment.
  3. HELPER in `AiAssistant.tsx` above `AiAssistant`: `buildAiAssistantTabs({ t, settings, saving, saveError, setPublicEnabled, setWidget }: BuildAiAssistantTabsInput): SettingsDialogTab[]` ← `const tabs: SettingsDialogTab[] = [` … `];` (with the "Two tabs" comment and the roadmap-tab JSDoc). `AiAssistant` calls it after the two early returns (same spot).
- **Importers to update:** `features/ai-assistant/__tests__/VisitorCredentialForm.unit.test.tsx` (all moved names); `features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts`, `hooks/use-admin-execution-credential.hooks.ts`, `rules.ts`, `ai-assistant-i18n.ts` — check each with `rg -n "from .*AiAssistant['\"]"` (several only mention names in comments). `AiAssistant.tsx` imports `VisitorCredentialForm` from the new file.
- **After:** `AiAssistant.tsx` ~400; `AiAssistant` ~62; `VisitorCredentialForm` ~85; new file ~260.
- **Risks / notes:** `apps/admin/src/__tests__/app-boot-request-volume.test.tsx` `vi.mock`s `../features/ai-assistant` (the index) — unaffected. After the Tovu→Jini move only `AiAssistant` stays product; the visitor-credential file is the likelier mover, which this split makes easier.
