import { deleteSubscription, WebhookSubscriptionNotFoundError } from "../../../../integrations";
import { toAdminSubscriptionResponse } from "../../../http/admin/integrations";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { IntegrationsRouteRegistrar } from "./deps";

/**
 * DELETE a webhook subscription. Soft-deletes (never row-deletes) — `deleteSubscription` sets
 * `status: "disabled"` + stamps `disabledAt` for audit durability (ADR-036 §2); the response
 * still echoes the (now-disabled) subscription so the admin UI can show its terminal state.
 *
 * Gated by `admin.integrations.manage`, checked directly via `authorize()` (same pattern as `create.ts`).
 */
export const registerAdminIntegrationsDeleteRoute: IntegrationsRouteRegistrar = (app, deps) => {
  app.delete(
    "/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId",
    async (req, res) => {
      if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
        res.status(404).json({ error: "workspace was not found" });
        return;
      }

      const subscriptionId = String(req.params.subscriptionId ?? "");

      try {
        const principal = getAuthedPrincipal(res);
        const authResult = await deps.authorize({
          principalId: principal.id,
          permission: "admin.integrations.manage",
          workspaceId: deps.workspaceId,
          entityType: "webhook_subscription",
          entityId: subscriptionId,
        });
        if (!authResult.allowed) {
          res.status(403).json({
            error: `principal '${principal.id}' is not authorized for 'admin.integrations.manage' (${authResult.reason})`,
            code: "FORBIDDEN",
            details: { permission: "admin.integrations.manage", reason: authResult.reason },
          });
          return;
        }

        const { subscription } = await deleteSubscription({
          deps: {
            clock: deps.clock,
            repo: deps.webhookSubscriptionRepo,
            idGenerator: deps.idGen,
            isAllowedTarget: async () => true, // not exercised: delete never re-validates targetUrl
          },
          input: {
            workspaceId: deps.workspaceId,
            id: subscriptionId,
          },
        });

        res.json({ subscription: toAdminSubscriptionResponse(subscription, null) });
      } catch (err) {
        if (err instanceof WebhookSubscriptionNotFoundError) {
          res.status(404).json({ error: err.message });
          return;
        }

        res.status(500).json({ error: "internal error" });
      }
    }
  );
};
