import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { filterVisibleTrashItems, trashDaysRemaining, TRASH_READ_PERMISSION } from "#src/features/trash/index";
import type { TrashItem } from "@jini-ai/cms/trash";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { DEFAULT_TRASH_PAGE_SIZE, MAX_TRASH_PAGE_SIZE, type TrashRouteDeps, type TrashRouteRegistrar } from "./deps.js";
import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";

/**
 * GET one page of the Trash.
 *
 * Display strings come from the `trashed_items` snapshot; no entity payload is parsed, which is what
 * keeps this endpoint working on rows whose payload is corrupt (the failure `widgets_trash_instance`
 * still has today). Post subtype resolution reads only the `posts.kind` column for the same reason.
 * Rows whose `purge_after` has passed are excluded by the repo itself, so a site that sat closed past
 * day 60 shows nothing expired on its first render, sweeper or no sweeper.
 */
export const registerAdminTrashListRoute: TrashRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/trash", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;

    try {
      const principal = getAuthedPrincipal(res);
      const params = { principalId: principal.id, permission: TRASH_READ_PERMISSION, workspaceId: deps.workspaceId };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;

      const now = deps.clock.nowIso();
      const page = await readVisiblePage({ deps, principalId: principal.id, now, limit: readLimit({ raw: req.query.limit }),
        entityTypes: readEntityTypes({ raw: req.query.entityTypes }), cursor: readCursor({ raw: req.query.cursor }) });
      const visible = page.items;
      // Skip the query on an empty page (nothing visible to this principal, or the Trash truly is
      // empty) rather than paying for a lookup with no rows to resolve.
      const usernameByPrincipalId = visible.length > 0 ? await loadUsernamesByPrincipalId(deps) : new Map<string, string>();
      const postKindById = await loadPostDisplayKinds({ items: visible, deps });
      res.json({
        items: visible.map((item) => {
          const displayKind = item.entityType === "post" ? postKindById.get(item.entityId) : undefined;
          return { ...toAdminTrashResponse({ item, now, usernameByPrincipalId }), ...(displayKind ? { displayKind } : {}) };
        }),
        nextCursor: page.nextCursor,
      });
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/trash/list", code: "INTERNAL_ERROR" });
    }
  });
};

/**
 * The most source reads one list request makes while hidden rows keep the page short. Bounded so a
 * Trash full of rows this principal may not see cannot turn one request into a full-table scan;
 * hitting it returns a short page whose `nextCursor` still resumes exactly where reading stopped.
 */
const MAX_TRASH_LIST_READS = 10;

/**
 * One page of rows `principalId` may see, filled to `limit` across several source reads (B150).
 *
 * Filtering happens after each read (per-kind, not per-surface: a principal who can only moderate
 * comments must not read the titles of deleted posts here any more than through the agent tool), so
 * a single read can come back short while visible rows remain. Each follow-up read asks only for the
 * shortfall: every row it returns fits on the page, so `nextCursor` never skips a visible row.
 * A read that returns no rows stops the loop even with a cursor, so a misbehaving source cannot spin.
 *
 * @complexity O(MAX_TRASH_LIST_READS) source reads and O(limit · MAX_TRASH_LIST_READS) rows.
 */
async function readVisiblePage(
  required: { deps: TrashRouteDeps; principalId: string; now: string; limit: number; entityTypes: string[] | undefined; cursor: string | null },
  _optional: Record<string, never> = {}
): Promise<{ items: TrashItem[]; nextCursor: string | null }> {
  const { deps, principalId, now, limit, entityTypes } = required;
  const items: TrashItem[] = [];
  let cursor = required.cursor;
  for (let reads = 0; reads < MAX_TRASH_LIST_READS; reads++) {
    const page = await deps.trash.list({ workspaceId: deps.workspaceId, now, limit: limit - items.length }, { entityTypes, cursor });
    items.push(...await filterVisibleTrashItems(deps, { principalId, items: page.items }));
    cursor = page.nextCursor;
    if (items.length >= limit || cursor === null || page.items.length === 0) break;
  }
  return { items, nextCursor: cursor };
}

/**
 * Resolve post/page subtypes without parsing entity payloads or changing trash identity.
 * Authorization has already filtered the input; missing rows leave the additive field absent.
 * @complexity O(p) results for at most MAX_TRASH_PAGE_SIZE visible posts, one column-only query.
 */
async function loadPostDisplayKinds(
  required: { items: readonly TrashItem[]; deps: TrashRouteDeps },
  _optional: Record<string, never> = {}
): Promise<ReadonlyMap<string, string>> {
  const ids = required.items.filter((item) => item.entityType === "post").map((item) => item.entityId);
  if (ids.length === 0) return new Map();
  // Only the two subtypes the admin contract names (`AdminTrashItem.displayKind`) are emitted.
  const posts = await required.deps.db.run((db) => db.selectFrom("posts")
    .select(["id", "kind"])
    .where("workspace_id", "=", required.deps.workspaceId)
    .where("id", "in", ids)
    .where("kind", "in", ["page", "post"])
    .execute());
  return new Map(posts.map((post) => [post.id, post.kind]));
}

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
 * (`Jini/packages/cms/src/widgets/write-service.ts`'s `ADOPTION_ACTOR`) — today the only non-human actor the
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
export function toAdminTrashResponse({ item, now, usernameByPrincipalId }: { item: TrashItem; now: string; usernameByPrincipalId: ReadonlyMap<string, string> }, _optional = {}) {
  return {
    id: item.id,
    entityType: item.entityType,
    entityId: item.entityId,
    title: item.displayTitle,
    subtitle: item.displaySubtitle,
    trashedAt: item.trashedAt,
    purgeAfter: item.purgeAfter,
    daysRemaining: trashDaysRemaining({ now, until: item.purgeAfter }),
    actorPrincipalId: item.actorPrincipalId,
    actorPluginId: item.actorPluginId,
    actorUsername: usernameByPrincipalId.get(item.actorPrincipalId) ?? null,
    actorIsSystem: item.actorPrincipalId === SYSTEM_ACTOR_PRINCIPAL_ID,
  };
}

/** @complexity O(n) in the filter's length. Unknown kinds are left in — the per-row filter drops them. */
function readEntityTypes({ raw }: { raw: unknown }, _optional = {}): string[] | undefined {
  const joined = Array.isArray(raw) ? raw.join(",") : "";
  const value = typeof raw === "string" ? raw : joined;
  const types = value.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  return types.length > 0 ? types : undefined;
}

/** Clamped rather than rejected: a bad `limit` is not worth a 400 on a read. @complexity O(1). */
function readLimit({ raw }: { raw: unknown }, _optional = {}): number {
  const parsed = Number.parseInt(typeof raw === "string" ? raw : "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TRASH_PAGE_SIZE;
  return Math.min(parsed, MAX_TRASH_PAGE_SIZE);
}

/** @complexity O(1). */
function readCursor({ raw }: { raw: unknown }, _optional = {}): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}
