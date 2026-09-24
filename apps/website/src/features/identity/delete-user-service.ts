import type { UUID } from "@jini-ai/cms/core";
import {
  IdentityForbiddenError,
  IdentityNotFoundError,
  IdentityValidationError,
  OwnerRequiredError,
  resolveEffectivePermissions,
  type AuthorizeDeps,
  type AuthServiceDeps,
} from "@jini-ai/cms/identity";
import { UserDeleteUnsupportedError } from "./user-purge-types.js";

/**
 * @file `trashUser` (delete-user plan v2, decisions 4/5/7, and the OWNER DECISION 2026-09-24 that
 * supersedes decision 1's "owner-role holders only" default) — moves a `kind='user'` or
 * `kind='api_key'` principal to the Trash (disables it, revokes its sessions, indexes it for
 * restore/purge) instead of hard-deleting it. Renamed from the v1 `deleteUser`, which called
 * `UserPurgePort.purgeUser` directly; that hard-delete path is now reached only through the Trash's
 * own purge (`purgeSelected`, or the retention sweeper 60 days later), never straight from this
 * transition.
 *
 * Purpose:
 * Same shape `admin-crud-service.ts`'s `disablePrincipal` and the v1 `deleteUser` already used
 * (`{ deps: AuthServiceDeps, input: {...} }`, plain-`Error`-subclass control flow), now delegating
 * the actual state change to a `RemoveEntity`-shaped callback (`removeUser`) bound to the Trash at
 * composition, instead of writing to `principals` itself.
 *
 * Architectural role:
 * Ordinary core function, not a port (mirrors `disablePrincipal`'s reasoning). `removeUser`'s type
 * below (`RemoveUserFn`) is a structural copy of `features/trash`'s `RemoveEntity`/`TrashMarkerResult`
 * — this file deliberately does not import the Trash feature, the same "no cross-feature import,
 * only a structurally-compatible callback" convention `features/post/post.ts`'s `RemovePostFn`
 * uses for the identical seam. `principalHoldsOwnerWildcard`/`countActiveOwnerWildcardPrincipals`
 * are a private copy of `admin-crud-service.ts`'s same-named helpers, for the reason given below.
 */

/** Thrown when the caller targets their own principal (409 `SELF_DELETE` at the route layer) — a
 *  refusal `disablePrincipal` has no equivalent of, since disabling your own account, unlike
 *  trashing it, is recoverable by another owner without needing a restore. */
export class SelfDeleteError extends Error {}

/** OWNER DECISION 2026-09-24 (delete-user plan v2, decision 7) — thrown by `enable`/`update`/
 *  `reset-password` when the target principal currently has a `trashed_items` row: those
 *  transitions must refuse a trashed principal rather than silently reactivate one still indexed
 *  for purge. Maps to 409 `USER_IN_TRASH` at the route layer. Declared here, not in each route
 *  file, so every consumer throws (and every route maps) the exact same error identity. */
export class UserInTrashError extends Error {}

/** OWNER DECISION 2026-09-24 (delete-user plan v2, decision 7) — thrown by `create` when the
 *  requested username belongs to a principal currently in the Trash: the username stays reserved
 *  until that principal is restored or purged. Maps to 409 `USERNAME_IN_TRASH`. */
export class UsernameInTrashError extends Error {}

/**
 * Structurally identical to `features/trash/ports.ts`'s `RemoveEntity`/`TrashMarkerResult` — see
 * this file's header for why `features/identity` copies the shape instead of importing it.
 * `bindRemoveEntity(trash, USER_ENTITY_TYPE)` (composition root) satisfies this type as-is.
 */
export type RemoveUserFn = (required: {
  workspaceId: UUID;
  id: UUID;
  display: { title: string; subtitle?: string | null };
  at: string;
  expectedVersion: number | null;
  actor: { principalId: UUID; pluginId?: string | null };
}) => Promise<
  | { ok: true; version: number | null; priorMarker?: string | null; noop?: true }
  | { ok: false; reason: "not-found" | "version-changed" }
  | { ok: false; reason: "blocked"; code: string; count: number }
>;

export interface DeleteUserDeps {
  identity: AuthServiceDeps;
  /**
   * Pre-bound to the user entity type at composition. `undefined` only for a composition root with
   * no Trash wiring (the in-memory `app.ts` root) — `trashUser` maps that to
   * `UserDeleteUnsupportedError`, the same 501 the v1 `deleteUser` gave `InMemoryUserPurge`.
   */
  removeUser?: RemoveUserFn;
  /**
   * True iff `principalId` already has a `trashed_items` row. Checked before calling `removeUser`
   * so a second trash of the same target is an idempotent no-op — the user `TrashAdapter`'s `hide`
   * has no idempotency branch of its own (it would just re-disable and re-report the current status
   * as `priorMarker`, corrupting the ORIGINAL `priorMarker` a restore needs); see that file's header.
   */
  isInTrash: (principalId: UUID) => Promise<boolean>;
}

export interface DeleteUserInput {
  workspaceId: UUID;
  callerPrincipalId: UUID;
  principalId: UUID;
  /** Resolved by the caller (`await deps.ownerPrincipalId` at the route layer), mirroring
   *  `disablePrincipal`'s identical convention — keeps this a plain, directly-testable function. */
  seededOwnerPrincipalId: UUID;
}

/** Assembles the `AuthorizeDeps` bag `resolveEffectivePermissions` expects from the flat
 *  `IdentityRepos` bag `AuthServiceDeps.repos` carries — a private copy of `admin-crud-service.ts`'s
 *  `authorizeDepsFrom`, which is not exported (see file header). */
function authorizeDepsFrom(repos: AuthServiceDeps["repos"]): AuthorizeDeps {
  return {
    principals: repos.principals,
    principalRoles: repos.principalRoles,
    rolePolicies: repos.rolePolicies,
    principalPolicies: repos.principalPolicies,
    policyPermissions: repos.policyPermissions,
  };
}

/** Private copy of `admin-crud-service.ts`'s same-named helper — see this file's header for why. */
async function principalHoldsOwnerWildcard(required: {
  deps: AuthServiceDeps;
  workspaceId: UUID;
  principalId: UUID;
}): Promise<boolean> {
  const { deps, workspaceId, principalId } = required;
  const effectiveRows = await resolveEffectivePermissions({
    deps: authorizeDepsFrom(deps.repos),
    principalId,
    workspaceId,
  });
  return effectiveRows.some(
    (row) => row.permission === "*" && row.resourceType == null && row.constraintJson == null
  );
}

/**
 * True iff `principalId` holds the built-in `admin` role, by role name and `isBuiltin`, not by any
 * permission grant (OWNER DECISION 2026-09-24, delete-user plan v2). The built-in admin policy
 * deliberately excludes `user.manage`/`role.manage` (Jini `seed.ts`, "Owner-only per REQ-09"), and
 * granting it one to reach this gate is out of scope (the plan header: "No Jini edits" — a Jini
 * change would also hand a non-owner-assignable custom role nothing, since `role.manage` can only
 * grant a CATALOG permission, and this decision is deliberately role-name-scoped, not permission-
 * scoped, so a custom role can never qualify by any grant). A role rename would silently lose this
 * gate; that is an accepted, documented tradeoff of "the simplest way that fits the existing authz"
 * — the plan's own words — until the finer-grained permission it queues is built.
 *
 * @complexity O(r) role lookups, r = roles the principal holds (small, see
 * `resolveEffectivePermissions`'s identical bound).
 */
async function principalHoldsBuiltinAdminRole(required: {
  deps: AuthServiceDeps;
  workspaceId: UUID;
  principalId: UUID;
}): Promise<boolean> {
  const { deps, workspaceId, principalId } = required;
  const roleLinks = await deps.repos.principalRoles.listByPrincipalId({ workspaceId, principalId });
  const roles = await Promise.all(
    roleLinks.map((link) => deps.repos.roles.findById({ workspaceId, id: link.roleId }))
  );
  return roles.some((role) => role !== null && role.isBuiltin && role.name === "admin");
}

/**
 * OWNER DECISION 2026-09-24's caller gate for trashing/restoring/permanently-deleting users: true
 * iff `callerPrincipalId` is the owner (an unconstrained `*` holder) or holds the built-in `admin`
 * role — never a custom role, even one granted `user.manage` via `role.manage`.
 *
 * Exported (not just `assertCallerMayManageUserTrash` below) so the Trash's generic restore/purge
 * routes can reuse the SAME rule as a boolean check: those routes gate through
 * `TrashAuthorizeFn`/`mayActOnEntityType` (`features/trash/permissions.ts`), which is boolean-
 * shaped, not exception-shaped, and lives in a different feature this file deliberately does not
 * import (see this file's header) — the composition root wraps that boolean callback around this
 * function for `entityType === "user"` only (`server/runtime/composition/trash-user-admin-
 * override.ts`), so the initial trash action and a later restore/purge of the same user can never
 * drift onto two different rules for who may act on it.
 *
 * @complexity O(1) `resolveEffectivePermissions` call plus O(1)
 * `principalHoldsBuiltinAdminRole` call — evaluated in that order so the common case (the owner)
 * never pays for the role lookup.
 */
export async function callerMayManageUserTrash(required: {
  deps: AuthServiceDeps;
  workspaceId: UUID;
  callerPrincipalId: UUID;
}): Promise<boolean> {
  const { deps, workspaceId, callerPrincipalId } = required;
  const isOwner = await principalHoldsOwnerWildcard({ deps, workspaceId, principalId: callerPrincipalId });
  if (isOwner) return true;
  return principalHoldsBuiltinAdminRole({ deps, workspaceId, principalId: callerPrincipalId });
}

/** Throws unless {@link callerMayManageUserTrash} says the caller may act. `IdentityForbiddenError`
 *  is the same error `assertCallerHasAnyPermission` throws for every other permission gate in this
 *  codebase, so the route layer's existing 403 mapping needs no new branch.
 *  @complexity See {@link callerMayManageUserTrash}. */
async function assertCallerMayManageUserTrash(required: {
  deps: AuthServiceDeps;
  workspaceId: UUID;
  callerPrincipalId: UUID;
}): Promise<void> {
  const { deps, workspaceId, callerPrincipalId } = required;
  if (await callerMayManageUserTrash({ deps, workspaceId, callerPrincipalId })) return;
  throw new IdentityForbiddenError(
    `principal '${callerPrincipalId}' is not authorized to trash, restore or permanently delete users`,
    "*",
    "no_grant"
  );
}

/** Private copy of `admin-crud-service.ts`'s same-named helper — see this file's header for why.
 *  @complexity O(n) in the workspace's principal count, same bound that helper documents. */
async function countActiveOwnerWildcardPrincipals(required: {
  deps: AuthServiceDeps;
  workspaceId: UUID;
}): Promise<number> {
  const { deps, workspaceId } = required;
  const allPrincipals = await deps.repos.principals.list({ workspaceId });
  const activePrincipals = allPrincipals.filter((principal) => principal.status === "active");
  const flags = await Promise.all(
    activePrincipals.map((principal) =>
      principalHoldsOwnerWildcard({ deps, workspaceId, principalId: principal.id })
    )
  );
  return flags.filter(Boolean).length;
}

/** Serializes `trashUser` calls (decision 4's concurrency rule, carried over unchanged from v1's
 *  `deleteUser`): without this, two concurrent trashes targeting the workspace's only two active
 *  owner-`*` principals could each read `activeOwnerCount === 2` before either write lands, and both
 *  would pass the INV-08 guard — chaining every call onto one module-level promise makes the
 *  read-then-write sequence for one call fully finish (or throw) before the next call's read begins.
 *  Module-level, not per-workspace: this codebase runs one workspace per process (CIC U-001), so a
 *  single chain is exactly as serialized as a per-workspace map would be, with no map to leak. */
let tail: Promise<unknown> = Promise.resolve();

/**
 * Moves a user (or the orphan `api_key` "runner" principal) to the Trash. Checked in order: caller
 * is the owner or holds the built-in `admin` role (OWNER DECISION 2026-09-24), target exists,
 * target is `kind='user'` or `kind='api_key'`, target is not the caller, target is not the seeded
 * owner, target is not the workspace's last active owner-`*` principal. A target already in the
 * Trash is an idempotent no-op. On success, delegates the state change to `deps.removeUser`
 * (disables the principal, revokes its sessions, and indexes it for the Trash screen — see
 * `features/trash/adapters/user.ts`), which records its own `identity.user.trashed` audit event.
 *
 * @complexity O(n) in the workspace's principal count (the owner-count guard, same bound
 * `disablePrincipal` documents) plus `deps.removeUser`'s own O(1) transaction.
 */
export async function trashUser(required: {
  deps: DeleteUserDeps;
  input: DeleteUserInput;
}): ReturnType<RemoveUserFn> {
  const { deps, input } = required;
  const { identity, removeUser, isInTrash } = deps;

  const run = async (): ReturnType<RemoveUserFn> => {
    await assertCallerMayManageUserTrash({
      deps: identity,
      workspaceId: input.workspaceId,
      callerPrincipalId: input.callerPrincipalId,
    });

    const target = await identity.repos.principals.findById({
      workspaceId: input.workspaceId,
      id: input.principalId,
    });
    if (!target) throw new IdentityNotFoundError(`principal '${input.principalId}' was not found`);

    if (target.kind !== "user" && target.kind !== "api_key") {
      throw new IdentityValidationError(
        `DELETE_USER target must be a user or api_key principal, got kind='${target.kind}'`
      );
    }

    if (target.id === input.callerPrincipalId) {
      throw new SelfDeleteError("you cannot delete your own account");
    }

    if (target.id === input.seededOwnerPrincipalId) {
      throw new OwnerRequiredError("the seeded owner principal can never be deleted");
    }

    if (target.status === "active") {
      const holdsOwnerWildcard = await principalHoldsOwnerWildcard({
        deps: identity,
        workspaceId: input.workspaceId,
        principalId: target.id,
      });
      if (holdsOwnerWildcard) {
        const activeOwnerCount = await countActiveOwnerWildcardPrincipals({
          deps: identity,
          workspaceId: input.workspaceId,
        });
        if (activeOwnerCount <= 1) {
          throw new OwnerRequiredError(
            "the workspace must keep at least one active owner-`*` principal (INV-08)"
          );
        }
      }
    }

    if (await isInTrash(target.id)) {
      return { ok: true, version: null, noop: true } as const;
    }

    let title = target.displayName;
    let subtitle: string | null = null;
    if (target.kind === "user") {
      const user = await identity.repos.users.findByPrincipalId({
        workspaceId: input.workspaceId,
        principalId: target.id,
      });
      if (!user) throw new IdentityNotFoundError(`user '${target.id}' was not found`);
      title = user.username;
      subtitle = user.email ?? null;
    } else {
      subtitle = "API key";
    }

    if (!removeUser) {
      throw new UserDeleteUnsupportedError(
        "this identity store has no Trash wiring; users cannot be deleted (composition-only limitation)"
      );
    }

    return removeUser({
      workspaceId: input.workspaceId,
      id: target.id,
      display: { title, subtitle },
      at: identity.clock.nowIso(),
      expectedVersion: null,
      actor: { principalId: input.callerPrincipalId },
    });
  };

  const result = tail.then(run, run);
  // Swallow the rejection on `tail` itself (not on `result`, which the caller still awaits and
  // sees rejected) so one failed trash never poisons the chain for every trash queued after it —
  // the same "chain for ordering only, never for the value" shape a module-level serialization
  // promise needs to stay usable across repeated failures.
  tail = result.catch(() => undefined);
  return result;
}
