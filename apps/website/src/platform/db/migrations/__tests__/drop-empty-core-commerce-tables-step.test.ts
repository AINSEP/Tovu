import assert from "node:assert/strict";
import { test } from "node:test";

import { sql } from "kysely";

import { listTables } from "../../kernel/dialect.js";
import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import type { StorageKernel } from "../../kernel/port.js";
import { readSchemaShape } from "../../kernel/schema-shape.js";
import { DROP_EMPTY_CORE_COMMERCE_TABLES_ID } from "../0011_drop_empty_core_commerce_tables.js";
import { CONTENT_MIGRATIONS, migrateContentDatabase } from "../index.js";
import { runMigrations } from "../runner.js";

/** @file 0011's all-target emptiness guard on SQLite/PGlite, following the 0002/0004 tests. */
const RETIRED_TABLES = [
  "commerce_order_items", "commerce_product_images", "commerce_webhook_events",
  "commerce_orders", "commerce_prices", "commerce_products",
];
const previous = CONTENT_MIGRATIONS.filter(step => step.id < DROP_EMPTY_CORE_COMMERCE_TABLES_ID);
const step = CONTENT_MIGRATIONS.find(candidate => candidate.id === DROP_EMPTY_CORE_COMMERCE_TABLES_ID)!;

for (const dialect of ["sqlite", "pglite"] as const) {
  const open = (): StorageKernel<unknown> =>
    dialect === "sqlite" ? openMemorySqliteKernel<unknown>() : openPgliteKernel<unknown>();

  test(`${dialect}: empty targets drop child-first, all other schema and plugin rows survive, rerun is a no-op`, async () => {
    const kernel = open();
    try {
      assert.ok(step, "0011 must be registered");
      await runMigrations(kernel, previous);
      for (const name of RETIRED_TABLES) assert.ok((await listTables(kernel)).includes(name));
      await kernel.execute(sql`CREATE TABLE p_store__products (id text PRIMARY KEY, title text NOT NULL)`);
      await kernel.execute(sql`CREATE INDEX p_store__products_title ON p_store__products(title)`);
      await kernel.execute(sql`INSERT INTO p_store__products VALUES ('retained', 'plugin product')`);
      const before = await readSchemaShape(kernel, { exclude: RETIRED_TABLES });
      assert.deepEqual((await runMigrations(kernel, [...previous, step])).applied, [step.id]);
      assert.deepEqual((await listTables(kernel)).filter(name => RETIRED_TABLES.includes(name)), []);
      assert.deepEqual(await readSchemaShape(kernel, { exclude: RETIRED_TABLES }), before);
      assert.deepEqual(await kernel.query(sql`SELECT * FROM p_store__products`), [{ id: "retained", title: "plugin product" }]);
      assert.deepEqual((await runMigrations(kernel, [...previous, step])).applied, []);
      await kernel.transaction(() => step.up(kernel, { note: () => {} }));
      assert.deepEqual(await readSchemaShape(kernel, { exclude: RETIRED_TABLES }), before);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: a fresh database ends without core commerce and keeps newsletter tables`, async () => {
    const kernel = open();
    try {
      await migrateContentDatabase(kernel);
      const tables = await listTables(kernel);
      assert.deepEqual(tables.filter(name => RETIRED_TABLES.includes(name)), []);
      for (const name of ["newsletter_campaigns", "newsletter_campaign_revisions"]) assert.ok(tables.includes(name));
    } finally { await kernel.close(); }
  });

  test(`${dialect}: every populated target is named with its exact count before any DROP`, async () => {
    const kernel = open();
    try {
      // Simple tables isolate the guard from FK prerequisites; the upgrade test uses real FKs.
      for (const [index, table] of RETIRED_TABLES.entries()) {
        await kernel.execute(sql`CREATE TABLE ${sql.table(table)} (id text PRIMARY KEY)`);
        for (let row = 0; row <= index; row += 1) await kernel.execute(sql`INSERT INTO ${sql.table(table)} VALUES (${String(row)})`);
      }
      await kernel.execute(sql`CREATE TABLE p_store__orders (id text PRIMARY KEY)`);
      await kernel.execute(sql`INSERT INTO p_store__orders VALUES ('retained')`);
      await runMigrations(kernel, []);
      const before = await readSchemaShape(kernel);
      const execute = kernel.execute.bind(kernel);
      const statements: string[] = [];
      kernel.execute = async statement => {
        statements.push(await kernel.run(db => statement.compile(db).sql));
        await execute(statement);
      };
      await assert.rejects(runMigrations(kernel, [step]), (error: unknown) => {
        assert.ok(error instanceof Error);
        for (const [index, table] of RETIRED_TABLES.entries()) assert.ok(error.message.includes(`${table}: ${index + 1}`), error.message);
        return true;
      });
      assert.deepEqual(statements.filter(statement => /^DROP TABLE/i.test(statement)), [], "refusal must precede every DROP, not merely roll it back");
      assert.deepEqual(await readSchemaShape(kernel), before);
      for (const [index, table] of RETIRED_TABLES.entries()) {
        assert.equal(Number((await kernel.query<{ n: number }>(sql`SELECT count(*) AS n FROM ${sql.table(table)}`))[0].n), index + 1);
      }
      assert.deepEqual(await kernel.query(sql`SELECT * FROM p_store__orders`), [{ id: "retained" }]);
      assert.equal((await listTables(kernel)).includes("tovu_migrations"), false, "the failed first step rolls back ledger creation too");
    } finally { await kernel.close(); }
  });

  test(`${dialect}: a populated last target protects its five empty siblings`, async () => {
    const kernel = open();
    try {
      for (const table of RETIRED_TABLES) await kernel.execute(sql`CREATE TABLE ${sql.table(table)} (id text PRIMARY KEY)`);
      await kernel.execute(sql`INSERT INTO commerce_products VALUES ('retained')`);
      const before = await readSchemaShape(kernel);
      await assert.rejects(kernel.transaction(() => step.up(kernel, { note: () => {} })), /commerce_products: 1/);
      assert.deepEqual(await readSchemaShape(kernel), before);
      assert.deepEqual(await kernel.query(sql`SELECT * FROM commerce_products`), [{ id: "retained" }]);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: missing targets and partial manual cleanup are harmless`, async () => {
    const kernel = open();
    try {
      await kernel.transaction(() => step.up(kernel, { note: () => {} }));
      assert.deepEqual(await listTables(kernel), []);
      await kernel.execute(sql`CREATE TABLE commerce_prices (id text PRIMARY KEY)`);
      await kernel.transaction(() => step.up(kernel, { note: () => {} }));
      assert.deepEqual(await listTables(kernel), []);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: absent or invalid counts refuse before a DROP`, async () => {
    const kernel = open();
    try {
      await kernel.execute(sql`CREATE TABLE commerce_products (id text PRIMARY KEY)`);
      const query = kernel.query.bind(kernel);
      const execute = kernel.execute.bind(kernel);
      const statements: string[] = [];
      kernel.execute = async statement => {
        statements.push(await kernel.run(db => statement.compile(db).sql));
        await execute(statement);
      };
      for (const rows of [[], [{ n: null }], [{ n: "" }], [{ n: "invalid" }], [{ n: -1 }], [{ n: 0.5 }], [{ n: Number.MAX_SAFE_INTEGER + 1 }], [{ n: 0 }, { n: 0 }]]) {
        kernel.query = async <Row>(statement: import("kysely").RawBuilder<Row>): Promise<Row[]> => {
          const text = await kernel.run(db => statement.compile(db).sql);
          return /^SELECT count\(\*\) AS n FROM/.test(text) ? rows as unknown as Row[] : query(statement);
        };
        await assert.rejects(kernel.transaction(() => step.up(kernel, { note: () => {} })), /invalid row count for commerce_products/);
      }
      kernel.query = query;
      assert.deepEqual(statements.filter(statement => /^DROP TABLE/i.test(statement)), []);
      assert.deepEqual(await listTables(kernel), ["commerce_products"]);
    } finally { await kernel.close(); }
  });
}
