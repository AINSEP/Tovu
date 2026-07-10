/**
 * @file SPIKE — whole-file snapshot before a schema change (ADR-023 §4, §11).
 *
 * The never-brick reversibility anchor: core takes a whole-file snapshot via SQLite's ONLINE
 * BACKUP API (not a raw `fs` copy — the backup API is WAL-safe on a live db) before ANY plugin
 * DDL. If the change fails, the snapshot is the named recovery point (§9). Copy-on-write
 * shadow-tables are a deferred >~1GB optimization (§11), not this.
 */
import path from "node:path";

import type Database from "better-sqlite3";

/** Snapshot `db` to a sibling file and return its path. Async: mirrors the online-backup API. */
export async function snapshotDb(db: Database.Database, dbPath: string, label: string): Promise<string> {
  const dir = path.dirname(dbPath);
  const base = path.basename(dbPath);
  const snapshotPath = path.join(dir, `${base}.snapshot-${label}-${Date.now()}`);
  await db.backup(snapshotPath); // SQLite online backup — captures a consistent whole-file copy
  return snapshotPath;
}
