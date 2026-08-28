import { and, eq } from "drizzle-orm";

import { widgetRegionBindings } from "../../platform/db/schema.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { findOneBy } from "../../platform/db/sqlite/repo-helpers.js";
import type { UUID } from "@jini-ai/cms/core";
import type { WidgetRegionBindingRepoPort } from "./ports.js";
import type { WidgetRegionBindingRow, WidgetRegionKey } from "./types.js";

/**
 * @file Real SQLite `WidgetRegionBindingRepoPort` adapter (ADR-006 rule-of-two "second adapter"
 * half — `repo.memory.ts`'s `InMemoryWidgetRegionBindingRepo` is the first), mirroring
 * `navigation/repo.sqlite.ts`'s `SqliteNavLocationBindingRepo` structurally: `upsert` uses
 * `onConflictDoUpdate` targeting the composite `UNIQUE(workspace_id, region_key)` index (a real
 * strengthening of INV-02 over the in-memory adapter's single-process-only guarantee).
 *
 * Architectural role:
 * Infrastructure adapter. No feature logic — `region-area-service.ts` owns every write decision;
 * this class only persists what it's told.
 */

type BindingRow = typeof widgetRegionBindings.$inferSelect;

function toRecord(row: BindingRow): WidgetRegionBindingRow {
  return {
    workspaceId: row.workspaceId,
    regionKey: row.regionKey,
    areaEntryId: row.areaEntryId,
    updatedAt: row.updatedAt,
  };
}

export class SqliteWidgetRegionBindingRepo implements WidgetRegionBindingRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByRegion(required: { workspaceId: UUID; regionKey: WidgetRegionKey }): Promise<WidgetRegionBindingRow | null> {
    return findOneBy(
      this.db,
      widgetRegionBindings,
      [eq(widgetRegionBindings.workspaceId, required.workspaceId), eq(widgetRegionBindings.regionKey, required.regionKey)],
      toRecord
    );
  }

  async listByWorkspace(required: { workspaceId: UUID }): Promise<WidgetRegionBindingRow[]> {
    const rows = this.db
      .select()
      .from(widgetRegionBindings)
      .where(eq(widgetRegionBindings.workspaceId, required.workspaceId))
      .all();
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
    this.db
      .insert(widgetRegionBindings)
      .values(row)
      .onConflictDoUpdate({
        target: [widgetRegionBindings.workspaceId, widgetRegionBindings.regionKey],
        set: { areaEntryId: row.areaEntryId, updatedAt: row.updatedAt },
      })
      .run();
    return row;
  }

  async markInactive(required: { workspaceId: UUID; regionKey: WidgetRegionKey }): Promise<void> {
    this.db
      .delete(widgetRegionBindings)
      .where(and(eq(widgetRegionBindings.workspaceId, required.workspaceId), eq(widgetRegionBindings.regionKey, required.regionKey)))
      .run();
  }

  async rebuildForWorkspace(required: { workspaceId: UUID; bindings: readonly WidgetRegionBindingRow[] }): Promise<void> {
    this.db.delete(widgetRegionBindings).where(eq(widgetRegionBindings.workspaceId, required.workspaceId)).run();
    if (required.bindings.length === 0) return;
    this.db
      .insert(widgetRegionBindings)
      .values(
        required.bindings.map((binding) => ({
          workspaceId: binding.workspaceId,
          regionKey: binding.regionKey,
          areaEntryId: binding.areaEntryId,
          updatedAt: binding.updatedAt,
        }))
      )
      .run();
  }
}
