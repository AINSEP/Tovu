import { and, eq, isNull, lte, or, sql } from "drizzle-orm";

import type { UUID } from "@jini-ai/cms/core";

import type { ExternalMcpServerRecord, ExternalMcpServerRepoPort } from "#src/assistant/index";
import { externalMcpServers } from "../schema.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Real `ExternalMcpServerRepoPort` adapter — the ADR-006 rule-of-two "second adapter" half;
 * `assistant/external-mcp-store.memory.ts` is the first. Mirrors
 * `media-provider-credential-repo.sqlite.ts`, which has the same workspace-scoped composite-key
 * shape.
 *
 * Both `sealed_*` groups are moved as opaque units — this file never inspects or validates their
 * contents (that is `AesGcmSecretSealer`'s and `external-mcp-store.ts`'s job); it only translates
 * each group's all-null-or-all-set shape into and out of `SealedSecret | null`.
 *
 * One method here is NOT a plain translation: {@link SqliteExternalMcpServerRepo.tryClaimOAuthRefreshLease}
 * is a compare-and-set, and it is the only place in this adapter where the SQL shape carries a
 * correctness guarantee rather than a storage detail. See its doc.
 */

type Row = typeof externalMcpServers.$inferSelect;

function toRecord(row: Row): ExternalMcpServerRecord {
  const sealedEnv =
    row.sealedKeyId !== null && row.sealedCiphertext !== null && row.sealedNonce !== null && row.sealedAlg !== null
      ? { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg }
      : null;
  const sealedOAuth =
    row.oauthSealedKeyId !== null && row.oauthSealedCiphertext !== null && row.oauthSealedNonce !== null && row.oauthSealedAlg !== null
      ? { keyId: row.oauthSealedKeyId, ciphertext: row.oauthSealedCiphertext, nonce: row.oauthSealedNonce, alg: row.oauthSealedAlg }
      : null;
  return {
    workspaceId: row.workspaceId,
    serverId: row.serverId,
    label: row.label,
    transport: row.transport,
    authMode: row.authMode,
    enabled: row.enabled,
    command: row.command,
    url: row.url,
    args: row.args,
    allowedToolNames: row.allowedToolNames,
    writeAllowedToolNames: row.writeAllowedToolNames,
    writeGrantsUpdatedByPrincipalId: row.writeGrantsUpdatedByPrincipalId,
    writeGrantsUpdatedAt: row.writeGrantsUpdatedAt,
    envNames: row.envNames,
    sealedEnv,
    oauthProviderId: row.oauthProviderId,
    oauthGrant: row.oauthGrant,
    oauthClientId: row.oauthClientId,
    oauthEndpointsJson: row.oauthEndpointsJson,
    oauthScopesJson: row.oauthScopesJson,
    oauthStatus: row.oauthStatus,
    oauthExpiresAt: row.oauthExpiresAt,
    oauthTokenEnvName: row.oauthTokenEnvName,
    oauthRefreshLeaseUntil: row.oauthRefreshLeaseUntil,
    sealedOAuth,
    aadVersion: row.aadVersion,
    oauthAadVersion: row.oauthAadVersion,
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
      authMode: record.authMode,
      enabled: record.enabled,
      command: record.command,
      url: record.url,
      args: record.args,
      allowedToolNames: record.allowedToolNames,
      writeAllowedToolNames: record.writeAllowedToolNames,
      writeGrantsUpdatedByPrincipalId: record.writeGrantsUpdatedByPrincipalId,
      writeGrantsUpdatedAt: record.writeGrantsUpdatedAt,
      envNames: record.envNames,
      sealedKeyId: record.sealedEnv?.keyId ?? null,
      sealedCiphertext: record.sealedEnv?.ciphertext ?? null,
      sealedNonce: record.sealedEnv?.nonce ?? null,
      sealedAlg: record.sealedEnv?.alg ?? null,
      oauthProviderId: record.oauthProviderId,
      oauthGrant: record.oauthGrant,
      oauthClientId: record.oauthClientId,
      oauthEndpointsJson: record.oauthEndpointsJson,
      oauthScopesJson: record.oauthScopesJson,
      oauthStatus: record.oauthStatus,
      oauthExpiresAt: record.oauthExpiresAt,
      oauthTokenEnvName: record.oauthTokenEnvName,
      oauthRefreshLeaseUntil: record.oauthRefreshLeaseUntil,
      oauthSealedKeyId: record.sealedOAuth?.keyId ?? null,
      oauthSealedCiphertext: record.sealedOAuth?.ciphertext ?? null,
      oauthSealedNonce: record.sealedOAuth?.nonce ?? null,
      oauthSealedAlg: record.sealedOAuth?.alg ?? null,
      aadVersion: record.aadVersion,
      oauthAadVersion: record.oauthAadVersion,
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

  /**
   * Claims the OAuth refresh lease with a single conditional UPDATE.
   *
   * The condition is in the `WHERE`, not in a preceding `SELECT`, and that is the whole guarantee:
   * a read-then-write loses the race it exists to prevent, because between reading "no lease" and
   * writing "my lease" the other process does exactly the same and both go on to redeem the same
   * single-use rotating refresh token — which permanently kills the connection. `result.changes` is
   * therefore the answer, not a diagnostic.
   *
   * A lease at or before `nowIso` is treated as abandoned, so a process that crashed mid-refresh
   * cannot wedge the connection until someone restarts something.
   *
   * @returns `true` when this caller now holds the lease.
   * @complexity O(1) — one indexed conditional UPDATE on the primary key.
   */
  async tryClaimOAuthRefreshLease(input: {
    workspaceId: UUID;
    serverId: string;
    nowIso: string;
    leaseUntil: string;
  }): Promise<boolean> {
    const result = this.db
      .update(externalMcpServers)
      .set({ oauthRefreshLeaseUntil: input.leaseUntil })
      .where(
        and(
          eq(externalMcpServers.workspaceId, input.workspaceId),
          eq(externalMcpServers.serverId, input.serverId),
          or(isNull(externalMcpServers.oauthRefreshLeaseUntil), lte(externalMcpServers.oauthRefreshLeaseUntil, input.nowIso)),
        ),
      )
      .run();
    return result.changes > 0;
  }

  async releaseOAuthRefreshLease(input: { workspaceId: UUID; serverId: string }): Promise<void> {
    this.db
      .update(externalMcpServers)
      .set({ oauthRefreshLeaseUntil: sql`NULL` })
      .where(and(eq(externalMcpServers.workspaceId, input.workspaceId), eq(externalMcpServers.serverId, input.serverId)))
      .run();
  }
}
