import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlPresentationSettingsRepo } from "./repo.js";

/**
 * @file The presentation-settings repo on a site's SQLite `content.db`: {@link SqlPresentationSettingsRepo}
 * (the one Kysely query body, `repo.ts`). Kept as a named class so existing call sites that construct
 * it from the content db handle stay as they are; new code calls `presentationSettingsRepoFor`.
 */
export class SqlitePresentationSettingsRepo extends SqlPresentationSettingsRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
