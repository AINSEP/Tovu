import Database from "better-sqlite3";

/**
 * @file The SQLite side of a database transfer: a snapshot held as bytes (from
 * `DbOpsPort.captureRestorePoint`, never the live file), opened in memory, read only. The copier sees
 * only {@link TransferSource}, so a Postgres source for the later "switch back" is a second adapter,
 * not a copier change.
 */

export interface TransferSource {
  /** The table's column names, or `null` when the source has no such table. */
  columns(table: string): readonly string[] | null;
  countRows(table: string): number;
  /** Every row, cells in `columns` order. */
  rows(table: string, columns: readonly string[]): Iterable<unknown[]>;
  close(): void;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * A site database runs in WAL mode, and its snapshot's header says so (bytes 18-19 = 2). SQLite
 * cannot open WAL-mode bytes in memory ("unable to open database file"), so a copy of the bytes is
 * marked rollback-journal (1) first. The pages themselves are complete: a backup never needs the WAL.
 */
function inMemoryReadableBytes(bytes: Buffer): Buffer {
  if (bytes[18] !== 2 && bytes[19] !== 2) return bytes;
  const copy = Buffer.from(bytes);
  copy[18] = 1;
  copy[19] = 1;
  return copy;
}

/** @complexity O(database size) to deserialize the snapshot. */
export function openSqliteSnapshotSource(bytes: Buffer): TransferSource {
  const db = new Database(inMemoryReadableBytes(bytes), { readonly: true });
  return {
    columns(table) {
      const info = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as { name: string }[];
      return info.length === 0 ? null : info.map((column) => column.name);
    },
    countRows(table) {
      return (db.prepare(`SELECT count(*) AS n FROM ${quoteIdent(table)}`).get() as { n: number }).n;
    },
    rows(table, columns) {
      return db.prepare(`SELECT ${columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(table)}`).raw().iterate() as Iterable<unknown[]>;
    },
    close: () => db.close(),
  };
}
