import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { listColumns, listIndexes, tableExists } from "#src/platform/db/kernel/dialect";
import { openMemorySqliteKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { openPgliteKernel } from "#src/platform/db/kernel/drivers/pglite";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { runMigrations } from "../runner.js";
import { publishBackstop } from "../0007_publish_backstop.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";
import { CONTENT_MIGRATIONS } from "../index.js";

/** Owner follow-up 2026-10-04 / ADR-066: additive audit storage, both dialects, exactly once. */
const adapters: { name: string; make: () => StorageKernel<unknown> }[] = [
  { name: "sqlite", make: () => openMemorySqliteKernel<unknown>() },
  { name: "pglite", make: () => openPgliteKernel<unknown>() },
];

test("publish backstop step is registered after submission IP retention with its new pin", () => {
  assert.equal(CONTENT_MIGRATIONS.at(-2)?.id, "0006_submission_ip_retention");
  assert.equal(CONTENT_MIGRATIONS.at(-1)?.id, "0007_publish_backstop");
  assert.equal(CONTENT_MIGRATIONS.at(-1)?.checksum, MIGRATION_CHECKSUMS["0007_publish_backstop"]);
  assert.equal(CONTENT_MIGRATIONS.filter(step => step.id === "0007_publish_backstop").length, 1);
});

for (const adapter of adapters) {
  test(`[${adapter.name}] publish backstop migration creates durable audit data and both indexes exactly once`, async () => {
    // Start empty: eachDialect's full-content fixture already applies 0007, hiding a missing step.
    const kernel = adapter.make();
    const step = publishBackstop({ checksum: MIGRATION_CHECKSUMS["0007_publish_backstop"]! });
    const options = { ledgerTable: "publish_backstop_test_migrations" };
    try {
      assert.equal(await tableExists(kernel, "publish_backstop_log"), false);
      assert.deepEqual((await runMigrations(kernel, [step], options)).applied, ["0007_publish_backstop"]);
      const columns = await listColumns(kernel, "publish_backstop_log");
      assert.deepEqual(columns.map(column => column.name), [
        "id", "workspace_id", "direction", "actor_id", "destination", "reason", "at",
        "items_json", "gap_labels_json", "result", "run_id", "details_json", "inverses_json",
      ]);
      for (const column of columns) {
        assert.equal(column.notNull, column.name !== "run_id", column.name);
        assert.equal(column.type.toLowerCase(), kernel.dialect === "postgres" && column.name.endsWith("_json") ? "jsonb" : "text", column.name);
      }
      assert.deepEqual([...await listIndexes(kernel, "publish_backstop_log")].sort(), [
        ["publish_backstop_log_run", { name: "publish_backstop_log_run", columns: ["workspace_id", "run_id"], unique: false }],
        ["publish_backstop_log_workspace_at", { name: "publish_backstop_log_workspace_at", columns: ["workspace_id", "at"], unique: false }],
      ]);
      const inverses = [{ kind: "row", table: "posts", pk: { id: "p1" }, before: { title: "Before" } }];
      const insert = (id: string, direction: string) => kernel.execute(sql`INSERT INTO publish_backstop_log
        (id, workspace_id, direction, actor_id, destination, reason, at, items_json, gap_labels_json, result, run_id, details_json, inverses_json)
        VALUES (${id}, 'ws', ${direction}, 'owner', 'https://live.example', 'Manual fix', '2026-10-04T00:00:00.000Z',
          '[]', '[]', 'success', NULL, '{}', ${JSON.stringify(inverses)})`);
      await insert("source-1", "source");
      await insert("destination-1", "destination");
      await assert.rejects(insert("invalid", "sideways"), /check constraint|CHECK constraint/i);
      assert.deepEqual((await runMigrations(kernel, [step], options)).applied, []);
      const rows = await kernel.query<{ direction: string; run_id: string | null; inverses: string }>(
        sql`SELECT direction, run_id, CAST(inverses_json AS text) AS inverses FROM publish_backstop_log ORDER BY direction`);
      assert.deepEqual(rows.map(row => ({ ...row, inverses: JSON.parse(row.inverses) })), [
        { direction: "destination", run_id: null, inverses }, { direction: "source", run_id: null, inverses },
      ]);
    } finally {
      await kernel.close();
    }
  });
}
