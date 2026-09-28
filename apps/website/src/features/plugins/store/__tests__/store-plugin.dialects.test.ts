import assert from "node:assert/strict";
import { test } from "node:test";

import { sql } from "kysely";

import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect, heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { listColumns } from "#src/platform/db/kernel/dialect";
import { activateStore, SEED_PRODUCTS } from "../store-plugin.js";

/**
 * @file The store plugin's data paths on every dialect (storage plan P2): declaring its tables,
 * the once-only seed, listing, and the OCC checkout (decrement + order row in one transaction),
 * one body on SQLite and PGlite. `make` drops the tables this file creates first, since the
 * PGlite instance is shared across the file.
 */

const OWN_TABLES = ["p_store__products", "p_store__orders", "_plugin_migrations", "_plugin_migration_journal", "_plugin_identity"];

function fresh(base: ContentKernel): ContentKernel {
  const pending = OWN_TABLES.reduce(
    (chain, table) => chain.then(() => base.execute(sql`DROP TABLE IF EXISTS ${sql.table(table)}`)),
    Promise.resolve()
  );
  pending.catch(() => {});
  return heldUntil(base, pending);
}

const orderCount = async (kernel: ContentKernel): Promise<number> =>
  Number((await kernel.query<{ n: number }>(sql`SELECT COUNT(*) AS n FROM p_store__orders`))[0].n);

describeEachDialect<ContentKernel>("store plugin data", { tables: [], make: fresh }, (makeKernel, dialect) => {
  test("declares both tables with the manifest's column types", async () => {
    const kernel = makeKernel();
    await activateStore({ db: kernel, dbPath: ":memory:" });
    const integer = dialect === "sqlite" ? "integer" : "bigint";
    const types = async (table: string) => (await listColumns(kernel, table)).map((c) => [c.name, c.type]);
    assert.deepEqual(await types("p_store__products"), [
      ["id", "text"],
      ["title", "text"],
      ["price", integer],
      ["stock", integer],
      ["version", integer],
    ]);
    assert.deepEqual(await types("p_store__orders"), [
      ["id", "text"],
      ["product_id", "text"],
      ["qty", integer],
      ["total", integer],
      ["at", integer],
    ]);
  });

  test("seeds once, lists by title with numeric fields, and a second activation does not re-seed", async () => {
    const kernel = makeKernel();
    await activateStore({ db: kernel, dbPath: ":memory:" });
    const store = await activateStore({ db: kernel, dbPath: ":memory:" });
    const products = await store.listProducts();
    assert.deepEqual(
      products.map((p) => [p.id, p.slug, p.title]),
      [
        ["prod-candle", "prod-candle", "Beeswax Candle"],
        ["prod-teacup", "prod-teacup", "Hand-thrown Teacup"],
        ["prod-notebook", "prod-notebook", "Linen Notebook"],
      ]
    );
    assert.equal(products.length, SEED_PRODUCTS.length);
    assert.deepEqual(products[0], { id: "prod-candle", slug: "prod-candle", title: "Beeswax Candle", price: 1200, stock: 5, version: 0 });
  });

  test("checkout decrements stock, bumps the version and writes one order; refusals write nothing", async () => {
    const kernel = makeKernel();
    const store = await activateStore({ db: kernel, dbPath: ":memory:" });

    const bought = await store.checkout("prod-candle", 2);
    assert.equal(bought.ok, true);
    if (bought.ok) assert.equal(bought.remainingStock, 3);
    const candle = (await store.listProducts()).find((p) => p.id === "prod-candle");
    assert.deepEqual([candle?.stock, candle?.version], [3, 1]);
    assert.equal(await orderCount(kernel), 1);

    assert.deepEqual(await store.checkout("prod-candle", 999), { ok: false, reason: "out-of-stock", retries: 0 });
    assert.deepEqual(await store.checkout("nope", 1), { ok: false, reason: "not-found", retries: 0 });
    assert.equal(await orderCount(kernel), 1);
  });

  test("concurrent checkouts never oversell", async () => {
    const kernel = makeKernel();
    const store = await activateStore({ db: kernel, dbPath: ":memory:" });
    const results = await Promise.all(Array.from({ length: 8 }, () => store.checkout("prod-teacup", 1)));
    assert.equal(results.filter((r) => r.ok).length, 5);
    assert.ok(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "out-of-stock"));
    const teacup = (await store.listProducts()).find((p) => p.id === "prod-teacup");
    assert.equal(teacup?.stock, 0);
    assert.equal(await orderCount(kernel), 5);
  });
});
