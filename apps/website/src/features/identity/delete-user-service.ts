import type { DomainEvent, UUID } from "@jini-ai/cms/core";
import {
  assertCallerHasAnyPermission,
  IdentityNotFoundError,
  IdentityValidationError,
  OwnerRequiredError,
  resolveEffectivePermissions,
  type AuthorizeDeps,
  type AuthServiceDeps,
} from "@jini-ai/cms/identity";
import type { PurgeCounts, UserPurgePort } from "./user-purge-types.js";

/**
 * @file `DELETE_USER` (delete-user plan decisions 4/5/7) — hard-deletes a `kind='user'` principal
 * and records an `identity.user.deleted` audit event, gated by every rule `admin-crud-service.ts`'s
 * `disablePrincipal` already enforces for the weaker "disable" transition, plus two DELETE-specific
 * refusals (`SelfDeleteError`, and the seeded-owner check applying unconditionally rather than only
 * to the wildcard-holder count).
 *
 * Purpose:
 * `@jini-ai/cms/identity` has no delete transition — this is a Tovu-local one, following the exact
 * `{ deps: AuthServiceDeps, input: {...} }` shape and plain-`Error`-subclass control flow every
 * transition in `admin-crud-service.ts`/`grant-service.ts` already uses, so it reads as one more
 * transition in that family rather than a bespoke shape.
 *
 * Architectural role:
 * Ordinary core function, not a port (mirrors `disablePrincipal`'s own reasoning — this logic has
 * one implementation, no adapter seam). `principalHoldsOwnerWildcard`/
 * `countActiveOwnerWildcardPrincipals` below are a private copy of `admin-crud-service.ts`'s
 * same-named helpers: that file's `authorizeDepsFrom` is intentionally not part of
 * `@jini-ai/cms/identity`'s public surface (only `resolveEffectivePermissions` and
 * `AuthorizeDeps`'s type are), so this Tovu-side transition assembles the same `AuthorizeDeps` bag
 * inline instead of reaching into the library's internals.
 */

/** Thrown when the caller targets their own principal (409 `SELF_DELETE` at the route layer) — a
 *  DELETE-specific refusal `disablePrincipal` has no equivalent of, since disabling your own
 *  account, unlike deleting it, is recoverable by another owner. */
export class SelfDeleteError extends Error {}

export interface DeleteUserDeps {
  identity: AuthServiceDeps;
  purge: UserPurgePort;
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

/** Serializes `deleteUser` calls (decision 4's concurrency rule): without this, two concurrent
 *  deletes targeting the workspace's only two active owner-`*` principals could each read
 *  `activeOwnerCount === 2` before either purge lands, and both would pass the INV-08 guard —
 *  chaining every call onto one module-level promise makes the read-then-purge sequence for one
 *  call fully finish (or throw) before the next call's read begins. Module-level, not per-workspace:
 *  this codebase runs one workspace per process (CIC U-001), so a single chain is exactly as
 *  serialized as a per-workspace map would be, with no map to leak. */
let tail: Promise<unknown> = Promise.resolve();

/**
 * `DELETE_USER`. Gated by `user.manage`. Checked in order: caller permission, target exists,
 * target is `kind='user'`, target is not the caller, target is not the seeded owner, target is not
 * the workspace's last active owner-`*` principal. On success, hard-deletes the principal's
 * identity rows and appends an `identity.user.deleted` outbox event (payload:
 * `{ principalId, username, removed }`) in one atomic unit via `deps.purge.purgeUser`.
 *
 * @complexity O(n) in the workspace's principal count (the owner-count guard, same bound
 * `disablePrincipal` documents) plus `deps.purge.purgeUser`'s own O(1) transaction.
 */
export async function deleteUser(required: {
  deps: DeleteUserDeps;
  input: DeleteUserInput;
}): Promise<{ removed: PurgeCounts }> {
  const { deps, input } = required;
  const { identity, purge } = deps;

  const run = async (): Promise<{ removed: PurgeCounts }> => {
    await assertCallerHasAnyPermission({
      deps: identity,
      workspaceId: input.workspaceId,
      callerPrincipalId: input.callerPrincipalId,
      permissions: ["user.manage"],
    });

    const target = await identity.repos.principals.findById({
      workspaceId: input.workspaceId,
      id: input.principalId,
    });
    if (!target) throw new IdentityNotFoundError(`principal '${input.principalId}' was not found`);

    if (target.kind !== "user") {
      throw new IdentityValidationError(
        `DELETE_USER target must be a human (kind='user') principal, got kind='${target.kind}'`
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

    const user = await identity.repos.users.findByPrincipalId({
      workspaceId: input.workspaceId,
      principalId: target.id,
    });
    if (!user) throw new IdentityNotFoundError(`user '${target.id}' was not found`);

    const removed = await purge.purgeUser({
      workspaceId: input.workspaceId,
      principalId: target.id,
      buildEvent: (counts): DomainEvent => ({
        id: identity.idGen.newId(),
        name: "identity.user.deleted",
        occurredAt: identity.clock.nowIso(),
        aggregateId: target.id,
        workspaceId: input.workspaceId,
        actorId: input.callerPrincipalId,
        payload: { principalId: target.id, username: user.username, removed: counts },
      }),
    });

    return { removed };
  };

  const result = tail.then(run, run);
  // Swallow the rejection on `tail` itself (not on `result`, which the caller still awaits and
  // sees rejected) so one failed delete never poisons the chain for every delete queued after it —
  // the same "chain for ordering only, never for the value" shape a module-level serialization
  // promise needs to stay usable across repeated failures.
  tail = result.catch(() => undefined);
  return result;
}
