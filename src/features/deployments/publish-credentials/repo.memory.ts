import type { UUID } from "@jini-ai/cms/core";

import type { PublishCredentialSetRecord, PublishCredentialSetRepoPort, PublishProviderId } from "./types";

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

  async insert(record: PublishCredentialSetRecord): Promise<void> {
    this.assertLabelAvailable(record.workspaceId, record.providerId, record.label);
    this.rows.set(InMemoryPublishCredentialSetRepo.rowKey(record.workspaceId, record.id), { ...record });
  }

  async update(record: PublishCredentialSetRecord): Promise<void> {
    this.assertLabelAvailable(record.workspaceId, record.providerId, record.label, record.id);
    this.rows.set(InMemoryPublishCredentialSetRepo.rowKey(record.workspaceId, record.id), { ...record });
  }

  async findById(input: { workspaceId: UUID; id: UUID }): Promise<PublishCredentialSetRecord | null> {
    return this.rows.get(InMemoryPublishCredentialSetRepo.rowKey(input.workspaceId, input.id)) ?? null;
  }

  async listByWorkspace(input: { workspaceId: UUID }): Promise<PublishCredentialSetRecord[]> {
    return [...this.rows.values()].filter((row) => row.workspaceId === input.workspaceId);
  }

  async delete(input: { workspaceId: UUID; id: UUID }): Promise<void> {
    this.rows.delete(InMemoryPublishCredentialSetRepo.rowKey(input.workspaceId, input.id));
  }
}
