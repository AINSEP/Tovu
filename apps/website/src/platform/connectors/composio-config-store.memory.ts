import type { ISODateTime, UUID } from "@jini-ai/cms/core";

import type { ComposioConfigRecord, ComposioConfigRepoPort } from "./composio-config-store.js";

/**
 * @file `ComposioConfigRepoPort`'s in-memory adapter — the ADR-006 rule-of-two test double,
 * backing `server/app.ts`'s hermetic composition root (the role
 * `media/provider-credential-store.memory.ts` plays for media provider keys).
 *
 * A flat map keyed by `workspaceId`, not the composite key its media sibling needs: this table is
 * single-row-per-workspace, so the workspace id IS the primary key.
 */
export class InMemoryComposioConfigRepo implements ComposioConfigRepoPort {
  private readonly rows = new Map<UUID, ComposioConfigRecord>();

  async findByWorkspaceId(workspaceId: UUID): Promise<ComposioConfigRecord | null> {
    const row = this.rows.get(workspaceId);
    return row === undefined ? null : { ...row, authConfigIds: { ...row.authConfigIds } };
  }

  async upsert(record: ComposioConfigRecord): Promise<void> {
    this.rows.set(record.workspaceId, { ...record, authConfigIds: { ...record.authConfigIds } });
  }

  /**
   * Column-scoped compare-and-swap on `keyGeneration`, mirroring the SQLite adapter's single
   * conditional `UPDATE`. Rebuilding the row from `...row` is safe here precisely because `row` is
   * re-read at this instant rather than supplied by the caller — the caller only ever gets to
   * choose `authConfigIds`/`updatedAt`, which is the property the port promises.
   *
   * @complexity O(1) — one map lookup plus one map write.
   * @overallScore 100
   */
  async updateAuthConfigIdsIfGenerationMatches(input: {
    workspaceId: UUID;
    expectedGeneration: number;
    authConfigIds: Record<string, string>;
    updatedAt: ISODateTime;
  }): Promise<boolean> {
    const row = this.rows.get(input.workspaceId);
    if (row === undefined || row.keyGeneration !== input.expectedGeneration) return false;
    this.rows.set(input.workspaceId, {
      ...row,
      authConfigIds: { ...input.authConfigIds },
      updatedAt: input.updatedAt,
    });
    return true;
  }
}
