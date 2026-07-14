import { createMenu, MenuConflictError, MenuValidationError } from "../../../../navigation/menu-service";
import type { NavItemNode } from "../../../../navigation";
import { toAdminMenuResponse, type MenuRouteRegistrar } from "../../../../server/http/admin/menus";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";

/**
 * POST a new menu (ADR-029 `createMenu`).
 *
 * `items` is optional (defaults to an empty menu); when supplied it is
 * validated end-to-end by `validateAndCloneTree` inside `createMenu` (id
 * uniqueness, depth/count bounds, target-kind allowlist, `url` scheme
 * denylist) — this route only rejects a non-array `items` before handing off.
 *
 * Gated by `admin.menus.create` (ADR-PIPE-012 D-1/D-2/D-9 — renamed/split from the old flat navigation permission),
 * checked directly via `authorize()` — mirrors `members/disable.ts`'s pattern since menu mutations
 * are a direct feature call, not routed through the SPEC-001 command gateway (see `update-tree.ts`'s
 * doc for why).
 */
export const registerAdminMenuCreateRoute: MenuRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/menus", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const rawItems = req.body?.items;
    if (rawItems !== undefined && !Array.isArray(rawItems)) {
      res.status(400).json({ error: "items must be an array" });
      return;
    }

    try {
      // Inside the try: requireAdminSession always sets res.locals.principal before this
      // route runs, but Express 4 doesn't catch a synchronous throw from an async handler
      // outside try/catch (the request would otherwise hang instead of 500ing).
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.menus.create",
        workspaceId: deps.workspaceId,
        entityType: "menu",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.menus.create' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.menus.create", reason: authResult.reason },
        });
        return;
      }

      const { menu } = await createMenu({
        deps: { repo: deps.menuRepo, clock: deps.clock, idGen: deps.idGen, outbox: deps.outbox },
        input: {
          workspaceId: deps.workspaceId,
          title: String(req.body?.title ?? ""),
          slug: String(req.body?.slug ?? ""),
          items: rawItems as NavItemNode[] | undefined,
        },
      });

      res.status(201).json(toAdminMenuResponse(menu));
    } catch (err) {
      if (err instanceof MenuValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof MenuConflictError) {
        res.status(409).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "internal error" });
    }
  });
};
