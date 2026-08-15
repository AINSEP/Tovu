import type { AuthorizeFn } from "@jini-ai/cms/core";
import type { ClockPort, IdGeneratorPort, UUID } from "@jini-ai/cms/core";
import type { ContentDb } from "../db/sqlite/content-db";
import { authorize as authorizeCore } from "@jini-ai/cms/identity";
import { Argon2PasswordHasher } from "@jini-ai/cms/identity/hasher";
import { migrateDeprecatedPermissionGrants } from "@jini-ai/cms/identity";
import type { IdentityRepos, PasswordHasherPort } from "@jini-ai/cms/identity";
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
} from "@jini-ai/cms/identity";
import {
  SqlitePolicyPermissionRepo,
  SqlitePolicyRepo,
  SqlitePrincipalPolicyRepo,
  SqlitePrincipalRepo,
  SqlitePrincipalRoleRepo,
  SqliteRolePolicyRepo,
  SqliteRoleRepo,
  SqliteSessionRepo,
  SqliteUserRepo,
} from "./repo.sqlite";
import { seedIdentity } from "@jini-ai/cms/identity";

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

/**
 * SPEC-022 §4.2 / `production-readiness-gate.ts` — the literal owner-password default this
 * module seeds when `TOVU_ADMIN_PASSWORD` is unset. Exported (not inlined below) so
 * `runBootGateOrExit()` in `src/index.ts` can compare the configured password against the exact
 * same value this seeder falls back to, with no second copy of the string to drift out of sync.
 */
export const DEFAULT_OWNER_PASSWORD = "tovu-dev";

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
  /**
   * SPEC-006 0.6.0 (REQ-11/REQ-15) — resolves to the seeded owner's principal id once first-boot
   * seeding completes. `admin-crud-service.ts`'s `disablePrincipal` awaits this to enforce "the
   * seeded owner is never disable-able" (a stronger rule than the INV-08 owner-count guard alone) —
   * mirrors `identityReady`'s exact fire-and-forget shape (kicked off here, awaited by the route
   * layer, never blocking `createRouteDeps()`'s synchronous return).
   */
  ownerPrincipalId: Promise<UUID>;
}

/**
 * Shared build: kick off first-boot seeding over whichever `repos` the caller assembled, bind an
 * `authorize()` closure over the same repos, and return the `IdentityRouteDepsSlice` shape both
 * composition roots need. Factored out so the in-memory and SQLite constructors below stay
 * identical except for which repo instances they pass in.
 */
function buildIdentityRouteDeps(
  repos: IdentityRepos,
  required: { workspaceId: UUID; clock: ClockPort; idGen: IdGeneratorPort }
): IdentityRouteDepsSlice {
  const passwordHasher = new Argon2PasswordHasher();

  const seedResult = seedIdentity({
    deps: { repos, hasher: passwordHasher, clock: required.clock, idGen: required.idGen },
    input: {
      workspaceId: required.workspaceId,
      // Read here, not in the library. `@jini-ai/cms` deliberately requires `ownerPassword` with no
      // default: a library fallback would mean every host that forgot to pass one shipped the same
      // owner credential. These two env vars and their defaults are exactly what `seedIdentity`
      // itself used to read before the extraction, so first-boot behavior is unchanged — the
      // decision simply moved to the host that owns the deployment model.
      ownerUsername: process.env.TOVU_ADMIN_USER ?? "admin",
      ownerPassword: process.env.TOVU_ADMIN_PASSWORD ?? DEFAULT_OWNER_PASSWORD,
    },
  });

  // SPEC-006 0.6.0: forked off `seedResult` (not a second seed call) so `disablePrincipal` can
  // await just the owner id without waiting on the permission-migration fan-out below.
  const ownerPrincipalId = seedResult.then((result) => result.ownerPrincipalId);

  const identityReady = seedResult
    .then(() =>
      // ADR-PIPE-012 T013/T014: every registered {from, to} permission-migration pair (currently
      // navigation.manage -> admin.menus.* and integration.manage -> admin.integrations.manage)
      // fans out to any pre-existing policy still holding the deprecated string. Additive-only
      // and idempotent (permission-migrations.ts) — safe to run on every boot, no-ops once every
      // policy already holds the new string(s).
      migrateDeprecatedPermissionGrants({
        policyPermissions: repos.policyPermissions,
        policies: repos.policies,
        idGen: required.idGen,
        workspaceId: required.workspaceId,
      })
    )
    .then(() => undefined);

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
    ownerPrincipalId,
    authorize,
  };
}

/**
 * Build the in-memory identity repos, kick off first-boot seeding, and bind an `authorize()`
 * closure over those same repos. Used by `server/app.ts`'s hermetic test/dev composition, where
 * per-test isolation (a fresh store per test) matters more than persistence.
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
  return buildIdentityRouteDeps(repos, required);
}

/**
 * Build the SQLite-backed identity repos over the same `content.db` handle every other feature's
 * `repo.sqlite.ts` adapter uses, kick off first-boot seeding, and bind `authorize()` over those
 * repos. Used by `server/deps.ts`'s real composition root — this is what makes a login survive a
 * `tsx watch` restart: the owner principal/user/session rows persist in `content.db`, and
 * `seedIdentity`'s existing idempotency check (look up the owner username before minting a new
 * principal) means the SAME principal id is reused on every subsequent boot, so a persisted
 * session isn't orphaned by a freshly-minted, unrelated principal id.
 *
 * @overallScore 100
 */
export function createSqliteIdentityRouteDeps(
  required: { db: ContentDb; workspaceId: UUID; clock: ClockPort; idGen: IdGeneratorPort }
): IdentityRouteDepsSlice {
  const { db, ...seedRequired } = required;
  const repos: IdentityRepos = {
    principals: new SqlitePrincipalRepo(db),
    users: new SqliteUserRepo(db),
    sessions: new SqliteSessionRepo(db),
    roles: new SqliteRoleRepo(db),
    policies: new SqlitePolicyRepo(db),
    policyPermissions: new SqlitePolicyPermissionRepo(db),
    rolePolicies: new SqliteRolePolicyRepo(db),
    principalRoles: new SqlitePrincipalRoleRepo(db),
    principalPolicies: new SqlitePrincipalPolicyRepo(db),
  };
  return buildIdentityRouteDeps(repos, seedRequired);
}
