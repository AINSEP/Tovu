import type { Insertable, Selectable } from "kysely";

import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { PoliciesTable, PolicyPermissionsTable, RolesTable } from "../../platform/db/content-database.generated.js";

import type { PolicyPermissionRepoPort, PolicyRepoPort, RoleRepoPort } from "@jini-ai/user-management";
import type { PolicyPermissionRecord, PolicyRecord, RoleRecord } from "@jini-ai/user-management";
import { createIdentityTransactions } from "./repo.js";

function toRoleRecord(row: Selectable<RolesTable>): RoleRecord {
  return { id: row.id, workspaceId: row.workspace_id, name: row.name, isBuiltin: row.is_builtin === 1 };
}

export class SqlRoleRepo implements RoleRepoPort {
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

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
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

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
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

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
