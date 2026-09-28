import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlPublishContentRunRepo } from "../repos/publish-content-run-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The publish-content run repo on a site's SQLite `content.db`: {@link SqlPublishContentRunRepo} (the one Kysely
 * query body, `repos/publish-content-run-repo.ts`), kept as a named class so the call sites that build it from the
 * content db handle stay as they are.
 */
export class SqlitePublishContentRunRepo extends SqlPublishContentRunRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
