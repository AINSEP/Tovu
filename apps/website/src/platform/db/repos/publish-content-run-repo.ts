import type { Selectable } from "kysely";

import type { PublishContentRunRecord, PublishContentRunRepoPort } from "#src/features/publish-content/run-repo";
import type { ContentKernel } from "../content-kernel.js";
import type { PublishContentRunsTable } from "../content-database.generated.js";

/**
 * @file THE `PublishContentRunRepoPort` adapter over `publish_content_runs` (migration `0066`): one
 * Kysely query body for every dialect (storage plan §4, ADR-066). Publish-content task 8
 * (`ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §2/§4). Each run id is
 * inserted once and then updated as per-item progress becomes durable, using one
 * `INSERT … ON CONFLICT DO UPDATE` for both cases. `sqlite/publish-content-run-repo.sqlite.ts` is
 * the thin subclass built from the content db handle.
 */

/** @complexity O(1) — fixed-shape field mapping, no iteration. */
function toRecord(row: Selectable<PublishContentRunsTable>): PublishContentRunRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    direction: row.direction as PublishContentRunRecord["direction"],
    peerPrincipalId: row.peer_principal_id,
    peerLabel: row.peer_label,
    phase: row.phase as PublishContentRunRecord["phase"],
    restorePointId: row.restore_point_id,
    changeSetIdsJson: row.change_set_ids_json,
    actorId: row.actor_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    reportJson: row.report_json,
    itemsJson: row.items_json,
  };
}

export class SqlPublishContentRunRepo implements PublishContentRunRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  /** Restore points of runs still in flight (planned/applying): retention must not delete the copy
   * a running import may still roll back to. Finished runs are NOT protected: every import records
   * its restore point, so protecting them all would keep every copy forever (the 11-01 full disk).
   * @complexity O(n) in-flight runs for one workspace, one query. */
  async inFlightRestorePointIds({ workspaceId }: { workspaceId: string }, _options = {}): Promise<ReadonlySet<string>> {
    const rows = await this.kernel.run(db => db.selectFrom("publish_content_runs").select("restore_point_id")
      .where("workspace_id", "=", workspaceId).where("phase", "in", ["planned", "applying"]).where("restore_point_id", "is not", null).execute());
    return new Set(rows.map(row => row.restore_point_id!));
  }

  async save(record: PublishContentRunRecord): Promise<void> {
    const progress = {
      phase: record.phase,
      restore_point_id: record.restorePointId,
      change_set_ids_json: record.changeSetIdsJson,
      finished_at: record.finishedAt,
      report_json: record.reportJson,
      items_json: record.itemsJson,
    };
    await this.kernel.run((db) =>
      db
        .insertInto("publish_content_runs")
        .values({
          id: record.id,
          workspace_id: record.workspaceId,
          direction: record.direction,
          peer_principal_id: record.peerPrincipalId,
          peer_label: record.peerLabel,
          actor_id: record.actorId,
          started_at: record.startedAt,
          ...progress,
        })
        .onConflict((oc) => oc.column("id").doUpdateSet(progress))
        .execute()
    );
  }

  async findById(input: { workspaceId: string; id: string }): Promise<PublishContentRunRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("publish_content_runs")
        .selectAll()
        .where("workspace_id", "=", input.workspaceId)
        .where("id", "=", input.id)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }
}
