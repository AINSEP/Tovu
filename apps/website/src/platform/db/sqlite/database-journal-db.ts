import { sql } from "kysely";

import { gateJournalKernel, type JournalDatabase, type JournalKernel } from "../journal-kernel.js";
import { openSqliteFileKernel } from "../kernel/index.js";
import { applyDatabaseJournalSchema } from "./database-journal-schema.js";

/**
 * @file Sidecar `ops/database-journal.db` bootstrap (ADR-041 §2).
 *
 * Purpose:
 * Opens the SQLite file that carries `database_ledger`/`migration_runs`/`restore_points` — a
 * physically separate file from `content.db`, so that restoring `content.db` from a snapshot
 * never erases the incident record describing that very restore, and boot recovery can append a
 * `migration.interrupted` row even when `content.db` itself won't open (ADR-041 §2). It stays a
 * local SQLite file on every content dialect.
 *
 * How it relates to the project:
 * The composition root (`server/deps.ts`) opens this alongside `content.db`, at
 * `<install-dir>/ops/database-journal.db` (ADR-012's install-dir tree), and injects the kernel into
 * `database-journal-repo.ts`'s adapters.
 *
 * Architectural role:
 * Infrastructure. `features/database`/`features/recovery` domain code depends on the ports those
 * adapters implement, never on this file directly.
 */

export type DatabaseJournalDb = JournalKernel;

/**
 * The journal file at `filePath` (created if missing) as a kernel over its own connection (5 s busy
 * timeout — the server and a CLI command may both have it open). Returns synchronously, so the
 * sync composition root can construct its repos at once; the WAL switch and schema are applied
 * through the kernel right after, and every call on the kernel waits for them (`ready`) and fails
 * with their error if they failed. The parent directory must exist.
 */
export function journalKernel(filePath: string): JournalKernel {
  const kernel = openSqliteFileKernel<JournalDatabase>(filePath);
  const ready = (async () => {
    await kernel.query(sql`PRAGMA journal_mode = WAL`);
    await applyDatabaseJournalSchema(kernel);
  })();
  return gateJournalKernel(kernel, ready);
}

/** Open (or create) `ops/database-journal.db` — {@link journalKernel}, under the name its call sites use. */
export const openDatabaseJournalDb = journalKernel;
