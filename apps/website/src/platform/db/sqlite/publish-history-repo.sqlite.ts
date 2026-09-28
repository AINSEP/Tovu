import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlPublishHistoryStore } from "../repos/publish-history-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The publish history store on a site's SQLite `content.db`: {@link SqlPublishHistoryStore} (the one Kysely
 * query body, `repos/publish-history-repo.ts`), kept as a named class so the call sites that build it from the
 * content db handle stay as they are.
 */
export class SqlitePublishHistoryStore extends SqlPublishHistoryStore {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
