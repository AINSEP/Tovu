import { recoverIncompleteDataModuleMigrations, restoreSqliteSnapshots } from "#src/features/plugins/migration-recovery";
import { contentKernel } from "#src/platform/db/content-kernel";
import { closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";
import { prepareContentStore } from "#src/platform/db/prepare-content-store";
import {
  type ContentDb,
  migrateSqliteContentFile,
  openSqliteContentConnection,
} from "#src/platform/db/sqlite/content-db";
import { seededPosts, seededPresentation, seededWorkspace } from "../configuration/seed.js";

/**
 * @file The site's content.db, opened the way every boot path of the composition root needs it:
 * open → crash recovery → migrate → watermark row + first-run demo seed.
 *
 * ADR-023 §2 recovery is mandatory and blocking, and runs on the freshly opened connection BEFORE
 * the migrations touch the schema: an interrupted dataModule attempt is undone from its snapshot
 * (the connection is closed for the restore and reopened after), so the site never opens to end
 * users on a half-applied plugin schema.
 */

/**
 * @param dbPath - the content.db file (created when absent), or `:memory:`.
 * @returns the open, migrated, prepared handle; the caller owns it.
 */
export async function openSiteContentDb(dbPath: string): Promise<ContentDb> {
  let db = openSqliteContentConnection(dbPath);
  const recovery = await recoverIncompleteDataModuleMigrations({
    store: db,
    restoreSnapshots: (entries) => {
      closeSqliteConnection(db);
      restoreSqliteSnapshots(dbPath, entries);
    },
  });
  if (recovery.recovered > 0) {
    db = openSqliteContentConnection(dbPath);
    for (const entry of recovery.entries) {
      console.error(`[migration-recovery] restored ${dbPath} from ${entry.snapshotPath} (interrupted dataModule migration of plugin '${entry.pluginId}')`);
    }
  }
  migrateSqliteContentFile(db);
  await prepareContentStore(contentKernel(db), {
    seed: { workspace: seededWorkspace, posts: seededPosts, presentation: seededPresentation },
  });
  return db;
}
