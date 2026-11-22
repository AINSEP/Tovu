import { RecordVersionConflictError, versionConflictBody } from "@jini-ai/core/optimistic-concurrency";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { deleteSubscription, WebhookSubscriptionNotFoundError } from "#src/features/webhooks/index";
import { toAdminSubscriptionResponse } from "#src/server/inbound/admin-http/http/integrations";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { toWebhookSubscriptionDeps, type IntegrationsRouteRegistrar } from "./deps.js";

/**
 * DELETE a webhook subscription. Soft-deletes (never row-deletes) — `deleteSubscription` sets
 * `status: "disabled"` + stamps `disabledAt` for audit durability (ADR-036 §2); the response
 * still echoes the (now-disabled) subscription so the admin UI can show its terminal state.
 *
 * Gated by `admin.integrations.manage`, checked directly via `authorize()` (same pattern as `create.ts`).
 */
export const registerAdminIntegrationsDeleteRoute: IntegrationsRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.delete(
    "/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId",
    async (req, res) => {
      if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

      const subscriptionId = String(req.params.subscriptionId ?? "");

      try {
        const principal = getAuthedPrincipal(res);
        const params = { principalId: principal.id, permission: "admin.integrations.manage", workspaceId: deps.workspaceId, entityType: "webhook_subscription", entityId: subscriptionId };
        if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

        const { subscription } = await deleteSubscription({
          // The shared egress policy is not exercised here: delete never re-validates targetUrl.
          deps: toWebhookSubscriptionDeps(deps),
          input: {
            workspaceId: deps.workspaceId,
            id: subscriptionId,
          },
        });

        res.json({ subscription: toAdminSubscriptionResponse({ subscription, lastDelivery: null }) });
      } catch (err) {
        if (err instanceof WebhookSubscriptionNotFoundError) {
          res.status(404).json({ error: err.message });
          return;
        }

        if (err instanceof RecordVersionConflictError) {
          res.status(409).json(versionConflictBody({ error: err }));
          return;
        }

        sendAdminFailure({ res, error: err }, { operation: "routes/integrations/delete", code: "INTERNAL_ERROR" });
      }
    }
  );
};
