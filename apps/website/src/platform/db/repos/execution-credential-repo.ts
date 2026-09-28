import type { Insertable, Selectable } from "kysely";

import type { AdminExecutionCredentialRecord, AdminExecutionCredentialRepoPort } from "#src/assistant/index";
import type { UUID, ISODateTime } from "@jini-ai/cms/core";
import type { ContentKernel } from "../content-kernel.js";
import type { AdminExecutionCredentialsTable } from "../content-database.generated.js";

/**
 * @file THE `AdminExecutionCredentialRepoPort` adapter: one Kysely query body for every dialect
 * (storage plan §4, ADR-066) — the ADR-006 rule-of-two "second adapter" half;
 * `assistant/execution-credential-store.memory.ts`'s `InMemoryAdminExecutionCredentialRepo` is the
 * first. The sibling of `site-credential-repo.ts` for the other ADR-058 table, keyed by
 * `(workspace_id, principal_id)` — migration `0026`'s composite primary key.
 * `sqlite/execution-credential-repo.sqlite.ts` is the thin subclass built from the content db handle.
 *
 * `sealed*`/`masked` columns are read and written as an opaque group — this file never inspects or
 * validates their contents (that is `AesGcmSecretSealer`'s and `execution-credential-store.ts`'s
 * job); it only ever moves the DB's NULL-or-all-five-set shape (enforced by the table's own CHECK
 * constraint) into and out of `SealedSecret | null`.
 */

function toRecord(row: Selectable<AdminExecutionCredentialsTable>): AdminExecutionCredentialRecord {
  const sealed =
    row.sealed_key_id !== null &&
    row.sealed_ciphertext !== null &&
    row.sealed_nonce !== null &&
    row.sealed_alg !== null
      ? { keyId: row.sealed_key_id, ciphertext: row.sealed_ciphertext, nonce: row.sealed_nonce, alg: row.sealed_alg }
      : null;
  return {
    workspaceId: row.workspace_id,
    principalId: row.principal_id,
    protocol: row.protocol,
    providerId: row.provider_id,
    baseUrl: row.base_url,
    model: row.model,
    maxTokens: row.max_tokens,
    sealed,
    masked: row.masked,
    aadVersion: row.aad_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: AdminExecutionCredentialRecord): Insertable<AdminExecutionCredentialsTable> {
  return {
    workspace_id: record.workspaceId,
    principal_id: record.principalId,
    protocol: record.protocol,
    provider_id: record.providerId,
    base_url: record.baseUrl,
    model: record.model,
    max_tokens: record.maxTokens,
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

export class SqlAdminExecutionCredentialRepo implements AdminExecutionCredentialRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findByWorkspaceAndPrincipal(required: { workspaceId: UUID; principalId: UUID }): Promise<AdminExecutionCredentialRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("admin_execution_credentials")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("principal_id", "=", required.principalId)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async upsert(record: AdminExecutionCredentialRecord): Promise<void> {
    const row = toRow(record);
    await this.kernel.run((db) =>
      db
        .insertInto("admin_execution_credentials")
        .values(row)
        .onConflict((oc) => oc.columns(["workspace_id", "principal_id"]).doUpdateSet(row))
        .execute()
    );
  }

  /** Idempotent: a zero-row UPDATE (no credential yet) is a normal, successful no-op, matching
   *  `AdminExecutionCredentialRepoPort.clearKey`'s documented contract. */
  async clearKey(input: { workspaceId: UUID; principalId: UUID; updatedAt: ISODateTime }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("admin_execution_credentials")
        .set({
          sealed_key_id: null,
          sealed_ciphertext: null,
          sealed_nonce: null,
          sealed_alg: null,
          masked: null,
          updated_at: input.updatedAt,
        })
        .where("workspace_id", "=", input.workspaceId)
        .where("principal_id", "=", input.principalId)
        .execute()
    );
  }
}
