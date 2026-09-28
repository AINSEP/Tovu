import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlUserPurge } from "./user-purge.js";

/**
 * @file `UserPurgePort` on a site's SQLite `content.db`: {@link SqlUserPurge} (the one Kysely query
 * body, `user-purge.ts`), kept as a named class so the composition root and the trash user adapter,
 * which build it from the content db handle, stay as they are.
 */
export class SqliteUserPurge extends SqlUserPurge {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
