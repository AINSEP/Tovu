import {
  pauseSubscription,
  WebhookSubscriptionNotFoundError,
  WebhookSubscriptionValidationError,
} from "../../../../integrations";
import { toAdminSubscriptionResponse } from "../../../http/admin/integrations";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { IntegrationsRouteRegistrar } from "./deps";

/**
 * POST pause/resume a webhook subscription. One route, both directions — mirrors
 * `pauseSubscription`'s own `{ paused?: boolean }` design (defaults to pausing); body
 * `{ "paused": false }` resumes an already-paused subscription back to `active`.
 *
 * Gated by `integration.manage`, checked directly via `authorize()` (same pattern as `create.ts`).
 */
export const registerAdminIntegrationsPauseRoute: IntegrationsRouteRegistrar = (app, deps) => {
  app.post(
    "/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId/pause",
    async (req, res) => {
      if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
        res.status(404).json({ error: "workspace was not found" });
        return;
      }

      const paused = req.body?.paused;
      const subscriptionId = String(req.params.subscriptionId ?? "");

      try {
        const principal = getAuthedPrincipal(res);
        const authResult = await deps.authorize({
          principalId: principal.id,
          permission: "integration.manage",
          workspaceId: deps.workspaceId,
          entityType: "webhook_subscription",
          entityId: subscriptionId,
        });
        if (!authResult.allowed) {
          res.status(403).json({
            error: `principal '${principal.id}' is not authorized for 'integration.manage' (${authResult.reason})`,
            code: "FORBIDDEN",
            details: { permission: "integration.manage", reason: authResult.reason },
          });
          return;
        }

        const { subscription } = await pauseSubscription(
          {
            deps: {
              clock: deps.clock,
              repo: deps.webhookSubscriptionRepo,
              idGenerator: deps.idGen,
              isAllowedTarget: async () => true, // not exercised: pause never re-validates targetUrl
            },
            input: {
              workspaceId: deps.workspaceId,
              id: subscriptionId,
            },
          },
          { paused: typeof paused === "boolean" ? paused : true }
        );

        res.json({ subscription: toAdminSubscriptionResponse(subscription, null) });
      } catch (err) {
        if (err instanceof WebhookSubscriptionNotFoundError) {
          res.status(404).json({ error: err.message });
          return;
        }

        if (err instanceof WebhookSubscriptionValidationError) {
          res.status(400).json({ error: err.message });
          return;
        }

        res.status(500).json({ error: "internal error" });
      }
    }
  );
};
