import type { ContentDatabase } from "./content-database.generated.js";
import { type SqliteConnectionSource, sqliteKernel, type StorageKernel } from "./kernel/index.js";

/**
 * @file The content database as a storage kernel: `StorageKernel<ContentDatabase>`, whichever
 * driver is underneath. Repos converted to Kysely take this.
 */

export type ContentKernel = StorageKernel<ContentDatabase>;

/**
 * The kernel itself, or the one kernel of a SQLite content db handle (the call sites that still
 * pass `ContentDb`). Told apart by `lockKey`, which only a kernel has (a Drizzle handle has a
 * `dialect` of its own, a better-sqlite3 client an `inTransaction` flag).
 */
export function contentKernel(store: ContentKernel | SqliteConnectionSource): ContentKernel {
  return typeof (store as Partial<ContentKernel>).lockKey === "function"
    ? (store as ContentKernel)
    : sqliteKernel<ContentDatabase>(store as SqliteConnectionSource);
}
