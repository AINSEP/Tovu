import {
  MenuConflictError,
  MenuNotFoundError,
  MenuValidationError,
  updateMenuTree,
} from "../../../../navigation";
import type { NavItemNode } from "../../../../navigation";
import { toAdminMenuResponse, type MenuRouteRegistrar } from "../../../../server/http/admin/menus";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";

/**
 * PUT a menu's whole item tree (ADR-029 `updateMenuTree`, whole-tree replace
 * with OCC on `expectedVersion`).
 *
 * Direct feature call, not the ADR-018 command gateway (`executeCommand`) —
 * see the handoff report: only `post/update` is registered in the revert
 * registry (`core/commands/appliers.ts`) today, so routing menu writes
 * through the gateway would record change sets nothing can revert. Flagged
 * as a policy question for the coordinator rather than resolved unilaterally
 * here.
 *
 * Gated by `admin.menus.update` (ADR-PIPE-012 D-1/D-2/D-9 — renamed/split from the old flat navigation permission),
 * checked directly via `authorize()` (same in-route pattern as `members/disable.ts`, appropriate
 * here since this bypasses the gateway).
 */
export const registerAdminMenuUpdateTreeRoute: MenuRouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/menus/:menuId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    if (!Array.isArray(req.body?.items)) {
      res.status(400).json({ error: "items must be an array" });
      return;
    }

    const menuId = String(req.params.menuId ?? "");

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.menus.update",
        workspaceId: deps.workspaceId,
        entityType: "menu",
        entityId: menuId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.menus.update' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.menus.update", reason: authResult.reason },
        });
        return;
      }

      const { menu } = await updateMenuTree({
        deps: { repo: deps.menuRepo, clock: deps.clock, idGen: deps.idGen, outbox: deps.outbox },
        input: {
          workspaceId: deps.workspaceId,
          id: menuId,
          expectedVersion: Number(req.body?.expectedVersion ?? 0),
          title: typeof req.body?.title === "string" ? req.body.title : undefined,
          slug: typeof req.body?.slug === "string" ? req.body.slug : undefined,
          items: req.body.items as NavItemNode[],
        },
      });

      res.json(toAdminMenuResponse(menu));
    } catch (err) {
      if (err instanceof MenuValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof MenuConflictError) {
        res.status(409).json({ error: err.message });
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
