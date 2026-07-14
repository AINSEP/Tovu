import { toAdminMenuListResponse, type MenuRouteRegistrar } from "../../../../server/http/admin/menus";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";

/**
 * GET the workspace's menus (admin list view, ADR-029).
 *
 * Reads go straight through `MenuRepoPort.list` — `navigation` ships no
 * `listMenus` service wrapper (only the mutation slice: create/update-tree/
 * assign/delete in `menu-service.ts`), so there is no business logic to
 * front this plain repo read with. See the handoff report's "interface
 * friction" note. This D-9 service-layer-bypass gap is unchanged by
 * ADR-PIPE-012 — only the permission naming below is in scope for this
 * remediation (see ADR-PIPE-012's "Note on D-9").
 *
 * Gated by `admin.menus.read` (ADR-PIPE-012 D-1/D-2/D-9 — renamed/split from
 * the old flat navigation permission).
 */
export const registerAdminMenuListRoute: MenuRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/menus", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.menus.read",
        workspaceId: deps.workspaceId,
        entityType: "menu",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.menus.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.menus.read", reason: authResult.reason },
        });
        return;
      }

      const menus = await deps.menuRepo.list({ workspaceId: deps.workspaceId });
      res.json(toAdminMenuListResponse(menus));
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
