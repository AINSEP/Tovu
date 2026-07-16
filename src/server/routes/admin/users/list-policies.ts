import { toAdminPolicyResponse } from "../../../http/admin/users";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteRegistrar } from "../../types";

/**
 * GET policies — list a workspace's policies (built-in + custom) for the Users admin screen's
 * policy picker. Gated by `role.manage`, mirroring `list-roles.ts`'s identical reasoning
 * (`createPolicy` is also gated by `role.manage`, not a separate `policy.manage`; 2026-07-16
 * authz sweep: this route previously had zero permission check beyond session auth).
 */
export const registerAdminPolicyListRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/policies", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "role.manage",
        workspaceId: deps.workspaceId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'role.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "role.manage", reason: authResult.reason },
        });
        return;
      }

      const policies = await deps.policyRepo.list({ workspaceId: deps.workspaceId });
      res.json({ policies: policies.map(toAdminPolicyResponse) });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
