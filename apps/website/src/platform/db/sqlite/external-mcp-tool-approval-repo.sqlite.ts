import { and, eq } from "drizzle-orm";

import type { UUID } from "@jini-ai/cms/core";

import type { ExternalMcpToolApprovalRecord, ExternalMcpToolApprovalRepoPort } from "#src/assistant/external-mcp-tool-approvals";
import { externalMcpToolApprovals } from "../schema.sqlite.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file `external_mcp_tool_approvals` (migration 0077): the G3 "Always allow" rows, one per site +
 * connection + remote tool. See `assistant/external-mcp-tool-approvals.ts`.
 */
export class SqliteExternalMcpToolApprovalRepo implements ExternalMcpToolApprovalRepoPort {
  constructor(private readonly db: ContentDb) {}

  private where(input: { workspaceId: UUID; serverId: string; toolName: string }) {
    return and(
      eq(externalMcpToolApprovals.workspaceId, input.workspaceId),
      eq(externalMcpToolApprovals.serverId, input.serverId),
      eq(externalMcpToolApprovals.toolName, input.toolName),
    );
  }

  async find(input: { workspaceId: UUID; serverId: string; toolName: string }): Promise<ExternalMcpToolApprovalRecord | null> {
    const row = this.db.select().from(externalMcpToolApprovals).where(this.where(input)).get();
    return row ? { ...row, workspaceId: row.workspaceId as UUID } : null;
  }

  async upsert(record: ExternalMcpToolApprovalRecord): Promise<void> {
    const values = { ...record };
    this.db
      .insert(externalMcpToolApprovals)
      .values(values)
      .onConflictDoUpdate({
        target: [externalMcpToolApprovals.workspaceId, externalMcpToolApprovals.serverId, externalMcpToolApprovals.toolName],
        set: { fingerprint: values.fingerprint, grantedByPrincipalId: values.grantedByPrincipalId, grantedAt: values.grantedAt },
      })
      .run();
  }

  async listByWorkspaceId(workspaceId: UUID): Promise<ExternalMcpToolApprovalRecord[]> {
    return this.db
      .select()
      .from(externalMcpToolApprovals)
      .where(eq(externalMcpToolApprovals.workspaceId, workspaceId))
      .all()
      .map((row) => ({ ...row, workspaceId: row.workspaceId as UUID }));
  }

  async delete(input: { workspaceId: UUID; serverId: string; toolName: string }): Promise<boolean> {
    return this.db.delete(externalMcpToolApprovals).where(this.where(input)).run().changes > 0;
  }
}
