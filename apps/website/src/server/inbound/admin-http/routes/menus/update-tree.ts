import {
  MenuConflictError,
  MenuNotFoundError,
  MenuValidationError,
  updateMenuTree,
} from "#src/features/navigation/index";
import type { NavItemNode } from "#src/features/navigation/index";
import { toAdminMenuResponse, type MenuRouteRegistrar } from "#src/server/inbound/admin-http/http/menus";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { entityNotLiveResponse } from "#src/server/inbound/admin-http/http/entity-not-live";
import type { Response } from "express";

/** The PUT body's four fields, read off an untyped body, or `null` if `items` is not an array.
 *  @complexity O(1). */
function parseMenuTreeRequestBody(rawBody: unknown): {
  items: NavItemNode[];
  expectedVersion: number;
  title: string | undefined;
  slug: string | undefined;
} | null {
  const body = (rawBody ?? {}) as Record<string, unknown>;
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
 *
 * The three typed cases, and a trashed menu (409 via `entityNotLiveResponse`), carry their own
 * message through to the caller. Anything else is a genuine
 * server fault and is flattened to an opaque "internal error" — but logged first, matching
 * `routes/connectors/errors.ts`'s `sendConnectorError`. Without that log the flattening is total:
 * an unmapped throw (the `TypeError` a missing menu-item `target` used to raise before
 * `@jini-ai/cms`'s `e467f5c4` guarded it) reached an operator as "something broke" with no
 * message, no stack, and no way to tell a client-shaped bug from a real outage. The response
 * body is deliberately unchanged — only the server-side diagnostic is added.
 *
 *  @complexity O(1). */
function sendUpdateMenuTreeError(res: Response, err: unknown): void {
  const live = entityNotLiveResponse(err);
  if (live) {
    res.status(live.status).json(live.body);
    return;
  }
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
  console.error(`admin menu update-tree route failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
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
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const parsedBody = parseMenuTreeRequestBody(req.body);
    if (!parsedBody) {
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
