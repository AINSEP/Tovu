import { and, eq } from "drizzle-orm";

import type { PublishContentRunRecord, PublishContentRunRepoPort } from "#src/features/publish-content/run-repo";
import { publishContentRuns } from "../schema.sqlite.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Task 8 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §2/§4 task 8.
 *
 * Real SQLite `PublishContentRunRepoPort` adapter over `publish_content_runs` (migration `0066`,
 * `platform/db/schema.sqlite.ts`). Each run id is inserted once and then updated as per-item progress
 * becomes durable, using one `INSERT … ON CONFLICT DO UPDATE` operation for both cases.
 */
export class SqlitePublishContentRunRepo implements PublishContentRunRepoPort {
  constructor(private readonly db: ContentDb) {}

  async save(record: PublishContentRunRecord): Promise<void> {
    this.db
      .insert(publishContentRuns)
      .values({ ...record })
      .onConflictDoUpdate({
        target: publishContentRuns.id,
        set: {
          phase: record.phase,
          restorePointId: record.restorePointId,
          changeSetIdsJson: record.changeSetIdsJson,
          finishedAt: record.finishedAt,
          reportJson: record.reportJson,
          itemsJson: record.itemsJson,
        },
      })
      .run();
  }

  async findById(input: { workspaceId: string; id: string }): Promise<PublishContentRunRecord | null> {
    const row = this.db
      .select()
      .from(publishContentRuns)
      .where(and(eq(publishContentRuns.workspaceId, input.workspaceId), eq(publishContentRuns.id, input.id)))
      .get();
    return row
      ? {
          ...row,
          direction: row.direction as PublishContentRunRecord["direction"],
          phase: row.phase as PublishContentRunRecord["phase"],
        }
      : null;
  }
}
