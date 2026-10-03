import type { Insertable, Selectable } from "kysely";

import type { UUID } from "@jini-ai/core/primitives";

import type {
  MediaProviderCredentialRecord,
  MediaProviderCredentialReplacePlanner,
  MediaProviderCredentialRepoPort,
} from "#src/features/media/provider-credential-store";
import type { ContentKernel } from "../content-kernel.js";
import type { MediaProviderCredentialsTable } from "../content-database.generated.js";

/**
 * @file THE `MediaProviderCredentialRepoPort` adapter: one Kysely query body for every dialect
 * (storage plan §4, ADR-066) — the ADR-006 rule-of-two "second adapter" half;
 * `media/provider-credential-store.memory.ts` is the first. Mirrors `site-credential-repo.ts`'s
 * shape, widened from its single-row-per-workspace pattern to this table's
 * `(workspace_id, provider_id)` composite key. `sqlite/media-provider-credential-repo.sqlite.ts` is
 * the thin subclass built from the content db handle.
 *
 * `sealed*`/`key_tail` are read and written as one opaque group — this file never inspects or
 * validates their contents (that is `AesGcmSecretSealer`'s and `provider-credential-store.ts`'s
 * job); it only moves the DB's all-null-or-all-set shape (enforced by the table's CHECK) into and
 * out of `SealedSecret | null`.
 *
 * `replaceWorkspace()` is a read-then-write: it runs in one kernel transaction holding
 * `lockKey` on the workspace's media credentials, so no other replace (or anything else that takes
 * that key) interleaves between the read the planner sees and the writes it produces — on SQLite
 * the transaction's `BEGIN IMMEDIATE` already serializes writers, on Postgres the advisory lock does.
 * The planner itself stays synchronous (the port's type), so all the awaiting is statements.
 */

type Row = Selectable<MediaProviderCredentialsTable>;

function toRecord(row: Row): MediaProviderCredentialRecord {
  const sealed =
    row.sealed_key_id !== null &&
    row.sealed_ciphertext !== null &&
    row.sealed_nonce !== null &&
    row.sealed_alg !== null
      ? { keyId: row.sealed_key_id, ciphertext: row.sealed_ciphertext, nonce: row.sealed_nonce, alg: row.sealed_alg }
      : null;
  return {
    workspaceId: row.workspace_id,
    providerId: row.provider_id,
    baseUrl: row.base_url,
    model: row.model,
    sealed,
    keyTail: row.key_tail,
    aadVersion: row.aad_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: MediaProviderCredentialRecord): Insertable<MediaProviderCredentialsTable> {
  return {
    workspace_id: record.workspaceId,
    provider_id: record.providerId,
    base_url: record.baseUrl,
    model: record.model,
    sealed_key_id: record.sealed?.keyId ?? null,
    sealed_ciphertext: record.sealed?.ciphertext ?? null,
    sealed_nonce: record.sealed?.nonce ?? null,
    sealed_alg: record.sealed?.alg ?? null,
    key_tail: record.keyTail,
    aad_version: record.aadVersion,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export class SqlMediaProviderCredentialRepo implements MediaProviderCredentialRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async listByWorkspaceId(workspaceId: UUID): Promise<MediaProviderCredentialRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("media_provider_credentials").selectAll().where("workspace_id", "=", workspaceId).execute()
    );
    return rows.map(toRecord);
  }

  async upsert(record: MediaProviderCredentialRecord): Promise<void> {
    const row = toRow(record);
    await this.kernel.run((db) =>
      db
        .insertInto("media_provider_credentials")
        .values(row)
        .onConflict((oc) => oc.columns(["workspace_id", "provider_id"]).doUpdateSet(row))
        .execute()
    );
  }

  async deleteByProviderIds(input: { workspaceId: UUID; providerIds: readonly string[] }): Promise<void> {
    // Guarded: `IN ()` on an empty list is a syntax error, not the zero-row match the port's
    // "no-op on an empty list" contract promises.
    if (input.providerIds.length === 0) return;
    await this.kernel.run((db) =>
      db
        .deleteFrom("media_provider_credentials")
        .where("workspace_id", "=", input.workspaceId)
        .where("provider_id", "in", [...input.providerIds])
        .execute()
    );
  }

  /**
   * Read, plan, and write the whole workspace inside one kernel transaction under the workspace's
   * `lockKey` (see this file's header). Called inside a caller's kernel transaction, it joins it.
   *
   * @throws whatever `plan` throws, after the transaction has rolled back.
   * @complexity O(n) statements for `n` submitted providers, plus one read and at most one delete.
   */
  async replaceWorkspace(input: {
    workspaceId: UUID;
    plan: MediaProviderCredentialReplacePlanner;
  }): Promise<readonly MediaProviderCredentialRecord[]> {
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey(`media_provider_credentials:${input.workspaceId}`);
      const { upserts, tombstoneProviderIds } = input.plan(await this.listByWorkspaceId(input.workspaceId));
      for (const record of upserts) await this.upsert(record);
      await this.deleteByProviderIds({ workspaceId: input.workspaceId, providerIds: tombstoneProviderIds });
      return upserts;
    });
  }
}
