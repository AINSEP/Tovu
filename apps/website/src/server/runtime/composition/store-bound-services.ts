import type { StoreBoundServices } from "./store-bound-contracts.js";
import { type ContentKernel, schemaErasedKernel } from "#src/platform/db/content-kernel";
import { PostgresDbOpsAdapter } from "#src/platform/db/postgres/db-ops-adapter";
import { kernelStampWatermark } from "@jini-ai/db/watermark/kernel";
import { WRITE_WATERMARK_TABLES } from "#src/platform/db/write-watermark-tables";
import type { SiteStore } from "./open-site-store.js";
import { sqliteOnlyServices } from "./sqlite-only-services.js";


/**
 * @file The composition body's one seam between storage engines (R1 plan R1d step 4, R1f).
 *
 * Every other repo in `deps.ts` is built from the content kernel and runs on any dialect (the trash
 * db and the tool-attempt audit sink included: both are kernel repos). What is left depends on the
 * engine, so it is built here, per store, with ONE shape: the body never asks which engine it is on.
 *
 * - SQLite (`sqliteOnlyServices`): restore points are whole-file copies of `content.db`.
 * - Postgres/PGlite ({@link pgOnlyServices}): restore points are reported unavailable.
 * The watermark stamp is the async kernel stamp on both (Jini `@jini-ai/db/watermark/kernel`; Jini cms awaits it,
 * owner decision O2); it stays in this bundle so the body keeps one source for it.
 */

/**
 * The Postgres/PGlite twin of `sqliteOnlyServices`.
 *
 * @complexity O(1) — constructs two objects, no I/O.
 */
export function pgOnlyServices(kernel: ContentKernel): StoreBoundServices {
  return {
    dbOps: new PostgresDbOpsAdapter(),
    stampWatermark: kernelStampWatermark({ kernel: schemaErasedKernel({ store: kernel }), tables: WRITE_WATERMARK_TABLES }),
  };
}

/**
 * The engine-bound services for `store`: SQLite when it carries the Drizzle handle, else Postgres.
 *
 * @param dbPath - `content.db` (SQLite restore points copy it); unused on Postgres.
 */
export function storeBoundServicesFor({ store, dbPath }: { store: SiteStore; dbPath: string }, _optional = {}): StoreBoundServices {
  return store.sqliteDb !== undefined ? sqliteOnlyServices({ db: store.sqliteDb, dbPath }) : pgOnlyServices(store.content);
}
