import { sql, type Insertable, type Selectable } from "kysely";

import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { IdentityUsersTable, PrincipalsTable } from "../../platform/db/content-database.generated.js";

import type { IdentityTransactionPort } from "@jini-ai/user-management";
import type { PrincipalRepoPort, UserRepoPort, PrincipalRecord, UserRecord } from "@jini-ai/core/contracts/site/user-management";
import type { PrincipalKind, PrincipalStatus } from "@jini-ai/user-management";
import type { AssertVersionedWritePort } from "@jini-ai/core/optimistic-concurrency";

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
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

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
    version: row.version,
  };
}

/** The constructor object of a versioned identity repo: the host binds Jini core's conflict helper. */
export interface SqlVersionedIdentityRequired { kernel: ContentKernel; assertVersionedWrite: AssertVersionedWritePort }

export class SqlUserRepo implements UserRepoPort {
  protected readonly kernel: ContentKernel;
  private readonly assertVersionedWrite: AssertVersionedWritePort;
  constructor({ kernel, assertVersionedWrite }: SqlVersionedIdentityRequired, _optional: Record<string, never> = {}) {
    this.kernel = kernel;
    this.assertVersionedWrite = assertVersionedWrite;
  }

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

  async recordLogin(required: { workspaceId: string; principalId: string; lastLoginAt: string }): Promise<void> {
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: required.workspaceId, execute: () => this.kernel.run((db) =>
      db
        .updateTable("identity_users")
        .set({ last_login_at: required.lastLoginAt })
        .where("workspace_id", "=", required.workspaceId)
        .where("principal_id", "=", required.principalId)
        .execute()) });
  }

  /**
   * Without a basis this is the insert-or-replace used by create, seed and credential reset; it still
   * advances the version so an editor's earlier basis goes stale. With a basis it is a profile edit:
   * one conditional UPDATE whose `WHERE version = :expectedVersion` is the lock. Password and login
   * time are written by their own paths and are not part of an editor's snapshot, so it never
   * writes them back.
   */
  async save(record: UserRecord, optional: { expectedVersion?: number } = {}): Promise<void> {
    const { expectedVersion } = optional;
    await createIdentityTransactions({ kernel: this.kernel }).run({ workspaceId: record.workspaceId, execute: async () => {
      if (expectedVersion === undefined) return this.upsert(record);
      const result = await this.kernel.run((db) => db.updateTable("identity_users")
        .set({ username: record.username, email: record.email ?? null, version: sql<number>`version + 1` })
        .where("workspace_id", "=", record.workspaceId).where("principal_id", "=", record.principalId)
        .where("version", "=", expectedVersion).executeTakeFirst());
      await this.assertVersionedWrite({ changedRows: result.numUpdatedRows, recordKind: "user", recordId: record.principalId, expectedVersion,
        readCurrentVersion: async () => (await this.findByPrincipalId({ workspaceId: record.workspaceId, principalId: record.principalId }))?.version ?? null });
    } });
  }

  private async upsert(record: UserRecord): Promise<void> {
    const row: Insertable<IdentityUsersTable> = {
      principal_id: record.principalId,
      workspace_id: record.workspaceId,
      username: record.username,
      email: record.email ?? null,
      password_hash: record.passwordHash,
      last_login_at: record.lastLoginAt ?? null,
      version: record.version,
    };
    await this.kernel.run((db) =>
      db
        .insertInto("identity_users")
        .values(row)
        .onConflict((oc) => oc.column("principal_id").doUpdateSet({ ...row, version: sql<number>`${sql.ref("identity_users.version")} + 1` }))
        .execute());
  }
}
