import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";

import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import { optimisticConcurrencyVersions } from "../0042_optimistic_concurrency_versions.js";
import { runMigrations } from "../runner.js";

test("0042 gives all six legacy and new editable rows a non-null version of one", async t => {
  const kernel = openMemorySqliteKernel<unknown>();
  t.after(() => kernel.close());
  const tables = ["webhook_subscriptions", "external_mcp_servers", "identity_users", "roles", "policies", "workspaces"] as const;
  for (const table of tables) {
    await kernel.execute(sql`CREATE TABLE ${sql.table(table)} (id TEXT PRIMARY KEY, label TEXT NOT NULL)`);
    await kernel.execute(sql`INSERT INTO ${sql.table(table)} VALUES ('legacy', ${`Original ${table}`})`);
  }
  const steps = [optimisticConcurrencyVersions({ checksum: "a".repeat(64) })];
  assert.deepEqual((await runMigrations({ kernel, steps })).applied, ["0042_optimistic_concurrency_versions"]);

  for (const table of tables) {
    await kernel.execute(sql`INSERT INTO ${sql.table(table)} (id, label) VALUES ('new', 'New row')`);
    await assert.rejects(kernel.execute(sql`INSERT INTO ${sql.table(table)} (id, label, version) VALUES ('bad', 'No version', NULL)`), {
      code: "SQLITE_CONSTRAINT_NOTNULL",
      message: `NOT NULL constraint failed: ${table}.version`,
    });
    assert.deepEqual(await kernel.query(sql`SELECT id, label, version FROM ${sql.table(table)} ORDER BY id`), [
      { id: "legacy", label: `Original ${table}`, version: 1 },
      { id: "new", label: "New row", version: 1 },
    ]);
  }
  assert.deepEqual((await runMigrations({ kernel, steps })).alreadyApplied, ["0042_optimistic_concurrency_versions"]);
});
