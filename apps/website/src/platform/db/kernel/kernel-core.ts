import { AsyncLocalStorage } from "node:async_hooks";

import type { Kysely } from "kysely";

import {
  type StorageCapabilities,
  type StorageDialect,
  type StorageKernel,
  type StorageTransport,
  UnsupportedCapabilityError,
} from "./port.js";
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
export interface KernelDriver<DB> {
  dialect: StorageDialect;
  transport: StorageTransport;
  capabilities: StorageCapabilities;
  ready: Promise<void>;
  base: Kysely<DB>;
  /** One real transaction; `body` gets its executor. Commit on resolve, roll back on throw. */
  begin<T>(body: (tx: Kysely<DB>) => Promise<T>): Promise<T>;
  /** `StorageKernel.lockKey` on the open transaction's executor. */
  lockKey(tx: Kysely<DB>, key: string): Promise<void>;
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

type Scope<DB> = { kind: "run" | "transaction"; db: Kysely<DB> };

export function buildKernel<DB>(driver: KernelDriver<DB>): StorageKernel<DB> {
  const scope = new AsyncLocalStorage<Scope<DB>>();
  const lock = driver.oneConnection ? new TurnLock() : undefined;
  let ownTransactions = 0;
  const joinsForeign = () => ownTransactions === 0 && driver.foreignTransactionOpen?.() === true;

  function require(capability: keyof StorageCapabilities): void {
    if (!driver.capabilities[capability]) throw new UnsupportedCapabilityError(capability, driver.transport);
  }

  async function run<T>(fn: (db: Kysely<DB>) => T | Promise<T>): Promise<T> {
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
    require("interactiveTransactions");
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

  async function lockKey(key: string): Promise<void> {
    const current = scope.getStore();
    // A joined legacy transaction counts: it is the same `BEGIN IMMEDIATE` on SQLite.
    if (current?.kind !== "transaction" && !joinsForeign()) {
      throw new Error("lockKey() must be called inside transaction()");
    }
    await driver.lockKey(current?.db ?? driver.base, key);
  }

  return {
    dialect: driver.dialect,
    transport: driver.transport,
    capabilities: driver.capabilities,
    ready: driver.ready,
    run,
    transaction,
    lockKey,
    query: async (statement) => (await run((db) => statement.execute(db))).rows,
    execute: async (statement) => {
      await run((db) => statement.execute(db));
    },
    inTransaction: () => scope.getStore()?.kind === "transaction",
    require,
    close: () => driver.close(),
  };
}
