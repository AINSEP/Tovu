import type { UUID } from "@jini-ai/cms/core";

import type { VendorCredentialSetRecord, VendorCredentialSetRepoPort, VendorId } from "./types.js";

/**
 * @file `VendorCredentialSetRepoPort`'s in-memory adapter — the ADR-006 rule-of-two test double,
 * mirroring `../deployments/publish-credentials/repo.memory.ts`'s shape byte-for-byte with
 * `providerId` swapped for `vendorId`. See that file's own header for the full reasoning (row
 * keying, the enforced UNIQUE constraint matching better-sqlite3's own error wording, why no
 * explicit lock is needed for the `isDefault` group invariant in a single-threaded JS process).
 */
export class InMemoryVendorCredentialSetRepo implements VendorCredentialSetRepoPort {
  private readonly rows = new Map<string, VendorCredentialSetRecord>();

  private static rowKey(workspaceId: UUID, id: UUID): string {
    return `${workspaceId}::${id}`;
  }

  private assertLabelAvailable(workspaceId: UUID, vendorId: VendorId, label: string, excludingId?: UUID): void {
    for (const row of this.rows.values()) {
      if (row.workspaceId !== workspaceId || row.vendorId !== vendorId || row.label !== label) continue;
      if (excludingId !== undefined && row.id === excludingId) continue;
      throw new Error(`UNIQUE constraint failed: vendor_credential_sets.workspace_id, vendor_credential_sets.vendor_id, vendor_credential_sets.label`);
    }
  }

  private clearOtherDefaults(workspaceId: UUID, vendorId: VendorId, keepId: UUID): void {
    for (const [key, row] of this.rows) {
      if (row.workspaceId !== workspaceId || row.vendorId !== vendorId || row.id === keepId || !row.isDefault) continue;
      this.rows.set(key, { ...row, isDefault: false });
    }
  }

  async insert(record: VendorCredentialSetRecord): Promise<void> {
    this.assertLabelAvailable(record.workspaceId, record.vendorId, record.label);
    this.rows.set(InMemoryVendorCredentialSetRepo.rowKey(record.workspaceId, record.id), { ...record });
    if (record.isDefault) this.clearOtherDefaults(record.workspaceId, record.vendorId, record.id);
  }

  async update(record: VendorCredentialSetRecord): Promise<void> {
    this.assertLabelAvailable(record.workspaceId, record.vendorId, record.label, record.id);
    this.rows.set(InMemoryVendorCredentialSetRepo.rowKey(record.workspaceId, record.id), { ...record });
    if (record.isDefault) this.clearOtherDefaults(record.workspaceId, record.vendorId, record.id);
  }

  async findById(input: { workspaceId: UUID; id: UUID }): Promise<VendorCredentialSetRecord | null> {
    return this.rows.get(InMemoryVendorCredentialSetRepo.rowKey(input.workspaceId, input.id)) ?? null;
  }

  async findDefaultByVendor(input: { workspaceId: UUID; vendorId: VendorId }): Promise<VendorCredentialSetRecord | null> {
    for (const row of this.rows.values()) {
      if (row.workspaceId === input.workspaceId && row.vendorId === input.vendorId && row.isDefault) return row;
    }
    return null;
  }

  async listByVendor(input: { workspaceId: UUID; vendorId: VendorId }): Promise<VendorCredentialSetRecord[]> {
    return [...this.rows.values()].filter((row) => row.workspaceId === input.workspaceId && row.vendorId === input.vendorId);
  }

  async listByWorkspace(input: { workspaceId: UUID }): Promise<VendorCredentialSetRecord[]> {
    return [...this.rows.values()].filter((row) => row.workspaceId === input.workspaceId);
  }

  async delete(input: { workspaceId: UUID; id: UUID }): Promise<void> {
    const key = InMemoryVendorCredentialSetRepo.rowKey(input.workspaceId, input.id);
    const removed = this.rows.get(key);
    this.rows.delete(key);
    if (!removed?.isDefault) return;

    const remaining = [...this.rows.values()].filter((row) => row.workspaceId === removed.workspaceId && row.vendorId === removed.vendorId);
    if (remaining.length === 0) return;
    const promoted = remaining.reduce((latest, row) => (row.updatedAt > latest.updatedAt ? row : latest));
    this.rows.set(InMemoryVendorCredentialSetRepo.rowKey(promoted.workspaceId, promoted.id), { ...promoted, isDefault: true });
  }

  /** Mirrors the SQLite adapter's targeted single-column write — see
   *  `VendorCredentialSetRepoPort.updateAccountLabel`'s own doc. No-op if the row vanished. */
  async updateAccountLabel(input: { workspaceId: UUID; id: UUID; accountLabel: string }): Promise<void> {
    const key = InMemoryVendorCredentialSetRepo.rowKey(input.workspaceId, input.id);
    const existing = this.rows.get(key);
    if (!existing) return;
    this.rows.set(key, { ...existing, accountLabel: input.accountLabel });
  }
}
