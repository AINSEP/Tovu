import type { ISODateTime, UUID } from "@jini-ai/core/primitives";

import type { ExternalMcpServerRecord, ExternalMcpServerRepoPort } from "./external-mcp-store.js";

/**
 * @file In-memory `ExternalMcpServerRepoPort` — the ADR-006 rule-of-two "first adapter", and the
 * double every store/route test binds instead of a real database.
 *
 * Keyed by `workspaceId` + `serverId` exactly as the table's composite primary key is, so a test
 * that leaks rows across workspaces fails here the same way it would against SQLite.
 *
 * {@link InMemoryExternalMcpServerRepo.tryClaimOAuthRefreshLease} reproduces the SQLite adapter's
 * compare-and-set SEMANTICS rather than its statement. It is genuinely atomic here for the reason
 * that matters in a test — JavaScript's single-threaded turn boundary means the read and the write
 * cannot be interleaved by another caller — so a test that asserts "the second claimant loses"
 * exercises the same contract the conditional UPDATE provides in production.
 */

function keyOf(workspaceId: UUID, serverId: string): string {
  return `${workspaceId} ${serverId}`;
}

export class InMemoryExternalMcpServerRepo implements ExternalMcpServerRepoPort {
  private readonly rows = new Map<string, ExternalMcpServerRecord>();

  async listByWorkspaceId(workspaceId: UUID): Promise<ExternalMcpServerRecord[]> {
    return [...this.rows.values()].filter((row) => row.workspaceId === workspaceId);
  }

  async findByServerId(input: { workspaceId: UUID; serverId: string }): Promise<ExternalMcpServerRecord | null> {
    return this.rows.get(keyOf(input.workspaceId, input.serverId)) ?? null;
  }

  async upsert(record: ExternalMcpServerRecord): Promise<void> {
    this.rows.set(keyOf(record.workspaceId, record.serverId), { ...record });
  }

  async deleteByServerId(input: { workspaceId: UUID; serverId: string }): Promise<boolean> {
    return this.rows.delete(keyOf(input.workspaceId, input.serverId));
  }

  async tryClaimOAuthRefreshLease(input: {
    workspaceId: UUID;
    serverId: string;
    nowIso: ISODateTime;
    leaseUntil: ISODateTime;
  }): Promise<boolean> {
    const row = this.rows.get(keyOf(input.workspaceId, input.serverId));
    if (!row) return false;
    const held = row.oauthRefreshLeaseUntil;
    // A lease at or before `nowIso` is abandoned — a process that crashed mid-refresh must not wedge
    // the connection until something is restarted.
    if (held !== null && Date.parse(held) > Date.parse(input.nowIso)) return false;
    this.rows.set(keyOf(input.workspaceId, input.serverId), { ...row, oauthRefreshLeaseUntil: input.leaseUntil });
    return true;
  }

  async releaseOAuthRefreshLease(input: { workspaceId: UUID; serverId: string }): Promise<void> {
    const row = this.rows.get(keyOf(input.workspaceId, input.serverId));
    if (!row) return;
    this.rows.set(keyOf(input.workspaceId, input.serverId), { ...row, oauthRefreshLeaseUntil: null });
  }
}
