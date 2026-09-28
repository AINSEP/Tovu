import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlPublishContentPeerRepo } from "../repos/publish-content-peer-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The publish-content peer repo on a site's SQLite `content.db`: {@link SqlPublishContentPeerRepo} (the one Kysely
 * query body, `repos/publish-content-peer-repo.ts`), kept as a named class so the call sites that build it from the
 * content db handle stay as they are.
 */
export class SqlitePublishContentPeerRepo extends SqlPublishContentPeerRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
