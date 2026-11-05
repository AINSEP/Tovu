import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { sql } from "kysely";

import { listIndexes, listTables } from "../../kernel/dialect.js";
import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import { openMemorySqliteKernel, openSqliteFileKernel } from "../../kernel/drivers/sqlite.js";
import type { StorageKernel } from "../../kernel/port.js";
import { readSchemaShape } from "../../kernel/schema-shape.js";
import { CONTENT_MIGRATIONS } from "../index.js";
import { runMigrations } from "../runner.js";

const ARCHIVE_ID = "0011_archive_legacy_commerce";
const DROP_ID = "0011_drop_empty_core_commerce_tables";
const TABLES = ["commerce_order_items", "commerce_product_images", "commerce_webhook_events",
  "commerce_orders", "commerce_prices", "commerce_products"];
const archiveName = (table: string) => `_archive_0011_${table}`;
const steps = () => CONTENT_MIGRATIONS.filter(step => [ARCHIVE_ID, DROP_ID].includes(step.id));

/** Small historical table set with cross-table FKs, an external parent, indexes and opaque bytes. */
async function seed(kernel: StorageKernel<unknown>): Promise<void> {
  await kernel.execute(sql`CREATE TABLE retained_content (id text PRIMARY KEY)`);
  await kernel.execute(sql`INSERT INTO retained_content VALUES ('content')`);
  await kernel.execute(sql`CREATE TABLE commerce_products (id text PRIMARY KEY, content_id text REFERENCES retained_content(id), payload text)`);
  await kernel.execute(sql`CREATE TABLE commerce_prices (id text PRIMARY KEY, product_id text REFERENCES commerce_products(id))`);
  await kernel.execute(sql`CREATE TABLE commerce_orders (id text PRIMARY KEY)`);
  await kernel.execute(sql`CREATE TABLE commerce_order_items (id text PRIMARY KEY, order_id text REFERENCES commerce_orders(id), price_id text REFERENCES commerce_prices(id))`);
  await kernel.execute(sql`CREATE TABLE commerce_product_images (id text PRIMARY KEY, product_id text REFERENCES commerce_products(id))`);
  await kernel.execute(sql`CREATE TABLE commerce_webhook_events (id text PRIMARY KEY, payload text)`);
  await kernel.execute(sql`CREATE INDEX retained_commerce_payload ON commerce_products(payload)`);
  await kernel.execute(sql`INSERT INTO commerce_products VALUES ('product', 'content', ' { "old": [3, 2, 1] } ')`);
  await kernel.execute(sql`INSERT INTO commerce_prices VALUES ('price', 'product')`);
  await kernel.execute(sql`INSERT INTO commerce_orders VALUES ('order')`);
  await kernel.execute(sql`INSERT INTO commerce_order_items VALUES ('item', 'order', 'price')`);
  for (const table of ["p_store__products", "p_lipay__payments"]) {
    await kernel.execute(sql`CREATE TABLE ${sql.table(table)} (id text PRIMARY KEY)`);
    await kernel.execute(sql`INSERT INTO ${sql.table(table)} VALUES ('plugin')`);
  }
}

/** Assert preserved content and actual FK enforcement, rather than just renamed table presence. */
async function assertRetained(kernel: StorageKernel<unknown>): Promise<void> {
  const tables = await listTables(kernel);
  for (const table of TABLES) {
    assert.ok(tables.includes(archiveName(table)), `keep even empty sibling ${table}`);
    assert.equal(tables.includes(table), false);
  }
  assert.deepEqual(await kernel.query(sql`SELECT * FROM _archive_0011_commerce_products`),
    [{ id: "product", content_id: "content", payload: ' { "old": [3, 2, 1] } ' }]);
  assert.deepEqual(await kernel.query(sql`SELECT * FROM _archive_0011_commerce_order_items`),
    [{ id: "item", order_id: "order", price_id: "price" }]);
  assert.ok((await listIndexes(kernel, "_archive_0011_commerce_products")).has("retained_commerce_payload"));
  await assert.rejects(kernel.execute(sql`DELETE FROM _archive_0011_commerce_prices WHERE id = 'price'`));
  await assert.rejects(kernel.execute(sql`DELETE FROM retained_content WHERE id = 'content'`));
  for (const table of ["p_store__products", "p_lipay__payments"]) {
    assert.deepEqual(await kernel.query(sql`SELECT * FROM ${sql.table(table)}`), [{ id: "plugin" }]);
  }
}

for (const dialect of ["sqlite", "pglite"] as const) {
  const open = () => dialect === "sqlite" ? openMemorySqliteKernel<unknown>() : openPgliteKernel<unknown>();

  test(`${dialect}: populated core archives the complete related set, warns and permits unchanged 0011`, async () => {
    const kernel = open();
    try {
      await seed(kernel);
      assert.deepEqual(steps().map(step => step.id), [ARCHIVE_ID, DROP_ID]);
      const report = await runMigrations(kernel, steps());
      assert.deepEqual(report.applied, [ARCHIVE_ID, DROP_ID]);
      assert.equal(report.notes.length, 1);
      assert.match(report.notes[0]!, /WARNING.*archiv/i);
      assert.match(report.notes[0]!, /preserved/i);
      assert.match(report.notes[0]!, /_archive_0011_commerce_products/);
      await assertRetained(kernel);
      assert.deepEqual((await runMigrations(kernel, steps())).applied, []);
      await kernel.transaction(() => steps()[0]!.up(kernel, { note: () => assert.fail("repeat must be silent") }));
      await assertRetained(kernel);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: empty, missing and already-upgraded tables do not create archives`, async () => {
    for (const state of ["missing", "empty", "already-upgraded"]) {
      const kernel = open();
      try {
        if (state === "empty") for (const table of TABLES) await kernel.execute(sql`CREATE TABLE ${sql.table(table)} (id text PRIMARY KEY)`);
        if (state === "already-upgraded") await runMigrations(kernel, steps().filter(step => step.id === DROP_ID));
        const report = await runMigrations(kernel, steps());
        assert.ok(report.applied.includes(ARCHIVE_ID), "pending IDs before an applied 0011 must run");
        assert.deepEqual(report.notes, []);
        assert.deepEqual((await listTables(kernel)).filter(table => /commerce/.test(table)), []);
      } finally { await kernel.close(); }
    }
  });

  test(`${dialect}: one populated last table protects its empty siblings; partial sets are supported`, async () => {
    const kernel = open();
    try {
      for (const table of ["commerce_prices", "commerce_products"]) await kernel.execute(sql`CREATE TABLE ${sql.table(table)} (id text PRIMARY KEY)`);
      await kernel.execute(sql`INSERT INTO commerce_products VALUES ('only-row')`);
      await runMigrations(kernel, steps());
      assert.deepEqual((await listTables(kernel)).filter(table => table.startsWith("_archive_")).sort(),
        ["_archive_0011_commerce_prices", "_archive_0011_commerce_products"]);
      assert.deepEqual(await kernel.query(sql`SELECT * FROM _archive_0011_commerce_products`), [{ id: "only-row" }]);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: an archive-name collision refuses before any rename and preserves both sets`, async () => {
    const kernel = open();
    try {
      await seed(kernel);
      await kernel.execute(sql`CREATE TABLE _archive_0011_commerce_products (id text PRIMARY KEY)`);
      await kernel.execute(sql`INSERT INTO _archive_0011_commerce_products VALUES ('older-archive')`);
      const before = await readSchemaShape(kernel);
      const execute = kernel.execute.bind(kernel);
      kernel.execute = async statement => {
        const text = await kernel.run(db => statement.compile(db).sql);
        assert.doesNotMatch(text, /^ALTER TABLE/i, "preflight every archive name before renaming");
        await execute(statement);
      };
      await assert.rejects(runMigrations(kernel, steps()), /_archive_0011_commerce_products.*backup/i);
      assert.deepEqual(await readSchemaShape(kernel), before);
      assert.deepEqual(await kernel.query(sql`SELECT * FROM _archive_0011_commerce_products`), [{ id: "older-archive" }]);
      assert.deepEqual(await kernel.query(sql`SELECT id FROM commerce_products`), [{ id: "product" }]);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: a failed rename rolls back the entire set and its ledger entry`, async () => {
    const kernel = open();
    try {
      await seed(kernel);
      const before = await readSchemaShape(kernel);
      const execute = kernel.execute.bind(kernel);
      let renames = 0;
      kernel.execute = async statement => {
        const text = await kernel.run(db => statement.compile(db).sql);
        if (/^ALTER TABLE/i.test(text) && ++renames === 3) throw new Error("injected rename failure");
        await execute(statement);
      };
      await assert.rejects(runMigrations(kernel, steps()), /injected rename failure/);
      assert.equal(renames, 3);
      assert.deepEqual(await readSchemaShape(kernel), before);
      assert.deepEqual(await kernel.query(sql`SELECT id FROM commerce_products`), [{ id: "product" }]);
      kernel.execute = execute;
      await runMigrations(kernel, steps());
      await assertRetained(kernel);
    } finally { await kernel.close(); }
  });
}

test("SQLite: concurrent openers archive once; pre-change and post-change backups restore all rows", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "commerce-archive-"));
  const file = path.join(dir, "content.db");
  const first = openSqliteFileKernel<unknown>(file);
  const second = openSqliteFileKernel<unknown>(file);
  try {
    await seed(first);
    const before = path.join(dir, "before.db");
    await first.backupTo(before);
    const reports = await Promise.all([runMigrations(first, steps()), runMigrations(second, steps())]);
    assert.deepEqual(reports.flatMap(report => report.applied).sort(), [ARCHIVE_ID, DROP_ID]);
    assert.equal(reports.flatMap(report => report.notes).length, 1);
    const after = path.join(dir, "after.db");
    await first.backupTo(after);
    for (const backup of [before, after]) {
      const restored = openSqliteFileKernel<unknown>(backup);
      try {
        await runMigrations(restored, steps());
        await assertRetained(restored);
      } finally { await restored.close(); }
    }
  } finally {
    await first.close();
    await second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
