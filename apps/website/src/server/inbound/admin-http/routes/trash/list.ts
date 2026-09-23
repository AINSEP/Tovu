import { filterVisibleTrashItems, trashDaysRemaining, TRASH_READ_PERMISSION } from "#src/features/trash/index";
import type { TrashItem } from "#src/features/trash/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { DEFAULT_TRASH_PAGE_SIZE, MAX_TRASH_PAGE_SIZE, type TrashRouteDeps, type TrashRouteRegistrar } from "./deps.js";

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
      // Skip the query on an empty page (nothing visible to this principal, or the Trash truly is
      // empty) rather than paying for a lookup with no rows to resolve.
      const usernameByPrincipalId = visible.length > 0 ? await loadUsernamesByPrincipalId(deps) : new Map<string, string>();
      res.json({
        items: visible.map((item) => toAdminTrashResponse(item, now, usernameByPrincipalId)),
        nextCursor: page.nextCursor,
      });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

/**
 * One `userRepo.list` call per request, not one lookup per row — the admin Users screen already
 * reads this same unpaginated list (`UserRepoPort.list`'s own doc: "Not paginated in v1"), so a
 * workspace's user count is already assumed small enough for a single in-memory pass here too.
 *
 * @complexity O(u) in the workspace's user count, once per request regardless of page size.
 */
async function loadUsernamesByPrincipalId(deps: TrashRouteDeps): Promise<ReadonlyMap<string, string>> {
  const users = await deps.userRepo.list({ workspaceId: deps.workspaceId });
  return new Map(users.map((user) => [user.principalId, user.username]));
}

/**
 * The principal id the boot-time widget adoption writes as its actor
 * (`features/widgets/write-service.ts`'s `ADOPTION_ACTOR`) — today the only non-human actor the
 * Trash records. No `userRepo` account can ever hold this id, so a row bearing it can never be a
 * real, since-removed user account; `actorIsSystem` lets the admin UI tell the two apart instead of
 * both collapsing into "Deleted user" (2026-09-21).
 */
const SYSTEM_ACTOR_PRINCIPAL_ID = "system";

/**
 * The screen's row shape. Keeps `id` — unlike the agent view, which drops it — because the
 * checkboxes select rows by it and the purge endpoint addresses them by it.
 *
 * `actorUsername` is `null` when `usernameByPrincipalId` has no entry for `actorPrincipalId` — the
 * deleting principal's user account no longer exists, or never had one (a non-user system
 * principal). The admin UI decides the fallback copy for that case; this endpoint never sends the
 * raw id as if it were a display value.
 *
 * @complexity O(1).
 */
export function toAdminTrashResponse(item: TrashItem, now: string, usernameByPrincipalId: ReadonlyMap<string, string>) {
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
    actorUsername: usernameByPrincipalId.get(item.actorPrincipalId) ?? null,
    actorIsSystem: item.actorPrincipalId === SYSTEM_ACTOR_PRINCIPAL_ID,
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
