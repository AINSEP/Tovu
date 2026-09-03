import {
  MenuConflictError,
  MenuNotFoundError,
  MenuValidationError,
  updateMenuTree,
} from "#src/features/navigation/index";
import type { NavItemNode } from "#src/features/navigation/index";
import { toAdminMenuResponse, type MenuRouteRegistrar } from "#src/server/inbound/admin-http/http/menus";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { Response } from "express";

/** The PUT body's four fields, read off an untyped body, or `null` if `items` is not an array.
 *
 *  `rawBody` is always an object here — `express.json()` sits ahead of every admin route
 *  (composition/app.ts) and unconditionally sets `req.body = req.body || {}` before any handler
 *  runs (body-parser's own `types/json.js`), so this function's one real caller (`req.body` below)
 *  can never hand it `undefined`. The prior `rawBody ?? {}` default was accordingly dead through
 *  any real HTTP request; removed rather than covered with an artificial direct-invoke test.
 *  @complexity O(1). */
function parseMenuTreeRequestBody(rawBody: unknown): {
  items: NavItemNode[];
  expectedVersion: number;
  title: string | undefined;
  slug: string | undefined;
} | null {
  const body = rawBody as Record<string, unknown>;
  if (!Array.isArray(body.items)) {
    return null;
  }
  return {
    items: body.items as NavItemNode[],
    expectedVersion: Number(body.expectedVersion ?? 0),
    title: typeof body.title === "string" ? body.title : undefined,
    slug: typeof body.slug === "string" ? body.slug : undefined,
  };
}

/** Maps `updateMenuTree`'s thrown error types onto the admin error envelope.
 *  @complexity O(1). */
function sendUpdateMenuTreeError(res: Response, err: unknown): void {
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
    // No `?? ""` fallback on either `req.params` read below: Express only invokes a route's
    // handler once every `:param` segment in its path matched a non-empty path segment, so
    // `workspaceId`/`menuId` are always populated strings here — the same guarantee
    // `admin-post-page-delete-routes.test.ts` documents for `pages/delete.ts`'s `pageId`.
    if (req.params.workspaceId !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const parsedBody = parseMenuTreeRequestBody(req.body);
    if (!parsedBody) {
      res.status(400).json({ error: "items must be an array" });
      return;
    }

    const menuId = req.params.menuId;

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
          expectedVersion: parsedBody.expectedVersion,
          title: parsedBody.title,
          slug: parsedBody.slug,
          items: parsedBody.items,
        },
      });

      res.json(toAdminMenuResponse(menu));
    } catch (err) {
      sendUpdateMenuTreeError(res, err);
    }
  });
};
