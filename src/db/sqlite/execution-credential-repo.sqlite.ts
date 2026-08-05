import { and, eq } from "drizzle-orm";

import type {
  AdminExecutionCredentialRecord,
  AdminExecutionCredentialRepoPort,
} from "../../assistant/execution-credential-store";
import type { UUID, ISODateTime } from "@jini-ai/cms/core";
import { adminExecutionCredentials } from "../schema";
import type { ContentDb } from "./content-db";

/**
 * @file Real `AdminExecutionCredentialRepoPort` adapter — the ADR-006 rule-of-two "second adapter"
 * half; `assistant/execution-credential-store.memory.ts`'s `InMemoryAdminExecutionCredentialRepo` is
 * the first. Mirrors `site-credential-repo.sqlite.ts`'s shape for the sibling ADR-058 table, keyed
 * by `(workspace_id, principal_id)` — migration `0026`'s composite primary key — instead of
 * `workspace_id` alone.
 *
 * `sealed*`/`masked` columns are read and written as an opaque group — this file never inspects or
 * validates their contents (that is `AesGcmSecretSealer`'s and `execution-credential-store.ts`'s
 * job); it only ever moves the DB's NULL-or-all-five-set shape (enforced by the table's own CHECK
 * constraint) into and out of `SealedSecret | null`.
 */

type Row = typeof adminExecutionCredentials.$inferSelect;

function toRecord(row: Row): AdminExecutionCredentialRecord {
  const sealed =
    row.sealedKeyId !== null &&
    row.sealedCiphertext !== null &&
    row.sealedNonce !== null &&
    row.sealedAlg !== null
      ? { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg }
      : null;
  return {
    workspaceId: row.workspaceId,
    principalId: row.principalId,
    protocol: row.protocol,
    providerId: row.providerId,
    baseUrl: row.baseUrl,
    model: row.model,
    maxTokens: row.maxTokens,
    sealed,
    masked: row.masked,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SqliteAdminExecutionCredentialRepo implements AdminExecutionCredentialRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByWorkspaceAndPrincipal(required: { workspaceId: UUID; principalId: UUID }): Promise<AdminExecutionCredentialRecord | null> {
    const row = this.db
      .select()
      .from(adminExecutionCredentials)
      .where(
        and(
          eq(adminExecutionCredentials.workspaceId, required.workspaceId),
          eq(adminExecutionCredentials.principalId, required.principalId)
        )
      )
      .all()[0];
    return row ? toRecord(row) : null;
  }

  async upsert(record: AdminExecutionCredentialRecord): Promise<void> {
    const values = {
      workspaceId: record.workspaceId,
      principalId: record.principalId,
      protocol: record.protocol,
      providerId: record.providerId,
      baseUrl: record.baseUrl,
      model: record.model,
      maxTokens: record.maxTokens,
      sealedKeyId: record.sealed?.keyId ?? null,
      sealedCiphertext: record.sealed?.ciphertext ?? null,
      sealedNonce: record.sealed?.nonce ?? null,
      sealedAlg: record.sealed?.alg ?? null,
      masked: record.masked,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
    this.db
      .insert(adminExecutionCredentials)
      .values(values)
      .onConflictDoUpdate({
        target: [adminExecutionCredentials.workspaceId, adminExecutionCredentials.principalId],
        set: values,
      })
      .run();
  }

  async clearKey(input: { workspaceId: UUID; principalId: UUID; updatedAt: ISODateTime }): Promise<void> {
    // No-op if no row exists — `.run()` on a zero-row UPDATE is a normal, successful no-op in
    // better-sqlite3/Drizzle, matching `AdminExecutionCredentialRepoPort.clearKey`'s documented
    // idempotent contract.
    this.db
      .update(adminExecutionCredentials)
      .set({
        sealedKeyId: null,
        sealedCiphertext: null,
        sealedNonce: null,
        sealedAlg: null,
        masked: null,
        updatedAt: input.updatedAt,
      })
      .where(
        and(
          eq(adminExecutionCredentials.workspaceId, input.workspaceId),
          eq(adminExecutionCredentials.principalId, input.principalId)
        )
      )
      .run();
  }
}
