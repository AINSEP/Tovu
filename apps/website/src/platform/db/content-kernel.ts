import type { ContentDatabase } from "./content-database.generated.js";
// The driver and port directly, not `kernel/index.js`: build scripts (`seed-site.mjs`) load
// callers of this module through tsx and must not pull the Postgres drivers into their graph.
import { type SqliteConnectionSource, sqliteKernel } from "./kernel/drivers/sqlite.js";
import type { StorageKernel } from "@jini-ai/core/contracts/storage";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { Kysely } from "kysely";

/**
 * @file The content database as a storage kernel: `StorageKernel<ContentDatabase>`, whichever
 * driver is underneath. Repos converted to Kysely take this.
 */

export type ContentKernel = KyselyKernel<ContentDatabase>;

/**
 * The kernel itself, or the one kernel of a SQLite content db handle (the call sites that still
 * pass `ContentDb`). Told apart by `lockKey`, which only a kernel has (a Drizzle handle has a
 * `dialect` of its own, a better-sqlite3 client an `inTransaction` flag).
 */
export function contentKernel({ store }: { store: ContentKernel | SqliteConnectionSource }, _optional: Record<string, never> = {}): ContentKernel {
  return typeof (store as Partial<ContentKernel>).lockKey === "function"
    ? (store as ContentKernel)
    : sqliteKernel<ContentDatabase>({ source: store as SqliteConnectionSource });
}

/**
 * The same kernel as {@link contentKernel}, typed without the host schema, for the Jini SQL adapters
 * (the `@jini-ai/<pkg>/.../sql` subpaths) whose `kernel` requirement is `StorageKernel<Kysely<unknown>, unknown>`.
 * Erases the host schema only: a Jini adapter supplies each query's table view on this same kernel.
 * It returns the very object `contentKernel` returns (no wrapper), so transactions and lock keys are shared.
 * This is the ONE place the schema-erasing cast lives; bindings call it and add no cast of their own.
 */
export function schemaErasedKernel({ store }: { store: ContentKernel | SqliteConnectionSource }, _optional: Record<string, never> = {}): StorageKernel<Kysely<unknown>, unknown> {
  return contentKernel({ store }) as unknown as StorageKernel<Kysely<unknown>, unknown>;
}
