import { toAdminMenuResponse, type MenuRouteRegistrar } from "#src/server/inbound/admin-http/http/menus";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

/**
 * GET one menu by id, including its full item tree (ADR-029).
 *
 * Gated by `admin.menus.read` (ADR-PIPE-012 D-1/D-2/D-9 — renamed/split from
 * the old flat navigation permission).
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
        permission: "admin.menus.read",
        workspaceId: deps.workspaceId,
        entityType: "menu",
        entityId: menuId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.menus.read' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.menus.read", reason: authResult.reason },
        });
        return;
      }

      // Admin URLs use the slug when one resolves (readable-slugs S6b, 2026-09-23) — this route
      // accepts either so an old id-based bookmark/link keeps working. Slug first, id second: same
      // precedent and rationale as posts' `getAdminPostByIdOrSlug` (`features/post/post.ts`) — the
      // slug is the handle a human typed into the URL; the id is the fallback for a stale link.
      const bySlug = await deps.menuRepo.findBySlug({ workspaceId: deps.workspaceId, slug: menuId.trim().toLowerCase() });
      const menu = bySlug ?? (await deps.menuRepo.findById({ workspaceId: deps.workspaceId, id: menuId }));
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
