/**
 * @file ADR-023 §2 (T3 fix) — the durable, fsynced phase-marker journal for the dataModule
 * engine. Every DDL attempt writes phase transitions here, in strict sequence:
 * `PREPARED_SNAPSHOT → DDL_IN_PROGRESS → VERIFYING → COMMITTED` (success) or `→ ROLLED_BACK`
 * (failure). Each transition is checkpointed (forced WAL fsync) before the corresponding DB
 * operation is attempted, so a crash can always be placed at a known, durable phase on next boot.
 *
 * One row per attempt, phase column UPDATEd in place (not append-only) — boot recovery
 * (`migration-recovery.ts`) needs to find "the" in-flight entry per plugin cheaply.
 */
import type Database from "better-sqlite3";

export type JournalPhase = "PREPARED_SNAPSHOT" | "DDL_IN_PROGRESS" | "VERIFYING" | "COMMITTED" | "ROLLED_BACK";

export interface JournalEntry {
  id: number;
  pluginId: string;
  phase: JournalPhase;
  snapshotPath: string;
  startedAt: number;
  updatedAt: number;
}

const TERMINAL_PHASES: ReadonlySet<JournalPhase> = new Set(["COMMITTED", "ROLLED_BACK"]);

export function ensureMigrationJournal(db: Database.Database): void {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS _plugin_migration_journal (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       plugin_id TEXT NOT NULL,
       phase TEXT NOT NULL,
       snapshot_path TEXT NOT NULL,
       started_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     )`
  ).run();
}

/** Forces a WAL checkpoint — the durability primitive behind "fsynced before the corresponding DB operation". */
function checkpoint(db: Database.Database): void {
  db.pragma("wal_checkpoint(FULL)");
}

/** Opens a new journal entry at `PREPARED_SNAPSHOT` and returns its id. Checkpointed before returning. */
export function beginJournalEntry(
  required: { db: Database.Database; pluginId: string; snapshotPath: string },
  _optional: Record<string, never> = {}
): number {
  const { db, pluginId, snapshotPath } = required;
  const now = Date.now();
  const result = db
    .prepare(`INSERT INTO _plugin_migration_journal (plugin_id, phase, snapshot_path, started_at, updated_at) VALUES (?, 'PREPARED_SNAPSHOT', ?, ?, ?)`)
    .run(pluginId, snapshotPath, now, now);
  checkpoint(db);
  return Number(result.lastInsertRowid);
}

/**
 * Writes a phase transition WITHOUT checkpointing (BUG FIX, 2026-08-12 — see `data-module.ts`'s
 * header comment, POST-COMMIT DATA-LOSS WINDOW). Exists solely for a caller that needs to write a
 * phase transition from INSIDE an already-open `db.transaction()` on the same connection, where
 * `advanceJournalPhase`'s checkpoint cannot run: `PRAGMA wal_checkpoint(FULL)` issued by the SAME
 * connection that holds an open write transaction throws `database table is locked` (confirmed
 * directly against this repo's better-sqlite3 build, not assumed from SQLite's docs, which don't
 * call out same-connection mid-transaction checkpoint behavior at all). The caller is responsible
 * for checkpointing the SAME id once its own transaction has committed — typically by calling
 * `advanceJournalPhase` again for the same id/phase, which re-writes the (already correct) row and
 * performs the deferred checkpoint in one call. Skipping that follow-up checkpoint does not weaken
 * crash-durability: the phase transition is already durable the instant the caller's transaction
 * commits (a normal SQLite WAL commit), the same as any other write in that transaction — the
 * checkpoint only controls when the WAL is merged back into the main db file, not whether the write
 * survives a crash.
 */
export function stageJournalPhase(
  required: { db: Database.Database; id: number; phase: JournalPhase },
  _optional: Record<string, never> = {}
): void {
  const { db, id, phase } = required;
  db.prepare(`UPDATE _plugin_migration_journal SET phase = ?, updated_at = ? WHERE id = ?`).run(phase, Date.now(), id);
}

/** Advances a journal entry to `phase`, checkpointed before returning (durable before the next step runs). */
export function advanceJournalPhase(
  required: { db: Database.Database; id: number; phase: JournalPhase },
  _optional: Record<string, never> = {}
): void {
  const { db, id, phase } = required;
  stageJournalPhase({ db, id, phase });
  checkpoint(db);
}

/** Boot-time recovery scan (§2): any entry NOT in a terminal phase is a crash-interrupted attempt. */
export function findIncompleteJournalEntries(db: Database.Database): JournalEntry[] {
  const rows = db.prepare(`SELECT id, plugin_id, phase, snapshot_path, started_at, updated_at FROM _plugin_migration_journal`).all() as Array<{
    id: number;
    plugin_id: string;
    phase: JournalPhase;
    snapshot_path: string;
    started_at: number;
    updated_at: number;
  }>;
  return rows
    .filter((r) => !TERMINAL_PHASES.has(r.phase))
    .map((r) => ({ id: r.id, pluginId: r.plugin_id, phase: r.phase, snapshotPath: r.snapshot_path, startedAt: r.started_at, updatedAt: r.updated_at }));
}
