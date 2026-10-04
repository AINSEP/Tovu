/**
 * @file `createSqliteTrashDb` — the {@link TrashDb} over a SQLite `content.db` handle: its storage
 * kernel. A thin shim while call sites still hold the Drizzle handle; a caller with a kernel passes
 * that instead.
 *
 * `transaction` is the kernel's: `@jini-ai/cms/trash` calls it from inside `TrashService.trash`/
 * `restore`/`purgeSelected`, which themselves run inside a domain's own already-open transaction
 * (posts and redirects both open one around "marker + revision append"); a nested kernel
 * transaction joins it.
 */
import { contentKernel } from "../../platform/db/content-kernel.js";
import type { SqliteConnectionSource } from "../../platform/db/kernel/drivers/sqlite.js";
import type { TrashDb } from "./db-port.js";

/**
 * @param required.db the content db handle (or its better-sqlite3 client), or a kernel.
 * @complexity O(1) to build.
 */
export function createSqliteTrashDb(required: { db: TrashDb | SqliteConnectionSource }): TrashDb {
  return contentKernel(required.db);
}
