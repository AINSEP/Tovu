import assert from "node:assert/strict";
import { after, test } from "node:test";

import { sql } from "kysely";

import { openPostgresKernel } from "../drivers/postgres.js";
import type { StorageKernel } from "../port.js";
import { freshPostgresDatabase } from "../../__tests__/postgres-database.js";

/**
 * @file The node-postgres pool survives the server dropping one of its idle connections (restart,
 * failover, `pg_terminate_backend`, a pooler's idle cut). node-postgres reports that as an `'error'`
 * event on the pool; with no listener, the EventEmitter throws and the process dies. Runs against a
 * REAL Postgres server and fails (never skips) when it is down.
 */

const APP = "tovu_pool_error_probe";
const url = `${freshPostgresDatabase("tovu_kernel_pg_pool_error_fixture")}&application_name=${APP}`;
const probed: StorageKernel<unknown> = openPostgresKernel<unknown>({ connectionString: url });
const killer: StorageKernel<unknown> = openPostgresKernel<unknown>({ connectionString: url.replace(APP, `${APP}_killer`) });

after(async () => {
  await probed.close();
  await killer.close();
});

test("a server-terminated idle pool connection does not crash the process, and the kernel reconnects", async () => {
  await probed.execute(sql`SELECT 1`);

  const terminated = await killer.query<{ ok: boolean }>(
    sql`SELECT pg_terminate_backend(pid) AS ok FROM pg_stat_activity WHERE application_name = ${APP}`
  );
  assert.deepEqual(
    terminated.map((row) => row.ok),
    [true]
  );
  // Give the pool's idle client time to see the socket close and emit 'error'.
  await new Promise((resolve) => setTimeout(resolve, 300));

  const again = await probed.query<{ n: number }>(sql`SELECT 1 AS n`);
  assert.equal(again[0]?.n, 1);
});
