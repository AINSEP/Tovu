/**
 * @file Public surface (barrel) for the `identity` library (ADR-021 / SPEC-006).
 *
 * A module's public contract is its `index.ts` (ADR-009 §1) — deep imports
 * from outside this directory should go through here.
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
} from "./types";

export {
  IdentityValidationError,
  IdentityNotFoundError,
  IdentityConflictError,
  AuthInvalidCredentialsError,
  IdentityForbiddenError,
  GrantExceedsIssuerError,
  OwnerRequiredError,
  PermissionUnknownError,
} from "./types";

export type {
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
} from "./ports";

export {
  InMemoryPrincipalRepo,
  InMemoryUserRepo,
  InMemorySessionRepo,
  InMemoryRoleRepo,
  InMemoryPolicyRepo,
  InMemoryPolicyPermissionRepo,
  InMemoryRolePolicyRepo,
  InMemoryPrincipalRoleRepo,
  InMemoryPrincipalPolicyRepo,
} from "./repo.memory";

export { Argon2PasswordHasher, type Argon2PasswordHasherOptions } from "./hasher";

export {
  authorize,
  resolveEffectivePermissions,
  type AuthorizeContext,
  type AuthorizeResult,
  type AuthorizeDeps,
} from "./authorize";

export {
  login,
  logout,
  validateSession,
  getEffectivePermissions,
  SESSION_TTL_MS,
  type AuthServiceDeps,
} from "./auth-service";

export { seedIdentity, type SeedIdentityDeps, type SeedIdentityInput, type SeedIdentityResult } from "./seed";

export {
  createUser,
  createRole,
  createPolicy,
  assignRole,
  attachPolicy,
} from "./grant-service";

/** SPEC-006 0.6.0 — the users/roles/policies admin CRUD-completion amendment. */
export {
  disablePrincipal,
  enablePrincipal,
  updateUser,
  resetUserPassword,
  updateRole,
  updatePolicy,
  deleteRole,
  deletePolicy,
  writePolicyPermission,
} from "./admin-crud-service";

export {
  createInMemoryIdentityRouteDeps,
  createSqliteIdentityRouteDeps,
  type IdentityRouteDepsSlice,
} from "./wiring";

export { normalizeUsername } from "./username";

export {
  registerPermission,
  listPermissions,
  isKnownPermission,
  permissionCatalog,
  type PermissionDescriptor,
} from "./permissions";

/**
 * ADR-PIPE-012: the shared deprecate-old/grant-new permission migration
 * mechanism. Sibling remediation ADRs (Members/Analytics/Integrations)
 * register their own `{from, to}` pair via `registerPermissionMigration`
 * rather than hand-rolling a divergent copy (ADR-PIPE-012 Enforcement).
 */
export {
  registerPermissionMigration,
  listPermissionMigrations,
  migrateDeprecatedPermissionGrants,
  type PermissionMigration,
  type MigrateDeprecatedPermissionGrantsDeps,
  type MigrateDeprecatedPermissionGrantsResult,
} from "./permission-migrations";
