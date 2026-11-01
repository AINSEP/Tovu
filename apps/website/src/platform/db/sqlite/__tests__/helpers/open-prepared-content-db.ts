import { contentKernel } from "../../../content-kernel.js";
import { prepareContentStore } from "../../../prepare-content-store.js";
import { type ContentDb, openContentDb } from "../../content-db.js";
import { closeSqliteConnection } from "../../../kernel/drivers/sqlite.js";

/**
 * @file A migrated content db WITH the rows every store carries (the `database_write_watermark`
 * singleton): `openContentDb` + `prepareContentStore`, for suites that stamp or read the watermark.
 */
export async function openPreparedContentDb(filePath: string): Promise<ContentDb> {
  const db = openContentDb(filePath);
  try {
    await prepareContentStore(contentKernel(db));
    return db;
  } catch (error) {
    // Ownership transfers to the caller only after preparation succeeds.
    closeSqliteConnection(db);
    throw error;
  }
}
