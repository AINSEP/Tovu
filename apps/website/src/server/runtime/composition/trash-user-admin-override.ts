import type { AuthServiceDeps } from "@jini-ai/cms/identity";

import { callerMayManageUserTrash } from "#src/features/identity/delete-user-service";
import { USER_ENTITY_TYPE, type TrashAuthorizeFn } from "#src/features/trash/index";

/**
 * @file The composition-root-only seam that lets the Trash's generic restore/purge routes honor the
 * OWNER DECISION 2026-09-24 gate for users (delete-user plan v2 Slice 2/3) without touching
 * `permissions.ts`'s `TRASH_PERMISSION_BY_ENTITY_TYPE` (a single shared, permission-string-keyed map
 * used by every trashable kind) or `mayActOnEntityType`/`filterVisibleTrashItems` (shared by
 * `list.ts`/`restore.ts`/`purge.ts`/`items.ts` for every kind). Widening either of those directly
 * would risk affecting every other kind's authorization, not just `user`. Wrapping the `authorize`
 * callback instead, and doing so ONLY for the Trash module's own deps (never `RouteDeps.authorize`
 * itself, which every non-Trash route in the product also reads), keeps the change scoped to
 * exactly the one place — and the one entity type — the decision names.
 */

/**
 * Wraps a Trash `authorize` callback (`TrashRouteDeps.authorize`) so a caller who fails the base
 * check is still allowed when `entityType === "user"` AND {@link callerMayManageUserTrash} says
 * they may manage user trash (owner, or the built-in `admin` role). Every other `entityType` — and
 * the routes' own coarser `content.read` entry gate, which never sets `entityType` at all — passes
 * through `base` completely unchanged.
 *
 * Reuses `callerMayManageUserTrash` (the exact function `trashUser`'s own caller gate calls) rather
 * than re-deriving "owner or built-in admin" a second time, so the initial trash action and a later
 * restore/purge of the same user can never drift onto two different rules for who may act on it.
 *
 * @complexity O(1) plus `base`'s own cost, plus — only when `base` denied AND `entityType==="user"`
 * — `callerMayManageUserTrash`'s O(r) role lookups (r = roles the caller holds).
 */
export function withUserTrashAdminOverride(required: {
  base: TrashAuthorizeFn;
  identity: AuthServiceDeps;
  workspaceId: string;
}): TrashAuthorizeFn {
  const { base, identity, workspaceId } = required;
  return async (params) => {
    const decision = await base(params);
    if (decision.allowed || params.entityType !== USER_ENTITY_TYPE) return decision;
    const mayManage = await callerMayManageUserTrash({
      deps: identity,
      workspaceId,
      callerPrincipalId: params.principalId,
    });
    return mayManage ? { allowed: true, reason: "builtin-admin-role-user-trash-override" } : decision;
  };
}
