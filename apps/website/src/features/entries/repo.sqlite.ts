import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlEntryRepo } from "./repo.js";

export type { EntryPublishReadPort } from "./repo.js";

/**
 * @file The entry repo on a site's SQLite `content.db`: {@link SqlEntryRepo} (the one Kysely query
 * body, `repo.ts`). Kept as a named class so existing call sites that construct it from the content
 * db handle stay as they are; new code calls `entryRepoFor`.
 */
export class SqliteEntryRepo extends SqlEntryRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
