import { trashPermissionFor as permission, mayActOnEntityType as mayAct, filterVisibleTrashItems as filter } from "@jini-ai/cms/trash/site/permissions";
/**
 * @file Who may see, restore and permanently remove which kind of trashed thing.
 *
 * The Trash is the only surface in the product that lists several unrelated domains side by side,
 * so a single `trash.read`/`trash.manage` pair would be a way around every one of them at once: a
 * principal trusted only to moderate comments would read the titles of every deleted post, and
 * could permanently destroy them. Instead **every row is gated by the permission that row's own
 * kind already required to be deleted**, resolved per row, in one place that both the agent tools
 * and the admin HTTP routes read — the two surfaces cannot drift apart because there is only one
 * lookup.
 *
 * Two sources feed that lookup, per `ADS-memory/.local-artifacts/handoffs/2026-09-21-t8f-trash-more-plan.md`
 * §1/§4:
 *  - {@link TRASH_PERMISSION_BY_ENTITY_TYPE} — the bespoke kinds (post/comment/media/redirect), whose
 *    adapters predate `TRASHABLE` and are not expected to move into it soon (§2's "stay on raw SQL
 *    for now"). A fixed, hand-maintained map is the right shape for a fixed, small set.
 *  - `TRASHABLE` itself (`registry.ts`) — every kind registered there already carries its own
 *    `permission` field, so a phase-2 kind (`form` today; `menu`/`term`/`taxonomy`/`form_submission`/
 *    `widget` later) needs no second entry here. `trashPermissionFor` is the merge point.
 */
import { COMMENT_ENTITY_TYPE } from "./adapters/comment.js";
import { MEDIA_ENTITY_TYPE } from "@jini-ai/cms/trash/site/adapters/media";
import { POST_ENTITY_TYPE } from "@jini-ai/cms/trash/site/adapters/post";
import { PLUGIN_ENTITY_TYPE } from "@jini-ai/cms/trash/site/adapters/plugin";
import { REDIRECT_ENTITY_TYPE } from "@jini-ai/cms/trash/site/adapters/redirect";
import { THEME_ENTITY_TYPE } from "@jini-ai/cms/trash/site/adapters/theme";
import { USER_ENTITY_TYPE } from "@jini-ai/cms/trash/site/adapters/user";
import type { TrashEntityType, TrashItem, TrashRegistry } from "@jini-ai/cms/trash";

/** The entry gate on the Trash surface itself. Every row is then filtered again, per kind. */
export const TRASH_READ_PERMISSION = "content.read";

/**
 * The BESPOKE kinds' gate: **the same permission that kind's own delete path required.**
 *
 * `content_post_delete` and `posts/delete.ts` gate on `content.write` (this codebase grants no
 * `content.delete` anywhere); comments moderation on `comments.moderate`; `media/trash.ts` on
 * `media.delete`; `redirects_tombstone` on `admin.redirects.manage`; users on the literal `"*"`
 * (delete-user plan v2 decision 1) — `user.manage` is not enough on its own, since `role.manage`
 * can grant it to a non-owner custom role, and `"*"` is not a catalog permission any such role can
 * ever hold (`Jini` `permissions.ts:638`).
 *
 * A kind absent from BOTH this map and `TRASHABLE` is neither listable nor restorable nor
 * purgeable. That is the conservative default on purpose: a phase-2 domain has to opt in
 * deliberately, rather than inheriting whatever the Trash happened to grant.
 */
export const TRASH_PERMISSION_BY_ENTITY_TYPE: ReadonlyMap<TrashEntityType, string> = new Map([
  [POST_ENTITY_TYPE, "content.write"],
  [COMMENT_ENTITY_TYPE, "comments.moderate"],
  [MEDIA_ENTITY_TYPE, "media.delete"],
  [REDIRECT_ENTITY_TYPE, "admin.redirects.manage"],
  [PLUGIN_ENTITY_TYPE, "admin.plugins.enable"],
  // `theme_trash`'s own gate (`theme.edit`, `features/theme/agent-tools.ts`'s THEME_WRITE_PERMISSION).
  [THEME_ENTITY_TYPE, "theme.edit"],
  [USER_ENTITY_TYPE, "*"],
]);


export function trashPermissionFor({ entityType, deps }: { entityType: Parameters<typeof permission>[0]["entityType"]; deps: Omit<Parameters<typeof permission>[0]["deps"], "permissionByEntityType"> }, _optional: Record<string, never> = {}) {
  return permission({ entityType, deps: { ...deps, permissionByEntityType: TRASH_PERMISSION_BY_ENTITY_TYPE } });
}

export function mayActOnEntityType(deps: Omit<Parameters<typeof mayAct>[0], "permissionByEntityType">, required: Parameters<typeof mayAct>[1]) {
  return mayAct({ ...deps, permissionByEntityType: TRASH_PERMISSION_BY_ENTITY_TYPE }, required);
}

export function filterVisibleTrashItems(deps: Omit<Parameters<typeof filter>[0], "permissionByEntityType">, required: Parameters<typeof filter>[1]) {
  return filter({ ...deps, permissionByEntityType: TRASH_PERMISSION_BY_ENTITY_TYPE }, required);
}
