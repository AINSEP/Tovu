import { and, eq } from "drizzle-orm";

import {
  identityUsers,
  policies,
  policyPermissions,
  principalPolicies,
  principalRoles,
  principals,
  rolePolicies,
  roles,
  sessions,
} from "../db/schema.js";
import type { ContentDb } from "../db/sqlite/content-db.js";
import { findOneBy } from "../db/sqlite/repo-helpers.js";

import type {
  PolicyPermissionRepoPort,
  PolicyRepoPort,
  PrincipalPolicyRepoPort,
  PrincipalRepoPort,
  PrincipalRoleRepoPort,
  RolePolicyRepoPort,
  RoleRepoPort,
  SessionRepoPort,
  UserRepoPort,
} from "@jini-ai/cms/identity";
import type {
  PolicyPermissionRecord,
  PolicyRecord,
  PrincipalKind,
  PrincipalPolicyRecord,
  PrincipalRecord,
  PrincipalRoleRecord,
  PrincipalStatus,
  RolePolicyRecord,
  RoleRecord,
  SessionRecord,
  UserRecord,
} from "@jini-ai/cms/identity";

/**
 * @file Drizzle/SQLite adapters for the `identity` repo ports (ADR-021 / SPEC-006).
 *
 * Purpose:
 * The other half of each ADR-006 rule-of-two, mirroring `repo.memory.ts`'s exact save-is-upsert
 * semantics. Built so identity survives a process restart — the in-memory-only adapters meant
 * every `tsx watch` restart (any file save) wiped every logged-in session, and re-seeded a fresh
 * random owner-principal id on top of that, so a persisted session alone wouldn't have helped
 * either. This is the whole rule-of-two: principals, users, sessions, roles, policies, and the
 * four join tables, all backed by real tables.
 */

function toPrincipalRecord(row: typeof principals.$inferSelect): PrincipalRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind as PrincipalKind,
    displayName: row.displayName,
    status: row.status as PrincipalStatus,
    disabledAt: row.disabledAt ?? undefined,
    createdAt: row.createdAt,
  };
}

export class SqlitePrincipalRepo implements PrincipalRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: string; id: string }): Promise<PrincipalRecord | null> {
    return findOneBy(
      this.db,
      principals,
      [eq(principals.workspaceId, required.workspaceId), eq(principals.id, required.id)],
      toPrincipalRecord
    );
  }

  async list(required: { workspaceId: string }): Promise<PrincipalRecord[]> {
    return this.db
      .select()
      .from(principals)
      .where(eq(principals.workspaceId, required.workspaceId))
      .all()
      .map(toPrincipalRecord);
  }

  async save(record: PrincipalRecord): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      kind: record.kind,
      displayName: record.displayName,
      status: record.status,
      disabledAt: record.disabledAt ?? null,
      createdAt: record.createdAt,
    };
    this.db.insert(principals).values(row).onConflictDoUpdate({ target: principals.id, set: row }).run();
  }
}

function toUserRecord(row: typeof identityUsers.$inferSelect): UserRecord {
  return {
    principalId: row.principalId,
    workspaceId: row.workspaceId,
    username: row.username,
    email: row.email ?? undefined,
    passwordHash: row.passwordHash,
    lastLoginAt: row.lastLoginAt ?? undefined,
  };
}

export class SqliteUserRepo implements UserRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByPrincipalId(required: {
    workspaceId: string;
    principalId: string;
  }): Promise<UserRecord | null> {
    return findOneBy(
      this.db,
      identityUsers,
      [eq(identityUsers.workspaceId, required.workspaceId), eq(identityUsers.principalId, required.principalId)],
      toUserRecord
    );
  }

  async findByUsername(required: { workspaceId: string; username: string }): Promise<UserRecord | null> {
    return findOneBy(
      this.db,
      identityUsers,
      [eq(identityUsers.workspaceId, required.workspaceId), eq(identityUsers.username, required.username)],
      toUserRecord
    );
  }

  async list(required: { workspaceId: string }): Promise<UserRecord[]> {
    return this.db
      .select()
      .from(identityUsers)
      .where(eq(identityUsers.workspaceId, required.workspaceId))
      .all()
      .map(toUserRecord);
  }

  async save(record: UserRecord): Promise<void> {
    const row = {
      principalId: record.principalId,
      workspaceId: record.workspaceId,
      username: record.username,
      email: record.email ?? null,
      passwordHash: record.passwordHash,
      lastLoginAt: record.lastLoginAt ?? null,
    };
    this.db
      .insert(identityUsers)
      .values(row)
      .onConflictDoUpdate({ target: identityUsers.principalId, set: row })
      .run();
  }
}

function toSessionRecord(row: typeof sessions.$inferSelect): SessionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    principalId: row.principalId,
    tokenHash: row.tokenHash,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt ?? undefined,
    ip: row.ip ?? undefined,
    userAgent: row.userAgent ?? undefined,
  };
}

export class SqliteSessionRepo implements SessionRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: string; id: string }): Promise<SessionRecord | null> {
    return findOneBy(
      this.db,
      sessions,
      [eq(sessions.workspaceId, required.workspaceId), eq(sessions.id, required.id)],
      toSessionRecord
    );
  }

  async findByTokenHash(required: {
    workspaceId: string;
    tokenHash: string;
  }): Promise<SessionRecord | null> {
    return findOneBy(
      this.db,
      sessions,
      [eq(sessions.workspaceId, required.workspaceId), eq(sessions.tokenHash, required.tokenHash)],
      toSessionRecord
    );
  }

  async save(record: SessionRecord): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      principalId: record.principalId,
      tokenHash: record.tokenHash,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt ?? null,
      ip: record.ip ?? null,
      userAgent: record.userAgent ?? null,
    };
    this.db.insert(sessions).values(row).onConflictDoUpdate({ target: sessions.id, set: row }).run();
  }

  async revoke(required: { workspaceId: string; id: string; revokedAt: string }): Promise<void> {
    this.db
      .update(sessions)
      .set({ revokedAt: required.revokedAt })
      .where(and(eq(sessions.workspaceId, required.workspaceId), eq(sessions.id, required.id)))
      .run();
  }

  async listByPrincipalId(required: {
    workspaceId: string;
    principalId: string;
  }): Promise<SessionRecord[]> {
    return this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.workspaceId, required.workspaceId), eq(sessions.principalId, required.principalId)))
      .all()
      .map(toSessionRecord);
  }
}

function toRoleRecord(row: typeof roles.$inferSelect): RoleRecord {
  return { id: row.id, workspaceId: row.workspaceId, name: row.name, isBuiltin: row.isBuiltin === 1 };
}

export class SqliteRoleRepo implements RoleRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: string; id: string }): Promise<RoleRecord | null> {
    return findOneBy(
      this.db,
      roles,
      [eq(roles.workspaceId, required.workspaceId), eq(roles.id, required.id)],
      toRoleRecord
    );
  }

  async findByName(required: { workspaceId: string; name: string }): Promise<RoleRecord | null> {
    return findOneBy(
      this.db,
      roles,
      [eq(roles.workspaceId, required.workspaceId), eq(roles.name, required.name)],
      toRoleRecord
    );
  }

  async list(required: { workspaceId: string }): Promise<RoleRecord[]> {
    return this.db.select().from(roles).where(eq(roles.workspaceId, required.workspaceId)).all().map(toRoleRecord);
  }

  async save(record: RoleRecord): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      name: record.name,
      isBuiltin: record.isBuiltin ? 1 : 0,
    };
    this.db.insert(roles).values(row).onConflictDoUpdate({ target: roles.id, set: row }).run();
  }

  async delete(required: { workspaceId: string; id: string }): Promise<void> {
    this.db.delete(roles).where(and(eq(roles.workspaceId, required.workspaceId), eq(roles.id, required.id))).run();
  }
}

function toPolicyRecord(row: typeof policies.$inferSelect): PolicyRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description ?? undefined,
    isBuiltin: row.isBuiltin === 1,
    isFrozen: row.isFrozen === 1,
  };
}

export class SqlitePolicyRepo implements PolicyRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findById(required: { workspaceId: string; id: string }): Promise<PolicyRecord | null> {
    return findOneBy(
      this.db,
      policies,
      [eq(policies.workspaceId, required.workspaceId), eq(policies.id, required.id)],
      toPolicyRecord
    );
  }

  async findByName(required: { workspaceId: string; name: string }): Promise<PolicyRecord | null> {
    return findOneBy(
      this.db,
      policies,
      [eq(policies.workspaceId, required.workspaceId), eq(policies.name, required.name)],
      toPolicyRecord
    );
  }

  async list(required: { workspaceId: string }): Promise<PolicyRecord[]> {
    return this.db
      .select()
      .from(policies)
      .where(eq(policies.workspaceId, required.workspaceId))
      .all()
      .map(toPolicyRecord);
  }

  async save(record: PolicyRecord): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      name: record.name,
      description: record.description ?? null,
      isBuiltin: record.isBuiltin ? 1 : 0,
      isFrozen: record.isFrozen ? 1 : 0,
    };
    this.db.insert(policies).values(row).onConflictDoUpdate({ target: policies.id, set: row }).run();
  }

  async delete(required: { workspaceId: string; id: string }): Promise<void> {
    this.db
      .delete(policies)
      .where(and(eq(policies.workspaceId, required.workspaceId), eq(policies.id, required.id)))
      .run();
  }
}

function toPolicyPermissionRecord(row: typeof policyPermissions.$inferSelect): PolicyPermissionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    policyId: row.policyId,
    permission: row.permission,
    resourceType: row.resourceType ?? null,
    constraintJson: row.constraintJson ?? null,
  };
}

export class SqlitePolicyPermissionRepo implements PolicyPermissionRepoPort {
  constructor(private readonly db: ContentDb) {}

  async listByPolicyId(required: {
    workspaceId: string;
    policyId: string;
  }): Promise<PolicyPermissionRecord[]> {
    return this.db
      .select()
      .from(policyPermissions)
      .where(
        and(
          eq(policyPermissions.workspaceId, required.workspaceId),
          eq(policyPermissions.policyId, required.policyId)
        )
      )
      .all()
      .map(toPolicyPermissionRecord);
  }

  async save(record: PolicyPermissionRecord): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      policyId: record.policyId,
      permission: record.permission,
      resourceType: record.resourceType ?? null,
      constraintJson: record.constraintJson ?? null,
    };
    this.db
      .insert(policyPermissions)
      .values(row)
      .onConflictDoUpdate({ target: policyPermissions.id, set: row })
      .run();
  }

  async deleteByPolicyId(required: { workspaceId: string; policyId: string }): Promise<void> {
    this.db
      .delete(policyPermissions)
      .where(
        and(
          eq(policyPermissions.workspaceId, required.workspaceId),
          eq(policyPermissions.policyId, required.policyId)
        )
      )
      .run();
  }
}

function toRolePolicyRecord(row: typeof rolePolicies.$inferSelect): RolePolicyRecord {
  return { id: row.id, workspaceId: row.workspaceId, roleId: row.roleId, policyId: row.policyId };
}

export class SqliteRolePolicyRepo implements RolePolicyRepoPort {
  constructor(private readonly db: ContentDb) {}

  async listByRoleId(required: { workspaceId: string; roleId: string }): Promise<RolePolicyRecord[]> {
    return this.db
      .select()
      .from(rolePolicies)
      .where(and(eq(rolePolicies.workspaceId, required.workspaceId), eq(rolePolicies.roleId, required.roleId)))
      .all()
      .map(toRolePolicyRecord);
  }

  async listByPolicyId(required: { workspaceId: string; policyId: string }): Promise<RolePolicyRecord[]> {
    return this.db
      .select()
      .from(rolePolicies)
      .where(
        and(eq(rolePolicies.workspaceId, required.workspaceId), eq(rolePolicies.policyId, required.policyId))
      )
      .all()
      .map(toRolePolicyRecord);
  }

  async save(record: RolePolicyRecord): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      roleId: record.roleId,
      policyId: record.policyId,
    };
    this.db
      .insert(rolePolicies)
      .values(row)
      .onConflictDoUpdate({ target: rolePolicies.id, set: row })
      .run();
  }
}

function toPrincipalRoleRecord(row: typeof principalRoles.$inferSelect): PrincipalRoleRecord {
  return { id: row.id, workspaceId: row.workspaceId, principalId: row.principalId, roleId: row.roleId };
}

export class SqlitePrincipalRoleRepo implements PrincipalRoleRepoPort {
  constructor(private readonly db: ContentDb) {}

  async listByPrincipalId(required: {
    workspaceId: string;
    principalId: string;
  }): Promise<PrincipalRoleRecord[]> {
    return this.db
      .select()
      .from(principalRoles)
      .where(
        and(
          eq(principalRoles.workspaceId, required.workspaceId),
          eq(principalRoles.principalId, required.principalId)
        )
      )
      .all()
      .map(toPrincipalRoleRecord);
  }

  async listByRoleId(required: { workspaceId: string; roleId: string }): Promise<PrincipalRoleRecord[]> {
    return this.db
      .select()
      .from(principalRoles)
      .where(
        and(eq(principalRoles.workspaceId, required.workspaceId), eq(principalRoles.roleId, required.roleId))
      )
      .all()
      .map(toPrincipalRoleRecord);
  }

  async save(record: PrincipalRoleRecord): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      principalId: record.principalId,
      roleId: record.roleId,
    };
    this.db
      .insert(principalRoles)
      .values(row)
      .onConflictDoUpdate({ target: principalRoles.id, set: row })
      .run();
  }
}

function toPrincipalPolicyRecord(row: typeof principalPolicies.$inferSelect): PrincipalPolicyRecord {
  return { id: row.id, workspaceId: row.workspaceId, principalId: row.principalId, policyId: row.policyId };
}

export class SqlitePrincipalPolicyRepo implements PrincipalPolicyRepoPort {
  constructor(private readonly db: ContentDb) {}

  async listByPrincipalId(required: {
    workspaceId: string;
    principalId: string;
  }): Promise<PrincipalPolicyRecord[]> {
    return this.db
      .select()
      .from(principalPolicies)
      .where(
        and(
          eq(principalPolicies.workspaceId, required.workspaceId),
          eq(principalPolicies.principalId, required.principalId)
        )
      )
      .all()
      .map(toPrincipalPolicyRecord);
  }

  async listByPolicyId(required: {
    workspaceId: string;
    policyId: string;
  }): Promise<PrincipalPolicyRecord[]> {
    return this.db
      .select()
      .from(principalPolicies)
      .where(
        and(
          eq(principalPolicies.workspaceId, required.workspaceId),
          eq(principalPolicies.policyId, required.policyId)
        )
      )
      .all()
      .map(toPrincipalPolicyRecord);
  }

  async save(record: PrincipalPolicyRecord): Promise<void> {
    const row = {
      id: record.id,
      workspaceId: record.workspaceId,
      principalId: record.principalId,
      policyId: record.policyId,
    };
    this.db
      .insert(principalPolicies)
      .values(row)
      .onConflictDoUpdate({ target: principalPolicies.id, set: row })
      .run();
  }
}
