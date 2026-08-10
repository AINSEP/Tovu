import { and, eq, inArray } from "drizzle-orm";

import type { UUID } from "@jini-ai/cms/core";

import type {
  MediaProviderCredentialRecord,
  MediaProviderCredentialRepoPort,
} from "../../media/provider-credential-store";
import { mediaProviderCredentials } from "../schema";
import type { ContentDb } from "./content-db";

/**
 * @file Real `MediaProviderCredentialRepoPort` adapter — the ADR-006 rule-of-two "second adapter"
 * half; `media/provider-credential-store.memory.ts` is the first. Mirrors
 * `site-credential-repo.sqlite.ts`'s shape, widened from its single-row-per-workspace pattern to
 * this table's `(workspace_id, provider_id)` composite key.
 *
 * `sealed*`/`key_tail` are read and written as one opaque group — this file never inspects or
 * validates their contents (that is `AesGcmSecretSealer`'s and `provider-credential-store.ts`'s
 * job); it only moves the DB's all-null-or-all-set shape (enforced by the table's CHECK) into and
 * out of `SealedSecret | null`.
 */

type Row = typeof mediaProviderCredentials.$inferSelect;

function toRecord(row: Row): MediaProviderCredentialRecord {
  const sealed =
    row.sealedKeyId !== null &&
    row.sealedCiphertext !== null &&
    row.sealedNonce !== null &&
    row.sealedAlg !== null
      ? { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg }
      : null;
  return {
    workspaceId: row.workspaceId,
    providerId: row.providerId,
    baseUrl: row.baseUrl,
    model: row.model,
    sealed,
    keyTail: row.keyTail,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SqliteMediaProviderCredentialRepo implements MediaProviderCredentialRepoPort {
  constructor(private readonly db: ContentDb) {}

  async listByWorkspaceId(workspaceId: UUID): Promise<MediaProviderCredentialRecord[]> {
    return this.db
      .select()
      .from(mediaProviderCredentials)
      .where(eq(mediaProviderCredentials.workspaceId, workspaceId))
      .all()
      .map(toRecord);
  }

  async upsert(record: MediaProviderCredentialRecord): Promise<void> {
    const values = {
      workspaceId: record.workspaceId,
      providerId: record.providerId,
      baseUrl: record.baseUrl,
      model: record.model,
      sealedKeyId: record.sealed?.keyId ?? null,
      sealedCiphertext: record.sealed?.ciphertext ?? null,
      sealedNonce: record.sealed?.nonce ?? null,
      sealedAlg: record.sealed?.alg ?? null,
      keyTail: record.keyTail,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
    this.db
      .insert(mediaProviderCredentials)
      .values(values)
      .onConflictDoUpdate({
        target: [mediaProviderCredentials.workspaceId, mediaProviderCredentials.providerId],
        set: values,
      })
      .run();
  }

  async deleteByProviderIds(input: { workspaceId: UUID; providerIds: readonly string[] }): Promise<void> {
    // Guarded because Drizzle's `inArray` against an empty list compiles to `IN ()`, which is a
    // SQLite syntax error rather than the zero-row match the port's "no-op on an empty list"
    // contract promises.
    if (input.providerIds.length === 0) return;
    this.db
      .delete(mediaProviderCredentials)
      .where(
        and(
          eq(mediaProviderCredentials.workspaceId, input.workspaceId),
          inArray(mediaProviderCredentials.providerId, [...input.providerIds])
        )
      )
      .run();
  }
}
