import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { StorageKernel } from "@jini-ai/db/kernel";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlWidgetRegionBindingRepo, type WidgetsDatabase } from "@jini-ai/cms/widgets/sql";

export const WIDGET_REGION_BINDINGS_TABLE = "widget_region_bindings";

/**
 * @file The widget region-binding repo on a site's SQLite `content.db`:
 * {@link SqlWidgetRegionBindingRepo} (the one Kysely query body, `Jini/packages/cms/src/widgets/sql/repo.ts`), kept as a named class so
 * the composition root that builds it from the content db handle stays as it is.
 */
export class SqliteWidgetRegionBindingRepo extends SqlWidgetRegionBindingRepo {
  /** @param store - The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super({ kernel: contentKernel(store) as unknown as StorageKernel<WidgetsDatabase>, tables: { regionBindings: WIDGET_REGION_BINDINGS_TABLE } }, {});
  }
}
