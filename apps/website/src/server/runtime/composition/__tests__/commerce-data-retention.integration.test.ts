import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { sqliteKernel } from "#src/platform/db/kernel/drivers/sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { initSite } from "#src/server/runtime/composition/site-dir";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { openSqliteContentConnection } from "#src/platform/db/sqlite/content-db";
import { closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";
import { copyRowsIntoOlderSchema } from "#src/platform/db/__tests__/helpers/pre-site-title-marker-db";
import { workspaces, members, media } from "#src/platform/db/schema.sqlite";
import { contentKernel } from "#src/platform/db/content-kernel";
import { CONTENT_MIGRATIONS, runMigrations } from "#src/platform/db/migrations/index";
import { DROP_EMPTY_CORE_COMMERCE_TABLES_ID } from "#src/platform/db/migrations/0011_drop_empty_core_commerce_tables";
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
    const schema = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE tbl_name GLOB 'commerce_*' OR tbl_name GLOB 'p_lipay__*' OR tbl_name GLOB 'p_store__*' ORDER BY type, name").all() as Array<{ type: string; name: string; tbl_name: string; sql: string | null }>;
    const retirement = db.prepare("SELECT id FROM tovu_migrations WHERE id = ?").all(DROP_EMPTY_CORE_COMMERCE_TABLES_ID);
    const bookkeeping = ["_plugin_identity", "_plugin_migrations", "_plugin_migration_journal"].map(name => {
      const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
      return { name, rows: exists ? db.prepare(`SELECT * FROM "${name}" WHERE plugin_id IN ('lipay', 'store') ORDER BY rowid`).all() : [] };
    });
    return { rows, schema, bookkeeping, retirement };
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
    const workspace = createSitesWorkspace({}, { homeDir: parent, appDataDir: path.join(parent, "app-data"), env: {}, sourceRoots: [] });
    workspace.updateConfig({ patch: { databases: "inSite" } });
    await initSite({ dir, name: "Commerce off", storage: { kind: "sqlite" } }, { workspace });
    const { contentDbPath: filePath } = resolveSiteDatabasePaths({ dir }, { workspace });
    await bootAndClose(filePath);
    const state = snapshot(filePath);
    assert.deepEqual(state.rows, [], "fresh sites have neither core commerce nor inactive plugin storage");
    assert.deepEqual(state.bookkeeping.flatMap(({ rows }) => rows), []);
    for (const key of ["p_lipay__*", "p_store__*"]) {
      assert.ok(TOVU_CORE_EXTENSION_CLAIMS.some(claim => claim.kind === "table" && claim.key === key), `retain reserved namespace ${key}`);
    }
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

for (const populated of [false, true]) {
  test(`commerce off: plugin storage survives; ${populated ? "populated core refuses boot without changes" : "empty core is removed across two boots"}`, async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "commerce-retention-"));
    try {
      const dir = path.join(parent, "site");
      const workspace = createSitesWorkspace({}, { homeDir: parent, appDataDir: path.join(parent, "app-data"), env: {}, sourceRoots: [] });
      workspace.updateConfig({ patch: { databases: "inSite" } });
      await initSite({ dir, name: "Retained commerce", storage: { kind: "sqlite" } }, { workspace });
      const { contentDbPath: filePath } = resolveSiteDatabasePaths({ dir }, { workspace });
      // initSite closes its handles. Replace only this temporary fixture's database to model an upgrade.
      for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${filePath}${suffix}`, { force: true });
      const db = openSqliteContentConnection(filePath);
      try {
        await runMigrations(sqliteKernel<unknown>(db), CONTENT_MIGRATIONS.filter(step => step.id < DROP_EMPTY_CORE_COMMERCE_TABLES_ID));
        // Only fixture setup declares the historical modules. Production boot must never invoke
        // them or reconcile them against an empty/off inventory.
        for (const decl of [LIPAY_MANIFEST, STORE_MANIFEST]) {
          const result = await declareDataModule({ db: contentKernel(db), dbPath: filePath, decl });
          assert.equal(result.ok, true);
        }
        db.insert(workspaces).values({ id: "retained-ws", name: "Retained", slug: "retained", createdAt: NOW }).run();
        if (populated) {
          // Keep this pre-0011 upgrade fixture historical: current Drizzle also names 0014's
          // kind/original_filename and 0034's members.password_hash columns. The shared copier
          // inserts only columns present here.
          await copyRowsIntoOlderSchema({ target: db, tables: ["members", "media"], populate: current => {
            current.insert(workspaces).values({ id: "retained-ws", name: "Retained", slug: "retained", createdAt: NOW }).run();
            current.insert(members).values({ id: "retained-member", workspaceId: "retained-ws", email: "retained@example.test", status: "active", createdAt: NOW, updatedAt: NOW, version: 9 }).run();
            current.insert(media).values({ id: "retained-media", workspaceId: "retained-ws", title: "Retained", alt: "Retained", caption: "", credit: "", sourceSha256: "retained-hash", status: "active", createdAt: NOW, updatedAt: NOW, version: 3 }).run();
          } });
          // Historical SQL fixtures use the frozen schema, whose Drizzle exports were retired.
          db.$client.prepare("INSERT INTO commerce_products (id, workspace_id, name, slug, kind, status, specs_json, created_at, updated_at, version) VALUES ('retained-product', 'retained-ws', 'Retained', 'retained', 'one_time', 'archived', ?, ?, ?, 7)").run(PAYLOAD, NOW, NOW);
          db.$client.prepare("INSERT INTO commerce_prices (id, workspace_id, product_id, unit_amount_cents, compare_at_amount_cents, currency, status, created_at, version) VALUES ('retained-price', 'retained-ws', 'retained-product', 123, 456, 'usd', 'archived', ?, 4)").run(NOW);
          db.$client.prepare("INSERT INTO commerce_product_images (id, workspace_id, product_id, media_id, position, created_at) VALUES ('retained-image', 'retained-ws', 'retained-product', 'retained-media', 2, ?)").run(NOW);
          db.$client.prepare("INSERT INTO commerce_orders (id, workspace_id, member_id, status, currency, total_amount_cents, provider, provider_payment_ref, provider_event_at, placed_at, created_at, updated_at, version) VALUES ('retained-order', 'retained-ws', 'retained-member', 'paid', 'usd', 123, 'lipay', 'retained-provider-ref', ?, ?, ?, ?, 5)").run(NOW, NOW, NOW, NOW);
          db.$client.prepare("INSERT INTO commerce_order_items (id, workspace_id, order_id, price_id, product_id, description, unit_amount_cents, quantity, currency, created_at) VALUES ('retained-item', 'retained-ws', 'retained-order', 'retained-price', 'retained-product', 'Historical price', 123, 1, 'usd', ?)").run(NOW);
          db.$client.prepare("INSERT INTO commerce_webhook_events (id, workspace_id, provider, event_id, event_type, event_occurred_at, payload_json, status, received_at, processed_at) VALUES ('retained-event', 'retained-ws', 'lipay', 'retained-provider-event', 'succeeded', ?, ?, 'applied', ?, ?)").run(NOW, PAYLOAD, NOW, NOW);
        }
        db.$client.prepare("INSERT INTO p_lipay__payments (id, workspace_id, provider_id, idempotency_key, status, amount_minor, currency, amount_refunded_minor, provider_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("payment", "retained-ws", "lipay", "retained-charge-key", "succeeded", 123, "USD", 12, "retained-ref", 1, 2);
        db.$client.prepare("INSERT INTO p_lipay__events (id, workspace_id, provider_id, provider_event_id, payment_id, kind, occurred_at, received_at, applied, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("event", "retained-ws", "lipay", "retained-delivery", "payment", "succeeded", 1, 2, 1, PAYLOAD);
        db.$client.prepare("INSERT INTO p_lipay__refunds (id, workspace_id, payment_id, idempotency_key, amount_minor, currency, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("refund", "retained-ws", "payment", "retained-refund-key", 12, "USD", "succeeded", 1, 2);
        db.$client.prepare("INSERT INTO p_store__products (id, title, price, stock, version) VALUES (?, ?, ?, ?, ?)").run("retained-stock", "Historical", 123, 17, 8);
        db.$client.prepare("INSERT INTO p_store__orders (id, product_id, qty, total, at) VALUES (?, ?, ?, ?, ?)").run("retained-store-order", "retained-stock", 2, 246, 3);
      } finally { closeSqliteConnection(db); }
      const before = snapshot(filePath);
      assert.equal(before.rows.length, 11);
      assert.deepEqual(before.retirement, []);
      assert.ok(before.rows.every(({ name, rows }) => rows.length === (name.startsWith("commerce_") && !populated ? 0 : 1)));
      const retained = {
        rows: before.rows.filter(({ name }) => !name.startsWith("commerce_")),
        schema: before.schema.filter(({ tbl_name }) => !tbl_name.startsWith("commerce_")),
        bookkeeping: before.bookkeeping,
        retirement: [{ id: DROP_EMPTY_CORE_COMMERCE_TABLES_ID }],
      };
      assert.equal(retained.rows.length, 5, "all store/payment plugin tables have rows at risk");
      for (let boot = 0; boot < 2; boot += 1) {
        if (populated) {
          await assert.rejects(bootAndClose(filePath), (error: unknown) => {
            assert.ok(error instanceof Error);
            for (const { name } of before.rows.filter(({ name }) => name.startsWith("commerce_"))) assert.ok(error.message.includes(`${name}: 1`), error.message);
            return true;
          });
          assert.deepEqual(snapshot(filePath), before, "refused boot preserves all core/plugin rows, schema and bookkeeping without recording 0011");
        } else {
          await bootAndClose(filePath);
          assert.deepEqual(snapshot(filePath), retained, "empty core is removed; plugin rows, schema and declaration bookkeeping remain exact");
        }
      }
    } finally { fs.rmSync(parent, { recursive: true, force: true }); }
  });
}
