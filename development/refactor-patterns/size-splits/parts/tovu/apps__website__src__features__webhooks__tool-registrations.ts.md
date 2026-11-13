### tovu:apps/website/src/features/webhooks/tool-registrations.ts
- **Over:** `buildWebhooksRegistrations` 126 (file 228, under)
- **Phase:** after-move (MOVE-AFTER write-service.ts; STAY-WIRING) · **Batch:** size-55
- **Tests:** `apps/website/src/features/webhooks/__tests__/tool-registrations.handlers.test.ts`, `.../webhooks/__tests__/tool-registrations.model-facing-errors.test.ts`, `.../webhooks/__tests__/agent-tools.delete-confirmation.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.webhooks.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `MANAGE_INTEGRATIONS_PERMISSION`, `CATALOG_BY_ID`, `IntegrationsToolDeps`, limits, `clampDeliveriesLimit`, `mostRecentDelivery`, `toSubscriptionToolView`, `toDeliveryToolView`, `WEBHOOKS_DELETE_TOOL_ID`, `webhooksDerivedRisk`, `WEBHOOKS_MODEL_FACING_ERRORS` | deps, views, risk (stay) |
| B | entries `webhooks_list_subscriptions`, `webhooks_get_deliveries` | read handlers |
| C | entries `webhooks_create_subscription`, `webhooks_update_subscription`, `webhooks_pause_subscription` | subscription write handlers |
| D | entry `webhooks_delete_subscription: approvalToolHandler({ surfaces,` | approval-gated delete |

- **Splits:**
  1. HELPERS in `buildWebhooksRegistrations` (same file, above it, in this order). `isAllowedTarget` type: `(url: string) => boolean` (match the arrow's inferred return).
     - `buildWebhookReadHandlers({ routeDeps }: BuildWebhookReadHandlersInput): Record<string, ToolHandler>` ← entries L198-232.
     - `buildWebhookWriteHandlers({ routeDeps, isAllowedTarget }: BuildWebhookWriteHandlersInput): Record<string, ToolHandler>` ← entries `webhooks_create_subscription` … `webhooks_pause_subscription` (~L233-297).
     - `createWebhookDeleteHandler({ routeDeps, surfaces, isAllowedTarget }: CreateWebhookDeleteHandlerInput): ToolHandler` ← the value `approvalToolHandler({ surfaces, …})` (~L298-340).
  2. `buildWebhooksRegistrations` keeps its signature (`surfaces` default), `const isAllowedTarget = …`, then `const handlers: Record<string, ToolHandler> = { ...buildWebhookReadHandlers({ routeDeps }), ...buildWebhookWriteHandlers({ routeDeps, isAllowedTarget }), webhooks_delete_subscription: createWebhookDeleteHandler({ routeDeps, surfaces, isAllowedTarget }) };` and the `return buildDomainRegistrations(` statement.
- **Importers to update:** none.
- **After:** file ~236; builder ~14; helpers ~32 / ~58 / ~42.
- **Risks / notes:** Drop `isAllowedTarget` from a helper's input if rg shows that helper's moved lines never use it (the outline shows uses at ~L240/266/281/330 — create/update/pause/delete). `surfaces` type is `ChatDeleteSurfaceDeps`.
