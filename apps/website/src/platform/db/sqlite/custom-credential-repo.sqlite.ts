import { and, eq } from "drizzle-orm";

import type { UUID } from "@jini-ai/cms/core";
import type { CustomCredentialCategoryId, CustomCredentialSetRecord, CustomCredentialSetRepoPort } from "#src/features/custom-credentials/types";
import { customCredentialSets } from "../schema.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Real `CustomCredentialSetRepoPort` adapter — the ADR-006 rule-of-two "second adapter" half;
 * `features/custom-credentials/repo.memory.ts`'s `InMemoryCustomCredentialSetRepo` is the first.
 * Structurally mirrors `source-control-credential-repo.sqlite.ts` (this table's own composite
 * `(workspace_id, id)` primary key, same shape), minus that adapter's `isDefault` transaction
 * dance — this table has no group invariant to maintain (see `types.ts`'s own header), so every
 * write here is a single plain statement, no `db.transaction()` needed.
 *
 * `sealed*` columns are read/written as an opaque group here, same discipline every sibling
 * credential repo documents — this file never inspects or validates their contents (that is
 * `AesGcmSecretSealer`'s and `custom-credentials/store.ts`'s job).
 */

type Row = typeof customCredentialSets.$inferSelect;

/** `additionalHostsJson` is a nullable plain-text JSON array (`db/schema.ts`'s own doc — this schema
 *  never uses Drizzle's `{mode:"json"}` column type), so `toRecord`/`toValues` are the one place it
 *  is (de)serialized. `null`/empty normalizes to `[]`, matching `CustomCredentialSetRecord.
 *  additionalHosts`'s own "empty, never null" contract. */
function parseAdditionalHosts(json: string | null): readonly string[] {
  return json ? (JSON.parse(json) as string[]) : [];
}

function serializeAdditionalHosts(hosts: readonly string[]): string | null {
  return hosts.length > 0 ? JSON.stringify(hosts) : null;
}

function toRecord(row: Row): CustomCredentialSetRecord {
  return {
    workspaceId: row.workspaceId,
    id: row.id,
    label: row.label,
    category: row.category as CustomCredentialCategoryId,
    baseUrl: row.baseUrl,
    additionalHosts: parseAdditionalHosts(row.additionalHostsJson),
    sealed: { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toValues(record: CustomCredentialSetRecord) {
  return {
    workspaceId: record.workspaceId,
    id: record.id,
    label: record.label,
    category: record.category,
    baseUrl: record.baseUrl,
    additionalHostsJson: serializeAdditionalHosts(record.additionalHosts),
    sealedKeyId: record.sealed.keyId,
    sealedCiphertext: record.sealed.ciphertext,
    sealedNonce: record.sealed.nonce,
    sealedAlg: record.sealed.alg,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class SqliteCustomCredentialSetRepo implements CustomCredentialSetRepoPort {
  constructor(private readonly db: ContentDb) {}

  async insert(record: CustomCredentialSetRecord): Promise<void> {
    // A plain `.insert()`, NOT `.onConflictDoUpdate()` — this table's rows are caller-created with
    // a fresh `id` (`store.ts`'s `createCustomCredential` mints it via `idGen.newId()`), so a
    // conflict here can only mean the UNIQUE `(workspace_id, label)` index rejected a duplicate
    // label — exactly the error `store.ts`'s `isUniqueLabelViolation` is written to catch and
    // translate. Letting it propagate raw is deliberate.
    this.db.insert(customCredentialSets).values(toValues(record)).run();
  }

  async update(record: CustomCredentialSetRecord): Promise<void> {
    this.db
      .update(customCredentialSets)
      .set(toValues(record))
      .where(and(eq(customCredentialSets.workspaceId, record.workspaceId), eq(customCredentialSets.id, record.id)))
      .run();
  }

  async findById(input: { workspaceId: UUID; id: UUID }): Promise<CustomCredentialSetRecord | null> {
    const row = this.db
      .select()
      .from(customCredentialSets)
      .where(and(eq(customCredentialSets.workspaceId, input.workspaceId), eq(customCredentialSets.id, input.id)))
      .all()[0];
    return row ? toRecord(row) : null;
  }

  async listByWorkspace(input: { workspaceId: UUID }): Promise<CustomCredentialSetRecord[]> {
    return this.db.select().from(customCredentialSets).where(eq(customCredentialSets.workspaceId, input.workspaceId)).all().map(toRecord);
  }

  async delete(input: { workspaceId: UUID; id: UUID }): Promise<void> {
    // No-op (not an error) on a zero-row DELETE — same idempotent-delete posture every sibling
    // credential repo documents.
    this.db.delete(customCredentialSets).where(and(eq(customCredentialSets.workspaceId, input.workspaceId), eq(customCredentialSets.id, input.id))).run();
  }
}
