/**
 * @file `TrashDb` — the dialect-neutral read/write surface `createTableTrashAdapter` (and, later,
 * `moveToTrash`) run against, so that adapter never imports `better-sqlite3` or any Postgres driver
 * itself. Design: `ADS-memory/.local-artifacts/handoffs/2026-09-21-t8f-trash-more-plan.md` §2.
 *
 * Every method takes and returns Drizzle's DIALECT-NEUTRAL core types (`Table`, `AnyColumn`, `SQL`) —
 * `SQLiteTable`/`PgTable` both extend `Table`, so a single interface serves `db-port.sqlite.ts` now
 * and a future `db-port.postgres.ts` without either side importing the other's driver types.
 *
 * Two rules baked into the shape rather than left to discipline:
 *  - **no `RETURNING`, anywhere** — MySQL has none, so a version bump is always read back with a
 *    second `selectOne`, never chained off the write.
 *  - **rows-affected, not the row** — `updateWhere`/`deleteWhere` return a count. A caller that wants
 *    the row reads it with `selectOne`. This keeps every write a single, un-parsed statement.
 */
import type { AnyColumn, SQL, Table } from "drizzle-orm";

/** Bindings for one `UPDATE`'s `SET` clause: real column values only — never a raw SQL fragment
 *  built from caller input, so a write here can never smuggle in anything beyond a column literal. */
export type TrashDbAssignment = Record<string, unknown>;

/** The row shape `selectOne` returns: one JS value per requested column, keyed the way the caller
 *  named it in `columns`. */
export type TrashDbRow<TSelection extends Record<string, AnyColumn>> = {
  [K in keyof TSelection]: TSelection[K]["_"]["data"];
};

export interface TrashDb {
  /**
   * Runs `run` inside one write transaction, reentrant with whatever transaction is already open on
   * this connection (see `db-port.sqlite.ts`'s doc for why that matters here).
   */
  transaction<T>(required: { run: () => Promise<T> }): Promise<T>;

  /** The first matching row, or `null` when none matched. `columns` is a selection map, not a
   *  raw select list, so the result is always shaped rather than positional. */
  selectOne<TSelection extends Record<string, AnyColumn>>(required: {
    table: Table;
    columns: TSelection;
    where: SQL;
  }): Promise<TrashDbRow<TSelection> | null>;

  /** @returns the number of rows the `UPDATE` matched — never the row itself (see file header). */
  updateWhere(required: { table: Table; set: TrashDbAssignment; where: SQL }): Promise<number>;

  /** @returns the number of rows the `DELETE` removed. */
  deleteWhere(required: { table: Table; where: SQL }): Promise<number>;
}
