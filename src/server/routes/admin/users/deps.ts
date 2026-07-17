import type { Express } from "express";

import type { AuthServiceDeps, IdentityRepos } from "../../../../identity";
import type { RouteDeps } from "../../types";

/**
 * @file `RouteDeps` -> `identity` service-deps mapping for the users/roles/policies admin routes,
 * plus (ADR-046 Phase 3, SPEC-040) the narrow `UsersRouteDeps` type the `users` server module's 8
 * registrars actually need.
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
 *
 * `UsersRouteDeps` (SPEC-040 addition, additive to the two helpers below, not a replacement):
 * confirmed by reading all 8 registrars directly — every one reads `workspaceId`/`authorize`;
 * `list.ts` also reads `principalRepo`/`userRepo`/`principalRoleRepo`/`principalPolicyRepo`
 * directly; `list-roles.ts`/`list-policies.ts` also read `roleRepo`/`policyRepo` directly; the 5
 * mutation routes (`create.ts`/`assign-role.ts`/`attach-policy.ts`/`create-role.ts`/
 * `create-policy.ts`) each call `identityServiceDepsFrom(deps)` below, which needs every identity
 * repo port plus `passwordHasher`/`clock`/`idGen`. `identityReposFrom`/`identityServiceDepsFrom`'s
 * parameter type is narrowed from `RouteDeps` to this same `UsersRouteDeps` (a pure narrowing —
 * both functions already only ever read fields `UsersRouteDeps` includes) so the 8 registrar
 * files below can be retyped from the generic `RouteRegistrar` to `UsersRouteRegistrar` and still
 * call these two helpers.
 */
export type UsersRouteDeps = Pick<
  RouteDeps,
  | "workspaceId"
  | "authorize"
  | "clock"
  | "idGen"
  | "principalRepo"
  | "userRepo"
  | "sessionRepo"
  | "roleRepo"
  | "policyRepo"
  | "policyPermissionRepo"
  | "rolePolicyRepo"
  | "principalRoleRepo"
  | "principalPolicyRepo"
  | "passwordHasher"
>;

/** Registrar signature for the users/roles/policies route modules (mirrors `RouteRegistrar`). */
export type UsersRouteRegistrar = (app: Express, deps: UsersRouteDeps) => void;

/** Assemble the `IdentityRepos` bag identity functions expect from `RouteDeps`'s flat fields. */
export function identityReposFrom(deps: UsersRouteDeps): IdentityRepos {
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
export function identityServiceDepsFrom(deps: UsersRouteDeps): AuthServiceDeps {
  return {
    repos: identityReposFrom(deps),
    hasher: deps.passwordHasher,
    clock: deps.clock,
    idGen: deps.idGen,
  };
}
