import type { Express } from "express";

import { readCommerceStatus } from "#src/features/commerce/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/** Dependencies required by the Commerce status transport adapter. */
export type AdminCommerceStatusDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "lipay">;

/**
 * Registers the authenticated, workspace-scoped Commerce operational-status endpoint.
 *
 * The handler performs no payment operation and reads no credentials. Its only runtime query is
 * the narrow provider catalog exposed through `readCommerceStatus`.
 *
 * @param app - Express application receiving the route.
 * @param deps - Tenant, authorization, and optional payment-runtime dependencies.
 * @returns Nothing; registration mutates only the supplied Express router.
 * @throws Unexpected authorization or adapter programming failures follow the app's existing
 * Express error path; expected workspace and permission failures are returned as 404/403.
 *
 * @complexity Registration is O(1). Each request is O(p + c), where p is registered payment
 * providers and c is their declared capability array entries; no external I/O is performed here.
 */
export function registerAdminCommerceStatusRoute(
  app: Express,
  deps: AdminCommerceStatusDeps
): void {
  app.get("/api/admin/v1/workspaces/:workspaceId/commerce/status", async (req, res) => {
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
        entityType: "integration",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.integrations.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.integrations.manage", reason: authResult.reason },
        });
        return;
      }

      res.status(200).json(
        readCommerceStatus({
          workspaceId: deps.workspaceId,
          resolvePaymentRuntime: () => deps.lipay ?? null,
        })
      );
    } catch (err) {
      console.error("[commerce/status] unexpected error", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
