import { toAdminRoleResponse } from "../../../http/admin/users";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { UsersRouteRegistrar } from "./deps";

/**
 * GET roles — list a workspace's roles (built-in + custom) for the Users admin screen's role
 * picker. Gated by `role.manage` — matches `createRole`/`createPolicy`'s own gate (identity's
 * `grant-service.ts`), since no separate `role.read` permission exists in the catalog (2026-07-16
 * authz sweep: this route previously had zero permission check beyond session auth).
 */
export const registerAdminRoleListRoute: UsersRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/roles", async (req, res) => {
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

      const roles = await deps.roleRepo.list({ workspaceId: deps.workspaceId });
      res.json({ roles: roles.map(toAdminRoleResponse) });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
