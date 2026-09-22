import { and, eq } from "drizzle-orm";

import type { PublishContentBaselineRecord, PublishContentBaselineRepoPort } from "#src/features/publish-content/baseline-repo";
import { publishContentBaselines } from "../schema.sqlite.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Task 7 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §2/§4 task 7.
 *
 * Real SQLite `PublishContentBaselineRepoPort` adapter over `publish_content_baselines`
 * (migration `0066`, `platform/db/schema.sqlite.ts`). Mirrors
 * `publish-content-bundle-repo.sqlite.ts`'s shape; `upsert` uses the table's own
 * `publish_content_baselines_unique` 4-column index as the `onConflictDoUpdate` target, the same
 * pattern `composio-connector-credential-repo.sqlite.ts`'s `upsert` already establishes for a
 * 2-column unique index.
 */

type Row = typeof publishContentBaselines.$inferSelect;

/** @complexity O(1) — fixed-shape field mapping, no iteration. */
function toRecord(row: Row): PublishContentBaselineRecord {
  return {
    workspaceId: row.workspaceId,
    peerPrincipalId: row.peerPrincipalId,
    entityType: row.entityType,
    entityId: row.entityId,
    hashAtLastSync: row.hashAtLastSync,
    hashVersion: row.hashVersion,
    syncedAt: row.syncedAt,
    runId: row.runId,
  };
}

export class SqlitePublishContentBaselineRepo implements PublishContentBaselineRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findOne(input: {
    workspaceId: string;
    peerPrincipalId: string;
    entityType: string;
    entityId: string;
  }): Promise<PublishContentBaselineRecord | null> {
    const row = this.db
      .select()
      .from(publishContentBaselines)
      .where(
        and(
          eq(publishContentBaselines.workspaceId, input.workspaceId),
          eq(publishContentBaselines.peerPrincipalId, input.peerPrincipalId),
          eq(publishContentBaselines.entityType, input.entityType),
          eq(publishContentBaselines.entityId, input.entityId)
        )
      )
      .get();
    return row ? toRecord(row) : null;
  }

  async upsert(record: PublishContentBaselineRecord): Promise<void> {
    this.db
      .insert(publishContentBaselines)
      .values({ ...record })
      .onConflictDoUpdate({
        target: [
          publishContentBaselines.workspaceId,
          publishContentBaselines.peerPrincipalId,
          publishContentBaselines.entityType,
          publishContentBaselines.entityId,
        ],
        set: { ...record },
      })
      .run();
  }
}
