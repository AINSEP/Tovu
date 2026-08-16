import type { UUID } from "@jini-ai/cms/core";

import type { SourceControlCredentialSetRecord, SourceControlCredentialSetRepoPort, SourceControlProviderId } from "./types";

/**
 * @file `SourceControlCredentialSetRepoPort`'s in-memory adapter — the ADR-006 rule-of-two test
 * double, mirroring `features/deployments/publish-credentials/repo.memory.ts`'s
 * `InMemoryPublishCredentialSetRepo` exactly. Rows are keyed by `${workspaceId}::${id}` (this
 * table's real composite PK) so isolation across workspaces is a property of the key itself.
 *
 * Deliberately enforces the SAME `(workspaceId, providerId, label)` UNIQUE constraint the real
 * SQLite table's index enforces — thrown as an `Error` whose message contains
 * `"UNIQUE constraint failed"`, matching better-sqlite3's own wording exactly (see `store.ts`'s
 * `isUniqueLabelViolation`).
 *
 * `insert`/`update`/`delete` also maintain the `isDefault` group invariant. No explicit
 * transaction is needed here: every method below is synchronous end to end (no `await` between the
 * read and the write), so nothing else can observe a half-updated group in a single-threaded JS
 * process.
 */
export class InMemorySourceControlCredentialSetRepo implements SourceControlCredentialSetRepoPort {
  private readonly rows = new Map<string, SourceControlCredentialSetRecord>();

  private static rowKey(workspaceId: UUID, id: UUID): string {
    return `${workspaceId}::${id}`;
  }

  private assertLabelAvailable(workspaceId: UUID, providerId: SourceControlProviderId, label: string, excludingId?: UUID): void {
    for (const row of this.rows.values()) {
      if (row.workspaceId !== workspaceId || row.providerId !== providerId || row.label !== label) continue;
      if (excludingId !== undefined && row.id === excludingId) continue;
      throw new Error(
        `UNIQUE constraint failed: source_control_credential_sets.workspace_id, source_control_credential_sets.provider_id, source_control_credential_sets.label`
      );
    }
  }

  /** Clears `isDefault` on every OTHER row sharing `(workspaceId, providerId)` — the
   *  group-invariant half of `insert`/`update`'s contract. */
  private clearOtherDefaults(workspaceId: UUID, providerId: SourceControlProviderId, keepId: UUID): void {
    for (const [key, row] of this.rows) {
      if (row.workspaceId !== workspaceId || row.providerId !== providerId || row.id === keepId || !row.isDefault) continue;
      this.rows.set(key, { ...row, isDefault: false });
    }
  }

  async insert(record: SourceControlCredentialSetRecord): Promise<void> {
    this.assertLabelAvailable(record.workspaceId, record.providerId, record.label);
    this.rows.set(InMemorySourceControlCredentialSetRepo.rowKey(record.workspaceId, record.id), { ...record });
    if (record.isDefault) this.clearOtherDefaults(record.workspaceId, record.providerId, record.id);
  }

  async update(record: SourceControlCredentialSetRecord): Promise<void> {
    this.assertLabelAvailable(record.workspaceId, record.providerId, record.label, record.id);
    this.rows.set(InMemorySourceControlCredentialSetRepo.rowKey(record.workspaceId, record.id), { ...record });
    if (record.isDefault) this.clearOtherDefaults(record.workspaceId, record.providerId, record.id);
  }

  async findById(input: { workspaceId: UUID; id: UUID }): Promise<SourceControlCredentialSetRecord | null> {
    return this.rows.get(InMemorySourceControlCredentialSetRepo.rowKey(input.workspaceId, input.id)) ?? null;
  }

  async findDefaultByProvider(input: { workspaceId: UUID; providerId: SourceControlProviderId }): Promise<SourceControlCredentialSetRecord | null> {
    for (const row of this.rows.values()) {
      if (row.workspaceId === input.workspaceId && row.providerId === input.providerId && row.isDefault) return row;
    }
    return null;
  }

  async listByProvider(input: { workspaceId: UUID; providerId: SourceControlProviderId }): Promise<SourceControlCredentialSetRecord[]> {
    return [...this.rows.values()].filter((row) => row.workspaceId === input.workspaceId && row.providerId === input.providerId);
  }

  async listByWorkspace(input: { workspaceId: UUID }): Promise<SourceControlCredentialSetRecord[]> {
    return [...this.rows.values()].filter((row) => row.workspaceId === input.workspaceId);
  }

  async delete(input: { workspaceId: UUID; id: UUID }): Promise<void> {
    const key = InMemorySourceControlCredentialSetRepo.rowKey(input.workspaceId, input.id);
    const removed = this.rows.get(key);
    this.rows.delete(key);
    if (!removed?.isDefault) return;

    // Promote the group's most-recently-updated remaining row — same tie-break rule the SQLite
    // adapter's `ORDER BY updated_at DESC LIMIT 1` uses.
    const remaining = [...this.rows.values()].filter((row) => row.workspaceId === removed.workspaceId && row.providerId === removed.providerId);
    if (remaining.length === 0) return;
    const promoted = remaining.reduce((latest, row) => (row.updatedAt > latest.updatedAt ? row : latest));
    this.rows.set(InMemorySourceControlCredentialSetRepo.rowKey(promoted.workspaceId, promoted.id), { ...promoted, isDefault: true });
  }
}
