import type { Insertable, Selectable } from "kysely";

import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type {
  ApiKeysTable,
  IdentityUsersTable,
  PoliciesTable,
  PolicyPermissionsTable,
  PrincipalPoliciesTable,
  PrincipalRolesTable,
  PrincipalsTable,
  RolePoliciesTable,
  RolesTable,
  SessionsTable,
} from "../../platform/db/content-database.generated.js";

import type { ApiKeyRecord, ApiKeyRepoPort } from "./api-key-types.js";
import type { PolicyPermissionRepoPort, PolicyRepoPort, PrincipalPolicyRepoPort, PrincipalRepoPort, PrincipalRoleRepoPort, RolePolicyRepoPort, RoleRepoPort, SessionRepoPort, UserRepoPort } from "@jini-ai/user-management";
import type { PolicyPermissionRecord, PolicyRecord, PrincipalKind, PrincipalPolicyRecord, PrincipalRecord, PrincipalRoleRecord, PrincipalStatus, RolePolicyRecord, RoleRecord, SessionRecord, UserRecord } from "@jini-ai/user-management";
import type { IdentityTransactionPort } from "@jini-ai/user-management";

/**
 * @file THE adapters for the `identity` repo ports (ADR-021 / SPEC-006): one Kysely query body for
 * every dialect (storage plan §4, ADR-066).
 *
 * Purpose:
 * The other half of each ADR-006 rule-of-two, mirroring `repo.memory.ts`'s exact save-is-upsert
 * semantics. Built so identity survives a process restart — the in-memory-only adapters meant
 * every `tsx watch` restart (any file save) wiped every logged-in session, and re-seeded a fresh
 * random owner-principal id on top of that, so a persisted session alone wouldn't have helped
 * either. This is the whole rule-of-two: principals, users, sessions, roles, policies, and the
 * four join tables, all backed by real tables. Every lookup is composite `(workspace_id, …)`.
 * `repo.sqlite.ts` holds the thin subclasses built from the content db handle.
 *
 * `is_builtin` / `is_frozen` are integer columns on both dialects (0/1), not booleans.
 */

/**
 * Bind identity's atomic guard/write unit to the SAME kernel as its repositories. Nested calls
 * join the active transaction. The workspace lock also covers ordinary saves below, so a grant
 * or status writer cannot insert a phantom owner/reference while a guarded mutation is deciding.
 * SQLite's BEGIN IMMEDIATE serializes writers; Postgres uses the kernel's advisory lock.
 * Shared transaction rationale lives in Jini user-management/src/core/ports.ts.
 * @complexity O(1) binding; each run adds one transaction and one workspace-lock acquisition.
 */
export function createIdentityTransactions(
  { kernel }: { kernel: ContentKernel },
  _optional: Record<string, never> = {},
): IdentityTransactionPort {
  return {
    run: ({ workspaceId, execute }) => kernel.transaction(async () => {
      await kernel.lockKey(`identity:${workspaceId}`);
      return execute();
    }),
  };
}

function toPrincipalRecord(row: Selectable<PrincipalsTable>): PrincipalRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind as PrincipalKind,
    displayName: row.display_name,
    status: row.status as PrincipalStatus,
    disabledAt: row.disabled_at ?? undefined,
    createdAt: row.created_at,
  };
}

export class SqlPrincipalRepo implements PrincipalRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findById(required: { workspaceId: string; id: string }): Promise<PrincipalRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("principals")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toPrincipalRecord(row) : null;
  }

  async list(required: { workspaceId: string }): Promise<PrincipalRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("principals").selectAll().where("workspace_id", "=", required.workspaceId).execute()
    );
    return rows.map(toPrincipalRecord);
  }

  async save(record: PrincipalRecord): Promise<void> {
    const row: Insertable<PrincipalsTable> = {
      id: record.id,
      workspace_id: record.workspaceId,
      kind: record.kind,
      display_name: record.displayName,
      status: record.status,
      disabled_at: record.disabledAt ?? null,
      created_at: record.createdAt,
    };
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: record.workspaceId, execute: () => this.kernel.run((db) =>
      db.insertInto("principals").values(row).onConflict((oc) => oc.column("id").doUpdateSet(row)).execute()) });
  }
}

function toUserRecord(row: Selectable<IdentityUsersTable>): UserRecord {
  return {
    principalId: row.principal_id,
    workspaceId: row.workspace_id,
    username: row.username,
    email: row.email ?? undefined,
    passwordHash: row.password_hash,
    lastLoginAt: row.last_login_at ?? undefined,
  };
}

export class SqlUserRepo implements UserRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findByPrincipalId(required: {
    workspaceId: string;
    principalId: string;
  }): Promise<UserRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("identity_users")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("principal_id", "=", required.principalId)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toUserRecord(row) : null;
  }

  async findByUsername(required: { workspaceId: string; username: string }): Promise<UserRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("identity_users")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("username", "=", required.username)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toUserRecord(row) : null;
  }

  async list(required: { workspaceId: string }): Promise<UserRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("identity_users").selectAll().where("workspace_id", "=", required.workspaceId).execute()
    );
    return rows.map(toUserRecord);
  }

  async save(record: UserRecord): Promise<void> {
    const row: Insertable<IdentityUsersTable> = {
      principal_id: record.principalId,
      workspace_id: record.workspaceId,
      username: record.username,
      email: record.email ?? null,
      password_hash: record.passwordHash,
      last_login_at: record.lastLoginAt ?? null,
    };
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: record.workspaceId, execute: () => this.kernel.run((db) =>
      db
        .insertInto("identity_users")
        .values(row)
        .onConflict((oc) => oc.column("principal_id").doUpdateSet(row))
        .execute()) });
  }
}

function toSessionRecord(row: Selectable<SessionsTable>): SessionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    principalId: row.principal_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? undefined,
    ip: row.ip ?? undefined,
    userAgent: row.user_agent ?? undefined,
  };
}

export class SqlSessionRepo implements SessionRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findById(required: { workspaceId: string; id: string }): Promise<SessionRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("sessions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toSessionRecord(row) : null;
  }

  async findByTokenHash(required: {
    workspaceId: string;
    tokenHash: string;
  }): Promise<SessionRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("sessions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("token_hash", "=", required.tokenHash)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toSessionRecord(row) : null;
  }

  async save(record: SessionRecord): Promise<void> {
    const row: Insertable<SessionsTable> = {
      id: record.id,
      workspace_id: record.workspaceId,
      principal_id: record.principalId,
      token_hash: record.tokenHash,
      created_at: record.createdAt,
      expires_at: record.expiresAt,
      revoked_at: record.revokedAt ?? null,
      ip: record.ip ?? null,
      user_agent: record.userAgent ?? null,
    };
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: record.workspaceId, execute: () => this.kernel.run((db) =>
      db.insertInto("sessions").values(row).onConflict((oc) => oc.column("id").doUpdateSet(row)).execute()) });
  }

  async revoke(required: { workspaceId: string; id: string; revokedAt: string }): Promise<void> {
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: required.workspaceId, execute: () => this.kernel.run((db) =>
      db
        .updateTable("sessions")
        .set({ revoked_at: required.revokedAt })
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .execute()) });
  }

  async listByPrincipalId(required: {
    workspaceId: string;
    principalId: string;
  }): Promise<SessionRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("sessions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("principal_id", "=", required.principalId)
        .execute()
    );
    return rows.map(toSessionRecord);
  }
}

function toRoleRecord(row: Selectable<RolesTable>): RoleRecord {
  return { id: row.id, workspaceId: row.workspace_id, name: row.name, isBuiltin: row.is_builtin === 1 };
}

export class SqlRoleRepo implements RoleRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findById(required: { workspaceId: string; id: string }): Promise<RoleRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("roles")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRoleRecord(row) : null;
  }

  async findByName(required: { workspaceId: string; name: string }): Promise<RoleRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("roles")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("name", "=", required.name)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRoleRecord(row) : null;
  }

  async list(required: { workspaceId: string }): Promise<RoleRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("roles").selectAll().where("workspace_id", "=", required.workspaceId).execute()
    );
    return rows.map(toRoleRecord);
  }

  async save(record: RoleRecord): Promise<void> {
    const row: Insertable<RolesTable> = {
      id: record.id,
      workspace_id: record.workspaceId,
      name: record.name,
      is_builtin: record.isBuiltin ? 1 : 0,
    };
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: record.workspaceId, execute: () => this.kernel.run((db) =>
      db.insertInto("roles").values(row).onConflict((oc) => oc.column("id").doUpdateSet(row)).execute()) });
  }

  async delete(required: { workspaceId: string; id: string }): Promise<void> {
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: required.workspaceId, execute: () => this.kernel.run((db) =>
      db
        .deleteFrom("roles")
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .execute()) });
  }
}

function toPolicyRecord(row: Selectable<PoliciesTable>): PolicyRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description ?? undefined,
    isBuiltin: row.is_builtin === 1,
    isFrozen: row.is_frozen === 1,
  };
}

export class SqlPolicyRepo implements PolicyRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findById(required: { workspaceId: string; id: string }): Promise<PolicyRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("policies")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toPolicyRecord(row) : null;
  }

  async findByName(required: { workspaceId: string; name: string }): Promise<PolicyRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("policies")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("name", "=", required.name)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toPolicyRecord(row) : null;
  }

  async list(required: { workspaceId: string }): Promise<PolicyRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("policies").selectAll().where("workspace_id", "=", required.workspaceId).execute()
    );
    return rows.map(toPolicyRecord);
  }

  async save(record: PolicyRecord): Promise<void> {
    const row: Insertable<PoliciesTable> = {
      id: record.id,
      workspace_id: record.workspaceId,
      name: record.name,
      description: record.description ?? null,
      is_builtin: record.isBuiltin ? 1 : 0,
      is_frozen: record.isFrozen ? 1 : 0,
    };
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: record.workspaceId, execute: () => this.kernel.run((db) =>
      db.insertInto("policies").values(row).onConflict((oc) => oc.column("id").doUpdateSet(row)).execute()) });
  }

  async delete(required: { workspaceId: string; id: string }): Promise<void> {
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: required.workspaceId, execute: () => this.kernel.run((db) =>
      db
        .deleteFrom("policies")
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .execute()) });
  }
}

function toPolicyPermissionRecord(row: Selectable<PolicyPermissionsTable>): PolicyPermissionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    policyId: row.policy_id,
    permission: row.permission,
    resourceType: row.resource_type ?? null,
    constraintJson: row.constraint_json ?? null,
  };
}

export class SqlPolicyPermissionRepo implements PolicyPermissionRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async listByPolicyId(required: {
    workspaceId: string;
    policyId: string;
  }): Promise<PolicyPermissionRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("policy_permissions")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("policy_id", "=", required.policyId)
        .execute()
    );
    return rows.map(toPolicyPermissionRecord);
  }

  async save(record: PolicyPermissionRecord): Promise<void> {
    const row: Insertable<PolicyPermissionsTable> = {
      id: record.id,
      workspace_id: record.workspaceId,
      policy_id: record.policyId,
      permission: record.permission,
      resource_type: record.resourceType ?? null,
      constraint_json: record.constraintJson ?? null,
    };
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: record.workspaceId, execute: () => this.kernel.run((db) =>
      db.insertInto("policy_permissions").values(row).onConflict((oc) => oc.column("id").doUpdateSet(row)).execute()) });
  }

  async deleteByPolicyId(required: { workspaceId: string; policyId: string }): Promise<void> {
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: required.workspaceId, execute: () => this.kernel.run((db) =>
      db
        .deleteFrom("policy_permissions")
        .where("workspace_id", "=", required.workspaceId)
        .where("policy_id", "=", required.policyId)
        .execute()) });
  }

  async delete(required: { workspaceId: string; id: string }): Promise<void> {
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: required.workspaceId, execute: () => this.kernel.run((db) =>
      db
        .deleteFrom("policy_permissions")
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .execute()) });
  }
}

function toRolePolicyRecord(row: Selectable<RolePoliciesTable>): RolePolicyRecord {
  return { id: row.id, workspaceId: row.workspace_id, roleId: row.role_id, policyId: row.policy_id };
}

export class SqlRolePolicyRepo implements RolePolicyRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async listByRoleId(required: { workspaceId: string; roleId: string }): Promise<RolePolicyRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("role_policies")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("role_id", "=", required.roleId)
        .execute()
    );
    return rows.map(toRolePolicyRecord);
  }

  async listByPolicyId(required: { workspaceId: string; policyId: string }): Promise<RolePolicyRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("role_policies")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("policy_id", "=", required.policyId)
        .execute()
    );
    return rows.map(toRolePolicyRecord);
  }

  async save(record: RolePolicyRecord): Promise<void> {
    const row: Insertable<RolePoliciesTable> = {
      id: record.id,
      workspace_id: record.workspaceId,
      role_id: record.roleId,
      policy_id: record.policyId,
    };
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: record.workspaceId, execute: () => this.kernel.run((db) =>
      db.insertInto("role_policies").values(row).onConflict((oc) => oc.column("id").doUpdateSet(row)).execute()) });
  }
}

function toPrincipalRoleRecord(row: Selectable<PrincipalRolesTable>): PrincipalRoleRecord {
  return { id: row.id, workspaceId: row.workspace_id, principalId: row.principal_id, roleId: row.role_id };
}

export class SqlPrincipalRoleRepo implements PrincipalRoleRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async listByPrincipalId(required: {
    workspaceId: string;
    principalId: string;
  }): Promise<PrincipalRoleRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("principal_roles")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("principal_id", "=", required.principalId)
        .execute()
    );
    return rows.map(toPrincipalRoleRecord);
  }

  async listByRoleId(required: { workspaceId: string; roleId: string }): Promise<PrincipalRoleRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("principal_roles")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("role_id", "=", required.roleId)
        .execute()
    );
    return rows.map(toPrincipalRoleRecord);
  }

  async save(record: PrincipalRoleRecord): Promise<void> {
    const row: Insertable<PrincipalRolesTable> = {
      id: record.id,
      workspace_id: record.workspaceId,
      principal_id: record.principalId,
      role_id: record.roleId,
    };
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: record.workspaceId, execute: () => this.kernel.run((db) =>
      db.insertInto("principal_roles").values(row).onConflict((oc) => oc.column("id").doUpdateSet(row)).execute()) });
  }
}

function toPrincipalPolicyRecord(row: Selectable<PrincipalPoliciesTable>): PrincipalPolicyRecord {
  return { id: row.id, workspaceId: row.workspace_id, principalId: row.principal_id, policyId: row.policy_id };
}

export class SqlPrincipalPolicyRepo implements PrincipalPolicyRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async listByPrincipalId(required: {
    workspaceId: string;
    principalId: string;
  }): Promise<PrincipalPolicyRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("principal_policies")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("principal_id", "=", required.principalId)
        .execute()
    );
    return rows.map(toPrincipalPolicyRecord);
  }

  async listByPolicyId(required: {
    workspaceId: string;
    policyId: string;
  }): Promise<PrincipalPolicyRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("principal_policies")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("policy_id", "=", required.policyId)
        .execute()
    );
    return rows.map(toPrincipalPolicyRecord);
  }

  async save(record: PrincipalPolicyRecord): Promise<void> {
    const row: Insertable<PrincipalPoliciesTable> = {
      id: record.id,
      workspace_id: record.workspaceId,
      principal_id: record.principalId,
      policy_id: record.policyId,
    };
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: record.workspaceId, execute: () => this.kernel.run((db) =>
      db
        .insertInto("principal_policies")
        .values(row)
        .onConflict((oc) => oc.column("id").doUpdateSet(row))
        .execute()) });
  }
}

/**
 * SPEC-006 REQ-08 — the tenth identity table, added after the original nine (see this file's
 * header). Its port lives in this repo (`api-key-types.ts`) rather than in `@jini-ai/user-management`,
 * which scopes API keys out; everything else about this adapter — save-is-upsert, composite
 * `(workspaceId, id)` lookups, `null`-for-absent — matches the nine above exactly.
 */
function toApiKeyRecord(row: Selectable<ApiKeysTable>): ApiKeyRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    principalId: row.principal_id,
    label: row.label,
    keyHash: row.key_hash,
    prefix: row.prefix,
    issuedPolicyId: row.issued_policy_id ?? undefined,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
  };
}

export class SqlApiKeyRepo implements ApiKeyRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findById(required: { workspaceId: string; id: string }): Promise<ApiKeyRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("api_keys")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("id", "=", required.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toApiKeyRecord(row) : null;
  }

  /** The verification hot path — served by `idx_api_keys_workspace_prefix`, never a scan. */
  async findByPrefix(required: { workspaceId: string; prefix: string }): Promise<ApiKeyRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("api_keys")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("prefix", "=", required.prefix)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toApiKeyRecord(row) : null;
  }

  async listByPrincipalId(required: { workspaceId: string; principalId: string }): Promise<ApiKeyRecord[]> {
    const rows = await this.kernel.run((db) =>
      db
        .selectFrom("api_keys")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("principal_id", "=", required.principalId)
        .execute()
    );
    return rows.map(toApiKeyRecord);
  }

  async save(record: ApiKeyRecord): Promise<void> {
    const row: Insertable<ApiKeysTable> = {
      id: record.id,
      workspace_id: record.workspaceId,
      principal_id: record.principalId,
      label: record.label,
      key_hash: record.keyHash,
      prefix: record.prefix,
      issued_policy_id: record.issuedPolicyId ?? null,
      created_at: record.createdAt,
      last_used_at: record.lastUsedAt ?? null,
      expires_at: record.expiresAt ?? null,
      revoked_at: record.revokedAt ?? null,
    };
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: record.workspaceId, execute: () => this.kernel.run((db) =>
      db.insertInto("api_keys").values(row).onConflict((oc) => oc.column("id").doUpdateSet(row)).execute()) });
  }
}
