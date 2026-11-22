import type { Insertable, Selectable } from "kysely";

import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { PrincipalPoliciesTable, PrincipalRolesTable, RolePoliciesTable } from "../../platform/db/content-database.generated.js";

import type { PrincipalPolicyRepoPort, PrincipalRoleRepoPort, RolePolicyRepoPort } from "@jini-ai/user-management";
import type { PrincipalPolicyRecord, PrincipalRoleRecord, RolePolicyRecord } from "@jini-ai/user-management";
import { createIdentityTransactions } from "./repo.js";

function toRolePolicyRecord(row: Selectable<RolePoliciesTable>): RolePolicyRecord {
  return { id: row.id, workspaceId: row.workspace_id, roleId: row.role_id, policyId: row.policy_id };
}

export class SqlRolePolicyRepo implements RolePolicyRepoPort {
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

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
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

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
  protected readonly kernel: ContentKernel;
  constructor(kernel: ContentKernel) {
    this.kernel = kernel;
  }

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
