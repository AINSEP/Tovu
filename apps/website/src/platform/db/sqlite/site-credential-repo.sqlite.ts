import { eq } from "drizzle-orm";

import type { SiteAssistantCredentialRecord, SiteAssistantCredentialRepoPort } from "#src/assistant/index";
import type { UUID, ISODateTime } from "@jini-ai/cms/core";
import { siteAssistantCredentials } from "../schema.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Real `SiteAssistantCredentialRepoPort` adapter (ADR-058) — the ADR-006 rule-of-two "second
 * adapter" half; `assistant/site-credential-store.memory.ts`'s `InMemorySiteAssistantCredentialRepo`
 * is the first. Mirrors `origin-repo.sqlite.ts`'s shape for the identical single-row-per-workspace
 * pattern (`workspace_id` primary key, upsert semantics, no surrogate id).
 *
 * `sealed*`/`masked` columns are read and written as an opaque group — this file never inspects or
 * validates their contents (that is `AesGcmSecretSealer`'s and `site-credential-store.ts`'s job); it
 * only ever moves the DB's NULL-or-all-five-set shape (enforced by the table's own CHECK constraint)
 * into and out of `SealedSecret | null`.
 */

type Row = typeof siteAssistantCredentials.$inferSelect;

function toRecord(row: Row): SiteAssistantCredentialRecord {
  const sealed =
    row.sealedKeyId !== null &&
    row.sealedCiphertext !== null &&
    row.sealedNonce !== null &&
    row.sealedAlg !== null
      ? { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg }
      : null;
  return {
    workspaceId: row.workspaceId,
    provider: row.provider,
    baseUrl: row.baseUrl,
    model: row.model,
    sealed,
    masked: row.masked,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SqliteSiteAssistantCredentialRepo implements SiteAssistantCredentialRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByWorkspaceId(workspaceId: UUID): Promise<SiteAssistantCredentialRecord | null> {
    const row = this.db
      .select()
      .from(siteAssistantCredentials)
      .where(eq(siteAssistantCredentials.workspaceId, workspaceId))
      .all()[0];
    return row ? toRecord(row) : null;
  }

  async upsert(record: SiteAssistantCredentialRecord): Promise<void> {
    const values = {
      workspaceId: record.workspaceId,
      provider: record.provider,
      baseUrl: record.baseUrl,
      model: record.model,
      sealedKeyId: record.sealed?.keyId ?? null,
      sealedCiphertext: record.sealed?.ciphertext ?? null,
      sealedNonce: record.sealed?.nonce ?? null,
      sealedAlg: record.sealed?.alg ?? null,
      masked: record.masked,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
    this.db
      .insert(siteAssistantCredentials)
      .values(values)
      .onConflictDoUpdate({ target: siteAssistantCredentials.workspaceId, set: values })
      .run();
  }

  async clearKey(input: { workspaceId: UUID; updatedAt: ISODateTime }): Promise<void> {
    // No-op if no row exists — `.run()` on a zero-row UPDATE is a normal, successful no-op in
    // better-sqlite3/Drizzle, matching `SiteAssistantCredentialRepoPort.clearKey`'s documented
    // idempotent contract.
    this.db
      .update(siteAssistantCredentials)
      .set({
        sealedKeyId: null,
        sealedCiphertext: null,
        sealedNonce: null,
        sealedAlg: null,
        masked: null,
        updatedAt: input.updatedAt,
      })
      .where(eq(siteAssistantCredentials.workspaceId, input.workspaceId))
      .run();
  }
}
