import { sql } from "kysely";

import type { StorageKernel } from "./port.js";

/**
 * @file SQLite-only primitives with no portable equivalent, spelled once here at the kernel boundary
 * (the no-raw-SQLite ratchet's one allowed place, `__tests__/no-raw-sqlite.boundary.test.ts`).
 *
 * Why these are not `listColumns`/`tableExists` (`dialect.ts`): their callers need SQLite's OWN
 * answer, byte for byte. Publish's "send by hand" (`sqlite/publish-backstop-row.sqlite.ts`) ships a
 * table's `PRAGMA table_info` shape to the other peer, which compares it to its own and hashes it into
 * the row's content hash — so the declared type keeps its case and `pk` keeps its key ordinal.
 * `listColumns` lower-cases the type and folds `pk` to a boolean, which would make an upgraded peer
 * disagree with an older one about the same table. The deferred foreign-key check is SQLite's
 * `defer_foreign_keys` + `foreign_key_check` pair; Postgres has no statement-level equivalent.
 *
 * Generic (no Tovu concepts): a candidate for `@jini-ai/db/kernel` next to `dialect.ts`.
 */

/** One `PRAGMA table_info` row, as the SQLite catalog reports it. */
export interface SqliteTableColumn {
  readonly name: string;
  /** The declared type, case preserved. */
  readonly type: string;
  /** 0 for a non-key column, else the column's 1-based position in the primary key. */
  readonly pk: number;
  readonly notnull: number;
}

/** One `PRAGMA foreign_key_check` row. */
export interface SqliteForeignKeyViolation {
  readonly table: string;
  readonly rowid: number;
  readonly parent: string;
}

function requireSqlite<DB>(kernel: StorageKernel<DB>, operation: string): void {
  if (kernel.dialect !== "sqlite") {
    throw new Error(`${operation} is SQLite-only; this kernel is ${kernel.dialect}`);
  }
}

/**
 * The columns of the ordinary table `table` (views excluded), in declaration order, exactly as
 * `PRAGMA table_info` reports them; `null` when no such table exists. The name is bound, never
 * spliced, so it needs no identifier quoting.
 * @throws {Error} On a non-SQLite kernel.
 */
export async function sqliteTableInfo<DB>(
  required: { kernel: StorageKernel<DB>; table: string },
  _optional: Record<string, never> = {},
): Promise<SqliteTableColumn[] | null> {
  const { kernel, table } = required;
  requireSqlite(kernel, "sqliteTableInfo");
  const found = await kernel.query<{ name: string }>(sql`SELECT name FROM sqlite_schema WHERE type='table' AND name=${table}`);
  if (found.length === 0) return null;
  const rows = await kernel.query<SqliteTableColumn>(sql`SELECT name, type, pk, "notnull" FROM pragma_table_info(${table}) ORDER BY cid`);
  return rows.map(({ name, type, pk, notnull }) => ({ name, type, pk, notnull }));
}

/**
 * Runs `work` in one kernel transaction with foreign keys deferred, then checks every foreign key
 * before commit. A violation throws `onViolation(first violation)` INSIDE the transaction, so the
 * whole of `work` rolls back.
 * @throws {Error} On a non-SQLite kernel.
 */
export async function sqliteForeignKeyCheckedTransaction<DB, T>(
  required: { kernel: StorageKernel<DB>; work: () => Promise<T>; onViolation: (violation: SqliteForeignKeyViolation) => Error },
  _optional: Record<string, never> = {},
): Promise<T> {
  const { kernel, work, onViolation } = required;
  requireSqlite(kernel, "sqliteForeignKeyCheckedTransaction");
  return kernel.transaction(async () => {
    await kernel.execute(sql`PRAGMA defer_foreign_keys = ON`);
    const result = await work();
    const [first] = await kernel.query<SqliteForeignKeyViolation>(sql`PRAGMA foreign_key_check`);
    if (first) throw onViolation(first);
    return result;
  });
}
