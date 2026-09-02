import { and, eq } from "drizzle-orm";

import type { ISODateTime, UUID } from "@jini-ai/cms/core";

import type { ComposioConfigRecord, ComposioConfigRepoPort } from "../../connectors/composio-config-store.js";
import { composioConfig } from "../schema.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Real `ComposioConfigRepoPort` adapter — the ADR-006 rule-of-two "second adapter" half;
 * `connectors/composio-config-store.memory.ts` is the first. Mirrors
 * `media-provider-credential-repo.sqlite.ts`, narrowed from its composite `(workspace_id,
 * provider_id)` key to this table's single-row-per-workspace shape.
 *
 * `sealed*`/`key_tail` are read and written as one opaque group — this file never inspects or
 * validates their contents (that is `AesGcmSecretSealer`'s and `composio-config-store.ts`'s job);
 * it only moves the DB's all-null-or-all-set shape (enforced by the table's CHECK) into and out of
 * `SealedSecret | null`.
 */

type Row = typeof composioConfig.$inferSelect;

/**
 * Parses the `auth_config_ids` JSON column, tolerating anything that is not a flat string map.
 *
 * Corrupt or hand-edited JSON degrades to "no ids provisioned" rather than throwing: the ids are a
 * remote-resource cache, so the worst cost of discarding them is one re-provision on the next
 * connect, whereas throwing would make the whole Connectors tab unreadable over a cosmetic
 * problem. The API key beside it is deliberately NOT treated this way.
 *
 * @complexity O(n) in the serialized length.
 * @overallScore 100
 */
function parseAuthConfigIds(raw: string | null): Record<string, string> {
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const ids: Record<string, string> = {};
  for (const [connectorId, authConfigId] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof authConfigId === "string" && authConfigId.length > 0) ids[connectorId] = authConfigId;
  }
  return ids;
}

function toRecord(row: Row): ComposioConfigRecord {
  const sealed =
    row.sealedKeyId !== null &&
    row.sealedCiphertext !== null &&
    row.sealedNonce !== null &&
    row.sealedAlg !== null
      ? { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg }
      : null;
  return {
    workspaceId: row.workspaceId,
    sealed,
    keyTail: row.keyTail,
    aadVersion: row.aadVersion,
    authConfigIds: parseAuthConfigIds(row.authConfigIds),
    keyGeneration: row.keyGeneration,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Shared by `upsert` and the conditional update so the two can never disagree about the empty
 *  case — see `upsert` for why an empty map is stored as `null`. */
function serializeAuthConfigIds(authConfigIds: Record<string, string>): string | null {
  return Object.keys(authConfigIds).length === 0 ? null : JSON.stringify(authConfigIds);
}

export class SqliteComposioConfigRepo implements ComposioConfigRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByWorkspaceId(workspaceId: UUID): Promise<ComposioConfigRecord | null> {
    const row = this.db
      .select()
      .from(composioConfig)
      .where(eq(composioConfig.workspaceId, workspaceId))
      .get();
    return row === undefined ? null : toRecord(row);
  }

  async upsert(record: ComposioConfigRecord): Promise<void> {
    const values = {
      workspaceId: record.workspaceId,
      sealedKeyId: record.sealed?.keyId ?? null,
      sealedCiphertext: record.sealed?.ciphertext ?? null,
      sealedNonce: record.sealed?.nonce ?? null,
      sealedAlg: record.sealed?.alg ?? null,
      keyTail: record.keyTail,
      aadVersion: record.aadVersion,
      // Stored as `null` rather than `"{}"` when empty so the common unconfigured row carries no
      // JSON at all, matching how every other optional column here reads as absent.
      authConfigIds: serializeAuthConfigIds(record.authConfigIds),
      keyGeneration: record.keyGeneration,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
    this.db
      .insert(composioConfig)
      .values(values)
      .onConflictDoUpdate({ target: composioConfig.workspaceId, set: values })
      .run();
  }

  /**
   * One conditional `UPDATE ... WHERE workspace_id = ? AND key_generation = ?`, touching only
   * `auth_config_ids` and `updated_at`.
   *
   * A single statement is the point. SQLite applies it atomically, so there is no read this caller
   * could be holding stale — and because the SET list names two columns, a delayed write physically
   * cannot carry a stale `sealed_*`/`key_tail` back over a rotation the way the read-modify-write
   * upsert it replaced could.
   *
   * @returns whether the row matched — `changes === 0` means the generation moved on and nothing
   *   was written.
   * @complexity O(1) — one primary-key-anchored update.
   * @overallScore 100
   */
  async updateAuthConfigIdsIfGenerationMatches(input: {
    workspaceId: UUID;
    expectedGeneration: number;
    authConfigIds: Record<string, string>;
    updatedAt: ISODateTime;
  }): Promise<boolean> {
    const result = this.db
      .update(composioConfig)
      .set({
        authConfigIds: serializeAuthConfigIds(input.authConfigIds),
        updatedAt: input.updatedAt,
      })
      .where(
        and(
          eq(composioConfig.workspaceId, input.workspaceId),
          eq(composioConfig.keyGeneration, input.expectedGeneration)
        )
      )
      .run();
    return result.changes > 0;
  }
}
