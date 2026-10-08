import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { initSite } from "#src/platform/site-dir/init-site";
import { openSqliteContentConnection } from "#src/platform/db/sqlite/content-db";
import { closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";
import { commerceProducts, commercePrices, commerceOrders, commerceOrderItems, commerceProductImages, commerceWebhookEvents, workspaces, members, media } from "#src/platform/db/schema.sqlite";
import { declareDataModule } from "#src/features/plugins/data-module";
import { LIPAY_MANIFEST } from "#src/features/plugins/lipay/manifest";
import { STORE_MANIFEST } from "#src/features/plugins/store/manifest";
import { buildBootModules } from "../../boot/bootstrap.js";
import { runBootLifecycle } from "../../lifecycle/boot-lifecycle.js";
import { createSiteRouteDeps } from "../deps.js";
import { TOVU_CORE_EXTENSION_CLAIMS } from "../core-extension-claims.js";

const NOW = "2026-10-07T00:00:00.000Z";
const PAYLOAD = ' { "event": "retained", "opaque": [3, 2, 1] }\n';

/** Compare values and schema, not database-file bytes: unrelated boot services legitimately write
 * their own rows. Payload whitespace, stock, versions, replay keys and journals must stay exact. */
function snapshot(filePath: string) {
  const db = new Database(filePath, { readonly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name GLOB 'commerce_*' OR name GLOB 'p_lipay__*' OR name GLOB 'p_store__*') ORDER BY name").all() as { name: string }[];
    const rows = tables.map(({ name }) => ({ name, rows: db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY id`).all() }));
    const schema = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE tbl_name GLOB 'commerce_*' OR tbl_name GLOB 'p_lipay__*' OR tbl_name GLOB 'p_store__*' ORDER BY type, name").all();
    const bookkeeping = ["_plugin_identity", "_plugin_migrations", "_plugin_migration_journal"].map(name => {
      const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
      return { name, rows: exists ? db.prepare(`SELECT * FROM "${name}" WHERE plugin_id IN ('lipay', 'store') ORDER BY rowid`).all() : [] };
    });
    return { rows, schema, bookkeeping };
  } finally { db.close(); }
}

/** Drain every boot task before comparison and close the composition's complete store (chat too). */
async function bootAndClose(filePath: string): Promise<void> {
  let closeStore: (() => Promise<void>) | undefined;
  const deps = await createSiteRouteDeps(filePath, { onStoreOpened: store => { closeStore = () => store.close(); } });
  try {
    const modules = buildBootModules(deps, { useMemory: false, defaultContentDbPath: () => filePath });
    assert.equal(modules.some(module => module.name === "store-plugin"), false);
    // Exercise the data-related serve lifecycle without starting unrelated plugin polling.
    const result = await runBootLifecycle(modules.filter(module => ["database-migration-reconciliation", "settings", "seo", "comments"].includes(module.name)));
    assert.equal(result.ok, true);
    await Promise.all([deps.identityReady, deps.settingsReady, deps.seoReady, deps.commentsReady, deps.commentsSettingsReady, deps.executionSettingsReady, deps.settingsUiTabsReady, deps.analyticsSettingsReady, deps.siteTitleReady, deps.pluginRuntimeReady, deps.blobHydrationReady, deps.adminPasswordResetReady]);
  } finally { await closeStore?.(); }
}

test("commerce off: a fresh site does not activate payment or store storage", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "commerce-fresh-off-"));
  try {
    const dir = path.join(parent, "site");
    await initSite({ dir, name: "Commerce off", storage: { kind: "sqlite" } });
    const filePath = path.join(dir, "content.db");
    await bootAndClose(filePath);
    const state = snapshot(filePath);
    assert.deepEqual(state.rows.filter(({ name }) => name.startsWith("p_lipay__") || name.startsWith("p_store__")), []);
    assert.deepEqual(state.bookkeeping.flatMap(({ rows }) => rows), []);
    for (const key of ["p_lipay__*", "p_store__*"]) {
      assert.ok(TOVU_CORE_EXTENSION_CLAIMS.some(claim => claim.kind === "table" && claim.key === key), `retain reserved namespace ${key}`);
    }
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test("commerce off: all eleven historical commerce tables and declaration records survive two real boots unchanged", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "commerce-retention-"));
  try {
    const dir = path.join(parent, "site");
    await initSite({ dir, name: "Retained commerce", storage: { kind: "sqlite" } });
    const filePath = path.join(dir, "content.db");
    const db = openSqliteContentConnection(filePath);
    try {
      // Only fixture setup declares the historical modules. Production boot must never invoke
      // them or reconcile them against an empty/off inventory.
      for (const decl of [LIPAY_MANIFEST, STORE_MANIFEST]) {
        const result = await declareDataModule({ db, dbPath: filePath, decl });
        assert.equal(result.ok, true);
      }
      db.insert(workspaces).values({ id: "retained-ws", name: "Retained", slug: "retained", createdAt: NOW }).run();
      db.insert(members).values({ id: "retained-member", workspaceId: "retained-ws", email: "retained@example.test", status: "active", createdAt: NOW, updatedAt: NOW, version: 9 }).run();
      db.insert(media).values({ id: "retained-media", workspaceId: "retained-ws", title: "Retained", alt: "Retained", caption: "", credit: "", sourceSha256: "retained-hash", status: "active", createdAt: NOW, updatedAt: NOW, version: 3 }).run();
      db.insert(commerceProducts).values({ id: "retained-product", workspaceId: "retained-ws", name: "Retained", slug: "retained", kind: "one_time", status: "archived", specsJson: PAYLOAD, createdAt: NOW, updatedAt: NOW, version: 7 }).run();
      db.insert(commercePrices).values({ id: "retained-price", workspaceId: "retained-ws", productId: "retained-product", unitAmountCents: 123, compareAtAmountCents: 456, currency: "usd", status: "archived", createdAt: NOW, version: 4 }).run();
      db.insert(commerceProductImages).values({ id: "retained-image", workspaceId: "retained-ws", productId: "retained-product", mediaId: "retained-media", position: 2, createdAt: NOW }).run();
      db.insert(commerceOrders).values({ id: "retained-order", workspaceId: "retained-ws", memberId: "retained-member", status: "paid", currency: "usd", totalAmountCents: 123, provider: "lipay", providerPaymentRef: "retained-provider-ref", providerEventAt: NOW, placedAt: NOW, createdAt: NOW, updatedAt: NOW, version: 5 }).run();
      db.insert(commerceOrderItems).values({ id: "retained-item", workspaceId: "retained-ws", orderId: "retained-order", priceId: "retained-price", productId: "retained-product", description: "Historical price", unitAmountCents: 123, quantity: 1, currency: "usd", createdAt: NOW }).run();
      db.insert(commerceWebhookEvents).values({ id: "retained-event", workspaceId: "retained-ws", provider: "lipay", eventId: "retained-provider-event", eventType: "succeeded", eventOccurredAt: NOW, payloadJson: PAYLOAD, status: "applied", receivedAt: NOW, processedAt: NOW }).run();
      db.$client.prepare("INSERT INTO p_lipay__payments (id, workspace_id, provider_id, idempotency_key, status, amount_minor, currency, amount_refunded_minor, provider_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("payment", "retained-ws", "lipay", "retained-charge-key", "succeeded", 123, "USD", 12, "retained-ref", 1, 2);
      db.$client.prepare("INSERT INTO p_lipay__events (id, workspace_id, provider_id, provider_event_id, payment_id, kind, occurred_at, received_at, applied, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("event", "retained-ws", "lipay", "retained-delivery", "payment", "succeeded", 1, 2, 1, PAYLOAD);
      db.$client.prepare("INSERT INTO p_lipay__refunds (id, workspace_id, payment_id, idempotency_key, amount_minor, currency, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("refund", "retained-ws", "payment", "retained-refund-key", 12, "USD", "succeeded", 1, 2);
      db.$client.prepare("INSERT INTO p_store__products (id, title, price, stock, version) VALUES (?, ?, ?, ?, ?)").run("retained-stock", "Historical", 123, 17, 8);
      db.$client.prepare("INSERT INTO p_store__orders (id, product_id, qty, total, at) VALUES (?, ?, ?, ?, ?)").run("retained-store-order", "retained-stock", 2, 246, 3);
    } finally { closeSqliteConnection(db); }
    const before = snapshot(filePath);
    assert.equal(before.rows.length, 11);
    assert.ok(before.rows.every(({ rows }) => rows.length === 1), "every retained table has data at risk");
    for (let boot = 0; boot < 2; boot += 1) {
      await bootAndClose(filePath);
      assert.deepEqual(snapshot(filePath), before, "off boot cannot mutate rows, schema or commerce declaration bookkeeping");
    }
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});
