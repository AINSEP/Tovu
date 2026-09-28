import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlTokenStore } from "../repos/gated-mutation-token-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The gated-mutation token store on a site's SQLite `content.db`: {@link SqlTokenStore} (the
 * one Kysely query body, `repos/gated-mutation-token-repo.ts`), kept as a named class so the
 * composition root that builds it from the content db handle stays as it is.
 */
export class SqliteTokenStore extends SqlTokenStore {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
