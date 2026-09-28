import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlSiteTitlePreservationStore } from "./site-title-preservation.js";

/**
 * @file The site-title preservation store on a site's SQLite `content.db`:
 * {@link SqlSiteTitlePreservationStore} (the one Kysely query body, `site-title-preservation.ts`),
 * kept as a named class so the composition root that builds it from the content db handle stays as
 * it is.
 */
export class SqliteSiteTitlePreservationStore extends SqlSiteTitlePreservationStore {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
