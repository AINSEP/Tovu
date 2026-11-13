### tovu:apps/website/src/features/taxonomy/tool-registrations.ts
- **Over:** `buildTaxonomyRegistrations` 223 (file 331, under)
- **Phase:** after-move (MOVE-AFTER contracts/core/human-confirmed…; STAY-WIRING) · **Batch:** size-57
- **Tests:** `apps/website/src/features/taxonomy/__tests__/tool-registrations.term-card.test.ts`, `.../taxonomy/__tests__/get-assigned-terms-tool.test.ts`, `.../taxonomy/__tests__/tool-registrations.assign-terms-validation-status.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `MUTATES_DURABLE_STATE`, `CATALOG_BY_ID`, `TaxonomyToolDeps`, `taxonomyDerivedRisk`, `MERGE_TOOL_ID`, `requireTaggableContentType`, `taxonomyDeps` | deps + risk (stay) |
| B | entries `taxonomy_list`, `taxonomy_create_taxonomy`, `taxonomy_create_term`, `taxonomy_rename_term` | taxonomy/term read + write handlers |
| C | entries `taxonomy_assign_terms`, `taxonomy_unassign_terms` | term assignment handlers |
| D | entry `taxonomy_plan_merge_term` | merge planning handler |
| E | build-locals `const mergeHooks = (`, `const termName = async (`, entry `[MERGE_TOOL_ID]: humanConfirmedToolHandler(surfaces, {` | the human-confirmed merge handler |

- **Splits:**
  1. HELPERS in `buildTaxonomyRegistrations` (same file, above it, in this order). Plan-named input `interface TaxonomyHandlersInput { routeDeps: TaxonomyToolDeps }`:
     - `buildTaxonomyTermHandlers({ routeDeps }: TaxonomyHandlersInput): Record<string, ToolHandler>` ← entries `taxonomy_list` … `taxonomy_rename_term` (~L215-274).
     - `buildTaxonomyAssignmentHandlers({ routeDeps }: TaxonomyHandlersInput): Record<string, ToolHandler>` ← entries `taxonomy_assign_terms`, `taxonomy_unassign_terms` (~L275-325).
     - `createPlanMergeTermHandler({ routeDeps }: TaxonomyHandlersInput): ToolHandler` ← the `taxonomy_plan_merge_term` arrow (~L326-362).
     - `createMergeTermHandler({ routeDeps, surfaces }: CreateMergeTermHandlerInput): ToolHandler` ← first the `const mergeHooks = (` (~L190-203) and `const termName = async (` (~L204) statements (moved, unchanged, as the helper's first statements), then `return humanConfirmedToolHandler(surfaces, {` … (the `[MERGE_TOOL_ID]` value, ~L363-428).
  2. `buildTaxonomyRegistrations` keeps its signature (incl. `surfaces` default) and becomes `const handlers: Record<string, ToolHandler> = { ...buildTaxonomyTermHandlers({ routeDeps }), ...buildTaxonomyAssignmentHandlers({ routeDeps }), taxonomy_plan_merge_term: createPlanMergeTermHandler({ routeDeps }), [MERGE_TOOL_ID]: createMergeTermHandler({ routeDeps, surfaces }) };` plus its `return buildDomainRegistrations({` statement.
- **Importers to update:** none.
- **After:** file ~340; `buildTaxonomyRegistrations` ~14; helpers ~58 / ~50 / ~38 / ~82.
- **Risks / notes:** `mergeHooks`/`termName` are used only by the `[MERGE_TOOL_ID]` entry (rg confirmed) — they move into `createMergeTermHandler`; they are created once per handler build either way. If any entry in B–D reads `surfaces`, add it to that helper's input (none found by rg).
