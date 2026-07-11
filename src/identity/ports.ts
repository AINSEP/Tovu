/**
 * @file Port contracts for the `identity` library (ADR-021 / SPEC-006).
 *
 * Purpose:
 * Dependency-inversion seams (ADR-006 rule-of-two) for the identity/RBAC
 * tables, plus `PasswordHasherPort` — the hashing seam behind which argon2id
 * lives (feature.spec.md Dependencies table: "behind a HasherPort, rule-of-two
 * candidate"). Only an in-memory adapter for each repo port ships this pass
 * (matches the disclosed precedent set by members/navigation/integrations/
 * analytics — see `src/server/deps.ts` comments); a SQLite adapter is a later
 * step, not a gap introduced here.
 *
 * `authorize()` itself is deliberately NOT a port (ADR-006/ADR-021 §2 — one
 * evaluator) — see `authorize.ts`. `AuthorizeDeps` there is a plain repo bag,
 * not declared here.
 *
 * Interfaces and types only — no feature logic.
 */
import type { ISODateTime, UUID } from "../core/ports";
import type {
  PolicyPermissionRecord,
  PolicyRecord,
  PrincipalPolicyRecord,
  PrincipalRecord,
  PrincipalRoleRecord,
  RolePolicyRecord,
  RoleRecord,
  SessionRecord,
  UserRecord,
} from "./types";

export interface PrincipalRepoPort {
  findById(required: { workspaceId: UUID; id: UUID }): Promise<PrincipalRecord | null>;
  list(required: { workspaceId: UUID }): Promise<PrincipalRecord[]>;
  save(record: PrincipalRecord): Promise<void>;
}

export interface UserRepoPort {
  findByPrincipalId(required: { workspaceId: UUID; principalId: UUID }): Promise<UserRecord | null>;
  /** `username` must already be normalized (NFC + lowercase) by the caller. */
  findByUsername(required: { workspaceId: UUID; username: string }): Promise<UserRecord | null>;
  /** All `users` rows in the workspace (Users admin screen listing). Not paginated in v1 — matches `PrincipalRepoPort.list`/`RoleRepoPort.list`/`PolicyRepoPort.list`. */
  list(required: { workspaceId: UUID }): Promise<UserRecord[]>;
  save(record: UserRecord): Promise<void>;
}

export interface SessionRepoPort {
  findById(required: { workspaceId: UUID; id: UUID }): Promise<SessionRecord | null>;
  findByTokenHash(required: { workspaceId: UUID; tokenHash: string }): Promise<SessionRecord | null>;
  save(record: SessionRecord): Promise<void>;
  /** Server-side revocation (logout, disable-cascade). Idempotent. */
  revoke(required: { workspaceId: UUID; id: UUID; revokedAt: ISODateTime }): Promise<void>;
}

export interface RoleRepoPort {
  findById(required: { workspaceId: UUID; id: UUID }): Promise<RoleRecord | null>;
  findByName(required: { workspaceId: UUID; name: string }): Promise<RoleRecord | null>;
  list(required: { workspaceId: UUID }): Promise<RoleRecord[]>;
  save(record: RoleRecord): Promise<void>;
}

export interface PolicyRepoPort {
  findById(required: { workspaceId: UUID; id: UUID }): Promise<PolicyRecord | null>;
  findByName(required: { workspaceId: UUID; name: string }): Promise<PolicyRecord | null>;
  list(required: { workspaceId: UUID }): Promise<PolicyRecord[]>;
  save(record: PolicyRecord): Promise<void>;
}

export interface PolicyPermissionRepoPort {
  listByPolicyId(required: { workspaceId: UUID; policyId: UUID }): Promise<PolicyPermissionRecord[]>;
  save(record: PolicyPermissionRecord): Promise<void>;
}

export interface RolePolicyRepoPort {
  listByRoleId(required: { workspaceId: UUID; roleId: UUID }): Promise<RolePolicyRecord[]>;
  save(record: RolePolicyRecord): Promise<void>;
}

export interface PrincipalRoleRepoPort {
  listByPrincipalId(required: { workspaceId: UUID; principalId: UUID }): Promise<PrincipalRoleRecord[]>;
  save(record: PrincipalRoleRecord): Promise<void>;
}

export interface PrincipalPolicyRepoPort {
  listByPrincipalId(required: { workspaceId: UUID; principalId: UUID }): Promise<PrincipalPolicyRecord[]>;
  save(record: PrincipalPolicyRecord): Promise<void>;
}

/**
 * The nine identity repo ports, bagged for the functions in this library that
 * need several of them at once (`authorize`, seeding, the auth service).
 * Composition roots (`server/app.ts` / `server/deps.ts`) assemble this from
 * individual `RouteDeps` fields.
 */
export interface IdentityRepos {
  principals: PrincipalRepoPort;
  users: UserRepoPort;
  sessions: SessionRepoPort;
  roles: RoleRepoPort;
  policies: PolicyRepoPort;
  policyPermissions: PolicyPermissionRepoPort;
  rolePolicies: RolePolicyRepoPort;
  principalRoles: PrincipalRoleRepoPort;
  principalPolicies: PrincipalPolicyRepoPort;
}

/**
 * Password hashing seam (INV-05). `argon2` (native argon2id bindings) is the
 * v1 adapter — see `hasher.ts`. Declared as a port per the spec's own
 * "rule-of-two candidate" language; only one real adapter exists this pass.
 */
export interface PasswordHasherPort {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}
