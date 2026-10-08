import assert from "node:assert/strict";
import { test } from "node:test";

import { listTables } from "../../kernel/dialect.js";
import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import type { StorageKernel } from "../../kernel/port.js";
import { DROP_UNUSED_DEPLOYMENT_TABLES_ID } from "../0004_drop_unused_deployment_tables.js";
import { CONTENT_MIGRATIONS, migrateContentDatabase } from "../index.js";
import { runMigrations } from "../runner.js";

const RETIRED_TABLES = [
  "deployment_environments",
  "deployment_targets",
  "deployment_runs",
  "releases",
  "deployment_run_events",
];

for (const dialect of ["sqlite", "pglite"] as const) {
  const open = (): StorageKernel<unknown> =>
    dialect === "sqlite" ? openMemorySqliteKernel<unknown>() : openPgliteKernel<unknown>();

  // REGRESSION: fails if 0004 is removed from CONTENT_MIGRATIONS or drops a live table.
  test(`${dialect}: upgrading removes only the five obsolete tables and preserves every live table`, async () => {
    const kernel = open();
    try {
      const previous = CONTENT_MIGRATIONS.filter((step) => step.id < DROP_UNUSED_DEPLOYMENT_TABLES_ID);
      await runMigrations(kernel, previous);
      const before = await listTables(kernel);
      for (const name of RETIRED_TABLES) assert.ok(before.includes(name), `${name} exists before upgrade`);

      // Isolate the retiring step: later migrations legitimately add live tables.
      const step = CONTENT_MIGRATIONS.find((candidate) => candidate.id === DROP_UNUSED_DEPLOYMENT_TABLES_ID);
      assert.ok(step);
      const report = await runMigrations(kernel, [...previous, step]);
      assert.deepEqual(report.applied, [DROP_UNUSED_DEPLOYMENT_TABLES_ID]);
      assert.deepEqual(
        (await listTables(kernel)).sort(),
        before.filter((name) => !RETIRED_TABLES.includes(name)).sort()
      );
      assert.deepEqual((await migrateContentDatabase(kernel)).applied,
        CONTENT_MIGRATIONS.filter(candidate => candidate.id > step.id).map(candidate => candidate.id));
      assert.deepEqual((await migrateContentDatabase(kernel)).applied, [], "booting again applies nothing");

      // PARITY: an already-absent table is harmless, including partial manual cleanup before boot.
      await step.up(kernel, { note: () => {} });
    } finally {
      await kernel.close();
    }
  });

  // REGRESSION: fails if a fresh install stops at the baseline's obsolete deployment tables.
  test(`${dialect}: a fresh database ends without the retired deployment model`, async () => {
    const kernel = open();
    try {
      await migrateContentDatabase(kernel);
      assert.deepEqual((await listTables(kernel)).filter((name) => RETIRED_TABLES.includes(name)), []);
    } finally {
      await kernel.close();
    }
  });
}
