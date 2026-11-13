### jini:packages/core/src/settings/tool-registrations.ts
- **Over:** `buildSettingsRegistrations` 116 (its `const handlers = {…}` literal is 103)
- **Phase:** now · **Batch:** size-13
- **Tests:** `src/settings/__tests__/tool-registrations.reads.test.ts`, `tool-registrations.set-value.test.ts`, `tool-registrations.clear-value.test.ts`, `tool-registrations.dotted-key.test.ts`, `tool-registrations.ui-preference.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A (stays) | module helpers L36-211, `buildSettingsRegistrations` shell + `return buildDomainRegistrations(…)` | registration wiring |
| B | `handlers` entries `settings_list_definitions`, `settings_get_effective`, `settings_get_raw` | read tools |
| C | `handlers` entry `settings_set_ui_preference` | UI-preference write tool |

- **Splits:**
  1. HELPER `buildSettingsReadHandlers({ routeDeps }: BuildSettingsReadHandlersInput): Record<string, ToolHandler>` — module level above `buildSettingsRegistrations` ← the three read entries verbatim as an object literal (same key order).
  2. HELPER `buildUiPreferenceHandler({ routeDeps }: BuildUiPreferenceHandlerInput): ToolHandler` ← the `settings_set_ui_preference` arrow body verbatim (comments move).
  3. `handlers` becomes `{ settings_set_value: …, settings_clear_value: …, ...buildSettingsReadHandlers({ routeDeps }), settings_set_ui_preference: buildUiPreferenceHandler({ routeDeps }) }` — key insertion order unchanged.
- **Importers to update:** none.
- **After:** `buildSettingsRegistrations` ~22; `buildSettingsReadHandlers` ~68; `buildUiPreferenceHandler` ~52; file ~240.
- **Risks / notes:** if any downstream code iterates `Object.keys(handlers)`, order is preserved by spreading in place.
