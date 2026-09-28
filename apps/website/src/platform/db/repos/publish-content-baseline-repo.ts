import type { Selectable } from "kysely";

import type { PublishContentBaselineRecord, PublishContentBaselineRepoPort } from "#src/features/publish-content/baseline-repo";
import type { ContentKernel } from "../content-kernel.js";
import type { PublishContentBaselinesTable } from "../content-database.generated.js";

/**
 * @file THE `PublishContentBaselineRepoPort` adapter over `publish_content_baselines` (migration
 * `0066`): one Kysely query body for every dialect (storage plan §4, ADR-066). Publish-content
 * task 7 (`ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §2/§4).
 * `upsert` targets the table's own `publish_content_baselines_unique` 4-column index.
 * `sqlite/publish-content-baseline-repo.sqlite.ts` is the thin subclass built from the content db handle.
 */

/** @complexity O(1) — fixed-shape field mapping, no iteration. */
function toRecord(row: Selectable<PublishContentBaselinesTable>): PublishContentBaselineRecord {
  return {
    workspaceId: row.workspace_id,
    peerPrincipalId: row.peer_principal_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    hashAtLastSync: row.hash_at_last_sync,
    hashVersion: row.hash_version,
    syncedAt: row.synced_at,
    runId: row.run_id,
  };
}

export class SqlPublishContentBaselineRepo implements PublishContentBaselineRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findOne(input: {
    workspaceId: string;
    peerPrincipalId: string;
    entityType: string;
    entityId: string;
  }): Promise<PublishContentBaselineRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("publish_content_baselines")
        .selectAll()
        .where("workspace_id", "=", input.workspaceId)
        .where("peer_principal_id", "=", input.peerPrincipalId)
        .where("entity_type", "=", input.entityType)
        .where("entity_id", "=", input.entityId)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async upsert(record: PublishContentBaselineRecord): Promise<void> {
    const columns = {
      workspace_id: record.workspaceId,
      peer_principal_id: record.peerPrincipalId,
      entity_type: record.entityType,
      entity_id: record.entityId,
      hash_at_last_sync: record.hashAtLastSync,
      hash_version: record.hashVersion,
      synced_at: record.syncedAt,
      run_id: record.runId,
    };
    await this.kernel.run((db) =>
      db
        .insertInto("publish_content_baselines")
        .values(columns)
        .onConflict((oc) =>
          oc.columns(["workspace_id", "peer_principal_id", "entity_type", "entity_id"]).doUpdateSet(columns)
        )
        .execute()
    );
  }
}

/** The publish-content baseline repo on `kernel`'s database, whichever dialect. */
export function publishContentBaselineRepoFor(kernel: ContentKernel): PublishContentBaselineRepoPort {
  return new SqlPublishContentBaselineRepo(kernel);
}
