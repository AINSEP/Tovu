import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import { buildKernel } from "../kernel-core.js";
import type { StorageKernel } from "../port.js";
import { PG_PARSERS } from "./pg-types.js";
import { postgresLockKey } from "./postgres-lock.js";

/**
 * @file The node-postgres driver: a connection POOL to any Postgres server (local, Supabase, Neon).
 * Kysely's own Postgres dialect; each transaction checks out its own connection, so unrelated
 * requests run concurrently (no turn lock) and `lockKey` is what serializes the sequences that
 * must not interleave.
 *
 * Not wired into any site yet (storage-adapter plan slice R1); the concurrency tests use it against
 * a real server.
 */

/** node-postgres type parsing aligned with PGlite's (`pg-types.ts`), for this pool only. */
const types = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    return PG_PARSERS[oid] ?? pg.types.getTypeParser(oid, format as "text");
  },
};

export function openPostgresKernel<DB>(required: { connectionString: string; max?: number }): StorageKernel<DB> {
  const pool = new pg.Pool({ connectionString: required.connectionString, max: required.max ?? 10, types });
  const base = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  return buildKernel<DB>({
    dialect: "postgres",
    transport: "node-postgres",
    capabilities: { interactiveTransactions: true, atomicBatch: true, transactionalDdl: true, backup: false },
    ready: Promise.resolve(),
    base,
    oneConnection: false,
    begin: (body) => base.transaction().execute((tx) => body(tx)),
    lockKey: postgresLockKey,
    close: () => base.destroy(),
  });
}
