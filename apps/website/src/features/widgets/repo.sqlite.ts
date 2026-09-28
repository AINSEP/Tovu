import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlWidgetRegionBindingRepo } from "./repo.js";

/**
 * @file The widget region-binding repo on a site's SQLite `content.db`:
 * {@link SqlWidgetRegionBindingRepo} (the one Kysely query body, `repo.ts`), kept as a named class so
 * the composition root that builds it from the content db handle stays as it is.
 */
export class SqliteWidgetRegionBindingRepo extends SqlWidgetRegionBindingRepo {
  /** @param store - The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
