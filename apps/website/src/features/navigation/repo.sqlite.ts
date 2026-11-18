import { SqlMenuRepo, SqlNavLocationBindingRepo } from "@jini-ai/cms/navigation/sql";
import { type ContentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";

/** Tovu owns the persisted table names. */
export const NAVIGATION_TABLES = { menus: "menus", navLocationBindings: "nav_location_bindings" } as const;

/**
 * @file The menu and nav-location-binding repos on a site's SQLite `content.db`:
 * {@link SqlMenuRepo} / {@link SqlNavLocationBindingRepo} (the one Kysely query body each, in Jini
 * `@jini-ai/cms/navigation/sql`), kept as named classes so the composition root that builds them from the
 * content db handle stays as it is.
 */
export class SqliteMenuRepo extends SqlMenuRepo {
  /** @param store - The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ kernel: schemaErasedKernel({ store }), tables: NAVIGATION_TABLES }, {});
  }
}

export class SqliteNavLocationBindingRepo extends SqlNavLocationBindingRepo {
  /** @param store - The connection's kernel, or the content db handle it is derived from. */
  constructor({ store }: { store: ContentKernel | ContentDb }) {
    super({ kernel: schemaErasedKernel({ store }), tables: NAVIGATION_TABLES }, {});
  }
}
