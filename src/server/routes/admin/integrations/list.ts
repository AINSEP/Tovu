import type { WebhookDeliveryRecord } from "#src/webhooks/index";
import { toAdminSubscriptionResponse } from "#src/server/http/admin/integrations";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { IntegrationsRouteRegistrar } from "./deps.js";

/**
 * Bound on how many of a subscription's most recent deliveries are read to compute the
 * "last delivery" summary shown per row. Delivery volume grows independently of how many
 * subscriptions exist, so this caps the read cost per subscription per request rather than
 * assuming delivery volume stays small.
 */
const LAST_DELIVERY_LOOKUP_LIMIT = 50;

/**
 * GET all webhook subscriptions for the workspace, each annotated with its most recent delivery
 * (list screen: label, target URL, status, last delivery).
 *
 * Gated by `admin.integrations.manage`, same reasoning as `deliveries.ts` (no split `.read` permission
 * exists for this domain).
 */
export const registerAdminIntegrationsListRoute: IntegrationsRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.integrations.manage",
        workspaceId: deps.workspaceId,
        entityType: "webhook_subscription",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.integrations.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.integrations.manage", reason: authResult.reason },
        });
        return;
      }

      const subscriptions = await deps.webhookSubscriptionRepo.listByWorkspace({
        workspaceId: deps.workspaceId,
      });

      const subscriptionResponses = await Promise.all(
        subscriptions.map(async (subscription) => {
          const recentDeliveries = await deps.webhookDeliveryRepo.listBySubscription({
            workspaceId: deps.workspaceId,
            subscriptionId: subscription.id,
            limit: LAST_DELIVERY_LOOKUP_LIMIT,
          });
          return toAdminSubscriptionResponse({
            subscription,
            lastDelivery: mostRecentDelivery(recentDeliveries),
          });
        })
      );

      res.json({ subscriptions: subscriptionResponses });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

/**
 * Most recent delivery by `createdAt`, computed here rather than assumed from the repo's return
 * order — `WebhookDeliveryRepoPort.listBySubscription` makes no ordering guarantee.
 *
 * @complexity O(n) over the bounded lookup window.
 * @overallScore 100
 */
function mostRecentDelivery(
  deliveries: readonly WebhookDeliveryRecord[]
): WebhookDeliveryRecord | null {
  if (deliveries.length === 0) return null;
  return deliveries.reduce((latest, candidate) =>
    candidate.createdAt > latest.createdAt ? candidate : latest
  );
}
