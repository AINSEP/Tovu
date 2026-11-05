import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import {
  commerceOrderPaymentRepoFor, commercePriceProviderRefRepoFor,
  commercePriceRepoFor, commerceProductRepoFor,
} from "@jini-ai/commerce/repo";
import type { CommerceDatabase } from "@jini-ai/commerce/repo";
import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import { listTables } from "../../kernel/dialect.js";
import { COMMERCE_MIGRATIONS, CONTENT_MIGRATIONS, migrateCommerceDatabase } from "../index.js";

const AT = "2026-11-05T19:00:00.000Z";
const TABLES = ["commerce_order_items", "commerce_order_payments", "commerce_orders", "commerce_price_provider_refs",
  "commerce_prices", "commerce_product_images", "commerce_products", "commerce_webhook_events"].sort();

for (const dialect of ["sqlite", "pglite"] as const) {
  test(`[${dialect}] activation creates exactly the borrowed catalog once without importing historical rows`, async t => {
    const kernel = dialect === "sqlite" ? openMemorySqliteKernel<CommerceDatabase>() : openPgliteKernel<CommerceDatabase>();
    t.after(() => kernel.close());
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
    const refs = commercePriceProviderRefRepoFor({ kernel });
    const payments = commerceOrderPaymentRepoFor({ kernel });
    await products.save({ id: "product", workspaceId: "workspace", name: "Book", slug: "book", kind: "one_time", status: "active", createdAt: AT, updatedAt: AT, version: 1 });
    await prices.save({ id: "price", workspaceId: "workspace", productId: "product", unitAmount: { minorUnits: 1200, currency: "JPY" }, status: "active", createdAt: AT, version: 1 });
    const scope = { workspaceId: "workspace", siteId: "site", providerId: "provider", providerAccountId: "account", mode: "test" as const };
    await refs.save({ ...scope, priceId: "price", providerPriceRef: "price_remote", createdAt: AT });
    assert.equal(await refs.find({ ...scope, priceId: "price" }), "price_remote");
    assert.equal(await refs.find({ ...scope, mode: "live", priceId: "price" }), null);
    const reservation = { ...scope, orderId: "order", amount: { minorUnits: 1200, currency: "JPY" }, createdAt: AT };
    assert.equal(await payments.reserve(reservation), "reserved");
    assert.equal(await payments.reserve(reservation), "same_scope");
    assert.equal(await payments.reserve({ ...reservation, providerAccountId: "foreign" }), "conflict");
    assert.deepEqual((await migrateCommerceDatabase({ kernel })).applied, []);
    assert.equal((await products.findById({ workspaceId: "workspace", id: "product" }))?.name, "Book");
    assert.equal((await prices.findById({ workspaceId: "workspace", id: "price" }))?.unitAmount.minorUnits, 1200);
  });
}
