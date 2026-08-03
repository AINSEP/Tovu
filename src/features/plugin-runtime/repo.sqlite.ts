import { eq } from "drizzle-orm";

import { pluginActivations } from "../../db/schema";
import type { ContentDb } from "../../db/sqlite/content-db";
import { findOneBy } from "../../db/sqlite/repo-helpers";
import type { PluginActivationRecord, PluginActivationRepoPort } from "./activation";

/**
 * @file Drizzle/SQLite `PluginActivationRepoPort` adapter — mirrors
 * `src/features/presentation/repo.sqlite.ts`'s shape. Depends on `pluginActivations` landing in
 * `src/db/schema.ts` (Track C, additive migration) — this is the only file besides
 * `schema.ts`/`content-db.ts` allowed to import Drizzle for this feature (ADR-015 rule 2).
 *
 * Architectural role:
 * TDD-certified stub (implementation outline C-013). Method bodies intentionally throw until the
 * Programmer stage implements them against `__tests__/integration/repo.contract.test.ts` (the
 * shared suite this adapter and `repo.memory.ts` must both satisfy identically).
 */
type PluginActivationRow = typeof pluginActivations.$inferSelect;

function toRecord(row: PluginActivationRow): PluginActivationRecord {
  return {
    pluginId: row.pluginId,
    workspaceId: row.workspaceId,
    version: row.version,
    enabled: row.enabled,
    updatedAt: row.updatedAt,
  };
}

export class SqlitePluginActivationRepo implements PluginActivationRepoPort {
  constructor(private readonly db: ContentDb) {}

  async getActivation(required: { workspaceId: string; pluginId: string }): Promise<PluginActivationRecord | null> {
    return findOneBy(
      this.db,
      pluginActivations,
      [eq(pluginActivations.workspaceId, required.workspaceId), eq(pluginActivations.pluginId, required.pluginId)],
      toRecord
    );
  }

  async save(record: PluginActivationRecord): Promise<void> {
    this.db
      .insert(pluginActivations)
      .values(record)
      .onConflictDoUpdate({
        target: [pluginActivations.workspaceId, pluginActivations.pluginId],
        set: { version: record.version, enabled: record.enabled, updatedAt: record.updatedAt },
      })
      .run();
  }

  async listAll(): Promise<PluginActivationRecord[]> {
    return this.db.select().from(pluginActivations).all().map(toRecord);
  }
}
