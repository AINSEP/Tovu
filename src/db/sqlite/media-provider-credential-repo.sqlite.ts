import type Database from "better-sqlite3";
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
 *
 * `transaction()` uses manual `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` against the raw better-sqlite3
 * handle (`db.$client`) rather than Drizzle's `db.transaction((tx) => ...)` wrapper — that wrapper
 * requires a *synchronous* callback (better-sqlite3 itself is synchronous), but
 * `saveMediaProviderCredentials`'s chokepoint callback does `await`ed repo calls. Manual BEGIN/COMMIT
 * is safe here because better-sqlite3 has no real async I/O: every call resolves on the same
 * microtask tick, so no other statement can interleave on this single connection between awaits.
 * Same precedent as `SqliteSettingsRepo.transaction`/`SqliteTaxonomyRepo.transaction`.
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

  /** See this file's header for why manual `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` is used instead of
   *  Drizzle's synchronous `db.transaction()` wrapper.
   *
   *  Deliberately NOT reentrant — same rationale as `SqliteSettingsRepo.transaction`'s doc comment
   *  (an instance-level depth counter cannot distinguish legitimate nesting from a second, unrelated
   *  concurrent transaction). `saveMediaProviderCredentials` calls this exactly once per invocation.
   *
   *  @complexity O(1) fixed overhead plus whatever `fn` itself costs.
   *  @overallScore 100
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // `$client` (the raw better-sqlite3 handle) exists at runtime on every `drizzle()`-constructed
    // instance but isn't part of the exported `BetterSQLite3Database` class type `ContentDb`
    // aliases — a known drizzle-orm typing gap (the property lives on the factory's return type, not
    // the class). Cast narrowly, scoped to this one call site.
    const client = (this.db as unknown as { $client: Database.Database }).$client;
    client.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn();
      client.exec("COMMIT");
      return result;
    } catch (error) {
      client.exec("ROLLBACK");
      throw error;
    }
  }
}
