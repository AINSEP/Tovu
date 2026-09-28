import { mkdirSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { buildKernel } from "../kernel-core.js";
import type { StorageKernel } from "../port.js";

/**
 * @file The PGlite driver: one in-process Postgres (WASM) per data directory.
 *
 * Repos are typed against Drizzle's `PgDatabase` (not `PgliteDatabase`), so the same `*.pg.ts`
 * adapter runs on node-postgres (Supabase / any Postgres) when that driver lands.
 *
 * PGlite holds one connection with a mutex per transaction: a repo that kept using the base handle
 * inside a transaction would wait on itself forever. The kernel's transaction scope hands the open
 * transaction to every `run()` inside it, which is what makes that safe.
 *
 * Only ONE process may open a data dir (see the plan's process-sharing spike, S0).
 */

export type PgKernelDb<TSchema extends Record<string, unknown>> = PgDatabase<PgQueryResultHKT, TSchema>;
export type PgKernel<TSchema extends Record<string, unknown>> = StorageKernel<PgKernelDb<TSchema>>;

/**
 * Opens (and on first use creates) a PGlite database. Synchronous so it fits the synchronous
 * composition root; the async setup runs behind `ready`, which every kernel call awaits.
 *
 * @param required.schema the Drizzle `pg-core` schema module the repos query.
 * @param optional.dataDir absent = in-memory (tests).
 * @param optional.prepare runs once after open, before any call — schema creation until the
 *   migrator lands (plan slice M1).
 */
export function openPgliteKernel<TSchema extends Record<string, unknown>>(
  required: { schema: TSchema },
  optional: { dataDir?: string; prepare?: (client: PGlite) => Promise<void> } = {}
): PgKernel<TSchema> {
  if (optional.dataDir !== undefined) mkdirSync(optional.dataDir, { recursive: true });
  const client = new PGlite(optional.dataDir);
  const db = drizzle({ client, schema: required.schema }) as unknown as PgKernelDb<TSchema>;
  const ready = (async () => {
    await client.waitReady;
    await optional.prepare?.(client);
  })();
  // Surfaced by every call that awaits `ready`; this only stops an unhandled-rejection crash when
  // nothing has called in yet.
  ready.catch(() => {});
  return buildKernel<PgKernelDb<TSchema>>({
    dialect: "postgres",
    driver: "pglite",
    ready,
    base: db,
    oneConnection: true,
    begin: (body) => db.transaction((tx) => body(tx as unknown as PgKernelDb<TSchema>)),
    // Every Postgres driver's result carries `rows` (PGlite `Results`, node-postgres `QueryResult`);
    // the generic `PgQueryResultHKT` just does not say so.
    query: async (executor, statement) =>
      ((await executor.execute(statement)) as unknown as { rows: Record<string, unknown>[] }).rows,
    execute: async (executor, statement) => {
      await executor.execute(statement);
    },
    async close() {
      await ready.catch(() => {});
      await client.close();
    },
  });
}
