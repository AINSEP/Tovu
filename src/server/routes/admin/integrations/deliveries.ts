import { toAdminDeliveryResponse } from "#src/server/http/admin/integrations";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { IntegrationsRouteRegistrar } from "./deps.js";

/** Default page size when the caller doesn't pass `?limit=`. */
const DEFAULT_DELIVERIES_PAGE_SIZE = 50;
/** Hard cap on a single delivery-log page, regardless of what the caller requests. */
const MAX_DELIVERIES_PAGE_SIZE = 200;

/** Parses and clamps the `?limit=` query param into `[1, MAX_DELIVERIES_PAGE_SIZE]`. */
function resolvePageSize(rawLimit: unknown): number {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DELIVERIES_PAGE_SIZE;
  return Math.min(Math.floor(parsed), MAX_DELIVERIES_PAGE_SIZE);
}

/**
 * GET the delivery log for one subscription (status, attempts, last response, timestamp),
 * newest-first.
 *
 * Gated by `admin.integrations.manage` — no dedicated read permission exists for the `integrations`
 * domain (no other route in this pass split it into `.read`/`.manage`), so the same single
 * permission that gates subscription mutations also gates this read, mirroring `member.manage`'s
 * coverage of its whole domain.
 */
export const registerAdminIntegrationsDeliveriesRoute: IntegrationsRouteRegistrar = (app, deps) => {
  app.get(
    "/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId/deliveries",
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

        const subscription = await deps.webhookSubscriptionRepo.findById({
          workspaceId: deps.workspaceId,
          id: subscriptionId,
        });
        if (!subscription) {
          res.status(404).json({ error: `webhook subscription '${subscriptionId}' was not found` });
          return;
        }

        const deliveries = await deps.webhookDeliveryRepo.listBySubscription({
          workspaceId: deps.workspaceId,
          subscriptionId,
          limit: resolvePageSize(req.query.limit),
        });

        // Newest-first for the log view — the repo makes no ordering guarantee, so this route
        // is the one place that owns "most recent" semantics for this response.
        const newestFirst = [...deliveries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        res.json({ deliveries: newestFirst.map(toAdminDeliveryResponse) });
      } catch {
        res.status(500).json({ error: "internal error" });
      }
    }
  );
};
