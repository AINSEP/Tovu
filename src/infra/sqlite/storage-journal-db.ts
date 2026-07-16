import path from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./storage-journal-schema";

/**
 * @file Sidecar `ops/storage-journal.db` bootstrap (ADR-041 §2, mirrors `content-db.ts`'s
 * `openContentDb` pattern).
 *
 * Purpose:
 * Opens the SQLite file that carries `storage_ledger`/`migration_runs`/`restore_points` — a
 * physically separate file from `content.db`, so that restoring `content.db` from a snapshot
 * never erases the incident record describing that very restore, and boot recovery can append a
 * `migration.interrupted` row even when `content.db` itself won't open (ADR-041 §2).
 *
 * How it relates to the project:
 * The composition root (`server/deps.ts`) opens this alongside `content.db`, at
 * `<install-dir>/ops/storage-journal.db` (ADR-012's install-dir tree), and injects the typed
 * handle into `storage-journal-repo.ts`'s adapters.
 *
 * Architectural role:
 * Infrastructure. Only this file and `storage-journal-repo.ts` touch Drizzle/SQLite for the
 * sidecar journal; `features/storage`/`features/recovery` domain code depends on the ports those
 * adapters implement, never on this file directly.
 */

export type StorageJournalDb = BetterSQLite3Database<typeof schema>;

/** Generated migrations live at `src/infra/drizzle-storage-journal/` (resolved from this file). */
const MIGRATIONS_DIR = path.resolve(__dirname, "../drizzle-storage-journal");

/** Open (or create) `ops/storage-journal.db`, apply pragmas, and migrate to the latest schema. */
export function openStorageJournalDb(filePath: string): StorageJournalDb {
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}
