/**
 * @file SPIKE — tests for the sample Tier-3 store plugin activation (C).
 *
 * Proves the store plugin declares its table through the core dataModule seam (B: snapshot→DDL),
 * seeds products idempotently, and exposes a read API that lists them.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { activateStore, SEED_PRODUCTS } from "../store-plugin.js";

function tempDb(): { db: Database.Database; dbPath: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-store-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return { db, dbPath, dir };
}

test("store: activation declares p_store__products (via the never-brick seam) and seeds it", async () => {
  const { db, dbPath, dir } = tempDb();
  const store = await activateStore({ db, dbPath });

  const tableExists = !!db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='p_store__products'`)
    .get();
  assert.ok(tableExists, "the plugin-owned table was created by core");

  const products = store.listProducts();
  assert.equal(products.length, SEED_PRODUCTS.length);
  assert.deepEqual(
    products.map((p) => p.title),
    ["Beeswax Candle", "Hand-thrown Teacup", "Linen Notebook"] // sorted by title
  );
  assert.ok(products.every((p) => typeof p.price === "number"));

  // A pre-DDL snapshot was written (never-brick anchor from B). The snapshot FILE itself is gone by
  // now -- `discardCommittedSnapshot` deletes it right after a successful commit (ADR-023 §4
  // amendment, 2026-08-02, `snapshot.ts`), since a committed migration's recovery window has
  // already closed and nothing reads it after that. The durable, intended record that the
  // never-brick seam actually ran BEFORE the DDL is `_plugin_migrations.snapshot_path` -- written
  // from the same `snapshotPath` value that `declareDataModule` computed prior to opening the DDL
  // transaction, on the very row that records the `CREATE TABLE` for `p_store__products` (see
  // `data-module.ts`'s `applyTableCreate` -> `recordMigration`).
  const migrationRow = db
    .prepare(`SELECT snapshot_path FROM _plugin_migrations WHERE table_name = 'p_store__products' ORDER BY id ASC LIMIT 1`)
    .get() as { snapshot_path: string | null } | undefined;
  assert.ok(migrationRow, "expected a _plugin_migrations row for the store's CREATE TABLE");
  assert.match(
    migrationRow!.snapshot_path ?? "",
    /content\.db\.snapshot-store-\d+$/,
    "core snapshotted before creating the store's table"
  );

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("store: activation is idempotent — a second boot does not double-seed", async () => {
  const { db, dbPath, dir } = tempDb();
  await activateStore({ db, dbPath });
  const store2 = await activateStore({ db, dbPath }); // simulate a restart
  assert.equal(store2.listProducts().length, SEED_PRODUCTS.length, "still one set of products");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("store: checkout decrements stock (OCC) and records an order", async () => {
  const { db, dbPath, dir } = tempDb();
  const store = await activateStore({ db, dbPath });

  const before = store.listProducts().find((p) => p.id === "prod-candle")!;
  const result = store.checkout("prod-candle", 2);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.remainingStock, before.stock - 2);
    assert.ok(result.orderId.startsWith("ord-"));
  }
  const after = store.listProducts().find((p) => p.id === "prod-candle")!;
  assert.equal(after.stock, before.stock - 2, "stock decremented");
  assert.equal(after.version, before.version + 1, "OCC version bumped");
  assert.equal(
    (db.prepare(`SELECT COUNT(*) AS n FROM p_store__orders WHERE product_id = ?`).get("prod-candle") as { n: number }).n,
    1,
    "an order row was written"
  );

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("store: checkout refuses out-of-stock and unknown products (no order, no decrement)", async () => {
  const { db, dbPath, dir } = tempDb();
  const store = await activateStore({ db, dbPath });

  const tooMany = store.checkout("prod-candle", 999);
  assert.deepEqual(tooMany, { ok: false, reason: "out-of-stock", retries: 0 });

  const missing = store.checkout("nope", 1);
  assert.deepEqual(missing, { ok: false, reason: "not-found", retries: 0 });

  assert.equal(
    (db.prepare(`SELECT COUNT(*) AS n FROM p_store__orders`).get() as { n: number }).n,
    0,
    "no orders written for refused checkouts"
  );

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
