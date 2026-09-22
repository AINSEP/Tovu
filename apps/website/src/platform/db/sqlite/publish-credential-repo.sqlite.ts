import { and, desc, eq, ne } from "drizzle-orm";

import type { UUID } from "@jini-ai/cms/core";
import type { PublishCredentialSetRecord, PublishCredentialSetRepoPort, PublishProviderId } from "#src/features/deployments/publish-credentials/types";
import { publishCredentialSets } from "../schema.sqlite.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Real `PublishCredentialSetRepoPort` adapter (2026-08-15) — the ADR-006 rule-of-two "second
 * adapter" half; `features/deployments/publish-credentials/repo.memory.ts`'s
 * `InMemoryPublishCredentialSetRepo` is the first. Mirrors `site-credential-repo.sqlite.ts`'s shape,
 * adapted for this table's composite `(workspace_id, id)` primary key instead of a single-column one.
 *
 * `sealed*` columns are read/written as an opaque group here, same discipline
 * `site-credential-repo.sqlite.ts`'s own header documents — this file never inspects or validates
 * their contents (that is `AesGcmSecretSealer`'s and `publish-credentials/store.ts`'s job).
 *
 * `insert`/`update`/`delete` wrap their group-invariant side effect (Contract v2 Correction B — see
 * `PublishCredentialSetRepoPort`'s own header) in one `db.transaction()` each, mirroring
 * `media-provider-credential-repo.sqlite.ts`'s `replaceWorkspace` — the same "read/plan/write must
 * never hand this connection back to the event loop mid-sequence" reasoning applies here: two
 * defaults for one `(workspace_id, provider_id)` must never be observable, even transiently.
 */

/** Same derivation `media-provider-credential-repo.sqlite.ts`'s own `ContentDbTx` uses — the Drizzle
 *  transaction callback argument's type, extracted structurally since Drizzle does not export it
 *  directly. */
type ContentDbTx = Parameters<Parameters<ContentDb["transaction"]>[0]>[0];

type Row = typeof publishCredentialSets.$inferSelect;

function toRecord(row: Row): PublishCredentialSetRecord {
  return {
    workspaceId: row.workspaceId,
    id: row.id,
    providerId: row.providerId as PublishProviderId,
    label: row.label,
    sealed: { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg },
    isDefault: row.isDefault,
    accountLabel: row.accountLabel,
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
    isDefault: record.isDefault,
    accountLabel: record.accountLabel,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class SqlitePublishCredentialSetRepo implements PublishCredentialSetRepoPort {
  constructor(private readonly db: ContentDb) {}

  async insert(record: PublishCredentialSetRecord): Promise<void> {
    this.db.transaction((tx) => {
      // A plain `.insert()`, NOT `.onConflictDoUpdate()` — unlike `SqliteSiteAssistantCredentialRepo`'s
      // single-row-per-workspace upsert, this table's rows are caller-created with a fresh `id`
      // (`store.ts`'s `createPublishCredential` mints it via `idGen.newId()`), so a conflict here can
      // only mean the UNIQUE `(workspace_id, provider_id, label)` index rejected a duplicate label —
      // exactly the error `store.ts`'s `isUniqueLabelViolation` is written to catch and translate.
      // Letting it propagate raw (rather than swallowing it into a silent upsert) is deliberate.
      tx.insert(publishCredentialSets).values(toValues(record)).run();
      if (record.isDefault) clearOtherDefaults(tx, record.workspaceId, record.providerId, record.id);
    });
  }

  async update(record: PublishCredentialSetRecord): Promise<void> {
    this.db.transaction((tx) => {
      tx.update(publishCredentialSets)
        .set(toValues(record))
        .where(and(eq(publishCredentialSets.workspaceId, record.workspaceId), eq(publishCredentialSets.id, record.id)))
        .run();
      if (record.isDefault) clearOtherDefaults(tx, record.workspaceId, record.providerId, record.id);
    });
  }

  async findById(input: { workspaceId: UUID; id: UUID }): Promise<PublishCredentialSetRecord | null> {
    const row = this.db
      .select()
      .from(publishCredentialSets)
      .where(and(eq(publishCredentialSets.workspaceId, input.workspaceId), eq(publishCredentialSets.id, input.id)))
      .all()[0];
    return row ? toRecord(row) : null;
  }

  async findDefaultByProvider(input: { workspaceId: UUID; providerId: PublishProviderId }): Promise<PublishCredentialSetRecord | null> {
    const row = this.db
      .select()
      .from(publishCredentialSets)
      .where(
        and(
          eq(publishCredentialSets.workspaceId, input.workspaceId),
          eq(publishCredentialSets.providerId, input.providerId),
          eq(publishCredentialSets.isDefault, true)
        )
      )
      .all()[0];
    return row ? toRecord(row) : null;
  }

  async listByProvider(input: { workspaceId: UUID; providerId: PublishProviderId }): Promise<PublishCredentialSetRecord[]> {
    return this.db
      .select()
      .from(publishCredentialSets)
      .where(and(eq(publishCredentialSets.workspaceId, input.workspaceId), eq(publishCredentialSets.providerId, input.providerId)))
      .all()
      .map(toRecord);
  }

  async listByWorkspace(input: { workspaceId: UUID }): Promise<PublishCredentialSetRecord[]> {
    return this.db.select().from(publishCredentialSets).where(eq(publishCredentialSets.workspaceId, input.workspaceId)).all().map(toRecord);
  }

  async delete(input: { workspaceId: UUID; id: UUID }): Promise<void> {
    this.db.transaction((tx) => {
      const removed = tx
        .select()
        .from(publishCredentialSets)
        .where(and(eq(publishCredentialSets.workspaceId, input.workspaceId), eq(publishCredentialSets.id, input.id)))
        .all()[0];

      // No-op (not an error) on a zero-row DELETE — same idempotent-delete posture
      // `SqliteSiteAssistantCredentialRepo.clearKey`'s own doc comment documents for its UPDATE.
      tx.delete(publishCredentialSets)
        .where(and(eq(publishCredentialSets.workspaceId, input.workspaceId), eq(publishCredentialSets.id, input.id)))
        .run();

      if (!removed?.isDefault) return;

      // Promote the group's most-recently-updated remaining row — see `PublishCredentialSetRepoPort`'s
      // own header for why "most recently updated" is the tie-break rule.
      const promoted = tx
        .select()
        .from(publishCredentialSets)
        .where(and(eq(publishCredentialSets.workspaceId, removed.workspaceId), eq(publishCredentialSets.providerId, removed.providerId)))
        .orderBy(desc(publishCredentialSets.updatedAt))
        .limit(1)
        .all()[0];
      if (!promoted) return;

      tx.update(publishCredentialSets)
        .set({ isDefault: true })
        .where(and(eq(publishCredentialSets.workspaceId, promoted.workspaceId), eq(publishCredentialSets.id, promoted.id)))
        .run();
    });
  }

  /** A targeted single-column `UPDATE` — see `PublishCredentialSetRepoPort.updateAccountLabel`'s own
   *  doc for why this must never be `update()`'s full-row replace. No-op (not an error) if the row
   *  vanished — matches this same class's `delete()` idempotent posture; a raw `UPDATE ... WHERE`
   *  simply affects zero rows in that case, so no existence check is needed first. */
  async updateAccountLabel(input: { workspaceId: UUID; id: UUID; accountLabel: string }): Promise<void> {
    this.db
      .update(publishCredentialSets)
      .set({ accountLabel: input.accountLabel })
      .where(and(eq(publishCredentialSets.workspaceId, input.workspaceId), eq(publishCredentialSets.id, input.id)))
      .run();
  }
}

/** Clears `isDefault` on every OTHER row sharing `(workspaceId, providerId)` — the group-invariant
 *  half of `insert`/`update`'s contract. `tx` rather than `this.db` so this always runs inside the
 *  caller's own transaction, never as a second, separately-committed statement. */
function clearOtherDefaults(tx: ContentDbTx, workspaceId: UUID, providerId: PublishProviderId, keepId: UUID): void {
  tx.update(publishCredentialSets)
    .set({ isDefault: false })
    .where(
      and(
        eq(publishCredentialSets.workspaceId, workspaceId),
        eq(publishCredentialSets.providerId, providerId),
        ne(publishCredentialSets.id, keepId),
        eq(publishCredentialSets.isDefault, true)
      )
    )
    .run();
}
