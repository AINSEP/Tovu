import { createSubscription, WebhookSubscriptionValidationError } from "../../../../integrations";
import { toAdminSubscriptionResponse } from "../../../http/admin/integrations";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { IntegrationsRouteRegistrar } from "./deps";

/**
 * Dev-only stand-in for `WebhookSubscriptionDeps.isAllowedTarget` (the egress allowlist seam
 * `src/integrations/subscriptions.ts` injects rather than importing `src/origin` directly, per
 * its own file header/`INFO.md` "Future direction" note). Permits every `https://` target that
 * already passed `subscriptions.ts`'s own scheme check.
 *
 * KNOWN GAP, not solved by this task: production wiring should replace this with
 * `core/origin`'s `isAllowedRedirectTarget`/`isAllowedEgressTarget` (ADR-040) once the
 * composition root wires that real cross-module dependency in — see the handoff report.
 */
const permitAllHttpsTargets = async (): Promise<boolean> => true;

/**
 * POST create a webhook subscription.
 *
 * Gated by `integration.manage` (registered in `identity/permissions.ts`), checked directly via
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
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "integration.manage",
        workspaceId: deps.workspaceId,
        entityType: "webhook_subscription",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'integration.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "integration.manage", reason: authResult.reason },
        });
        return;
      }

      const rawTopics = req.body?.topics;
      const { subscription } = await createSubscription({
        deps: {
          clock: deps.clock,
          repo: deps.webhookSubscriptionRepo,
          idGenerator: deps.idGen,
          isAllowedTarget: permitAllHttpsTargets,
        },
        input: {
          workspaceId: deps.workspaceId,
          // Dev-mode single-actor placeholder, matching the session/command-gateway convention
          // (`dev-auth.ts`'s fixed `"user-local"` session subject) — no permissions feature yet.
          ownerPrincipalId: "user-local",
          createdByPrincipalId: "user-local",
          label: String(req.body?.label ?? ""),
          targetUrl: String(req.body?.targetUrl ?? ""),
          topics: Array.isArray(rawTopics) ? rawTopics.map(String) : [],
        },
      });

      res.status(201).json({ subscription: toAdminSubscriptionResponse(subscription, null) });
    } catch (err) {
      if (err instanceof WebhookSubscriptionValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
