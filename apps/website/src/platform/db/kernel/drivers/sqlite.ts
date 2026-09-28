import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { buildKernel } from "../kernel-core.js";
import type { StorageKernel } from "../port.js";

/**
 * @file The better-sqlite3 driver: a kernel over an ALREADY OPEN Drizzle SQLite handle (the
 * site's `content.db`, opened and migrated by `openContentDb`). Wrapping instead of opening keeps
 * every existing SQLite site byte-for-byte as it was: same file, same pragmas, same migrations.
 *
 * ONE kernel per connection ({@link sqliteKernel} memoizes on the client): the turn lock and the
 * transaction scope only protect callers that share them. Transactions are `BEGIN IMMEDIATE` on the
 * connection — Drizzle's own `db.transaction()` on this driver requires a synchronous callback, and
 * repo work awaits.
 *
 * The connection's opener closes it; `close()` here does nothing.
 */

export type SqliteKernelDb<TSchema extends Record<string, unknown>> = BetterSQLite3Database<TSchema>;
export type SqliteKernel<TSchema extends Record<string, unknown>> = StorageKernel<SqliteKernelDb<TSchema>>;

const kernels = new WeakMap<Database.Database, SqliteKernel<Record<string, unknown>>>();

function clientOf(db: BetterSQLite3Database<Record<string, unknown>>): Database.Database {
  return (db as unknown as { $client: Database.Database }).$client;
}

export function sqliteKernel<TSchema extends Record<string, unknown>>(
  db: SqliteKernelDb<TSchema>
): SqliteKernel<TSchema> {
  const client = clientOf(db as SqliteKernelDb<Record<string, unknown>>);
  const known = kernels.get(client);
  if (known !== undefined) return known as unknown as SqliteKernel<TSchema>;
  const kernel = buildKernel<SqliteKernelDb<TSchema>>({
    dialect: "sqlite",
    driver: "better-sqlite3",
    ready: Promise.resolve(),
    base: db,
    oneConnection: true,
    async begin(body) {
      client.exec("BEGIN IMMEDIATE");
      try {
        const result = await body(db);
        client.exec("COMMIT");
        return result;
      } catch (error) {
        if (client.inTransaction) client.exec("ROLLBACK");
        throw error;
      }
    },
    query: async (executor, statement) => executor.all<Record<string, unknown>>(statement),
    execute: async (executor, statement) => {
      executor.run(statement);
    },
    foreignTransactionOpen: () => client.inTransaction,
    close: async () => {},
  });
  kernels.set(client, kernel as unknown as SqliteKernel<Record<string, unknown>>);
  return kernel;
}
