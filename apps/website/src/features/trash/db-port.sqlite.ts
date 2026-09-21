/**
 * @file The only `TrashDb` implementation today: Drizzle's better-sqlite3 query builder, reentrant
 * with the caller's own transaction.
 *
 * `transaction` reuses `createContentDbTransactionRunner` (`repo.sqlite.ts`) rather than Drizzle's
 * own `db.transaction()` wrapper, for the same reason that runner already exists: `write-service.ts`
 * calls it from inside `TrashService.trash`/`restore`/`purgeSelected`, which themselves run inside a
 * domain's own already-open `BEGIN IMMEDIATE` (posts and redirects both open one around "marker +
 * revision append"). Drizzle's `transaction()` requires a synchronous callback and cannot nest, so it
 * cannot stand in here — the raw-client runner already handles both constraints.
 */
import type { AnyColumn, SQL, Table } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { createContentDbTransactionRunner } from "./repo.sqlite.js";
import type { TrashDb, TrashDbAssignment, TrashDbRow } from "./db-port.js";

/**
 * @param required.db the Drizzle handle over `content.db` (its `$client` backs the transaction
 *        runner; every other method uses the Drizzle builder directly on the same connection, so it
 *        automatically joins whatever transaction is currently open — SQLite has one connection and
 *        one writer, so there is nothing extra to coordinate).
 * @complexity O(1) to build.
 */
export function createSqliteTrashDb(required: { db: ContentDb }): TrashDb {
  const { db } = required;
  const runInTransaction = createContentDbTransactionRunner(db.$client);

  return {
    async transaction({ run }) {
      return runInTransaction(run);
    },

    /** @complexity O(1) via whatever index the caller's `where` matches. */
    async selectOne<TSelection extends Record<string, AnyColumn>>(select: {
      table: Table;
      columns: TSelection;
      where: SQL;
    }): Promise<TrashDbRow<TSelection> | null> {
      // `select.columns` is typed `Record<string, AnyColumn>` at the dialect-neutral port boundary
      // (`db-port.ts`); Drizzle's better-sqlite3 `.select()` wants its own narrower `SQLiteColumn`
      // selection shape. The cast is safe: every column that reaches here came from a `sqliteTable`
      // declaration in `schema.ts` (the only schema module wired up today), so it already IS one.
      const rows = db
        .select(select.columns as unknown as Record<string, SQLiteColumn>)
        .from(select.table as SQLiteTable)
        .where(select.where)
        .limit(1)
        .all() as Array<TrashDbRow<TSelection>>;
      return rows[0] ?? null;
    },

    /** @complexity O(1) plus whatever index the `where` matches. */
    async updateWhere(write: { table: Table; set: TrashDbAssignment; where: SQL }): Promise<number> {
      const result = db
        .update(write.table as SQLiteTable)
        .set(write.set)
        .where(write.where)
        .run();
      return result.changes;
    },

    /** @complexity O(1) plus whatever index the `where` matches, plus the delete itself. */
    async deleteWhere(write: { table: Table; where: SQL }): Promise<number> {
      const result = db
        .delete(write.table as SQLiteTable)
        .where(write.where)
        .run();
      return result.changes;
    },
  };
}
