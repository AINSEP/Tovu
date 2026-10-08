import type { Selectable } from "kysely";

import type { UUID } from "@jini-ai/core/primitives";

import type { ExternalMcpToolApprovalRecord, ExternalMcpToolApprovalRepoPort } from "#src/assistant/external-mcp-tool-approval-ports";
import type { ContentKernel } from "../content-kernel.js";
import type { ExternalMcpToolApprovalsTable } from "../content-database.generated.js";

/**
 * @file `external_mcp_tool_approvals` (migration 0077): the G3 "Always allow" rows, one per site +
 * connection + remote tool. See `assistant/external-mcp-tool-approvals.ts`. One Kysely query body
 * for every dialect (storage plan §4, ADR-066); `sqlite/external-mcp-tool-approval-repo.sqlite.ts`
 * is the thin subclass the composition root builds from the content db handle.
 */

type ApprovalKey = { workspaceId: UUID; serverId: string; toolName: string };

function toRecord(row: Selectable<ExternalMcpToolApprovalsTable>): ExternalMcpToolApprovalRecord {
  return {
    workspaceId: row.workspace_id as UUID,
    serverId: row.server_id,
    toolName: row.tool_name,
    fingerprint: row.fingerprint,
    grantedByPrincipalId: row.granted_by_principal_id,
    grantedAt: row.granted_at,
  };
}

export class SqlExternalMcpToolApprovalRepo implements ExternalMcpToolApprovalRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async find(input: ApprovalKey): Promise<ExternalMcpToolApprovalRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("external_mcp_tool_approvals")
        .selectAll()
        .where("workspace_id", "=", input.workspaceId)
        .where("server_id", "=", input.serverId)
        .where("tool_name", "=", input.toolName)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async upsert(record: ExternalMcpToolApprovalRecord): Promise<void> {
    const grant = { fingerprint: record.fingerprint, granted_by_principal_id: record.grantedByPrincipalId, granted_at: record.grantedAt };
    await this.kernel.run((db) =>
      db
        .insertInto("external_mcp_tool_approvals")
        .values({ workspace_id: record.workspaceId, server_id: record.serverId, tool_name: record.toolName, ...grant })
        .onConflict((oc) => oc.columns(["workspace_id", "server_id", "tool_name"]).doUpdateSet(grant))
        .execute()
    );
  }

  async listByWorkspaceId(workspaceId: UUID): Promise<ExternalMcpToolApprovalRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("external_mcp_tool_approvals").selectAll().where("workspace_id", "=", workspaceId).execute()
    );
    return rows.map(toRecord);
  }

  async delete(input: ApprovalKey): Promise<boolean> {
    const result = await this.kernel.run((db) =>
      db
        .deleteFrom("external_mcp_tool_approvals")
        .where("workspace_id", "=", input.workspaceId)
        .where("server_id", "=", input.serverId)
        .where("tool_name", "=", input.toolName)
        .executeTakeFirst()
    );
    return Number(result.numDeletedRows) > 0;
  }
}
