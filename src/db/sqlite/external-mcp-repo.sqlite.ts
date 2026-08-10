import { and, eq } from "drizzle-orm";

import type { UUID } from "@jini-ai/cms/core";

import type { ExternalMcpServerRecord, ExternalMcpServerRepoPort } from "../../assistant/external-mcp-store";
import { externalMcpServers } from "../schema";
import type { ContentDb } from "./content-db";

/**
 * @file Real `ExternalMcpServerRepoPort` adapter — the ADR-006 rule-of-two "second adapter" half;
 * `assistant/external-mcp-store.memory.ts` is the first. Mirrors
 * `media-provider-credential-repo.sqlite.ts`, which has the same workspace-scoped composite-key
 * shape.
 *
 * The `sealed_*` columns are moved as one opaque group — this file never inspects or validates
 * their contents (that is `AesGcmSecretSealer`'s and `external-mcp-store.ts`'s job); it only
 * translates the table's all-null-or-all-set shape into and out of `SealedSecret | null`.
 */

type Row = typeof externalMcpServers.$inferSelect;

function toRecord(row: Row): ExternalMcpServerRecord {
  const sealedEnv =
    row.sealedKeyId !== null && row.sealedCiphertext !== null && row.sealedNonce !== null && row.sealedAlg !== null
      ? { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg }
      : null;
  return {
    workspaceId: row.workspaceId,
    serverId: row.serverId,
    label: row.label,
    transport: row.transport,
    enabled: row.enabled,
    command: row.command,
    args: row.args,
    allowedToolNames: row.allowedToolNames,
    envNames: row.envNames,
    sealedEnv,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SqliteExternalMcpServerRepo implements ExternalMcpServerRepoPort {
  constructor(private readonly db: ContentDb) {}

  async listByWorkspaceId(workspaceId: UUID): Promise<ExternalMcpServerRecord[]> {
    return this.db
      .select()
      .from(externalMcpServers)
      .where(eq(externalMcpServers.workspaceId, workspaceId))
      .all()
      .map(toRecord);
  }

  async findByServerId(input: { workspaceId: UUID; serverId: string }): Promise<ExternalMcpServerRecord | null> {
    const row = this.db
      .select()
      .from(externalMcpServers)
      .where(and(eq(externalMcpServers.workspaceId, input.workspaceId), eq(externalMcpServers.serverId, input.serverId)))
      .get();
    return row ? toRecord(row) : null;
  }

  async upsert(record: ExternalMcpServerRecord): Promise<void> {
    const values = {
      workspaceId: record.workspaceId,
      serverId: record.serverId,
      label: record.label,
      transport: record.transport,
      enabled: record.enabled,
      command: record.command,
      args: record.args,
      allowedToolNames: record.allowedToolNames,
      envNames: record.envNames,
      sealedKeyId: record.sealedEnv?.keyId ?? null,
      sealedCiphertext: record.sealedEnv?.ciphertext ?? null,
      sealedNonce: record.sealedEnv?.nonce ?? null,
      sealedAlg: record.sealedEnv?.alg ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
    this.db
      .insert(externalMcpServers)
      .values(values)
      .onConflictDoUpdate({
        target: [externalMcpServers.workspaceId, externalMcpServers.serverId],
        set: values,
      })
      .run();
  }

  async deleteByServerId(input: { workspaceId: UUID; serverId: string }): Promise<boolean> {
    const result = this.db
      .delete(externalMcpServers)
      .where(and(eq(externalMcpServers.workspaceId, input.workspaceId), eq(externalMcpServers.serverId, input.serverId)))
      .run();
    return result.changes > 0;
  }
}
