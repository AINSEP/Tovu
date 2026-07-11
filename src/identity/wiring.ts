import type { AuthorizeFn } from "../core/commands";
import type { ClockPort, IdGeneratorPort, UUID } from "../core/ports";
import { authorize as authorizeCore } from "./authorize";
import { Argon2PasswordHasher } from "./hasher";
import type { IdentityRepos, PasswordHasherPort } from "./ports";
import {
  InMemoryPolicyPermissionRepo,
  InMemoryPolicyRepo,
  InMemoryPrincipalPolicyRepo,
  InMemoryPrincipalRepo,
  InMemoryPrincipalRoleRepo,
  InMemoryRolePolicyRepo,
  InMemoryRoleRepo,
  InMemorySessionRepo,
  InMemoryUserRepo,
} from "./repo.memory";
import { seedIdentity } from "./seed";

/**
 * @file Shared identity wiring for the composition roots (`server/app.ts` /
 * `server/deps.ts`).
 *
 * Purpose:
 * Both composition roots need the identical identity slice of `RouteDeps`
 * (nine in-memory repos, the argon2id hasher, a bound `authorize()` closure,
 * and the seed-completion promise) — factored here once so the two stay
 * identical, mirroring how `server/seed.ts` is the one source of truth for
 * workspace/post/presentation seed data.
 *
 * Architectural role:
 * `createRouteDeps()` returns synchronously; identity seeding hashes a
 * password (async, argon2id), so seeding is kicked off here immediately and
 * its promise (`identityReady`) is handed back on `RouteDeps` rather than
 * awaited inline. Auth-adjacent middleware/routes await it before touching
 * identity repos — see `middleware/dev-auth.ts`.
 */

/** The identity-owned slice of `RouteDeps` (see that file's fields of the same names). */
export interface IdentityRouteDepsSlice {
  principalRepo: IdentityRepos["principals"];
  userRepo: IdentityRepos["users"];
  sessionRepo: IdentityRepos["sessions"];
  roleRepo: IdentityRepos["roles"];
  policyRepo: IdentityRepos["policies"];
  policyPermissionRepo: IdentityRepos["policyPermissions"];
  rolePolicyRepo: IdentityRepos["rolePolicies"];
  principalRoleRepo: IdentityRepos["principalRoles"];
  principalPolicyRepo: IdentityRepos["principalPolicies"];
  passwordHasher: PasswordHasherPort;
  identityReady: Promise<void>;
  authorize: AuthorizeFn;
}

/**
 * Build the in-memory identity repos, kick off first-boot seeding, and bind
 * an `authorize()` closure over those same repos. In-memory only this pass
 * (see `identity/INFO.md`) — both `server/app.ts` (tests/dev) and
 * `server/deps.ts` (the SQLite content composition) call this identically,
 * matching the disclosed precedent that identity has no SQLite adapter yet.
 *
 * @complexity O(1) construction; `identityReady`'s underlying seed work is
 * itself O(1) (see `seedIdentity`'s doc).
 * @overallScore 100
 */
export function createInMemoryIdentityRouteDeps(required: {
  workspaceId: UUID;
  clock: ClockPort;
  idGen: IdGeneratorPort;
}): IdentityRouteDepsSlice {
  const repos: IdentityRepos = {
    principals: new InMemoryPrincipalRepo(),
    users: new InMemoryUserRepo(),
    sessions: new InMemorySessionRepo(),
    roles: new InMemoryRoleRepo(),
    policies: new InMemoryPolicyRepo(),
    policyPermissions: new InMemoryPolicyPermissionRepo(),
    rolePolicies: new InMemoryRolePolicyRepo(),
    principalRoles: new InMemoryPrincipalRoleRepo(),
    principalPolicies: new InMemoryPrincipalPolicyRepo(),
  };
  const passwordHasher = new Argon2PasswordHasher();

  const identityReady = seedIdentity({
    deps: { repos, hasher: passwordHasher, clock: required.clock, idGen: required.idGen },
    input: { workspaceId: required.workspaceId },
  }).then(() => undefined);

  const authorize: AuthorizeFn = (params) =>
    authorizeCore({
      deps: {
        principals: repos.principals,
        principalRoles: repos.principalRoles,
        rolePolicies: repos.rolePolicies,
        principalPolicies: repos.principalPolicies,
        policyPermissions: repos.policyPermissions,
      },
      principalId: params.principalId,
      permission: params.permission,
      context: {
        workspaceId: params.workspaceId,
        entityType: params.entityType,
        entityId: params.entityId,
      },
    });

  return {
    principalRepo: repos.principals,
    userRepo: repos.users,
    sessionRepo: repos.sessions,
    roleRepo: repos.roles,
    policyRepo: repos.policies,
    policyPermissionRepo: repos.policyPermissions,
    rolePolicyRepo: repos.rolePolicies,
    principalRoleRepo: repos.principalRoles,
    principalPolicyRepo: repos.principalPolicies,
    passwordHasher,
    identityReady,
    authorize,
  };
}
