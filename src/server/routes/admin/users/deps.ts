import type { AuthServiceDeps, IdentityRepos } from "../../../../identity";
import type { RouteDeps } from "../../types";

/**
 * @file `RouteDeps` -> `identity` service-deps mapping for the users/roles/policies admin routes.
 *
 * Purpose:
 * `RouteDeps` (unlike `members`) already declares the identity repo ports as
 * flat fields (`principalRepo`, `userRepo`, ... — see `middleware/dev-auth.ts`'s
 * `identityReposFrom`, the same shape this mirrors). The `grant-service.ts`
 * transitions (`createUser`/`createRole`/`createPolicy`/`assignRole`/
 * `attachPolicy`) want the nested `AuthServiceDeps` bag
 * (`{ repos: IdentityRepos, hasher, clock, idGen }`) that `auth-service.ts`
 * already defines — this file is the one place that assembles it from
 * `RouteDeps` for the users/roles/policies route files, so each route doesn't
 * repeat the field mapping.
 *
 * Architectural role:
 * Composition-boundary glue only — no business logic. `identityReposFrom` in
 * `middleware/dev-auth.ts` is not exported, so this is a small, deliberate
 * duplicate rather than a shared import (mirrors why `members/deps.ts` has
 * its own bundle assembler instead of reaching into another route module).
 */

/** Assemble the `IdentityRepos` bag identity functions expect from `RouteDeps`'s flat fields. */
export function identityReposFrom(deps: RouteDeps): IdentityRepos {
  return {
    principals: deps.principalRepo,
    users: deps.userRepo,
    sessions: deps.sessionRepo,
    roles: deps.roleRepo,
    policies: deps.policyRepo,
    policyPermissions: deps.policyPermissionRepo,
    rolePolicies: deps.rolePolicyRepo,
    principalRoles: deps.principalRoleRepo,
    principalPolicies: deps.principalPolicyRepo,
  };
}

/** Assemble the `AuthServiceDeps` bag `grant-service.ts`'s transitions expect from `RouteDeps`. */
export function identityServiceDepsFrom(deps: RouteDeps): AuthServiceDeps {
  return {
    repos: identityReposFrom(deps),
    hasher: deps.passwordHasher,
    clock: deps.clock,
    idGen: deps.idGen,
  };
}
