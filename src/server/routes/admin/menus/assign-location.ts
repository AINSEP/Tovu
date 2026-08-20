import { assignLocation, MenuNotFoundError } from "#src/navigation/index";
import { toAdminAssignLocationResponse, type MenuRouteRegistrar } from "#src/server/http/admin/menus";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";

/** Reads+trims `locationKey` off the body in one place; `null` means missing or blank.
 *  @complexity O(1). */
function parseLocationKey(rawBody: unknown): string | null {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  const locationKey = String(body.locationKey ?? "").trim();
  return locationKey || null;
}

/**
 * POST assign a menu to a theme location (ADR-029 `assignLocation`).
 *
 * Last-writer-wins: if the location was already bound to a different menu,
 * that menu is displaced (its `locations` field loses the key) and the
 * response includes it as `displacedMenu` so the UI can show what changed.
 *
 * Gated by `admin.menus.assign` (ADR-PIPE-012 D-1/D-2/D-9 — renamed/split from the old flat
 * navigation permission), checked directly via `authorize()` (same pattern as `create.ts`).
 */
export const registerAdminMenuAssignLocationRoute: MenuRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/menus/:menuId/locations", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const locationKey = parseLocationKey(req.body);
    if (!locationKey) {
      res.status(400).json({ error: "locationKey is required" });
      return;
    }

    const menuId = String(req.params.menuId ?? "");

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.menus.assign",
        workspaceId: deps.workspaceId,
        entityType: "menu",
        entityId: menuId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.menus.assign' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.menus.assign", reason: authResult.reason },
        });
        return;
      }

      const { menu, binding, displacedMenu } = await assignLocation({
        deps: {
          repo: deps.menuRepo,
          bindingRepo: deps.navLocationBindingRepo,
          clock: deps.clock,
          idGen: deps.idGen,
          outbox: deps.outbox,
        },
        input: {
          workspaceId: deps.workspaceId,
          menuId,
          locationKey,
        },
      });

      res.json(toAdminAssignLocationResponse({ menu, binding, displacedMenu }));
    } catch (err) {
      if (err instanceof MenuNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "internal error" });
    }
  });
};
