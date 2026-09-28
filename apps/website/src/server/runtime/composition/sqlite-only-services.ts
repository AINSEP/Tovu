import type { DbOpsPort } from "#src/contracts/core/gated-mutations/ports";
import type { DatabaseDestinationRepoPort } from "#src/features/database-transfer/destination-store";
import { SqliteDatabaseDestinationRepo } from "#src/features/database-transfer/destination-repo.sqlite";
import { sqliteStampWatermark } from "#src/features/taxonomy/repo.sqlite";
import type { ContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteDbOpsAdapter } from "#src/platform/db/sqlite/db-ops";

/**
 * @file The composition body's one seam between storage engines (R1 plan R1d step 4).
 *
 * Every other repo in `deps.ts` is built from the content kernel and runs on any dialect. What is
 * left needs the SQLite Drizzle handle or the `content.db` file itself, so it is grouped here and
 * built only on the SQLite branch. R1f adds the PGlite/Postgres twin with the same shape; the body
 * never asks which engine it is on. Audit: `ADS-memory/.local-artifacts/handoffs/2026-09-28-storage-r1d.md`.
 */

/** The services whose implementation depends on the storage engine. */
export interface StoreBoundServices {
  /** Restore points are whole-file copies of `content.db` (Jini infra); shared by the body and the boot password reset. */
  readonly dbOps: DbOpsPort;
  /** Synchronous Drizzle watermark bump; Jini cms calls it unawaited (owner decision O2 moves it to the kernel in R1f). */
  readonly stampWatermark: () => void;
  /** The database-transfer destination row; its repo is Drizzle-only today. */
  readonly databaseTransferDestinationRepo: DatabaseDestinationRepoPort;
}

/**
 * @param db - the site's open `content.db` handle (`SiteStore.sqliteDb`).
 * @param dbPath - the file behind it, which restore points copy.
 * @complexity O(1) — constructs three objects, no I/O.
 */
export function sqliteOnlyServices(db: ContentDb, dbPath: string): StoreBoundServices {
  return {
    dbOps: new SqliteDbOpsAdapter({ db, filePath: dbPath }),
    stampWatermark: sqliteStampWatermark(db),
    databaseTransferDestinationRepo: new SqliteDatabaseDestinationRepo(db),
  };
}
