import { AsyncLocalStorage } from "node:async_hooks";

import type { SQL } from "drizzle-orm";

import type { StorageDialect, StorageDriver, StorageKernel } from "./port.js";
import { TurnLock } from "./turn-lock.js";

/**
 * @file The transaction rules every driver shares, so they cannot differ by dialect: a test that
 * passes on PGlite passes on SQLite for the same reason.
 *
 * The caller's async context (AsyncLocalStorage) records whether it is inside a `run()` body or a
 * transaction, and which executor that is. Nested `transaction()` joins; nested `run()` reuses the
 * executor; `transaction()` inside `run()` throws (it would wait on the caller's own turn).
 */

/** What a driver supplies. Everything else about a kernel is built here. */
export interface KernelDriver<TDb> {
  dialect: StorageDialect;
  driver: StorageDriver;
  ready: Promise<void>;
  base: TDb;
  /** One real transaction on the connection; `body` gets its executor. Commit on resolve, roll back on throw. */
  begin<T>(body: (tx: TDb) => Promise<T>): Promise<T>;
  query(db: TDb, statement: SQL): Promise<Record<string, unknown>[]>;
  execute(db: TDb, statement: SQL): Promise<void>;
  /** Share one connection between all callers: take turns (see `turn-lock.ts`). */
  oneConnection: boolean;
  /**
   * A transaction on the connection that this kernel did not open (a legacy `BEGIN IMMEDIATE` site
   * not converted yet). While one is open, kernel calls join it — the same pass-through the legacy
   * runners use — instead of failing on a nested `BEGIN`. Removed once no legacy site remains.
   */
  foreignTransactionOpen?(): boolean;
  close(): Promise<void>;
}

type Scope<TDb> = { kind: "run" | "transaction"; db: TDb };

export function buildKernel<TDb>(driver: KernelDriver<TDb>): StorageKernel<TDb> {
  const scope = new AsyncLocalStorage<Scope<TDb>>();
  const lock = driver.oneConnection ? new TurnLock() : undefined;
  let ownTransactions = 0;
  const joinsForeign = () => ownTransactions === 0 && driver.foreignTransactionOpen?.() === true;

  async function run<T>(fn: (db: TDb) => T | Promise<T>): Promise<T> {
    await driver.ready;
    const current = scope.getStore();
    if (current !== undefined) return fn(current.db);
    if (joinsForeign()) return fn(driver.base);
    await lock?.acquire("shared");
    try {
      return await scope.run({ kind: "run", db: driver.base }, () => fn(driver.base));
    } finally {
      lock?.release("shared");
    }
  }

  async function transaction<T>(fn: () => Promise<T>): Promise<T> {
    await driver.ready;
    const current = scope.getStore();
    if (current?.kind === "transaction") return fn();
    if (current?.kind === "run") {
      throw new Error(
        "transaction() was called inside a run() body; start the transaction first and call run() inside it"
      );
    }
    if (joinsForeign()) return fn();
    await lock?.acquire("exclusive");
    ownTransactions += 1;
    try {
      return await driver.begin((tx) => scope.run({ kind: "transaction", db: tx }, fn));
    } finally {
      ownTransactions -= 1;
      lock?.release("exclusive");
    }
  }

  return {
    dialect: driver.dialect,
    driver: driver.driver,
    ready: driver.ready,
    run,
    transaction,
    query: <Row extends Record<string, unknown>>(statement: SQL) =>
      run(async (db) => (await driver.query(db, statement)) as Row[]),
    execute: (statement: SQL) => run((db) => driver.execute(db, statement)),
    inTransaction: () => scope.getStore()?.kind === "transaction",
    close: () => driver.close(),
  };
}
