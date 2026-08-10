import type { UUID } from "@jini-ai/cms/core";

import type { ComposioConfigRecord, ComposioConfigRepoPort } from "./composio-config-store";

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
}
