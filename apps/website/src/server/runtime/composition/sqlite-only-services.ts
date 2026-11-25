import { schemaErasedKernel } from "#src/platform/db/content-kernel";
import type { ContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteDbOpsAdapter } from "#src/platform/db/sqlite/db-ops";
import { processCopyCoordinator } from "#src/platform/db/sqlite/copy-coordinator";
import { kernelStampWatermark } from "@jini-ai/db/watermark/kernel";
import { WRITE_WATERMARK_TABLES } from "#src/platform/db/write-watermark-tables";
import type { StoreBoundServices } from "./store-bound-contracts.js";

/**
 * @file The SQLite half of the composition body's one seam between storage engines (R1 plan R1d
 * step 4; the seam and its Postgres/PGlite twin are in `store-bound-services.ts`). Audit:
 * `ADS-memory/.local-artifacts/handoffs/2026-09-28-storage-r1d.md`.
 */

/**
 * @param db - the site's open `content.db` handle (`SiteStore.sqliteDb`).
 * @param dbPath - the file behind it, which restore points copy.
 * @complexity O(1) — constructs two objects, no I/O.
 */
export function sqliteOnlyServices({ db, dbPath }: { db: ContentDb; dbPath: string }, _optional = {}): StoreBoundServices {
  return {
    dbOps: new SqliteDbOpsAdapter({ db, filePath: dbPath, copies: processCopyCoordinator }),
    stampWatermark: kernelStampWatermark({ kernel: schemaErasedKernel({ store: db }), tables: WRITE_WATERMARK_TABLES }),
  };
}
