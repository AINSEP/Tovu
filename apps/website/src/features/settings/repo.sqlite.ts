import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlSettingsRepo } from "./repo.js";

/**
 * @file The settings repo on a site's SQLite `content.db`: {@link SqlSettingsRepo} (the one Kysely
 * query body, `repo.ts`), kept as a named class so the call sites that construct it from the content
 * db handle stay as they are; new code constructs `SqlSettingsRepo` with its kernel.
 */
export class SqliteSettingsRepo extends SqlSettingsRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
