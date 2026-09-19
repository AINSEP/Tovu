import type { PublishContentRunRecord, PublishContentRunRepoPort } from "#src/features/publish-content/run-repo";
import { publishContentRuns } from "../schema.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Task 8 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §2/§4 task 8.
 *
 * Real SQLite `PublishContentRunRepoPort` adapter over `publish_content_runs` (migration `0066`,
 * `platform/db/schema.ts`). Mirrors `publish-content-bundle-repo.sqlite.ts`'s shape — a plain
 * `INSERT`, no `onConflictDoUpdate`: run ids are freshly minted by `apply-loop.ts` and never reused,
 * matching `PublishContentRunRepoPort.save`'s own "insert-once" contract.
 */
export class SqlitePublishContentRunRepo implements PublishContentRunRepoPort {
  constructor(private readonly db: ContentDb) {}

  async save(record: PublishContentRunRecord): Promise<void> {
    this.db.insert(publishContentRuns).values({ ...record }).run();
  }
}
