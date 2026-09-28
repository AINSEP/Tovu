import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";

import { PGlite, type Transaction } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";

import * as pgSchema from "../schema.postgres.js";
import * as sqliteSchema from "../schema.sqlite.js";
import type { ContentDb } from "../sqlite/content-db.js";
import { hasPgContentSchema, pgContentSchemaSql } from "./content-schema.js";

/**
 * @file The PGlite content store: one in-process Postgres (WASM) per data directory, the storage
 * kernel the `TOVU_CONTENT_STORE=pglite` prototype runs on (plan:
 * `ADS-memory/.local-artifacts/plans/2026-09-28-pglite-adapter-slices.md`).
 *
 * - Schema: created ONCE, on an empty data dir, from `schema.postgres.ts` through the same DDL the
 *   SQLite→Postgres copy writes (`features/database-transfer`), so there is one Postgres layout, not
 *   two. There are no Postgres migrations yet; a schema change after the first boot is not applied.
 * - Import: on that same first boot, when `importFrom` is given, the site's existing `posts` and
 *   `post_revisions` rows are copied over (read-only on the SQLite side), in the same transaction as
 *   the DDL — a crash leaves an empty data dir and the next boot starts over.
 * - Transactions: {@link PgliteContentStore.transaction} keeps the open transaction in
 *   AsyncLocalStorage and {@link PgliteContentStore.executor} hands it to every repo call made inside
 *   it. PGlite holds a mutex for a whole transaction, so a repo that kept using the base handle
 *   inside one would wait on itself forever (the "ambient transaction" deadlock in the SQLite
 *   lock-in audit, §3.1).
 *
 * Only ONE process may open a data dir. The API process owns it; see `selectPostRepo`.
 */

export type PgliteContentDb = PgliteDatabase<typeof pgSchema>;
type PgliteTx = Parameters<Parameters<PgliteContentDb["transaction"]>[0]>[0];
/** What a repo runs its statements on: the open transaction, or the base handle. */
export type PgliteExecutor = PgliteContentDb | PgliteTx;

export interface PgliteContentStore {
  /** Resolves once the schema (and the one-time import) is in place; every repo call awaits it. */
  readonly ready: Promise<void>;
  executor(): PgliteExecutor;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Rows per INSERT during the one-time import (keeps each statement's parameter count small). */
const IMPORT_BATCH = 200;

async function importRows(tx: Transaction, from: ContentDb): Promise<void> {
  // Drizzle only needs `query` from its client for inserts, which a PGlite `Transaction` has; this
  // keeps the import inside the raw transaction the DDL runs in.
  const target = drizzle({ client: tx as unknown as PGlite });
  const pairs = [
    [sqliteSchema.posts, pgSchema.posts],
    [sqliteSchema.postRevisions, pgSchema.postRevisions],
  ] as const;
  for (const [source, into] of pairs) {
    const rows = from.select().from(source).all();
    for (let at = 0; at < rows.length; at += IMPORT_BATCH) {
      await target.insert(into).values(rows.slice(at, at + IMPORT_BATCH) as never);
    }
  }
}

async function bootstrap(client: PGlite, importFrom: ContentDb | undefined): Promise<void> {
  if (await hasPgContentSchema(client)) return;
  await client.transaction(async (tx) => {
    await tx.exec(pgContentSchemaSql());
    if (importFrom !== undefined) await importRows(tx, importFrom);
  });
}

/**
 * Opens (and on first use creates) a PGlite content store. Synchronous so it fits the synchronous
 * composition root; the async setup runs behind {@link PgliteContentStore.ready}.
 *
 * @param optional.dataDir absent = in-memory (tests).
 * @param optional.importFrom the SQLite content db whose posts seed a brand-new data dir.
 */
export function openPgliteContentStore(optional: { dataDir?: string; importFrom?: ContentDb }): PgliteContentStore {
  if (optional.dataDir !== undefined) mkdirSync(optional.dataDir, { recursive: true });
  const client = new PGlite(optional.dataDir);
  const db = drizzle({ client, schema: pgSchema });
  const ready = bootstrap(client, optional.importFrom);
  // Surfaced by every repo call that awaits `ready`; this only stops an unhandled-rejection crash
  // when nothing has called in yet.
  ready.catch(() => {});
  const open = new AsyncLocalStorage<PgliteTx>();

  return {
    ready,
    executor: () => open.getStore() ?? db,
    async transaction(fn) {
      await ready;
      // Nested call inside this store's own transaction: same unit of work, no savepoint.
      if (open.getStore() !== undefined) return fn();
      return db.transaction((tx) => open.run(tx, fn));
    },
    async close() {
      await ready.catch(() => {});
      await client.close();
    },
  };
}

