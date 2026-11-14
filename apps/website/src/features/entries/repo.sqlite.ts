import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlEntryRepo } from "./repo.js";

export type { EntryPublishReadPort } from "./contracts.js";

/**
 * @file The entry repo on a site's SQLite `content.db`: {@link SqlEntryRepo} (the one Kysely query
 * body, `repo.ts`). Kept as a named class so callers can construct it from a content db handle or
 * kernel; new code calls `entryRepoFor`.
 */
export class SqliteEntryRepo extends SqlEntryRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super(contentKernel({ store }));
  }
}
