import { toAdminMenuResponse, type MenuRouteRegistrar } from "../../../../server/http/admin/menus";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";

/**
 * GET one menu by id, including its full item tree (ADR-029).
 *
 * Gated by `navigation.manage` — no dedicated read permission exists for the `navigation` domain
 * (no other route in this pass split a domain into `.read`/`.manage`), so the same single
 * permission that gates menu mutations also gates this read, mirroring `member.manage`'s coverage
 * of its whole domain.
 */
export const registerAdminMenuGetRoute: MenuRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/menus/:menuId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const menuId = String(req.params.menuId ?? "");

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "navigation.manage",
        workspaceId: deps.workspaceId,
        entityType: "menu",
        entityId: menuId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'navigation.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "navigation.manage", reason: authResult.reason },
        });
        return;
      }

      const menu = await deps.menuRepo.findById({ workspaceId: deps.workspaceId, id: menuId });
      if (!menu) {
        res.status(404).json({ error: `menu '${menuId}' was not found` });
        return;
      }
      res.json(toAdminMenuResponse(menu));
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};
