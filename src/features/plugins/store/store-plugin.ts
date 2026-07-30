/**
 * @file SPIKE — the sample Tier-3 store plugin (C) + checkout.
 *
 * The simplest real plugin that owns tables: it DECLARES `p_store__products` and `p_store__orders`
 * (which core creates through the never-brick dataModule seam, B), seeds products, and exposes a
 * read API + a checkout the site route (D) renders. Tier-3 = trusted/first-party/local (ADR-024):
 * full access, honestly labeled, never in the public marketplace. Exploratory spike beyond
 * ADR-023 §12's v1 disposition.
 *
 * §7/§8 note: reads here are raw `SELECT` scoped to the plugin namespace (ADR-023 §8); writes go
 * direct for the spike (a real build routes writes through the typed core repository, §7).
 */
import Database from "better-sqlite3";

import { declareDataModule, type DataModuleDecl } from "../data-module";

export interface Product {
  id: string;
  title: string;
  price: number; // cents
  stock: number;
  version: number;
}

export type CheckoutResult =
  | { ok: true; orderId: string; remainingStock: number; retries: number }
  | { ok: false; reason: "not-found" | "out-of-stock" | "conflict"; retries: number };

export interface StoreApi {
  listProducts(): Product[];
  /** Buy `qty` of a product: an OCC-guarded stock decrement plus an order row. */
  checkout(productId: string, qty: number): CheckoutResult;
}

export const STORE_PLUGIN_ID = "store";
const PRODUCTS = `p_${STORE_PLUGIN_ID}__products`;
const ORDERS = `p_${STORE_PLUGIN_ID}__orders`;

export const STORE_MANIFEST: DataModuleDecl = {
  pluginId: STORE_PLUGIN_ID,
  pluginTier: "tier-2",
  provenance: { sourceUrl: "builtin://store", publisher: "tovu-core" },
  tables: [
    {
      name: "products",
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        { name: "title", type: "TEXT", notNull: true },
        { name: "price", type: "INTEGER", notNull: true },
        { name: "stock", type: "INTEGER", notNull: true },
        { name: "version", type: "INTEGER", notNull: true },
      ],
    },
    {
      name: "orders",
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        { name: "product_id", type: "TEXT", notNull: true },
        { name: "qty", type: "INTEGER", notNull: true },
        { name: "total", type: "INTEGER", notNull: true },
        { name: "at", type: "INTEGER", notNull: true },
      ],
    },
  ],
};

export const SEED_PRODUCTS: Product[] = [
  { id: "prod-teacup", title: "Hand-thrown Teacup", price: 2800, stock: 5, version: 0 },
  { id: "prod-notebook", title: "Linen Notebook", price: 1600, stock: 5, version: 0 },
  { id: "prod-candle", title: "Beeswax Candle", price: 1200, stock: 5, version: 0 },
];

/** Declare the store's tables through core (snapshot→DDL), seed once, and return the store API. */
export async function activateStore(
  required: { db: Database.Database; dbPath: string },
  _optional: Record<string, never> = {}
): Promise<StoreApi> {
  const { db, dbPath } = required;
  const result = await declareDataModule({ db, dbPath, decl: STORE_MANIFEST });
  if (!result.ok) {
    throw new Error(`store dataModule declaration failed: ${result.error?.code} — ${result.error?.message}`);
  }

  const count = (db.prepare(`SELECT COUNT(*) AS n FROM "${PRODUCTS}"`).get() as { n: number }).n;
  if (count === 0) {
    const insert = db.prepare(`INSERT INTO "${PRODUCTS}" (id, title, price, stock, version) VALUES (?, ?, ?, ?, ?)`);
    db.transaction(() => {
      for (const p of SEED_PRODUCTS) insert.run(p.id, p.title, p.price, p.stock, p.version);
    })();
  }

  function checkout(productId: string, qty: number): CheckoutResult {
    const maxAttempts = 5;
    let retries = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const product = db
        .prepare(`SELECT price, stock, version FROM "${PRODUCTS}" WHERE id = ?`)
        .get(productId) as { price: number; stock: number; version: number } | undefined;
      if (!product) return { ok: false, reason: "not-found", retries };
      if (product.stock < qty) return { ok: false, reason: "out-of-stock", retries };

      const orderId = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // The stock decrement and the order insert are TWO writes. They are atomic here ONLY because
      // this spike store holds a direct DB handle. A real Tier-3 plugin behind the frozen async ABI
      // (ADR-024 §3) CANNOT hold a transaction across the seam — which is exactly why core must own
      // an atomic multi-write primitive (see the cowork ABI finding → ADR-026).
      const committed = db.transaction(() => {
        const dec = db
          .prepare(`UPDATE "${PRODUCTS}" SET stock = stock - ?, version = version + 1 WHERE id = ? AND version = ?`)
          .run(qty, productId, product.version);
        if (dec.changes === 0) return false; // OCC conflict — the row moved under us; retry
        db.prepare(`INSERT INTO "${ORDERS}" (id, product_id, qty, total, at) VALUES (?, ?, ?, ?, ?)`).run(
          orderId,
          productId,
          qty,
          product.price * qty,
          Date.now()
        );
        return true;
      })();

      if (!committed) {
        retries += 1;
        continue;
      }
      return { ok: true, orderId, remainingStock: product.stock - qty, retries };
    }
    return { ok: false, reason: "conflict", retries };
  }

  return {
    listProducts(): Product[] {
      return db
        .prepare(`SELECT id, title, price, stock, version FROM "${PRODUCTS}" ORDER BY title`)
        .all() as Product[];
    },
    checkout,
  };
}

/**
 * Boot helper: open a dedicated connection to the site db and activate the store on it.
 *
 * `busy_timeout` (SPEC-033 fix): this dedicated connection is a SEPARATE handle to the same
 * `content.db` file the main composition-root connection also writes to (Newsletter's and
 * Comments' dataModule declares, settings/SEO seeding, `menuBindingsReady`'s unsequenced write —
 * none of which this connection waits for). Without a busy timeout, any transient lock held by
 * one of those writers at the exact moment this connection opens throws `SQLITE_BUSY`
 * ("database is locked") immediately instead of retrying — caught via a live multi-boot smoke
 * test after ADR-046 Phase 2's boot-lifecycle reordering pushed this connection's open later in
 * the boot sequence, making the collision reproduce deterministically. 5s comfortably covers any
 * of those writers' actual duration.
 */
export async function bootstrapStore(dbPath: string): Promise<StoreApi> {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  return activateStore({ db, dbPath });
}
