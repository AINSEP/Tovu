### tovu:apps/admin/src/features/settings/SettingsUi.tsx
- **Over:** `SettingsUi` 300 (file 402, under)
- **Phase:** now (STAY-WIRING; survey flags one part to MOVE — label truncated, starts "`T…`", most likely `TabIcon`, which also exists in `providers/Providers.tsx`) · **Batch:** size-06
- **Tests:** `apps/admin/src/features/settings/__tests__/SettingsUi.unit.test.tsx`, `apps/admin/src/hooks/__tests__/tovu-execution-entry-points.integration.test.tsx`, `apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx`, `apps/admin/src/__tests__/unit/panels-render.unit.test.tsx`, `apps/admin/src/features/settings/hooks/__tests__/use-settings-ui.unit.test.ts` (smoke), `apps/admin/src/features/workspace/__tests__/Workspace.unit.test.tsx` (smoke)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `tabs` entry `id: "execution"` (~L332-383) | assistant execution tab |
| B | entries `instructions`, `notifications`, `privacy` (~L384-455) | assistant behaviour preference tabs |
| C | entries `language`, `interface` (~L456-496) | operator locale/interface tabs |
| D | entry `memory` (~L497-569) + `EMPTY_MEMORY_*`, `MEMORY_HOOK_FLAGS`, `READ_ONLY_MEMORY_ACTION` | read-only memory tab |
| E | entries `workspace`, `about` (~L570-632) | install identity + version tabs |
| F | rest of `SettingsUi` (hooks, loading gate, `requestedTabId`, `handleTabChange`, `saveStatus`, markup) | the settings shell (stays) |

- **Splits** (module level, above `SettingsUi`, below `resolveTabId`; each returns the object literal(s) moved verbatim, every inline comment word for word — the long SPEC-044 OQ-04 block moves with `workspace`):
  1. `executionSettingsTab({ t, tExecution, executionPolicy, adminCredential, agentPresentation }: ExecutionSettingsTabInput): SettingsDialogTab` ← unit A.
  2. `assistantPreferenceTabs({ s, t, tCap, settingsLocale }: AssistantPreferenceTabsInput): SettingsDialogTab[]` ← unit B (3 entries, in order).
  3. `localeAndInterfaceTabs({ s, t, settingsLocale }: LocaleAndInterfaceTabsInput): SettingsDialogTab[]` ← unit C.
  4. `memorySettingsTab({ s, t, tCap, settingsLocale }: MemorySettingsTabInput): SettingsDialogTab` ← unit D.
  5. `installSettingsTabs({ t, tCap, settingsLocale }: InstallSettingsTabsInput): SettingsDialogTab[]` ← unit E.
  6. In `SettingsUi`: `const tabs: SettingsDialogTab[] = [executionSettingsTab({…}), ...assistantPreferenceTabs({…}), ...localeAndInterfaceTabs({…}), memorySettingsTab({…}), ...installSettingsTabs({…})];` — tab order unchanged.
  Input types: `s: SettingsUiController`; `t`/`tCap`/`tExecution`: `ReturnType<typeof createSettingsUiTranslators>["t" | "tCap" | "tExecution"]` (indexed one by one); `executionPolicy: ReturnType<typeof useTovuSettingsExecution>`; `agentPresentation: ReturnType<typeof useAiAgentPresentation>`; `adminCredential: ReturnType<ReturnType<typeof resolveSettingsExecutionCredentialHook>>`; `settingsLocale: string`. Executor: confirm the exact identifier list per entry with the outline tool before cutting (from a grep: A uses `t, tExecution, executionPolicy, adminCredential, agentPresentation`; B `s.instructions/notifications/privacy, t, tCap, settingsLocale`; C `s.language/interface, t, settingsLocale`; D `s.memoryTopTab, s.setMemoryTopTab, t, tCap, settingsLocale`; E `t, tCap, tWorkspace, settingsLocale`).
- **Importers to update:** none.
- **After:** file ~430; `SettingsUi` ~80; largest helper `memorySettingsTab` ~72.
- **Risks / notes:** All five helpers are called after the `if (s.loading)` gate, same as the literal today — no hooks inside them. JSX inside builders is fine (a builder returning descriptors is not a component).
