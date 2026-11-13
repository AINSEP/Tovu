### tovu:apps/website/src/features/widgets/tool-registrations.ts
- **Over:** `buildWidgetsRegistrations` 213 (file 338, under)
- **Phase:** after-move (MOVE-AFTER features/widgets/agent-tools contracts) · **Batch:** size-55
- **Tests:** `apps/website/src/features/widgets/__tests__/integration/tool-registrations.region-gaps.test.ts`, `.../tool-registrations.delegated-error-status.test.ts`, `.../tool-registrations.shape-rejection.test.ts`, `.../tool-registrations.handler-gaps.test.ts`, `.../tool-registrations.input-validation-status.test.ts`, `.../tool-registrations.plugin-hook-failed.test.ts`, `apps/website/src/features/widgets/__tests__/agent-tools.trash-confirmation.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts`, `.../tool-registrations.widgets-contracts.test.ts`, `apps/website/src/server/__tests__/widgets-error-code-parity.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `MUTATES_DURABLE_STATE`, `CATALOG_BY_ID`, `WidgetsToolDeps`, `widgetsDerivedRisk`, `isWidgetsShapeRejection`, `toModelFacingWidgetsError`, views, `WIDGETS_TRASH_TOOL_ID`, `ASSISTANT_ACTOR_PLUGIN_ID`, `resolveWidgetPlacementView`, `placementContent` | deps, errors, views (stay) |
| B | entries `widgets_list_instances`, `widgets_get_instance`, `widgets_list_regions`, `widgets_get_region` | read handlers |
| C | entries `widgets_create_instance`, `widgets_update_instance`, `widgets_trash_instance` | instance write handlers |
| D | entries `widgets_bind_region`, `widgets_set_region_placements` | region binding handlers |
| E | entries `widgets_insert_embed`, `widgets_remove_embed`, `widgets_reorder_embeds` | in-content embed handlers |

- **Splits:**
  1. HELPERS in `buildWidgetsRegistrations` (same file, above it, in this order). Plan-named input `interface WidgetsHandlersInput { routeDeps: WidgetsToolDeps }`; each returns `Record<string, ToolHandler>`:
     - `buildWidgetReadHandlers` ← entries ~L231-283; `buildWidgetInstanceWriteHandlers` ← ~L284-364; `buildWidgetRegionHandlers` ← ~L365-406; `buildWidgetEmbedHandlers` ← ~L407-464.
  2. `buildWidgetsRegistrations` keeps its signature, `const handlers: Record<string, ToolHandler> = { ...buildWidgetReadHandlers({ routeDeps }), ...buildWidgetInstanceWriteHandlers({ routeDeps }), ...buildWidgetRegionHandlers({ routeDeps }), ...buildWidgetEmbedHandlers({ routeDeps }) };` (same key order), then `const modelFacingHandlers …` (with its "Every handler above gets `toModelFacingWidgetsError`" comment) and the `return buildDomainRegistrations(` statement with its "No `unwiredToolIds`" comment.
- **Importers to update:** none.
- **After:** file ~350; builder ~28; helpers ~50 / ~75 / ~40 / ~55.
- **Risks / notes:** Outline: handlers read only `routeDeps`. If `widgets_trash_instance` reads `surfaces` (rg the moved lines), add `surfaces: AssistantSurfaceDeps` to `buildWidgetInstanceWriteHandlers`' input.
