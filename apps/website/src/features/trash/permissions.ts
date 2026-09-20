/**
 * @file Who may see, restore and permanently remove which kind of trashed thing.
 *
 * The Trash is the only surface in the product that lists four unrelated domains side by side, so a
 * single `trash.read`/`trash.manage` pair would be a way around four separate permissions at once:
 * a principal trusted only to moderate comments would read the titles of every deleted post, and
 * could permanently destroy them. Instead **every row is gated by the permission that row's own
 * kind already required to be deleted**, resolved per row, in one place that both the agent tools
 * and the admin HTTP routes read — the two surfaces cannot drift apart because there is only one
 * map.
 */
import { COMMENT_ENTITY_TYPE } from "./adapters/comment.js";
import { MEDIA_ENTITY_TYPE } from "./adapters/media.js";
import { POST_ENTITY_TYPE } from "./adapters/post.js";
import { REDIRECT_ENTITY_TYPE } from "./adapters/redirect.js";
import type { TrashEntityType, TrashItem } from "./ports.js";

/** The entry gate on the Trash surface itself. Every row is then filtered again, per kind. */
export const TRASH_READ_PERMISSION = "content.read";

/**
 * Per-kind gate: **the same permission that kind's own delete path required.**
 *
 * `content_post_delete` and `posts/delete.ts` gate on `content.write` (this codebase grants no
 * `content.delete` anywhere); comments moderation on `comments.moderate`; `media/trash.ts` on
 * `media.delete`; `redirects_tombstone` on `admin.redirects.manage`.
 *
 * A kind absent from this map is neither listable nor restorable nor purgeable. That is the
 * conservative default on purpose: a phase-2 domain has to opt in here deliberately, rather than
 * inheriting whatever the Trash happened to grant.
 */
export const TRASH_PERMISSION_BY_ENTITY_TYPE: ReadonlyMap<TrashEntityType, string> = new Map([
  [POST_ENTITY_TYPE, "content.write"],
  [COMMENT_ENTITY_TYPE, "comments.moderate"],
  [MEDIA_ENTITY_TYPE, "media.delete"],
  [REDIRECT_ENTITY_TYPE, "admin.redirects.manage"],
]);

/**
 * The permission a kind needs, or `null` when the Trash does not own that kind.
 *
 * Exists so a caller that is going to check the permission ANYWAY (through its own evaluator) can
 * resolve the name without a second authorization round-trip — the single-evaluator rule.
 *
 * @complexity O(1).
 */
export function trashPermissionFor(entityType: TrashEntityType): string | null {
  return TRASH_PERMISSION_BY_ENTITY_TYPE.get(entityType) ?? null;
}

/** The non-throwing authorization seam both surfaces already hold. */
export type TrashAuthorizeFn = (params: {
  principalId: string;
  permission: string;
  workspaceId: string;
  entityType?: string;
  entityId?: string;
}) => Promise<{ allowed: boolean; reason: string }>;

/**
 * Decides whether `principalId` may act on one kind of trashed thing.
 *
 * @returns the permission that was checked and the decision. The permission is returned so a
 *          denial can name it — a 403 saying only "forbidden" tells an operator nothing about
 *          which of four roles they are missing.
 * @complexity O(1) beyond the injected `authorize` call.
 */
export async function mayActOnEntityType(
  deps: { authorize: TrashAuthorizeFn; workspaceId: string },
  required: { principalId: string; entityType: TrashEntityType; entityId?: string }
): Promise<{ permission: string | null; allowed: boolean; reason: string }> {
  const permission = trashPermissionFor(required.entityType);
  if (!permission) {
    return { permission: null, allowed: false, reason: `'${required.entityType}' is not a kind the Trash owns` };
  }
  const decision = await deps.authorize({
    principalId: required.principalId,
    permission,
    workspaceId: deps.workspaceId,
    entityType: required.entityType,
    entityId: required.entityId,
  });
  return { permission, allowed: decision.allowed, reason: decision.reason };
}

/**
 * Drops the rows `principalId` may not act on.
 *
 * Filters AFTER the page is fetched rather than narrowing the query's `entityTypes`, so a page can
 * come back short. That is the honest shape: `nextCursor` still points at the next row in the real
 * keyset, whereas shrinking the query would make the cursor skip rows the caller IS allowed to see
 * if their permissions changed mid-scan.
 *
 * @complexity O(n) rows and at most one `authorize` call per DISTINCT kind on the page (four).
 */
export async function filterVisibleTrashItems(
  deps: { authorize: TrashAuthorizeFn; workspaceId: string },
  required: { principalId: string; items: readonly TrashItem[] }
): Promise<TrashItem[]> {
  const decidedByType = new Map<TrashEntityType, boolean>();
  const visible: TrashItem[] = [];
  for (const item of required.items) {
    let allowed = decidedByType.get(item.entityType);
    if (allowed === undefined) {
      allowed = (await mayActOnEntityType(deps, { principalId: required.principalId, entityType: item.entityType })).allowed;
      decidedByType.set(item.entityType, allowed);
    }
    if (allowed) visible.push(item);
  }
  return visible;
}

/**
 * Whole days from `now` until `until`, floored at 0.
 *
 * Floored rather than allowed to go negative because both surfaces already exclude expired rows: a
 * negative number could only come from clock skew, and "-3 days left" reads as a bug rather than as
 * "this is overdue".
 *
 * @complexity O(1).
 */
export function trashDaysRemaining(now: string, until: string): number {
  const ms = new Date(until).getTime() - new Date(now).getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
}
