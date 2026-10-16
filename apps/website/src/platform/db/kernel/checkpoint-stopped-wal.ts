import fs from "node:fs";
import type Database from "better-sqlite3";

/** Fold an unclean stop's committed WAL frames into the main file; never read rows.
 * The caller must hold SQLite's exclusive lock on this connection until it closes, so a
 * leftover journal belongs to the stopped database rather than a concurrent writer.
 * @param input - The locked connection and its database file path.
 * @returns Nothing once an absent or fully truncated WAL is safe for relocation.
 * @throws The mover's checkpoint error if SQLite reports busy or the WAL remains non-empty;
 * native SQLite/filesystem errors propagate to the caller's existing admission handling.
 * @example checkpointStoppedSqliteWal({ db, path: file });
 * @complexity O(1) file probes plus checkpointing the leftover WAL; no rows are read.
 */
export function checkpointStoppedSqliteWal({ db, path: file }: { db: Database.Database; path: string }, _options = {}): void {
  if (fs.existsSync(file + "-wal")) {
    const [result] = db.pragma("wal_checkpoint(TRUNCATE)") as { busy: number }[];
    if (result?.busy || fs.statSync(file + "-wal").size !== 0) throw new Error(`Database journal could not be checkpointed: ${file}-wal. Open and stop the site, then retry.`);
  }
}
