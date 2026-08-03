/**
 * @file ADR-023 §2 — boot-time crash recovery for the dataModule engine. Called from
 * `db/sqlite/content-db.ts#openContentDb`, BEFORE that file opens its own long-lived
 * connection, so this function owns a short-lived connection of its own for the entire
 * check-and-restore sequence and always closes it before returning — no restore ever runs
 * against a file another connection still holds open (T2/T8's corruption vector).
 *
 * Any journal entry not in a terminal phase (`COMMITTED`/`ROLLED_BACK`) is a crash-interrupted
 * attempt — mandatory, blocking: restore from that entry's snapshot, clean its WAL/SHM sidecars
 * (T8, via `restore.ts`), then mark the entry `ROLLED_BACK`.
 */
import Database from "better-sqlite3";

import { ensureMigrationJournal, findIncompleteJournalEntries } from "./migration-journal";
import { restoreFromSnapshot } from "./restore";

export interface RecoveryResult {
  recovered: number;
  entries: Array<{ pluginId: string; snapshotPath: string }>;
}

/**
 * NOTE: the journal entry itself is NOT marked `ROLLED_BACK` post-restore. The journal row was
 * inserted AFTER the snapshot it references was taken (§2's phase sequence starts at
 * `PREPARED_SNAPSHOT`, meaning "the snapshot already exists"), so the snapshot never contains that
 * row — restoring from it reverts the live file to a state that has no record of the interrupted
 * attempt at all, which is correct (the attempt is fully undone). This function's returned
 * `entries` list IS the audit record for this boot's recovery action; the caller must log it.
 */
export function recoverIncompleteDataModuleMigrations(dbPath: string): RecoveryResult {
  const scan = new Database(dbPath);
  let incomplete: ReturnType<typeof findIncompleteJournalEntries>;
  try {
    ensureMigrationJournal(scan);
    incomplete = findIncompleteJournalEntries(scan);
  } finally {
    scan.close();
  }

  if (incomplete.length === 0) {
    return { recovered: 0, entries: [] };
  }

  // The file must be untouched by any open connection while it is overwritten.
  for (const entry of incomplete) {
    restoreFromSnapshot({ dbPath, snapshotPath: entry.snapshotPath });
  }

  return { recovered: incomplete.length, entries: incomplete.map((e) => ({ pluginId: e.pluginId, snapshotPath: e.snapshotPath })) };
}
