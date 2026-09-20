import { filterVisibleTrashItems, trashDaysRemaining, TRASH_READ_PERMISSION } from "#src/features/trash/index";
import type { TrashItem } from "#src/features/trash/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { DEFAULT_TRASH_PAGE_SIZE, MAX_TRASH_PAGE_SIZE, type TrashRouteRegistrar } from "./deps.js";

/**
 * GET one page of the Trash.
 *
 * Every row is rendered from the `trashed_items` snapshot alone — no entity is read, which is what
 * keeps this endpoint working on rows whose payload is corrupt (the failure `widgets_trash_instance`
 * still has today). Rows whose `purge_after` has passed are excluded by the repo itself, so a site
 * that sat closed past day 60 shows nothing expired on its first render, sweeper or no sweeper.
 */
export const registerAdminTrashListRoute: TrashRouteRegistrar = (app, deps) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/trash", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: TRASH_READ_PERMISSION,
        workspaceId: deps.workspaceId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for '${TRASH_READ_PERMISSION}' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: TRASH_READ_PERMISSION, reason: authResult.reason },
        });
        return;
      }

      const now = deps.clock.nowIso();
      const page = await deps.trash.list({
        workspaceId: deps.workspaceId,
        now,
        entityTypes: readEntityTypes(req.query.entityTypes),
        limit: readLimit(req.query.limit),
        cursor: readCursor(req.query.cursor),
      });

      // Per-kind, not per-surface: a principal who can only moderate comments must not read the
      // titles of deleted posts here any more than they can through the agent tool.
      const visible = await filterVisibleTrashItems(deps, { principalId: principal.id, items: page.items });
      res.json({ items: visible.map((item) => toAdminTrashResponse(item, now)), nextCursor: page.nextCursor });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

/**
 * The screen's row shape. Keeps `id` — unlike the agent view, which drops it — because the
 * checkboxes select rows by it and the purge endpoint addresses them by it.
 *
 * @complexity O(1).
 */
export function toAdminTrashResponse(item: TrashItem, now: string) {
  return {
    id: item.id,
    entityType: item.entityType,
    entityId: item.entityId,
    title: item.displayTitle,
    subtitle: item.displaySubtitle,
    trashedAt: item.trashedAt,
    purgeAfter: item.purgeAfter,
    daysRemaining: trashDaysRemaining(now, item.purgeAfter),
    actorPrincipalId: item.actorPrincipalId,
    actorPluginId: item.actorPluginId,
  };
}

/** @complexity O(n) in the filter's length. Unknown kinds are left in — the per-row filter drops them. */
function readEntityTypes(raw: unknown): string[] | undefined {
  const value = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join(",") : "";
  const types = value.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  return types.length > 0 ? types : undefined;
}

/** Clamped rather than rejected: a bad `limit` is not worth a 400 on a read. @complexity O(1). */
function readLimit(raw: unknown): number {
  const parsed = Number.parseInt(typeof raw === "string" ? raw : "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TRASH_PAGE_SIZE;
  return Math.min(parsed, MAX_TRASH_PAGE_SIZE);
}

/** @complexity O(1). */
function readCursor(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}
