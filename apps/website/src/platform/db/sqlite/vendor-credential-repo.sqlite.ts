import { and, desc, eq, ne } from "drizzle-orm";

import type { UUID } from "@jini-ai/cms/core";
import type { VendorCredentialSetRecord, VendorCredentialSetRepoPort, VendorId } from "#src/features/vendor-credentials/types";
import { vendorCredentialSets } from "../schema.sqlite.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Real `VendorCredentialSetRepoPort` adapter — the ADR-006 rule-of-two "second adapter" half;
 * `../../features/vendor-credentials/repo.memory.ts`'s `InMemoryVendorCredentialSetRepo` is the
 * first. Mirrors `publish-credential-repo.sqlite.ts`/`source-control-credential-repo.sqlite.ts`
 * byte-for-byte, `providerId` swapped for `vendorId` and `tokenTail` added to the plain column
 * group both `toRecord`/`toValues` already move opaquely — see either sibling file's own header for
 * the full "why one `db.transaction()` per group-invariant write" reasoning this file shares.
 */

type ContentDbTx = Parameters<Parameters<ContentDb["transaction"]>[0]>[0];

type Row = typeof vendorCredentialSets.$inferSelect;

function toRecord(row: Row): VendorCredentialSetRecord {
  return {
    workspaceId: row.workspaceId,
    id: row.id,
    vendorId: row.vendorId as VendorId,
    label: row.label,
    sealed: { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg },
    tokenTail: row.tokenTail,
    isDefault: row.isDefault,
    accountLabel: row.accountLabel,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toValues(record: VendorCredentialSetRecord) {
  return {
    workspaceId: record.workspaceId,
    id: record.id,
    vendorId: record.vendorId,
    label: record.label,
    sealedKeyId: record.sealed.keyId,
    sealedCiphertext: record.sealed.ciphertext,
    sealedNonce: record.sealed.nonce,
    sealedAlg: record.sealed.alg,
    tokenTail: record.tokenTail,
    isDefault: record.isDefault,
    accountLabel: record.accountLabel,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class SqliteVendorCredentialSetRepo implements VendorCredentialSetRepoPort {
  constructor(private readonly db: ContentDb) {}

  async insert(record: VendorCredentialSetRecord): Promise<void> {
    this.db.transaction((tx) => {
      // A plain `.insert()`, NOT `.onConflictDoUpdate()` — same reasoning both sibling adapters'
      // own `insert()` document: a conflict here can only mean the UNIQUE
      // `(workspace_id, vendor_id, label)` index rejected a duplicate label.
      tx.insert(vendorCredentialSets).values(toValues(record)).run();
      if (record.isDefault) clearOtherDefaults(tx, record.workspaceId, record.vendorId, record.id);
    });
  }

  async update(record: VendorCredentialSetRecord): Promise<void> {
    this.db.transaction((tx) => {
      tx.update(vendorCredentialSets)
        .set(toValues(record))
        .where(and(eq(vendorCredentialSets.workspaceId, record.workspaceId), eq(vendorCredentialSets.id, record.id)))
        .run();
      if (record.isDefault) clearOtherDefaults(tx, record.workspaceId, record.vendorId, record.id);
    });
  }

  async findById(input: { workspaceId: UUID; id: UUID }): Promise<VendorCredentialSetRecord | null> {
    const row = this.db
      .select()
      .from(vendorCredentialSets)
      .where(and(eq(vendorCredentialSets.workspaceId, input.workspaceId), eq(vendorCredentialSets.id, input.id)))
      .all()[0];
    return row ? toRecord(row) : null;
  }

  async findDefaultByVendor(input: { workspaceId: UUID; vendorId: VendorId }): Promise<VendorCredentialSetRecord | null> {
    const row = this.db
      .select()
      .from(vendorCredentialSets)
      .where(
        and(
          eq(vendorCredentialSets.workspaceId, input.workspaceId),
          eq(vendorCredentialSets.vendorId, input.vendorId),
          eq(vendorCredentialSets.isDefault, true)
        )
      )
      .all()[0];
    return row ? toRecord(row) : null;
  }

  async listByVendor(input: { workspaceId: UUID; vendorId: VendorId }): Promise<VendorCredentialSetRecord[]> {
    return this.db
      .select()
      .from(vendorCredentialSets)
      .where(and(eq(vendorCredentialSets.workspaceId, input.workspaceId), eq(vendorCredentialSets.vendorId, input.vendorId)))
      .all()
      .map(toRecord);
  }

  async listByWorkspace(input: { workspaceId: UUID }): Promise<VendorCredentialSetRecord[]> {
    return this.db.select().from(vendorCredentialSets).where(eq(vendorCredentialSets.workspaceId, input.workspaceId)).all().map(toRecord);
  }

  async delete(input: { workspaceId: UUID; id: UUID }): Promise<void> {
    this.db.transaction((tx) => {
      const removed = tx
        .select()
        .from(vendorCredentialSets)
        .where(and(eq(vendorCredentialSets.workspaceId, input.workspaceId), eq(vendorCredentialSets.id, input.id)))
        .all()[0];

      tx.delete(vendorCredentialSets)
        .where(and(eq(vendorCredentialSets.workspaceId, input.workspaceId), eq(vendorCredentialSets.id, input.id)))
        .run();

      if (!removed?.isDefault) return;

      const promoted = tx
        .select()
        .from(vendorCredentialSets)
        .where(and(eq(vendorCredentialSets.workspaceId, removed.workspaceId), eq(vendorCredentialSets.vendorId, removed.vendorId)))
        .orderBy(desc(vendorCredentialSets.updatedAt))
        .limit(1)
        .all()[0];
      if (!promoted) return;

      tx.update(vendorCredentialSets)
        .set({ isDefault: true })
        .where(and(eq(vendorCredentialSets.workspaceId, promoted.workspaceId), eq(vendorCredentialSets.id, promoted.id)))
        .run();
    });
  }

  /** A targeted single-column `UPDATE` — see `VendorCredentialSetRepoPort.updateAccountLabel`'s
   *  own doc for why this must never be `update()`'s full-row replace. */
  async updateAccountLabel(input: { workspaceId: UUID; id: UUID; accountLabel: string }): Promise<void> {
    this.db
      .update(vendorCredentialSets)
      .set({ accountLabel: input.accountLabel })
      .where(and(eq(vendorCredentialSets.workspaceId, input.workspaceId), eq(vendorCredentialSets.id, input.id)))
      .run();
  }
}

/** Clears `isDefault` on every OTHER row sharing `(workspaceId, vendorId)` — the group-invariant
 *  half of `insert`/`update`'s contract. */
function clearOtherDefaults(tx: ContentDbTx, workspaceId: UUID, vendorId: VendorId, keepId: UUID): void {
  tx.update(vendorCredentialSets)
    .set({ isDefault: false })
    .where(
      and(
        eq(vendorCredentialSets.workspaceId, workspaceId),
        eq(vendorCredentialSets.vendorId, vendorId),
        ne(vendorCredentialSets.id, keepId),
        eq(vendorCredentialSets.isDefault, true)
      )
    )
    .run();
}
