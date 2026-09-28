import { and, eq, inArray } from "drizzle-orm";

import type { UUID } from "@jini-ai/cms/core";

import type {
  MediaProviderCredentialRecord,
  MediaProviderCredentialReplacePlanner,
  MediaProviderCredentialRepoPort,
} from "#src/features/media/provider-credential-store";
import { mediaProviderCredentials } from "../schema.sqlite.js";
import { contentKernel } from "../content-kernel.js";
import type { ContentDb } from "./content-db.js";

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
 *
 * `replaceWorkspace()` runs in the content db's storage-kernel transaction (`BEGIN IMMEDIATE` on
 * SQLite; other callers of the kernel wait their turn). The port takes a synchronous planner, so the
 * read, the plan and every write run with no `await` between them: nothing on this connection can
 * observe half-replaced state, by construction rather than by convention.
 */

type Row = typeof mediaProviderCredentials.$inferSelect;


/** Either the connection itself or an open transaction on it. */
type Writer = Pick<ContentDb, "select" | "insert" | "delete">;

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
    aadVersion: row.aadVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Reads one workspace's rows through `writer` — the connection, or an open transaction on it. */
function selectByWorkspaceId(writer: Writer, workspaceId: UUID): MediaProviderCredentialRecord[] {
  return writer
    .select()
    .from(mediaProviderCredentials)
    .where(eq(mediaProviderCredentials.workspaceId, workspaceId))
    .all()
    .map(toRecord);
}

function upsertRow(writer: Writer, record: MediaProviderCredentialRecord): void {
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
    aadVersion: record.aadVersion,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  writer
    .insert(mediaProviderCredentials)
    .values(values)
    .onConflictDoUpdate({
      target: [mediaProviderCredentials.workspaceId, mediaProviderCredentials.providerId],
      set: values,
    })
    .run();
}

function deleteRows(writer: Writer, workspaceId: UUID, providerIds: readonly string[]): void {
  // Guarded because Drizzle's `inArray` against an empty list compiles to `IN ()`, which is a
  // SQLite syntax error rather than the zero-row match the port's "no-op on an empty list"
  // contract promises.
  if (providerIds.length === 0) return;
  writer
    .delete(mediaProviderCredentials)
    .where(
      and(
        eq(mediaProviderCredentials.workspaceId, workspaceId),
        inArray(mediaProviderCredentials.providerId, [...providerIds])
      )
    )
    .run();
}

export class SqliteMediaProviderCredentialRepo implements MediaProviderCredentialRepoPort {
  constructor(private readonly db: ContentDb) {}

  async listByWorkspaceId(workspaceId: UUID): Promise<MediaProviderCredentialRecord[]> {
    return selectByWorkspaceId(this.db, workspaceId);
  }

  async upsert(record: MediaProviderCredentialRecord): Promise<void> {
    upsertRow(this.db, record);
  }

  async deleteByProviderIds(input: { workspaceId: UUID; providerIds: readonly string[] }): Promise<void> {
    deleteRows(this.db, input.workspaceId, input.providerIds);
  }

  /**
   * Read, plan, and write the whole workspace inside one `BEGIN IMMEDIATE` transaction.
   *
   * The body is synchronous end to end — the fresh read, the caller's planner, all
   * upserts and the tombstone delete — so this connection is never handed back to the event loop
   * while the transaction is open. That is the property the port promises and the reason the planner
   * cannot be async (see this file's header, and
   * `MediaProviderCredentialRepoPort.replaceWorkspace`).
   *
   * `BEGIN IMMEDIATE` (the kernel's SQLite transaction) takes the write lock up front: the read
   * that feeds the planner is a read-for-update, so deferring the lock until the first write would
   * let a second writer slip in behind it. Called inside a caller's kernel transaction, it joins it.
   *
   * @throws whatever `plan` throws, after the transaction has rolled back.
   * @complexity O(n) statements for `n` submitted providers, plus one read and at most one delete.
   * @overallScore 100
   */
  async replaceWorkspace(input: {
    workspaceId: UUID;
    plan: MediaProviderCredentialReplacePlanner;
  }): Promise<readonly MediaProviderCredentialRecord[]> {
    return contentKernel(this.db).transaction(async () => {
      const { upserts, tombstoneProviderIds } = input.plan(selectByWorkspaceId(this.db, input.workspaceId));
      for (const record of upserts) upsertRow(this.db, record);
      deleteRows(this.db, input.workspaceId, tombstoneProviderIds);
      return upserts;
    });
  }
}
