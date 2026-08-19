import type { UUID } from "@jini-ai/cms/core";

import type { CustomCredentialSetRecord, CustomCredentialSetRepoPort } from "./types.js";

/**
 * @file `CustomCredentialSetRepoPort`'s in-memory adapter — the ADR-006 rule-of-two test double,
 * mirroring `features/source-control/repo.memory.ts`'s `InMemorySourceControlCredentialSetRepo`
 * (minus the `isDefault` group invariant this table has no concept of — see `types.ts`'s own
 * header). Rows are keyed by `${workspaceId}::${id}` (this table's real composite PK) so isolation
 * across workspaces is a property of the key itself.
 *
 * Deliberately enforces the SAME `(workspaceId, label)` UNIQUE constraint the real SQLite table's
 * index enforces — thrown as an `Error` whose message contains `"UNIQUE constraint failed"`,
 * matching better-sqlite3's own wording exactly (see `store.ts`'s `isUniqueLabelViolation`).
 */
export class InMemoryCustomCredentialSetRepo implements CustomCredentialSetRepoPort {
  private readonly rows = new Map<string, CustomCredentialSetRecord>();

  private static rowKey(workspaceId: UUID, id: UUID): string {
    return `${workspaceId}::${id}`;
  }

  private assertLabelAvailable(workspaceId: UUID, label: string, excludingId?: UUID): void {
    for (const row of this.rows.values()) {
      if (row.workspaceId !== workspaceId || row.label !== label) continue;
      if (excludingId !== undefined && row.id === excludingId) continue;
      throw new Error(`UNIQUE constraint failed: custom_credential_sets.workspace_id, custom_credential_sets.label`);
    }
  }

  async insert(record: CustomCredentialSetRecord): Promise<void> {
    this.assertLabelAvailable(record.workspaceId, record.label);
    this.rows.set(InMemoryCustomCredentialSetRepo.rowKey(record.workspaceId, record.id), { ...record });
  }

  async update(record: CustomCredentialSetRecord): Promise<void> {
    this.assertLabelAvailable(record.workspaceId, record.label, record.id);
    this.rows.set(InMemoryCustomCredentialSetRepo.rowKey(record.workspaceId, record.id), { ...record });
  }

  async findById(input: { workspaceId: UUID; id: UUID }): Promise<CustomCredentialSetRecord | null> {
    return this.rows.get(InMemoryCustomCredentialSetRepo.rowKey(input.workspaceId, input.id)) ?? null;
  }

  async listByWorkspace(input: { workspaceId: UUID }): Promise<CustomCredentialSetRecord[]> {
    return [...this.rows.values()].filter((row) => row.workspaceId === input.workspaceId);
  }

  async delete(input: { workspaceId: UUID; id: UUID }): Promise<void> {
    this.rows.delete(InMemoryCustomCredentialSetRepo.rowKey(input.workspaceId, input.id));
  }
}
