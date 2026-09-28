import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { sql } from "kysely";

import { freshPostgresDatabase } from "../../__tests__/postgres-database.js";
import { openPostgresKernel } from "../../kernel/drivers/postgres.js";
import type { StorageKernel } from "../../kernel/port.js";
import { migrateContentDatabase } from "../index.js";
import { runMigrations } from "../runner.js";
import type { MigrationStep } from "../step.js";

/**
 * @file The runner on REAL Postgres (two independent connections), which PGlite's single
 * connection cannot show: two processes migrating one database at the same moment apply each step
 * exactly once (the advisory lock + ledger re-read), and the frozen baseline applies. Needs the local
 * server (`pg_ctl -D /usr/local/var/postgresql@14 start`); fails, never skips, when it is down.
 */

let first: StorageKernel<unknown>;
let second: StorageKernel<unknown>;
let baseline: StorageKernel<unknown>;

before(() => {
  const url = freshPostgresDatabase("tovu_migrations_pg_fixture");
  first = openPostgresKernel<unknown>({ connectionString: url });
  second = openPostgresKernel<unknown>({ connectionString: url });
  baseline = openPostgresKernel<unknown>({ connectionString: freshPostgresDatabase("tovu_migrations_pg_baseline") });
});

after(async () => {
  await first?.close();
  await second?.close();
  await baseline?.close();
});

test("two connections migrating at once apply a step exactly once", async () => {
  let runs = 0;
  const slow: MigrationStep = {
    id: "0001_slow",
    checksum: "e".repeat(64),
    up: async (kernel) => {
      runs += 1;
      await kernel.execute(sql`CREATE TABLE slow_t (id text PRIMARY KEY)`);
      await new Promise((resolve) => setTimeout(resolve, 150));
    },
  };
  const [a, b] = await Promise.all([runMigrations(first, [slow]), runMigrations(second, [slow])]);
  assert.equal(runs, 1);
  assert.deepEqual([...a.applied, ...b.applied], ["0001_slow"]);
  assert.deepEqual([...a.alreadyApplied, ...b.alreadyApplied], ["0001_slow"]);
});

test("the frozen baseline applies on real Postgres", async () => {
  const report = await migrateContentDatabase(baseline);
  assert.deepEqual(report.applied, ["0000_legacy_baseline"]);
  const [{ n }] = await baseline.query<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`
  );
  assert.equal(n, 93, "92 content tables + tovu_migrations");
});
