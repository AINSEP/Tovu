import type { Response } from "express";

import { deleteMenu, MenuLocationBoundError, MenuNotFoundError } from "#src/features/navigation/index";
import { toAdminDeleteMenuResponse, type MenuRouteDeps, type MenuRouteRegistrar } from "#src/server/inbound/admin-http/http/menus";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

/**
 * When `force` is set, checks the separate `admin.menus.delete.force` permission (ADR-PIPE-012
 * D-1) and writes the 403 itself on denial. Returns whether the caller should proceed — `true`
 * unconditionally when `force` is unset, since the ordinary `admin.menus.delete` check already ran.
 *
 * @complexity O(1) plus one `authorize()` call when `force` is set.
 */
async function authorizeForceDelete(
  deps: MenuRouteDeps,
  principal: ReturnType<typeof getAuthedPrincipal>,
  menuId: string,
  force: boolean,
  res: Response
): Promise<boolean> {
  if (!force) return true;
  const forceAuthResult = await deps.authorize({
    principalId: principal.id,
    permission: "admin.menus.delete.force",
    workspaceId: deps.workspaceId,
    entityType: "menu",
    entityId: menuId,
  });
  if (forceAuthResult.allowed) return true;
  res.status(403).json({
    error: `principal '${principal.id}' is not authorized for 'admin.menus.delete.force' (${forceAuthResult.reason})`,
    code: "FORBIDDEN",
    details: { permission: "admin.menus.delete.force", reason: forceAuthResult.reason },
  });
  return false;
}

/** Maps this route's thrown error types onto the admin error envelope. @complexity O(1). */
function sendMenuDeleteError(res: Response, err: unknown): void {
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

/**
 * DELETE a menu — trash on first call, hard-purge on a second call against an
 * already-trashed menu (ADR-029 §6 deletion ladder, mirrors ADR-027 media).
 *
 * `?force=true` bypasses the 409 dangling-location guard on purge. ADR-PIPE-012 D-1 closes the gap
 * this route's earlier doc comment named: force-purge is now gated by its own
 * `admin.menus.delete.force` permission, checked in addition to (not instead of) `admin.menus.delete`
 * — both are checked before any repo call, so a caller holding only `admin.menus.delete` who
 * requests `?force=true` is denied 403 rather than silently downgraded to the ordinary blocked-purge
 * 409 (INV-NEW-02-adjacent discipline; see ADR-PIPE-012 Contract Map C-010a..f).
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
        permission: "admin.menus.delete",
        workspaceId: deps.workspaceId,
        entityType: "menu",
        entityId: menuId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.menus.delete' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.menus.delete", reason: authResult.reason },
        });
        return;
      }

      if (!(await authorizeForceDelete(deps, principal, menuId, force, res))) {
        return;
      }

      const { menu, purged } = await deleteMenu({
        deps: {
          repo: deps.menuRepo,
          bindingRepo: deps.navLocationBindingRepo,
          clock: deps.clock,
          idGen: deps.idGen,
          outbox: deps.outbox,
        },
        input: {
          workspaceId: deps.workspaceId,
          id: menuId,
          force,
        },
      });

      res.json(toAdminDeleteMenuResponse({ menu, purged }));
    } catch (err) {
      sendMenuDeleteError(res, err);
    }
  });
};
