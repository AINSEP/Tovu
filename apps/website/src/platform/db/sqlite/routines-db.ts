import type { NativeSqliteDatabase } from "../kernel/drivers/sqlite.js";

/**
 * @file Sidecar `ops/routines.db` connection (P3-T1a.T).
 *
 * Why a separate file and connection from `content.db`: restoring or swapping content must never
 * erase routine run history or the scheduler lease, and the scheduler's short write transactions
 * must not queue behind content writes. Same reasoning as `database-journal-db.ts`.
 *
 * Why these pragmas, here, before anything else touches the handle: WAL lets the admin screen read
 * while the scheduler writes; a 5 s busy timeout lets a second Tovu window's lease check wait out a
 * claim instead of failing; foreign keys keep runs tied to their routine. The routines store BORROWS
 * this handle (it never closes it), so whoever opened it here owns closing it.
 */

/** The opener the host injects; production passes `openNativeSqlite`, tests may pass a fake. */
export type OpenRoutinesSqlite = (filePath: string) => NativeSqliteDatabase;

export function openRoutinesDb({ filePath, openSqlite }: { filePath: string; openSqlite: OpenRoutinesSqlite }, _optional: Record<string, never> = {}): NativeSqliteDatabase {
  const handle = openSqlite(filePath);
  try {
    handle.pragma("journal_mode = WAL");
    handle.pragma("busy_timeout = 5000");
    handle.pragma("foreign_keys = ON");
    return handle;
  } catch (error) {
    // A half-configured handle must not leak: the caller only learns about it through the throw.
    handle.close();
    throw error;
  }
}
