import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { sendAdminFailure } from "#src/server/inbound/admin-http/routes/system/site-share-errors";
import { toAdminDeliveryResponse } from "#src/server/inbound/admin-http/http/integrations";
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
      if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

      const subscriptionId = String(req.params.subscriptionId ?? "");

      try {
        const principal = getAuthedPrincipal(res);
        const params = { principalId: principal.id, permission: "admin.integrations.manage", workspaceId: deps.workspaceId, entityType: "webhook_subscription", entityId: subscriptionId };
        if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

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

        // Newest-first for the log view — the repo orders before limiting (with id breaking ties).
        // Sorting here after LIMIT would leave the wrong rows on the "most recent" page (F1761).
        res.json({ deliveries: deliveries.map(toAdminDeliveryResponse) });
      } catch (error) {
        sendAdminFailure({ res, error }, { operation: "routes/integrations/deliveries", code: "INTERNAL_ERROR" });
      }
    }
  );
};
