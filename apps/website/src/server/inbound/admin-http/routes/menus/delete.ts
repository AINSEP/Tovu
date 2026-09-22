import { MenuConflictError, MenuNotFoundError } from "#src/features/navigation/index";
import { trashMenu } from "#src/features/navigation/trash-menu";
import { toAdminTrashMenuResponse, type MenuRouteRegistrar } from "#src/server/inbound/admin-http/http/menus";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

/**
 * DELETE a menu — moves it to the Trash (ADR-029 §6 / trash pipeline). No more force/purge ladder:
 * purging (permanent deletion) happens only through the generic Trash surface, which already
 * unassigns a bound menu's locations at purge time (T1's registry `purgeFirst`). A second call
 * against an already-trashed menu 404s like any other not-found — there is no separate
 * `admin.menus.delete.force` permission or `?force=true` behavior left to gate.
 */
export const registerAdminMenuDeleteRoute: MenuRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/menus/:menuId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    const menuId = String(req.params.menuId ?? "");
    try {
      const principal = getAuthedPrincipal(res);
      const authorized = await authorizeOrRespond(res, deps.authorize, {
        principalId: principal.id,
        permission: "admin.menus.delete",
        workspaceId: deps.workspaceId,
        entityType: "menu",
        entityId: menuId,
      });
      if (!authorized) return;

      const trashed = await trashMenu(
        { workspaceId: deps.workspaceId, menuId, actor: { principalId: principal.id } },
        { menuRepo: deps.menuRepo, remove: deps.removeMenu, clock: deps.clock }
      );
      res.json(toAdminTrashMenuResponse(trashed));
    } catch (err) {
      if (err instanceof MenuNotFoundError) { res.status(404).json({ error: err.message }); return; }
      if (err instanceof MenuConflictError) { res.status(409).json({ error: err.message }); return; }
      res.status(500).json({ error: "internal error" });
    }
  });
};
