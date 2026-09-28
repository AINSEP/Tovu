import { dirname } from "node:path";

import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import { buildKernel } from "../kernel-core.js";
import type { StorageKernel } from "../port.js";
import { PGLITE_SOCKET_FILE } from "./pglite-owner.js";
import { PG_PARSERS } from "./pg-types.js";
import { postgresLockKey } from "./postgres-lock.js";

/**
 * @file A storage kernel that reaches a PGlite data dir through its owner's Unix socket
 * (`pglite-owner.ts`): node-postgres with ONE connection and the kernel's turn lock, because PGlite
 * is one backend session — a second connection gives no parallelism, and every client's transaction
 * blocks every other client anyway (S0 spike). The API process and the agent daemon both use this.
 *
 * Kernel rules this transport makes hard: no `SET` (only `SET LOCAL`), no temp tables, no named
 * prepared statements, no session advisory locks — all clients share one session, so any of those
 * leaks into the other process. Backup is not offered here; it goes through the owner.
 *
 * TODO(R1f): report transport `"pglite-socket"` once `StorageTransport` (port.ts) has it; this
 * slice adds new files only, so it reports `"node-postgres"` for now.
 */

const types = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    return PG_PARSERS[oid] ?? pg.types.getTypeParser(oid, format as "text");
  },
};

export function openPgliteSocketKernel<DB>(required: { socketPath: string }): StorageKernel<DB> {
  if (!required.socketPath.endsWith(`/${PGLITE_SOCKET_FILE}`)) {
    throw new Error(`a PGlite socket path ends in /${PGLITE_SOCKET_FILE}: ${required.socketPath}`);
  }
  const pool = new pg.Pool({
    host: dirname(required.socketPath),
    port: 5432,
    user: "postgres",
    database: "postgres",
    max: 1,
    // Keep the one connection: every new one's startup waits behind any open transaction.
    idleTimeoutMillis: 0,
    types,
  });
  // An idle connection dropped by the owner (restart, idle-in-transaction timeout) is evicted by the
  // pool and reopened on next use; without a listener it would crash the process.
  pool.on("error", () => {});
  const base = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  return buildKernel<DB>({
    dialect: "postgres",
    transport: "node-postgres",
    capabilities: { interactiveTransactions: true, atomicBatch: true, transactionalDdl: true, backup: false },
    ready: Promise.resolve(),
    base,
    oneConnection: true,
    begin: (body) => base.transaction().execute((tx) => body(tx)),
    lockKey: postgresLockKey,
    close: () => base.destroy(),
  });
}
