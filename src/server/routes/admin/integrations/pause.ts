import type { Request } from "express";

import {
  pauseSubscription,
  WebhookSubscriptionNotFoundError,
  WebhookSubscriptionValidationError,
} from "#src/webhooks/index";
import { toAdminSubscriptionResponse } from "#src/server/http/admin/integrations";
import { authorizeOrRespond } from "#src/server/http/responses/authorize-guard";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { IntegrationsRouteRegistrar } from "./deps.js";

/** `{ paused?: boolean }` body — defaults to pausing (`true`) for any non-boolean value,
 *  including absent, so `{ "paused": false }` is the only way to resume. */
function resolvePausedFlag(req: Request): boolean {
  const raw = req.body?.paused;
  return typeof raw === "boolean" ? raw : true;
}

/**
 * POST pause/resume a webhook subscription. One route, both directions — mirrors
 * `pauseSubscription`'s own `{ paused?: boolean }` design (defaults to pausing); body
 * `{ "paused": false }` resumes an already-paused subscription back to `active`.
 *
 * Gated by `admin.integrations.manage`, checked directly via `authorize()` (same pattern as `create.ts`).
 */
export const registerAdminIntegrationsPauseRoute: IntegrationsRouteRegistrar = (app, deps) => {
  app.post(
    "/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions/:subscriptionId/pause",
    async (req, res) => {
      if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
        res.status(404).json({ error: "workspace was not found" });
        return;
      }

      const paused = resolvePausedFlag(req);
      const subscriptionId = String(req.params.subscriptionId ?? "");

      try {
        const principal = getAuthedPrincipal(res);
        const authorized = await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "admin.integrations.manage",
          workspaceId: deps.workspaceId,
          entityType: "webhook_subscription",
          entityId: subscriptionId,
        });
        if (!authorized) return;

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
          { paused }
        );

        res.json({ subscription: toAdminSubscriptionResponse({ subscription, lastDelivery: null }) });
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
