import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlMenuRepo, SqlNavLocationBindingRepo } from "./repo.js";

/**
 * @file The menu and nav-location-binding repos on a site's SQLite `content.db`:
 * {@link SqlMenuRepo} / {@link SqlNavLocationBindingRepo} (the one Kysely query body each,
 * `repo.ts`), kept as named classes so the composition root that builds them from the content db
 * handle stays as it is.
 */
export class SqliteMenuRepo extends SqlMenuRepo {
  /** @param store - The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}

export class SqliteNavLocationBindingRepo extends SqlNavLocationBindingRepo {
  /** @param store - The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
