import { toAdminMenuListResponse, type MenuRouteRegistrar } from "../../../../server/http/admin/menus";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";

/**
 * GET the workspace's menus (admin list view, ADR-029).
 *
 * Reads go straight through `MenuRepoPort.list` — `navigation` ships no
 * `listMenus` service wrapper (only the mutation slice: create/update-tree/
 * assign/delete in `menu-service.ts`), so there is no business logic to
 * front this plain repo read with. See the handoff report's "interface
 * friction" note.
 *
 * Gated by `navigation.manage`, same reasoning as `get-by-id.ts` (no split `.read` permission
 * exists for this domain).
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
        permission: "navigation.manage",
        workspaceId: deps.workspaceId,
        entityType: "menu",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'navigation.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "navigation.manage", reason: authResult.reason },
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
