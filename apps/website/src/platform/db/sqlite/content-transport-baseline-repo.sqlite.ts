import { and, eq } from "drizzle-orm";

import type { ContentTransportBaselineRecord, ContentTransportBaselineRepoPort } from "#src/features/content-transport/baseline-repo";
import { contentTransportBaselines } from "../schema.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Task 7 of the content-transport (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §2/§4 task 7.
 *
 * Real SQLite `ContentTransportBaselineRepoPort` adapter over `content_transport_baselines`
 * (migration `0066`, `platform/db/schema.ts`). Mirrors
 * `content-transport-bundle-repo.sqlite.ts`'s shape; `upsert` uses the table's own
 * `content_transport_baselines_unique` 4-column index as the `onConflictDoUpdate` target, the same
 * pattern `composio-connector-credential-repo.sqlite.ts`'s `upsert` already establishes for a
 * 2-column unique index.
 */

type Row = typeof contentTransportBaselines.$inferSelect;

/** @complexity O(1) — fixed-shape field mapping, no iteration. */
function toRecord(row: Row): ContentTransportBaselineRecord {
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

export class SqliteContentTransportBaselineRepo implements ContentTransportBaselineRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findOne(input: {
    workspaceId: string;
    peerPrincipalId: string;
    entityType: string;
    entityId: string;
  }): Promise<ContentTransportBaselineRecord | null> {
    const row = this.db
      .select()
      .from(contentTransportBaselines)
      .where(
        and(
          eq(contentTransportBaselines.workspaceId, input.workspaceId),
          eq(contentTransportBaselines.peerPrincipalId, input.peerPrincipalId),
          eq(contentTransportBaselines.entityType, input.entityType),
          eq(contentTransportBaselines.entityId, input.entityId)
        )
      )
      .get();
    return row ? toRecord(row) : null;
  }

  async upsert(record: ContentTransportBaselineRecord): Promise<void> {
    this.db
      .insert(contentTransportBaselines)
      .values({ ...record })
      .onConflictDoUpdate({
        target: [
          contentTransportBaselines.workspaceId,
          contentTransportBaselines.peerPrincipalId,
          contentTransportBaselines.entityType,
          contentTransportBaselines.entityId,
        ],
        set: { ...record },
      })
      .run();
  }
}
