import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { sql } from "kysely";
import {
  commerceOrderPaymentRepoFor, commerceOrderRepoFor, commercePriceProviderRefRepoFor,
  commercePriceRepoFor, commerceProductRepoFor,
} from "@jini-ai/commerce/repo";
import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import { openPostgresKernel } from "../../kernel/drivers/postgres.js";
import { listTables } from "../../kernel/dialect.js";
import { COMMERCE_MIGRATIONS, CONTENT_MIGRATIONS, migrateCommerceDatabase } from "../index.js";

const AT = "2026-11-05T19:00:00.000Z";
const LARGE_MINOR = 2_147_483_648;
const TABLES = ["commerce_order_items", "commerce_order_payments", "commerce_orders", "commerce_price_provider_refs",
  "commerce_prices", "commerce_product_images", "commerce_products", "commerce_webhook_events"].sort();

/** Dedicated native pool: startup search_path scopes the migration's raw DDL to this test schema. */
async function kernelFor(t: import("node:test").TestContext, dialect: "sqlite" | "pglite" | "postgres") {
  if (dialect === "sqlite") return openMemorySqliteKernel<unknown>();
  if (dialect === "pglite") return openPgliteKernel<unknown>();
  const connection = new URL(process.env.COMMERCE_PG_URL ?? `postgresql://${encodeURIComponent(process.env.PGUSER ?? "la")}@/postgres`);
  if (!process.env.COMMERCE_PG_URL) {
    connection.searchParams.set("host", process.env.PGHOST ?? "/tmp");
    if (process.env.PGPORT) connection.searchParams.set("port", process.env.PGPORT);
  }
  const admin = openPostgresKernel<unknown>({ connectionString: connection.href });
  const schema = `commerce_catalog_${randomUUID().replaceAll("-", "")}`;
  await admin.execute(sql`CREATE SCHEMA ${sql.id(schema)}`);
  connection.searchParams.set("options", `-c search_path=${schema}`);
  const kernel = openPostgresKernel<unknown>({ connectionString: connection.href, max: 3 });
  t.after(async () => {
    await kernel.close();
    try { await admin.execute(sql`DROP SCHEMA ${sql.id(schema)} CASCADE`); }
    finally { await admin.close(); }
  });
  return kernel;
}

for (const dialect of ["sqlite", "pglite", "postgres"] as const) {
  test(`[${dialect}] activation creates exactly the borrowed catalog once without importing historical rows`, async t => {
    const kernel = await kernelFor(t, dialect);
    if (dialect !== "postgres") t.after(() => kernel.close());
    await kernel.execute(sql`CREATE TABLE p_store__products (id text PRIMARY KEY, name text NOT NULL)`);
    await kernel.execute(sql`INSERT INTO p_store__products VALUES ('historical', 'Do not import')`);
    await kernel.execute(sql`CREATE TABLE commerce_products (id text PRIMARY KEY)`);
    await kernel.execute(sql`INSERT INTO commerce_products VALUES ('archived')`);
    await kernel.execute(sql`ALTER TABLE commerce_products RENAME TO _archive_0011_commerce_products`);
    // Archive renames retain historical index identities; activation must coexist with them.
    await kernel.execute(sql`CREATE INDEX idx_commerce_prices_product ON _archive_0011_commerce_products(id)`);
    await kernel.execute(sql`CREATE INDEX idx_commerce_order_items_order ON _archive_0011_commerce_products(id)`);
    assert.deepEqual((await listTables(kernel)).filter(table => table.startsWith("commerce_")), []);
    assert.ok(CONTENT_MIGRATIONS.every(step => !COMMERCE_MIGRATIONS.includes(step)), "ordinary CMS boot must not activate commerce");
    const activations = await Promise.all([migrateCommerceDatabase({ kernel }), migrateCommerceDatabase({ kernel })]);
    assert.deepEqual(activations.flatMap(report => report.applied), COMMERCE_MIGRATIONS.map(step => step.id));
    assert.deepEqual((await listTables(kernel)).filter(table => table.startsWith("commerce_")).sort(), TABLES);
    assert.deepEqual(await kernel.query(sql`SELECT * FROM commerce_products`), []);
    assert.deepEqual(await kernel.query(sql`SELECT * FROM p_store__products`), [{ id: "historical", name: "Do not import" }]);
    assert.deepEqual(await kernel.query(sql`SELECT * FROM _archive_0011_commerce_products`), [{ id: "archived" }]);

    const products = commerceProductRepoFor({ kernel });
    const prices = commercePriceRepoFor({ kernel });
    const orders = commerceOrderRepoFor({ kernel });
    const refs = commercePriceProviderRefRepoFor({ kernel });
    const payments = commerceOrderPaymentRepoFor({ kernel });
    await products.save({ id: "product", workspaceId: "workspace", name: "Book", slug: "book", kind: "one_time", status: "active", createdAt: AT, updatedAt: AT, version: 1 });
    await prices.save({ id: "price", workspaceId: "workspace", productId: "product", unitAmount: { minorUnits: LARGE_MINOR, currency: "JPY" },
      compareAtAmount: { minorUnits: LARGE_MINOR + 1, currency: "JPY" }, status: "active", createdAt: AT, version: 1 });
    await orders.placeOrder({ order: { id: "order", workspaceId: "workspace", memberId: "buyer", status: "pending",
      totalAmount: { minorUnits: LARGE_MINOR, currency: "JPY" }, provider: "provider", placedAt: AT, createdAt: AT, updatedAt: AT, version: 1 },
      items: [{ id: "item", workspaceId: "workspace", orderId: "order", priceId: "price", productId: "product", description: "Book",
        unitAmount: { minorUnits: LARGE_MINOR, currency: "JPY" }, quantity: 1, createdAt: AT }] });
    const scope = { workspaceId: "workspace", siteId: "site", providerId: "provider", providerAccountId: "account", mode: "test" as const };
    await refs.save({ ...scope, priceId: "price", providerPriceRef: "price_remote", createdAt: AT });
    assert.equal(await refs.find({ ...scope, priceId: "price" }), "price_remote");
    assert.equal(await refs.find({ ...scope, mode: "live", priceId: "price" }), null);
    const reservation = { ...scope, orderId: "order", amount: { minorUnits: LARGE_MINOR, currency: "JPY" }, createdAt: AT };
    assert.equal(await payments.reserve(reservation), "reserved");
    assert.equal(await payments.reserve(reservation), "same_scope");
    assert.equal(await payments.reserve({ ...reservation, providerAccountId: "foreign" }), "conflict");
    assert.deepEqual((await migrateCommerceDatabase({ kernel })).applied, []);
    assert.equal((await products.findById({ workspaceId: "workspace", id: "product" }))?.name, "Book");
    const price = await prices.findById({ workspaceId: "workspace", id: "price" });
    assert.deepEqual([price?.unitAmount.minorUnits, price?.compareAtAmount?.minorUnits], [LARGE_MINOR, LARGE_MINOR + 1]);
    assert.equal((await orders.findById({ workspaceId: "workspace", id: "order" }))?.totalAmount.minorUnits, LARGE_MINOR);
    assert.equal((await orders.listItems({ workspaceId: "workspace", orderId: "order" }))[0]?.unitAmount.minorUnits, LARGE_MINOR);
  });
}
