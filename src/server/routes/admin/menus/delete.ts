import { deleteMenu, MenuLocationBoundError, MenuNotFoundError } from "../../../../navigation/menu-service";
import { toAdminDeleteMenuResponse, type MenuRouteRegistrar } from "../../../../server/http/admin/menus";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";

/**
 * DELETE a menu — trash on first call, hard-purge on a second call against an
 * already-trashed menu (ADR-029 §6 deletion ladder, mirrors ADR-027 media).
 *
 * `?force=true` bypasses the 409 dangling-location guard on purge. A separate
 * `navigation.delete.force` permission (an idea floated in this route's earlier doc comment) was
 * not registered — no other route in this pass splits a single mutation into per-flag permissions,
 * and ADR-029 itself never finalized that split (see the Programmer handoff's naming-inconsistency
 * disclosure). `navigation.manage` gates the whole delete/purge/force-purge ladder uniformly.
 */
export const registerAdminMenuDeleteRoute: MenuRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/menus/:menuId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const force = String(req.query.force ?? "") === "true";
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

      const { menu, purged } = await deleteMenu({
        deps: {
          repo: deps.menuRepo,
          bindingRepo: deps.navLocationBindingRepo,
          clock: deps.clock,
        },
        input: {
          workspaceId: deps.workspaceId,
          id: menuId,
          force,
        },
      });

      res.json(toAdminDeleteMenuResponse(menu, purged));
    } catch (err) {
      if (err instanceof MenuLocationBoundError) {
        res.status(409).json({ error: err.message, boundLocations: err.boundLocations });
        return;
      }
      if (err instanceof MenuNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "internal error" });
    }
  });
};
