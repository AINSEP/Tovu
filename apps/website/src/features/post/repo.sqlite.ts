import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlPostRepo } from "./repo.js";
import { postSearchFor } from "./search-index.js";

/**
 * @file The post repo on a site's SQLite `content.db`: {@link SqlPostRepo} (the one Kysely query
 * body, `repo.ts`) with its dialect's search projection (FTS5 here). Kept as a named class for callers
 * that construct it from a content db handle; new code calls `postRepoFor`.
 */
export class SqlitePostRepo extends SqlPostRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    const kernel = contentKernel({ store });
    super(kernel, postSearchFor(kernel));
  }
}
