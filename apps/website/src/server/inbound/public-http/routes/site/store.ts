import { RESERVED_SEGMENTS } from "#src/platform/routing/reserved-paths";
/**
 * @file SPIKE — public `/store` page + `/store/buy` (D). Renders products that live in a
 * PLUGIN-owned table (`p_store__products`), and a buy action that runs the plugin's checkout
 * (OCC stock decrement + order row in `p_store__orders`). Proves a Tier-3 plugin can own real
 * data AND mutate it from the site. Registered before the site `/:slug` catch-all.
 *
 * Note: `/store/buy` is a GET for spike visibility (clickable in a browser); a real build uses a
 * POST form + CSRF. Left as a GET on purpose so "see it in action" needs no extra middleware.
 */
import type { Express } from "express";

import { siteRelativeTargetReason } from "@jini-ai/cms/redirects";
import type { StoreApi } from "@jini-ai/commerce/store";
import { escapeHtml } from "#src/platform/html/escape";

const STORE_PATH = "/store";

/**
 * The optional caller-chosen return path (e.g. the `/products` theme route), or `/store`.
 *
 * `/store/buy` is an unauthenticated GET, so this value comes from whatever link a visitor followed.
 * It must be path-absolute AND pass the redirects write gate's own site-relative check — a bare
 * `startsWith("/") && !startsWith("//")` test (this route's original check) lets `/\evil.example`
 * through, which Express sends unencoded and a browser follows to `evil.example`.
 *
 * @param raw - `req.query.returnTo` as parsed; a repeated or bracketed parameter is not a string.
 * @returns `raw` when it is a safe on-site path, otherwise `/store`.
 * @complexity O(n) in the value length.
 */
function resolveReturnTo(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/")) return STORE_PATH;
  return siteRelativeTargetReason({ target: raw, reservedSegments: RESERVED_SEGMENTS }, {}) === null ? raw : STORE_PATH;
}

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export function registerStoreRoutes(app: Express, deps: { store?: StoreApi }): void {
  app.get("/store", async (req, res) => {
    const store = deps.store;
    if (!store) {
      res
        .status(200)
        .type("html")
        .send("<!doctype html><h1>Store</h1><p>Store plugin is not enabled in this runtime.</p>");
      return;
    }

    const flash = typeof req.query.msg === "string" ? `<p><em>${escapeHtml(req.query.msg)}</em></p>` : "";
    let products: Awaited<ReturnType<typeof store.listProducts>>;
    try {
      products = await store.listProducts();
    } catch {
      res.status(500).type("html").send("<h1>Store error</h1>");
      return;
    }
    const items = products
      .map((p) => {
        const buy =
          p.stock > 0
            ? `<a href="/store/buy?productId=${encodeURIComponent(p.id)}">Buy 1</a>`
            : `<span>sold out</span>`;
        return `<li><strong>${escapeHtml(p.title)}</strong> — ${money(p.price)} · ${p.stock} in stock · ${buy}</li>`;
      })
      .join("");

    res.type("html").send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1"><title>Store — Tovu</title>` +
        `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem}` +
        `li{margin:.5rem 0}code{background:#f2f2f2;padding:.1rem .3rem;border-radius:3px}</style></head>` +
        `<body><h1>Store</h1>` +
        `<p>These products come from <strong>plugin-owned tables</strong> (<code>p_store__products</code>, ` +
        `<code>p_store__orders</code>), created by core through the snapshot-before-DDL seam.</p>` +
        `${flash}<ul>${items}</ul><p><a href="/">← Home</a></p></body></html>`
    );
  });

  app.get("/store/buy", async (req, res) => {
    const store = deps.store;
    const returnTo = resolveReturnTo(req.query.returnTo);
    if (!store) {
      res.redirect(returnTo);
      return;
    }
    const productId = String(req.query.productId ?? "");
    let result: Awaited<ReturnType<typeof store.checkout>>;
    try {
      result = await store.checkout({ productId: productId, qty: 1 });
    } catch {
      res.status(500).type("html").send("<h1>Store error</h1>");
      return;
    }
    const msg = result.ok
      ? `Purchased — order ${result.orderId}, ${result.remainingStock} left.`
      : `Could not buy: ${result.reason}.`;
    const target = new URL(returnTo, "http://store-return.invalid");
    // Keep the established message encoding while preserving authored query and fragment parts.
    const query = target.search ? `${target.search}&` : "?";
    res.redirect(`${target.pathname}${query}msg=${encodeURIComponent(msg)}${target.hash}`);
  });
}
