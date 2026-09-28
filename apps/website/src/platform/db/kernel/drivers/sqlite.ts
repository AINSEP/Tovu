import path from "node:path";

import Database from "better-sqlite3";
import { Kysely, type SqliteDatabase, SqliteDialect } from "kysely";

import { buildKernel } from "../kernel-core.js";
import type { StorageKernel } from "../port.js";
import { TurnLock } from "../turn-lock.js";

/**
 * @file The better-sqlite3 driver: a kernel over an ALREADY OPEN SQLite connection (the site's
 * `content.db`, opened and migrated by `openContentDb`). Wrapping instead of opening keeps every
 * existing SQLite site byte-for-byte as it was: same file, same pragmas, same migrations.
 *
 * Accepts the Drizzle handle the call sites hold (`ContentDb`) and reads its client; the Drizzle
 * handle itself is not used. ONE kernel per connection ({@link sqliteKernel} memoizes on the
 * client): the transaction scope only protects callers that share it. The turn lock is per FILE:
 * every connection to one database file in this process takes turns on the same lock (see
 * `KernelDriver.turnLock`).
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

/** The reverse of `kernels`, plus the owning kernels {@link openSqliteFileKernel} hands out. */
const connectionsByKernel = new WeakMap<StorageKernel<unknown>, Database.Database>();

/** One turn lock per database FILE, shared by every connection to it in this process. */
const fileTurnLocks = new Map<string, TurnLock>();

function turnLockFor(client: Database.Database): TurnLock | undefined {
  if (client.memory) return undefined;
  const file = path.resolve(client.name);
  let lock = fileTurnLocks.get(file);
  if (lock === undefined) {
    lock = new TurnLock();
    fileTurnLocks.set(file, lock);
  }
  return lock;
}

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
    turnLock: turnLockFor(client),
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
    backup: async (destPath) => {
      await client.backup(destPath);
    },
    close: async () => {},
  });
  kernels.set(client, kernel as SqliteKernel<unknown>);
  connectionsByKernel.set(kernel as SqliteKernel<unknown>, client);
  return kernel;
}

/**
 * A kernel over a new private in-memory SQLite database (foreign keys on, as `openContentDb` sets
 * them). `close()` closes the connection. For scratch work, e.g. building a reference schema.
 */
export function openMemorySqliteKernel<DB>(): SqliteKernel<DB> {
  return openSqliteFileKernel<DB>(":memory:");
}

/**
 * A kernel over its OWN connection to the SQLite file at `filePath`, opened as-is: no migration, no
 * WAL switch, foreign keys on (as `openContentDb` sets them). `close()` closes the connection.
 *
 * For ops on a database file that is not the running site's (a duplicate being prepared, a site dir
 * being inspected). `readOnly` opens with better-sqlite3's own `readonly` mode, so SQLite itself
 * rejects any write, and requires the file to exist.
 *
 * @throws whatever better-sqlite3 throws opening the file (missing file when `readOnly`, not a
 *   database, locked).
 */
export function openSqliteFileKernel<DB>(filePath: string, optional: { readOnly?: boolean } = {}): SqliteKernel<DB> {
  const readOnly = optional.readOnly === true;
  const client = new Database(filePath, readOnly ? { readonly: true, fileMustExist: true } : {});
  if (readOnly) client.pragma("busy_timeout = 5000");
  else client.pragma("foreign_keys = ON");
  const kernel = sqliteKernel<DB>(client);
  const owned: SqliteKernel<DB> = {
    ...kernel,
    close: async () => closeSqliteConnection(client),
  };
  connectionsByKernel.set(owned as SqliteKernel<unknown>, client);
  return owned;
}

/**
 * Closes the better-sqlite3 connection under `source` (a Drizzle handle from `openContentDb`, or
 * the client) and forgets its kernel. For callers that opened a content db themselves and must
 * release it; the kernel's own `close()` never closes a connection it did not open.
 */
export function closeSqliteConnection(source: SqliteConnectionSource): void {
  const client = clientOf(source);
  kernels.delete(client);
  client.close();
}

/** The connection under a kernel this driver built, for the SQLite `StorageOps` (`../ops.ts`). */
export function sqliteConnectionOf<DB>(kernel: StorageKernel<DB>): Database.Database | undefined {
  return connectionsByKernel.get(kernel as StorageKernel<unknown>);
}
