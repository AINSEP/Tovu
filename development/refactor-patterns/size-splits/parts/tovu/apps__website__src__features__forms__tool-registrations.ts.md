### tovu:apps/website/src/features/forms/tool-registrations.ts
- **Over:** `buildFormsRegistrations` 163 (file 399)
- **Phase:** after-move (MIXED; MOVE-AFTER write-service.ts …; STAY-WIRING) · **Batch:** size-48
- **Tests:** `apps/website/src/features/forms/__tests__/tool-registrations.model-facing-errors.test.ts`, `apps/website/src/features/forms/__tests__/agent-tools.unit.test.ts`, `apps/website/src/features/forms/__tests__/tool-definition-view.unit.test.ts`, `apps/website/src/features/forms/__tests__/common-field-tools.test.ts`
- **Responsibility map:** `const handlers: Record<string, ToolHandler> = {` holds two jobs — form definitions (`forms_list_providers`, `forms_list_definitions`, `forms_create_definition`, `forms_update_definition`, `forms_set_definition_status`) and submissions/delivery (`forms_list_submissions`, `forms_get_submission`, `forms_delivery_status`, `forms_pull_submissions`).
- **Splits:**
  1. HELPER `buildFormsDefinitionHandlers({ routeDeps }: BuildFormsHandlersInput): Record<string, ToolHandler>` (same file, above `buildFormsRegistrations`) ← the five definition entries verbatim (with their comments).
  2. HELPER `buildFormsSubmissionHandlers({ routeDeps }: BuildFormsHandlersInput): Record<string, ToolHandler>` ← the four submission/delivery entries.
  `buildFormsRegistrations` becomes `const handlers: Record<string, ToolHandler> = { ...buildFormsDefinitionHandlers({ routeDeps }), ...buildFormsSubmissionHandlers({ routeDeps }) };` + the unchanged `return buildDomainRegistrations(` (key order preserved).
- **Importers to update:** none.
- **After:** `buildFormsRegistrations` ~15; helpers ~85 / ~70; file ~405.
- **Risks / notes:** none of the tests `mock.module` this file. MOVE-AFTER: handlers move with the write-service later; helpers move as a unit.
