import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./database-journal-schema.js";

/**
 * @file Sidecar `ops/database-journal.db` bootstrap (ADR-041 §2, mirrors `content-db.ts`'s
 * `openContentDb` pattern).
 *
 * Purpose:
 * Opens the SQLite file that carries `database_ledger`/`migration_runs`/`restore_points` — a
 * physically separate file from `content.db`, so that restoring `content.db` from a snapshot
 * never erases the incident record describing that very restore, and boot recovery can append a
 * `migration.interrupted` row even when `content.db` itself won't open (ADR-041 §2).
 *
 * How it relates to the project:
 * The composition root (`server/deps.ts`) opens this alongside `content.db`, at
 * `<install-dir>/ops/database-journal.db` (ADR-012's install-dir tree), and injects the typed
 * handle into `database-journal-repo.ts`'s adapters.
 *
 * Architectural role:
 * Infrastructure. Only this file and `database-journal-repo.ts` touch Drizzle/SQLite for the
 * sidecar journal; `features/database`/`features/recovery` domain code depends on the ports those
 * adapters implement, never on this file directly.
 */

export type DatabaseJournalDb = BetterSQLite3Database<typeof schema>;

/** Generated migrations live at `src/platform/db/drizzle-database-journal/` (resolved from this file).
 * That directory carries forward the original shipped `0000_pale_weapon_omega.sql` migration (a
 * plain directory rename, not a content edit) plus a new migration that renames `storage_ledger`
 * to `database_ledger` — see that directory's own migrations for the full history. */
const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle-database-journal");

/** Open (or create) `ops/database-journal.db`, apply pragmas, and migrate to the latest schema. */
export function openDatabaseJournalDb(filePath: string): DatabaseJournalDb {
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}
