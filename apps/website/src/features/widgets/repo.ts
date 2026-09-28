import type { Selectable } from "kysely";

import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { WidgetRegionBindingsTable } from "../../platform/db/content-database.generated.js";
import type { UUID } from "@jini-ai/cms/core";
import type { WidgetRegionBindingRepoPort } from "./ports.js";
import type { WidgetRegionBindingRow, WidgetRegionKey } from "./types.js";

/**
 * @file THE durable `WidgetRegionBindingRepoPort`: one Kysely query body for every dialect the
 * storage kernel drives (storage plan §4, ADR-066). ADR-006 rule-of-two "second adapter" half —
 * `repo.memory.ts`'s `InMemoryWidgetRegionBindingRepo` is the first; `repo.sqlite.ts` is the thin
 * subclass the composition root builds from the content db handle. `upsert` targets the composite
 * `UNIQUE(workspace_id, region_key)` index (a real strengthening of INV-02 over the in-memory
 * adapter's single-process-only guarantee).
 *
 * Architectural role:
 * Infrastructure adapter. No feature logic — `region-area-service.ts` owns every write decision;
 * this class only persists what it's told.
 */

function toRecord(row: Selectable<WidgetRegionBindingsTable>): WidgetRegionBindingRow {
  return {
    workspaceId: row.workspace_id,
    regionKey: row.region_key as WidgetRegionKey,
    areaEntryId: row.area_entry_id,
    updatedAt: row.updated_at,
  };
}

function toRow(binding: WidgetRegionBindingRow): WidgetRegionBindingsTable {
  return {
    workspace_id: binding.workspaceId,
    region_key: binding.regionKey,
    area_entry_id: binding.areaEntryId,
    updated_at: binding.updatedAt,
  };
}

export class SqlWidgetRegionBindingRepo implements WidgetRegionBindingRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async findByRegion(required: { workspaceId: UUID; regionKey: WidgetRegionKey }): Promise<WidgetRegionBindingRow | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("widget_region_bindings")
        .selectAll()
        .where("workspace_id", "=", required.workspaceId)
        .where("region_key", "=", required.regionKey)
        .limit(1)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async listByWorkspace(required: { workspaceId: UUID }): Promise<WidgetRegionBindingRow[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("widget_region_bindings").selectAll().where("workspace_id", "=", required.workspaceId).execute()
    );
    return rows.map(toRecord);
  }

  async upsert(required: {
    workspaceId: UUID;
    regionKey: WidgetRegionKey;
    areaEntryId: UUID;
    updatedAt: string;
  }): Promise<WidgetRegionBindingRow> {
    const row = {
      workspaceId: required.workspaceId,
      regionKey: required.regionKey,
      areaEntryId: required.areaEntryId,
      updatedAt: required.updatedAt,
    };
    await this.kernel.run((db) =>
      db
        .insertInto("widget_region_bindings")
        .values(toRow(row))
        .onConflict((oc) =>
          oc.columns(["workspace_id", "region_key"]).doUpdateSet({ area_entry_id: row.areaEntryId, updated_at: row.updatedAt })
        )
        .execute()
    );
    return row;
  }

  async markInactive(required: { workspaceId: UUID; regionKey: WidgetRegionKey }): Promise<void> {
    await this.kernel.run((db) =>
      db
        .deleteFrom("widget_region_bindings")
        .where("workspace_id", "=", required.workspaceId)
        .where("region_key", "=", required.regionKey)
        .execute()
    );
  }

  /** Delete-then-insert in one kernel transaction, so a reader never sees the workspace half rebuilt. */
  async rebuildForWorkspace(required: { workspaceId: UUID; bindings: readonly WidgetRegionBindingRow[] }): Promise<void> {
    await this.kernel.transaction(async () => {
      await this.kernel.run((db) => db.deleteFrom("widget_region_bindings").where("workspace_id", "=", required.workspaceId).execute());
      if (required.bindings.length === 0) return;
      await this.kernel.run((db) => db.insertInto("widget_region_bindings").values(required.bindings.map(toRow)).execute());
    });
  }
}
