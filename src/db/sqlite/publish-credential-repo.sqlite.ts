import { and, eq } from "drizzle-orm";

import type { UUID } from "@jini-ai/cms/core";
import type { PublishCredentialSetRecord, PublishCredentialSetRepoPort, PublishProviderId } from "../../features/deployments/publish-credentials/types";
import { publishCredentialSets } from "../schema";
import type { ContentDb } from "./content-db";

/**
 * @file Real `PublishCredentialSetRepoPort` adapter (2026-08-15) — the ADR-006 rule-of-two "second
 * adapter" half; `features/deployments/publish-credentials/repo.memory.ts`'s
 * `InMemoryPublishCredentialSetRepo` is the first. Mirrors `site-credential-repo.sqlite.ts`'s shape,
 * adapted for this table's composite `(workspace_id, id)` primary key instead of a single-column one.
 *
 * `sealed*` columns are read/written as an opaque group here, same discipline
 * `site-credential-repo.sqlite.ts`'s own header documents — this file never inspects or validates
 * their contents (that is `AesGcmSecretSealer`'s and `publish-credentials/store.ts`'s job).
 */

type Row = typeof publishCredentialSets.$inferSelect;

function toRecord(row: Row): PublishCredentialSetRecord {
  return {
    workspaceId: row.workspaceId,
    id: row.id,
    providerId: row.providerId as PublishProviderId,
    label: row.label,
    sealed: { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toValues(record: PublishCredentialSetRecord) {
  return {
    workspaceId: record.workspaceId,
    id: record.id,
    providerId: record.providerId,
    label: record.label,
    sealedKeyId: record.sealed.keyId,
    sealedCiphertext: record.sealed.ciphertext,
    sealedNonce: record.sealed.nonce,
    sealedAlg: record.sealed.alg,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class SqlitePublishCredentialSetRepo implements PublishCredentialSetRepoPort {
  constructor(private readonly db: ContentDb) {}

  async insert(record: PublishCredentialSetRecord): Promise<void> {
    // A plain `.insert()`, NOT `.onConflictDoUpdate()` — unlike `SqliteSiteAssistantCredentialRepo`'s
    // single-row-per-workspace upsert, this table's rows are caller-created with a fresh `id`
    // (`store.ts`'s `createPublishCredential` mints it via `idGen.newId()`), so a conflict here can
    // only mean the UNIQUE `(workspace_id, provider_id, label)` index rejected a duplicate label —
    // exactly the error `store.ts`'s `isUniqueLabelViolation` is written to catch and translate.
    // Letting it propagate raw (rather than swallowing it into a silent upsert) is deliberate.
    this.db.insert(publishCredentialSets).values(toValues(record)).run();
  }

  async update(record: PublishCredentialSetRecord): Promise<void> {
    this.db
      .update(publishCredentialSets)
      .set(toValues(record))
      .where(and(eq(publishCredentialSets.workspaceId, record.workspaceId), eq(publishCredentialSets.id, record.id)))
      .run();
  }

  async findById(input: { workspaceId: UUID; id: UUID }): Promise<PublishCredentialSetRecord | null> {
    const row = this.db
      .select()
      .from(publishCredentialSets)
      .where(and(eq(publishCredentialSets.workspaceId, input.workspaceId), eq(publishCredentialSets.id, input.id)))
      .all()[0];
    return row ? toRecord(row) : null;
  }

  async listByWorkspace(input: { workspaceId: UUID }): Promise<PublishCredentialSetRecord[]> {
    return this.db.select().from(publishCredentialSets).where(eq(publishCredentialSets.workspaceId, input.workspaceId)).all().map(toRecord);
  }

  async delete(input: { workspaceId: UUID; id: UUID }): Promise<void> {
    // No-op (not an error) on a zero-row DELETE — same idempotent-delete posture
    // `SqliteSiteAssistantCredentialRepo.clearKey`'s own doc comment documents for its UPDATE.
    this.db
      .delete(publishCredentialSets)
      .where(and(eq(publishCredentialSets.workspaceId, input.workspaceId), eq(publishCredentialSets.id, input.id)))
      .run();
  }
}
