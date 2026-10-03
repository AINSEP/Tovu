import type { Insertable, Selectable } from "kysely";

import type { SiteAssistantCredentialRecord, SiteAssistantCredentialRepoPort } from "#src/assistant/index";
import type { UUID, ISODateTime } from "@jini-ai/core/primitives";
import type { ContentKernel } from "../content-kernel.js";
import type { SiteAssistantCredentialsTable } from "../content-database.generated.js";

/**
 * @file THE `SiteAssistantCredentialRepoPort` adapter (ADR-058): one Kysely query body for every
 * dialect (storage plan §4, ADR-066) — the ADR-006 rule-of-two "second adapter" half;
 * `assistant/site-credential-store.memory.ts`'s `InMemorySiteAssistantCredentialRepo` is the first.
 * Single row per workspace (`workspace_id` primary key, upsert semantics, no surrogate id).
 * `sqlite/site-credential-repo.sqlite.ts` is the thin subclass built from the content db handle.
 *
 * `sealed*`/`masked` columns are read and written as an opaque group — this file never inspects or
 * validates their contents (that is `AesGcmSecretSealer`'s and `site-credential-store.ts`'s job); it
 * only ever moves the DB's NULL-or-all-five-set shape (enforced by the table's own CHECK constraint)
 * into and out of `SealedSecret | null`.
 */

function toRecord(row: Selectable<SiteAssistantCredentialsTable>): SiteAssistantCredentialRecord {
  const sealed =
    row.sealed_key_id !== null &&
    row.sealed_ciphertext !== null &&
    row.sealed_nonce !== null &&
    row.sealed_alg !== null
      ? { keyId: row.sealed_key_id, ciphertext: row.sealed_ciphertext, nonce: row.sealed_nonce, alg: row.sealed_alg }
      : null;
  return {
    workspaceId: row.workspace_id,
    provider: row.provider,
    baseUrl: row.base_url,
    model: row.model,
    sealed,
    masked: row.masked,
    aadVersion: row.aad_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: SiteAssistantCredentialRecord): Insertable<SiteAssistantCredentialsTable> {
  return {
    workspace_id: record.workspaceId,
    provider: record.provider,
    base_url: record.baseUrl,
    model: record.model,
    sealed_key_id: record.sealed?.keyId ?? null,
    sealed_ciphertext: record.sealed?.ciphertext ?? null,
    sealed_nonce: record.sealed?.nonce ?? null,
    sealed_alg: record.sealed?.alg ?? null,
    masked: record.masked,
    aad_version: record.aadVersion,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export class SqlSiteAssistantCredentialRepo implements SiteAssistantCredentialRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findByWorkspaceId(workspaceId: UUID): Promise<SiteAssistantCredentialRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("site_assistant_credentials")
        .selectAll()
        .where("workspace_id", "=", workspaceId)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async upsert(record: SiteAssistantCredentialRecord): Promise<void> {
    const row = toRow(record);
    await this.kernel.run((db) =>
      db
        .insertInto("site_assistant_credentials")
        .values(row)
        .onConflict((oc) => oc.column("workspace_id").doUpdateSet(row))
        .execute()
    );
  }

  /** Idempotent: a zero-row UPDATE (no credential yet) is a normal, successful no-op, matching
   *  `SiteAssistantCredentialRepoPort.clearKey`'s documented contract. */
  async clearKey(input: { workspaceId: UUID; updatedAt: ISODateTime }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("site_assistant_credentials")
        .set({
          sealed_key_id: null,
          sealed_ciphertext: null,
          sealed_nonce: null,
          sealed_alg: null,
          masked: null,
          updated_at: input.updatedAt,
        })
        .where("workspace_id", "=", input.workspaceId)
        .execute()
    );
  }
}
