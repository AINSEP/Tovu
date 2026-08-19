import type { Request } from "express";

import { createSubscription, WebhookSubscriptionValidationError } from "#src/webhooks/index";
import { toAdminSubscriptionResponse } from "#src/server/http/admin/integrations";
import { authorizeOrRespond } from "#src/server/http/responses/authorize-guard";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { IntegrationsRouteRegistrar } from "./deps.js";

/** Pulls the create-subscription fields out of the request body, applying the same
 *  string-coercion/defaulting `createSubscription`'s own validation expects (never throws —
 *  malformed shapes just become empty/invalid values that `createSubscription` rejects). */
function parseCreateSubscriptionInput(req: Request): { label: string; targetUrl: string; topics: string[] } {
  const rawTopics = req.body?.topics;
  return {
    label: String(req.body?.label ?? ""),
    targetUrl: String(req.body?.targetUrl ?? ""),
    topics: Array.isArray(rawTopics) ? rawTopics.map(String) : [],
  };
}

/**
 * POST create a webhook subscription.
 *
 * Gated by `admin.integrations.manage` (registered in `identity/permissions.ts`), checked directly via
 * `authorize()` — mirrors `members/disable.ts`'s pattern since subscription mutations are a direct
 * feature call, not routed through the SPEC-001 command gateway.
 */
export const registerAdminIntegrationsCreateRoute: IntegrationsRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/integrations/subscriptions", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "admin.integrations.manage",
        workspaceId: deps.workspaceId,
        entityType: "webhook_subscription",
      });
      if (!authorized) return;

      const { label, targetUrl, topics } = parseCreateSubscriptionInput(req);
      const { subscription } = await createSubscription({
        deps: {
          clock: deps.clock,
          repo: deps.webhookSubscriptionRepo,
          idGenerator: deps.idGen,
          // ADR-PIPE-015 GAP-06: the real core/origin egress oracle, replacing the dev-only
          // permitAllHttpsTargets stand-in. Fails closed on any parse failure or ambiguity.
          isAllowedTarget: (url: string) =>
            deps.originRegistry.isAllowedEgressTarget({ workspaceId: deps.workspaceId }, url),
        },
        input: {
          workspaceId: deps.workspaceId,
          // Dev-mode single-actor placeholder, matching the session/command-gateway convention
          // (`dev-auth.ts`'s fixed `"user-local"` session subject) — no permissions feature yet.
          ownerPrincipalId: "user-local",
          createdByPrincipalId: "user-local",
          label,
          targetUrl,
          topics,
        },
      });

      res.status(201).json({ subscription: toAdminSubscriptionResponse({ subscription, lastDelivery: null }) });
    } catch (err) {
      if (err instanceof WebhookSubscriptionValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
