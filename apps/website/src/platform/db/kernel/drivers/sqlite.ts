import type Database from "better-sqlite3";
import { Kysely, type SqliteDatabase, SqliteDialect } from "kysely";

import { buildKernel } from "../kernel-core.js";
import type { StorageKernel } from "../port.js";

/**
 * @file The better-sqlite3 driver: a kernel over an ALREADY OPEN SQLite connection (the site's
 * `content.db`, opened and migrated by `openContentDb`). Wrapping instead of opening keeps every
 * existing SQLite site byte-for-byte as it was: same file, same pragmas, same migrations.
 *
 * Accepts the Drizzle handle the call sites hold (`ContentDb`) and reads its client; the Drizzle
 * handle itself is not used. ONE kernel per connection ({@link sqliteKernel} memoizes on the
 * client): the turn lock and the transaction scope only protect callers that share them.
 *
 * Queries go through Kysely's own SQLite dialect over a thin binding shim: SQLite cannot bind a
 * boolean, so `true`/`false` are written as `1`/`0` (what Drizzle's boolean columns stored). Reads
 * of those columns come back as `0`/`1` — the generated types say `SqlBool` so a repo converts.
 *
 * Transactions are `BEGIN IMMEDIATE` on the connection, not Kysely's `transaction()` (which issues a
 * deferred `BEGIN`): IMMEDIATE takes the write lock up front, which is what makes `lockKey` a no-op
 * here and keeps read-then-write sequences from failing with SQLITE_BUSY halfway through.
 *
 * The connection's opener closes it; `close()` here does nothing.
 */

export type SqliteKernel<DB> = StorageKernel<DB>;

/** A Drizzle better-sqlite3 handle (it carries its client as `$client`), or the client itself. */
export type SqliteConnectionSource = Database.Database | { readonly $client: Database.Database };

const kernels = new WeakMap<Database.Database, SqliteKernel<unknown>>();

function clientOf(source: SqliteConnectionSource): Database.Database {
  return "$client" in source ? source.$client : source;
}

const bindable = (value: unknown) => (typeof value === "boolean" ? (value ? 1 : 0) : value);

/** better-sqlite3 as Kysely's `SqliteDatabase`, with booleans bound as integers. */
function bindingShim(client: Database.Database): SqliteDatabase {
  return {
    close: () => {},
    prepare(sqlText) {
      const statement = client.prepare(sqlText);
      const bind = (parameters: ReadonlyArray<unknown>) => parameters.map(bindable);
      return {
        reader: statement.reader,
        all: (parameters) => statement.all(bind(parameters)),
        run: (parameters) => statement.run(bind(parameters)),
        iterate: (parameters) => statement.iterate(bind(parameters)),
      };
    },
  };
}

export function sqliteKernel<DB>(source: SqliteConnectionSource): SqliteKernel<DB> {
  const client = clientOf(source);
  const known = kernels.get(client);
  if (known !== undefined) return known as SqliteKernel<DB>;
  const base = new Kysely<DB>({ dialect: new SqliteDialect({ database: bindingShim(client) }) });
  const kernel = buildKernel<DB>({
    dialect: "sqlite",
    transport: "better-sqlite3",
    capabilities: { interactiveTransactions: true, atomicBatch: true, transactionalDdl: true, backup: true },
    ready: Promise.resolve(),
    base,
    oneConnection: true,
    async begin(body) {
      client.exec("BEGIN IMMEDIATE");
      try {
        const result = await body(base);
        client.exec("COMMIT");
        return result;
      } catch (error) {
        if (client.inTransaction) client.exec("ROLLBACK");
        throw error;
      }
    },
    // BEGIN IMMEDIATE already holds the database write lock for the whole transaction.
    lockKey: async () => {},
    foreignTransactionOpen: () => client.inTransaction,
    close: async () => {},
  });
  kernels.set(client, kernel as SqliteKernel<unknown>);
  return kernel;
}
