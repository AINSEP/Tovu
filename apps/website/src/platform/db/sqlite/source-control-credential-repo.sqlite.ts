import { and, desc, eq, ne } from "drizzle-orm";

import type { UUID } from "@jini-ai/cms/core";
import type { SourceControlCredentialSetRecord, SourceControlCredentialSetRepoPort, SourceControlProviderId } from "#src/features/source-control/types";
import { sourceControlCredentialSets } from "../schema.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Real `SourceControlCredentialSetRepoPort` adapter — the ADR-006 rule-of-two "second
 * adapter" half; `features/source-control/repo.memory.ts`'s `InMemorySourceControlCredentialSetRepo`
 * is the first. Structurally mirrors `publish-credential-repo.sqlite.ts` (this table's own composite
 * `(workspace_id, id)` primary key, same shape).
 *
 * `sealed*` columns are read/written as an opaque group here, same discipline
 * `publish-credential-repo.sqlite.ts`'s own header documents — this file never inspects or
 * validates their contents (that is `AesGcmSecretSealer`'s and `source-control/store.ts`'s job).
 *
 * `insert`/`update`/`delete` wrap their group-invariant side effect (the `isDefault` invariant — see
 * `SourceControlCredentialSetRepoPort`'s own header) in one `db.transaction()` each, same "read/
 * plan/write must never hand this connection back to the event loop mid-sequence" reasoning
 * `publish-credential-repo.sqlite.ts` documents: two defaults for one `(workspace_id, provider_id)`
 * must never be observable, even transiently.
 */

/** Same derivation `publish-credential-repo.sqlite.ts`'s own `ContentDbTx` uses — the Drizzle
 *  transaction callback argument's type, extracted structurally since Drizzle does not export it
 *  directly. */
type ContentDbTx = Parameters<Parameters<ContentDb["transaction"]>[0]>[0];

type Row = typeof sourceControlCredentialSets.$inferSelect;

function toRecord(row: Row): SourceControlCredentialSetRecord {
  return {
    workspaceId: row.workspaceId,
    id: row.id,
    providerId: row.providerId as SourceControlProviderId,
    label: row.label,
    sealed: { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg },
    isDefault: row.isDefault,
    accountLabel: row.accountLabel,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toValues(record: SourceControlCredentialSetRecord) {
  return {
    workspaceId: record.workspaceId,
    id: record.id,
    providerId: record.providerId,
    label: record.label,
    sealedKeyId: record.sealed.keyId,
    sealedCiphertext: record.sealed.ciphertext,
    sealedNonce: record.sealed.nonce,
    sealedAlg: record.sealed.alg,
    isDefault: record.isDefault,
    accountLabel: record.accountLabel,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class SqliteSourceControlCredentialSetRepo implements SourceControlCredentialSetRepoPort {
  constructor(private readonly db: ContentDb) {}

  async insert(record: SourceControlCredentialSetRecord): Promise<void> {
    this.db.transaction((tx) => {
      // A plain `.insert()`, NOT `.onConflictDoUpdate()` — this table's rows are caller-created with
      // a fresh `id` (`store.ts`'s `createSourceControlCredential` mints it via `idGen.newId()`), so
      // a conflict here can only mean the UNIQUE `(workspace_id, provider_id, label)` index rejected
      // a duplicate label — exactly the error `store.ts`'s `isUniqueLabelViolation` is written to
      // catch and translate. Letting it propagate raw is deliberate.
      tx.insert(sourceControlCredentialSets).values(toValues(record)).run();
      if (record.isDefault) clearOtherDefaults(tx, record.workspaceId, record.providerId, record.id);
    });
  }

  async update(record: SourceControlCredentialSetRecord): Promise<void> {
    this.db.transaction((tx) => {
      tx.update(sourceControlCredentialSets)
        .set(toValues(record))
        .where(and(eq(sourceControlCredentialSets.workspaceId, record.workspaceId), eq(sourceControlCredentialSets.id, record.id)))
        .run();
      if (record.isDefault) clearOtherDefaults(tx, record.workspaceId, record.providerId, record.id);
    });
  }

  async findById(input: { workspaceId: UUID; id: UUID }): Promise<SourceControlCredentialSetRecord | null> {
    const row = this.db
      .select()
      .from(sourceControlCredentialSets)
      .where(and(eq(sourceControlCredentialSets.workspaceId, input.workspaceId), eq(sourceControlCredentialSets.id, input.id)))
      .all()[0];
    return row ? toRecord(row) : null;
  }

  async findDefaultByProvider(input: { workspaceId: UUID; providerId: SourceControlProviderId }): Promise<SourceControlCredentialSetRecord | null> {
    const row = this.db
      .select()
      .from(sourceControlCredentialSets)
      .where(
        and(
          eq(sourceControlCredentialSets.workspaceId, input.workspaceId),
          eq(sourceControlCredentialSets.providerId, input.providerId),
          eq(sourceControlCredentialSets.isDefault, true)
        )
      )
      .all()[0];
    return row ? toRecord(row) : null;
  }

  async listByProvider(input: { workspaceId: UUID; providerId: SourceControlProviderId }): Promise<SourceControlCredentialSetRecord[]> {
    return this.db
      .select()
      .from(sourceControlCredentialSets)
      .where(and(eq(sourceControlCredentialSets.workspaceId, input.workspaceId), eq(sourceControlCredentialSets.providerId, input.providerId)))
      .all()
      .map(toRecord);
  }

  async listByWorkspace(input: { workspaceId: UUID }): Promise<SourceControlCredentialSetRecord[]> {
    return this.db.select().from(sourceControlCredentialSets).where(eq(sourceControlCredentialSets.workspaceId, input.workspaceId)).all().map(toRecord);
  }

  async delete(input: { workspaceId: UUID; id: UUID }): Promise<void> {
    this.db.transaction((tx) => {
      const removed = tx
        .select()
        .from(sourceControlCredentialSets)
        .where(and(eq(sourceControlCredentialSets.workspaceId, input.workspaceId), eq(sourceControlCredentialSets.id, input.id)))
        .all()[0];

      // No-op (not an error) on a zero-row DELETE — same idempotent-delete posture the sibling
      // publish-credential adapter documents.
      tx.delete(sourceControlCredentialSets)
        .where(and(eq(sourceControlCredentialSets.workspaceId, input.workspaceId), eq(sourceControlCredentialSets.id, input.id)))
        .run();

      if (!removed?.isDefault) return;

      // Promote the group's most-recently-updated remaining row.
      const promoted = tx
        .select()
        .from(sourceControlCredentialSets)
        .where(and(eq(sourceControlCredentialSets.workspaceId, removed.workspaceId), eq(sourceControlCredentialSets.providerId, removed.providerId)))
        .orderBy(desc(sourceControlCredentialSets.updatedAt))
        .limit(1)
        .all()[0];
      if (!promoted) return;

      tx.update(sourceControlCredentialSets)
        .set({ isDefault: true })
        .where(and(eq(sourceControlCredentialSets.workspaceId, promoted.workspaceId), eq(sourceControlCredentialSets.id, promoted.id)))
        .run();
    });
  }
}

/** Clears `isDefault` on every OTHER row sharing `(workspaceId, providerId)` — the group-invariant
 *  half of `insert`/`update`'s contract. `tx` rather than `this.db` so this always runs inside the
 *  caller's own transaction, never as a second, separately-committed statement. */
function clearOtherDefaults(tx: ContentDbTx, workspaceId: UUID, providerId: SourceControlProviderId, keepId: UUID): void {
  tx.update(sourceControlCredentialSets)
    .set({ isDefault: false })
    .where(
      and(
        eq(sourceControlCredentialSets.workspaceId, workspaceId),
        eq(sourceControlCredentialSets.providerId, providerId),
        ne(sourceControlCredentialSets.id, keepId),
        eq(sourceControlCredentialSets.isDefault, true)
      )
    )
    .run();
}
