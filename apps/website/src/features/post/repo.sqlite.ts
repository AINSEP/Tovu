import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlPostRepo } from "./repo.js";
import { sqlitePostSearchProjection } from "./search-index.sqlite.js";

/**
 * @file The post repo on a site's SQLite `content.db`: {@link SqlPostRepo} (the one Kysely query
 * body, `repo.ts`) with the FTS5 search projection. Kept as a named class so the ~60 call sites
 * that construct it from the content db handle stay as they are; new code calls `postRepoFor`.
 */
export class SqlitePostRepo extends SqlPostRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store), sqlitePostSearchProjection);
  }
}
