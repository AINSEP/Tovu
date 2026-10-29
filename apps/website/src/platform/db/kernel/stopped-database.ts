/** Native stopped-database admission and verification, owned by the storage kernel. */
import fs from "node:fs";
import path from "node:path";
import { verifySqliteIntegrity } from "@jini-ai/db/sqlite";
import { openNativeSqlite } from "./drivers/sqlite.js";
import { checkpointStoppedSqliteWal } from "./checkpoint-stopped-wal.js";

/** Released hosts have no lease. SQLite's exclusive lock is the admission proof. Never copy a live SQLite inode.
 * A WAL/SHM that survives while this probe holds that lock was left by an unclean stop (no process has the DB):
 * its committed frames are checkpointed into the main file, exactly as the site's next open would, and the
 * stale SHM is removed under the lock; close deletes the emptied WAL. Any journal still present afterwards refuses.
 * @complexity O(1) probes per DB, plus one checkpoint of a leftover WAL; no rows are read.
 */
export function assertDatabaseStopped({ path: file }: { path: string }, _options = {}): void {
  const db = openNativeSqlite(file, { fileMustExist: true, timeout: 0 });
  try {
    // EXCLUSIVE locking mode keeps the lock until close and uses a heap wal-index, never the stale SHM.
    db.exec("PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; ROLLBACK;");
    checkpointStoppedSqliteWal({ db, path: file });
    fs.rmSync(file + "-shm", { force: true });
  } catch (error) {
    if ((error as { code?: string }).code?.startsWith("SQLITE_BUSY")) throw new Error(`Database is open in another process: ${file}. Stop it before moving it.`);
    throw error;
  } finally { db.close(); }
  for (const suffix of ["-wal", "-shm"]) {
    if (fs.existsSync(file + suffix)) throw new Error(`Database journal exists: ${file + suffix}. Stop the site and close/checkpoint its database before moving it.`);
  }
}
/** Read-only verification of every user table plus SQLite's full integrity check through Jini's
 * existing SQLite inspector. It now supports strict counts; its diagnostics mode still reports
 * partial results. No process is signalled: a recycled PID is not permission to stop another app.
 * Row counts include tables with unusual quoted names and distinguish identical totals per table.
 * @param options.verifyIntegrity - Integrity/row-count inspector; defaults to Jini's SQLite inspector.
 * @complexity O(database pages + all table rows), one stopped connection per verification.
 */
export function inspectStoppedDatabase({ path: file }: { path: string }, { verifyIntegrity = verifySqliteIntegrity }: { verifyIntegrity?: typeof verifySqliteIntegrity } = {}): string {
  // SQLite can create WAL/SHM even for a readonly connection. Remember exactly what existed;
  // only this inspection's artifacts may be removed, never a pre-existing journal.
  const absentSidecars = ["-wal", "-shm"].map((suffix) => file + suffix).filter((sidecar) => !fs.existsSync(sidecar));
  let db: ReturnType<typeof openNativeSqlite> | undefined;
  try {
    db = openNativeSqlite(file, { readonly: true, fileMustExist: true });
    const checked = verifyIntegrity({ db }, { includeRowCounts: true });
    if (!checked.ok) throw new Error(`SQLite integrity_check failed for ${path.basename(file)}: ${checked.issues.map((issue) => issue.message).join('; ')}`);
    if (!checked.rowCounts) throw new Error("Build @jini-ai/db before running the stopped-site database mover.");
    return JSON.stringify(checked.rowCounts);
  } finally {
    try { db?.close(); }
    finally { for (const sidecar of absentSidecars) fs.rmSync(sidecar, { force: true }); }
  }
}

