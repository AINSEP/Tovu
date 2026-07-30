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

import type { RouteDeps } from "../types";

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function registerStoreRoutes(app: Express, deps: RouteDeps): void {
  app.get("/store", (req, res) => {
    const store = deps.store;
    if (!store) {
      res
        .status(200)
        .type("html")
        .send("<!doctype html><h1>Store</h1><p>Store plugin is not enabled in this runtime.</p>");
      return;
    }

    const flash = typeof req.query.msg === "string" ? `<p><em>${escapeHtml(req.query.msg)}</em></p>` : "";
    const items = store
      .listProducts()
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

  app.get("/store/buy", (req, res) => {
    const store = deps.store;
    // Optional caller-chosen return path (e.g. the `/products` theme route), same allowlist
    // `safeHref` in render.ts uses for content links: only in-page-relative paths, never an
    // absolute/protocol-relative URL an attacker could smuggle into an open redirect.
    const returnToRaw = String(req.query.returnTo ?? "/store");
    const returnTo = returnToRaw.startsWith("/") && !returnToRaw.startsWith("//") ? returnToRaw : "/store";
    if (!store) {
      res.redirect(returnTo);
      return;
    }
    const productId = String(req.query.productId ?? "");
    const result = store.checkout(productId, 1);
    const msg = result.ok
      ? `Purchased — order ${result.orderId}, ${result.remainingStock} left.`
      : `Could not buy: ${result.reason}.`;
    res.redirect(`${returnTo}?msg=${encodeURIComponent(msg)}`);
  });
}
