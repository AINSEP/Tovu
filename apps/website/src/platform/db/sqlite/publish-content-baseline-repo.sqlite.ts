import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlPublishContentBaselineRepo } from "../repos/publish-content-baseline-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The publish-content baseline repo on a site's SQLite `content.db`: {@link SqlPublishContentBaselineRepo} (the one Kysely
 * query body, `repos/publish-content-baseline-repo.ts`), kept as a named class so the call sites that build it from the
 * content db handle stay as they are.
 */
export class SqlitePublishContentBaselineRepo extends SqlPublishContentBaselineRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
