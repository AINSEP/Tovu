/**
 * @file Public surface (barrel) for identity — re-exported from `@jini-ai/cms/identity`.
 *
 * The domain moved into the package on 2026-08-02 so a second host can use the same users, roles,
 * policies, sessions, and authorization rules. What is left in this directory is only what is
 * genuinely this host's:
 *
 * - `repo.sqlite.ts` — the Drizzle adapters. They name `db/schema.ts`, which is this repo's shared
 *   1,246-line schema covering every domain, so they are host persistence, not library code.
 * - `wiring.ts` — composition. It picks the adapters, supplies the password hasher, and chooses the
 *   first-boot owner credentials.
 *
 * Everything else here is a re-export, and the shape of what is *not* re-exported is the point:
 * there is no wiring or SQLite export on this barrel, so nothing outside the composition root can
 * accidentally depend on this host's persistence choice.
 *
 * `Argon2PasswordHasher` is not re-exported either — it lives at `@jini-ai/cms/identity/hasher`,
 * behind its own subpath, because it pulls a native module that importing the domain must not
 * require. `wiring.ts` imports it from there.
 */
export type {
  PrincipalKind,
  PrincipalStatus,
  PrincipalRecord,
  UserRecord,
  SessionRecord,
  RoleRecord,
  PolicyRecord,
  PolicyPermissionRecord,
  RolePolicyRecord,
  PrincipalRoleRecord,
  PrincipalPolicyRecord,
  PrincipalRepoPort,
  UserRepoPort,
  SessionRepoPort,
  RoleRepoPort,
  PolicyRepoPort,
  PolicyPermissionRepoPort,
  RolePolicyRepoPort,
  PrincipalRoleRepoPort,
  PrincipalPolicyRepoPort,
  IdentityRepos,
  PasswordHasherPort,
  AuthorizeContext,
  AuthorizeResult,
  AuthorizeDeps,
  AuthServiceDeps,
  SeedIdentityDeps,
  SeedIdentityInput,
  SeedIdentityResult,
  IdentityAgentToolDefinition,
  IdentityAgentToolSideEffect,
  IdentityToolInputResult,
  PermissionDescriptor,
  PermissionMigration,
  MigrateDeprecatedPermissionGrantsDeps,
  MigrateDeprecatedPermissionGrantsResult,
} from "@jini-ai/cms/identity";

export {
  IdentityValidationError,
  IdentityNotFoundError,
  IdentityConflictError,
  AuthInvalidCredentialsError,
  IdentityForbiddenError,
  GrantExceedsIssuerError,
  OwnerRequiredError,
  PermissionUnknownError,
  InMemoryPrincipalRepo,
  InMemoryUserRepo,
  InMemorySessionRepo,
  InMemoryRoleRepo,
  InMemoryPolicyRepo,
  InMemoryPolicyPermissionRepo,
  InMemoryRolePolicyRepo,
  InMemoryPrincipalRoleRepo,
  InMemoryPrincipalPolicyRepo,
  authorize,
  resolveEffectivePermissions,
  login,
  logout,
  validateSession,
  getEffectivePermissions,
  SESSION_TTL_MS,
  seedIdentity,
  createUser,
  createRole,
  createPolicy,
  assignRole,
  attachPolicy,
  assertCallerHasAnyPermission,
  identityAgentToolCatalog,
  parseIdentityToolInput,
  disablePrincipal,
  enablePrincipal,
  updateUser,
  resetUserPassword,
  updateRole,
  updatePolicy,
  deleteRole,
  deletePolicy,
  writePolicyPermission,
  normalizeUsername,
  registerPermission,
  listPermissions,
  isKnownPermission,
  permissionCatalog,
  registerPermissionMigration,
  listPermissionMigrations,
  migrateDeprecatedPermissionGrants,
} from "@jini-ai/cms/identity";
