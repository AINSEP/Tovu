import type { UUID } from "@jini-ai/cms/core";

import type { PublishCredentialSetRecord, PublishCredentialSetRepoPort, PublishProviderId } from "./types.js";

/**
 * @file `PublishCredentialSetRepoPort`'s in-memory adapter — the ADR-006 rule-of-two test double,
 * mirroring `assistant/site-credential-store.memory.ts`'s shape. Rows are keyed by
 * `${workspaceId}::${id}` (this table's real composite PK) so isolation across workspaces is a
 * property of the key itself, not something a test has to remember to assert separately.
 *
 * Deliberately enforces the SAME `(workspaceId, providerId, label)` UNIQUE constraint the real SQLite
 * table's index enforces — thrown as an `Error` whose message contains `"UNIQUE constraint failed"`,
 * matching better-sqlite3's own wording exactly (see `store.ts`'s `isUniqueLabelViolation`). Without
 * this, `store.ts`'s duplicate-label path (`createPublishCredential`/`updatePublishCredential`) would
 * only be exercisable against a real SQLite `content.db`, and this module's own unit tests would need
 * one just to prove that one branch — a heavier test than the behavior warrants.
 *
 * `insert`/`update`/`delete` also maintain the `isDefault` group invariant (Contract v2 Correction B
 * — see `PublishCredentialSetRepoPort`'s own header). No explicit transaction is needed here: every
 * method below is synchronous end to end (no `await` between the read and the write), so nothing else
 * can observe a half-updated group in a single-threaded JS process — the same property the real
 * SQLite adapter needs an actual `db.transaction()` to get.
 */
export class InMemoryPublishCredentialSetRepo implements PublishCredentialSetRepoPort {
  private readonly rows = new Map<string, PublishCredentialSetRecord>();

  private static rowKey(workspaceId: UUID, id: UUID): string {
    return `${workspaceId}::${id}`;
  }

  private assertLabelAvailable(workspaceId: UUID, providerId: PublishProviderId, label: string, excludingId?: UUID): void {
    for (const row of this.rows.values()) {
      if (row.workspaceId !== workspaceId || row.providerId !== providerId || row.label !== label) continue;
      if (excludingId !== undefined && row.id === excludingId) continue;
      throw new Error(
        `UNIQUE constraint failed: publish_credential_sets.workspace_id, publish_credential_sets.provider_id, publish_credential_sets.label`
      );
    }
  }

  /** Clears `isDefault` on every OTHER row sharing `(workspaceId, providerId)` — the group-invariant
   *  half of `insert`/`update`'s contract. */
  private clearOtherDefaults(workspaceId: UUID, providerId: PublishProviderId, keepId: UUID): void {
    for (const [key, row] of this.rows) {
      if (row.workspaceId !== workspaceId || row.providerId !== providerId || row.id === keepId || !row.isDefault) continue;
      this.rows.set(key, { ...row, isDefault: false });
    }
  }

  async insert(record: PublishCredentialSetRecord): Promise<void> {
    this.assertLabelAvailable(record.workspaceId, record.providerId, record.label);
    this.rows.set(InMemoryPublishCredentialSetRepo.rowKey(record.workspaceId, record.id), { ...record });
    if (record.isDefault) this.clearOtherDefaults(record.workspaceId, record.providerId, record.id);
  }

  async update(record: PublishCredentialSetRecord): Promise<void> {
    this.assertLabelAvailable(record.workspaceId, record.providerId, record.label, record.id);
    this.rows.set(InMemoryPublishCredentialSetRepo.rowKey(record.workspaceId, record.id), { ...record });
    if (record.isDefault) this.clearOtherDefaults(record.workspaceId, record.providerId, record.id);
  }

  async findById(input: { workspaceId: UUID; id: UUID }): Promise<PublishCredentialSetRecord | null> {
    return this.rows.get(InMemoryPublishCredentialSetRepo.rowKey(input.workspaceId, input.id)) ?? null;
  }

  async findDefaultByProvider(input: { workspaceId: UUID; providerId: PublishProviderId }): Promise<PublishCredentialSetRecord | null> {
    for (const row of this.rows.values()) {
      if (row.workspaceId === input.workspaceId && row.providerId === input.providerId && row.isDefault) return row;
    }
    return null;
  }

  async listByProvider(input: { workspaceId: UUID; providerId: PublishProviderId }): Promise<PublishCredentialSetRecord[]> {
    return [...this.rows.values()].filter((row) => row.workspaceId === input.workspaceId && row.providerId === input.providerId);
  }

  async listByWorkspace(input: { workspaceId: UUID }): Promise<PublishCredentialSetRecord[]> {
    return [...this.rows.values()].filter((row) => row.workspaceId === input.workspaceId);
  }

  async delete(input: { workspaceId: UUID; id: UUID }): Promise<void> {
    const key = InMemoryPublishCredentialSetRepo.rowKey(input.workspaceId, input.id);
    const removed = this.rows.get(key);
    this.rows.delete(key);
    if (!removed?.isDefault) return;

    // Promote the group's most-recently-updated remaining row — same tie-break rule the SQLite
    // adapter's `ORDER BY updated_at DESC LIMIT 1` uses.
    const remaining = [...this.rows.values()].filter((row) => row.workspaceId === removed.workspaceId && row.providerId === removed.providerId);
    if (remaining.length === 0) return;
    const promoted = remaining.reduce((latest, row) => (row.updatedAt > latest.updatedAt ? row : latest));
    this.rows.set(InMemoryPublishCredentialSetRepo.rowKey(promoted.workspaceId, promoted.id), { ...promoted, isDefault: true });
  }

  /** Mirrors the SQLite adapter's targeted single-column write — see
   *  `PublishCredentialSetRepoPort.updateAccountLabel`'s own doc. No-op if the row vanished. */
  async updateAccountLabel(input: { workspaceId: UUID; id: UUID; accountLabel: string }): Promise<void> {
    const key = InMemoryPublishCredentialSetRepo.rowKey(input.workspaceId, input.id);
    const existing = this.rows.get(key);
    if (!existing) return;
    this.rows.set(key, { ...existing, accountLabel: input.accountLabel });
  }
}
