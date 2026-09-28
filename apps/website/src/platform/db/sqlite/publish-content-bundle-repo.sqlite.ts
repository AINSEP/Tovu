import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlPublishContentBundleRepo } from "../repos/publish-content-bundle-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The publish-content bundle repo on a site's SQLite `content.db`: {@link SqlPublishContentBundleRepo} (the one Kysely
 * query body, `repos/publish-content-bundle-repo.ts`), kept as a named class so the call sites that build it from the
 * content db handle stay as they are.
 */
export class SqlitePublishContentBundleRepo extends SqlPublishContentBundleRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
