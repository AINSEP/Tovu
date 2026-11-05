import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { sql } from "kysely";

import { dropDatabase, freshPostgresDatabase } from "../../__tests__/postgres-database.js";
import { listTables } from "../../kernel/dialect.js";
import { openPostgresKernel } from "../../kernel/drivers/postgres.js";
import type { StorageKernel } from "../../kernel/port.js";
import { CONTENT_MIGRATIONS } from "../index.js";
import { runMigrations } from "../runner.js";

const ARCHIVE_ID = "0011_archive_legacy_commerce";
const TABLES = ["commerce_order_items", "commerce_product_images", "commerce_webhook_events",
  "commerce_orders", "commerce_prices", "commerce_products"];
const steps = CONTENT_MIGRATIONS.filter(step => [ARCHIVE_ID, "0011_drop_empty_core_commerce_tables"].includes(step.id));

/** Verify restored archives still contain the original data, index and enforced FK. */
async function assertRetained(kernel: StorageKernel<unknown>): Promise<void> {
  const tables = await listTables(kernel);
  for (const name of TABLES) {
    assert.ok(tables.includes(`_archive_0011_${name}`));
    assert.equal(tables.includes(name), false);
  }
  assert.deepEqual(await kernel.query(sql`SELECT * FROM _archive_0011_commerce_products`), [{ id: "product", payload: ' { "retained": true } ' }]);
  assert.deepEqual(await kernel.query(sql`SELECT * FROM _archive_0011_commerce_prices`), [{ id: "price", product_id: "product" }]);
  assert.deepEqual(await kernel.query(sql`SELECT * FROM p_lipay__payments`), [{ id: "plugin-payment" }]);
  await assert.rejects(kernel.execute(sql`DELETE FROM _archive_0011_commerce_products WHERE id = 'product'`));
  assert.equal((await kernel.query(sql`SELECT 1 FROM pg_indexes WHERE schemaname = current_schema()
    AND tablename = '_archive_0011_commerce_products' AND indexname = 'retained_product_payload'`)).length, 1);
}

test("Postgres: concurrent upgrades archive once with stable relation identities; dumps restore all rows", async () => {
  const database = "tovu_commerce_archive_pg";
  const restoreDatabase = "tovu_commerce_archive_restore_pg";
  const url = freshPostgresDatabase(database);
  const first = openPostgresKernel<unknown>({ connectionString: url });
  const second = openPostgresKernel<unknown>({ connectionString: url });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "commerce-archive-pg-"));
  try {
    await first.execute(sql`CREATE TABLE commerce_products (id text PRIMARY KEY, payload text)`);
    await first.execute(sql`CREATE TABLE commerce_prices (id text PRIMARY KEY, product_id text REFERENCES commerce_products(id))`);
    for (const table of TABLES.slice(0, 4)) await first.execute(sql`CREATE TABLE ${sql.table(table)} (id text PRIMARY KEY)`);
    await first.execute(sql`CREATE INDEX retained_product_payload ON commerce_products(payload)`);
    await first.execute(sql`INSERT INTO commerce_products VALUES ('product', ' { "retained": true } ')`);
    await first.execute(sql`INSERT INTO commerce_prices VALUES ('price', 'product')`);
    await first.execute(sql`CREATE TABLE p_lipay__payments (id text PRIMARY KEY)`);
    await first.execute(sql`INSERT INTO p_lipay__payments VALUES ('plugin-payment')`);
    const before = await first.query<{ relname: string; oid: number }>(sql`SELECT relname, oid FROM pg_class
      WHERE relnamespace = current_schema()::regnamespace AND (relname IN (${sql.join(TABLES)}) OR relname = 'retained_product_payload') ORDER BY oid`);
    const preChange = path.join(dir, "before.dump");
    execFileSync("pg_dump", ["--dbname", url, "--no-owner", "--no-privileges", "--format=custom", "--file", preChange], { timeout: 15_000 });
    const reports = await Promise.all([runMigrations(first, steps), runMigrations(second, steps)]);
    assert.deepEqual(reports.flatMap(report => report.applied).sort(), steps.map(step => step.id));
    assert.equal(reports.flatMap(report => report.notes).length, 1);
    assert.match(reports.flatMap(report => report.notes)[0]!, /WARNING.*preserved/);
    const after = await first.query<{ relname: string; oid: number }>(sql`SELECT relname, oid FROM pg_class
      WHERE oid IN (${sql.join(before.map(row => row.oid))}) ORDER BY oid`);
    assert.deepEqual(after, before.map(row => ({ ...row,
      relname: row.relname === "retained_product_payload" ? row.relname : `_archive_0011_${row.relname}` })));
    await assertRetained(first);
    assert.deepEqual((await runMigrations(second, steps)).applied, []);
    const postChange = path.join(dir, "after.dump");
    execFileSync("pg_dump", ["--dbname", url, "--no-owner", "--no-privileges", "--format=custom", "--file", postChange], { timeout: 15_000 });
    for (const dump of [preChange, postChange]) {
      const restoreUrl = freshPostgresDatabase(restoreDatabase);
      execFileSync("pg_restore", ["--dbname", restoreUrl, "--no-owner", "--no-privileges", "--exit-on-error", dump], { timeout: 15_000 });
      const restored = openPostgresKernel<unknown>({ connectionString: restoreUrl });
      try {
        await runMigrations(restored, steps);
        await assertRetained(restored);
      } finally { await restored.close(); }
    }
  } finally {
    await first.close();
    await second.close();
    dropDatabase({ database });
    dropDatabase({ database: restoreDatabase });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
