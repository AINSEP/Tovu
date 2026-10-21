import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createCommerceSiteTestApp as createApp } from "./commerce-site-app.js";
import { resolveStorefrontProducts } from "../products.js";
import type { CommerceSiteTestDeps } from "./commerce-site-app.js";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { Product, StoreApi } from "#src/features/plugins/store/store-plugin";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";

/**
 * @file Route-level coverage for `registerProductRoutes` — real HTTP requests against the
 * route (via `createApp`), with a fake StoreApi rather than a real plugin database. This file
 * proves the route renders plugin products and handles an absent or empty store; persistence
 * invariants belong to the store plugin's own tests.
 *
 * Deliberately does not touch `/api/admin/v1/auth/login` or anything else `packet-one-routes
 * .test.ts` exercises — that keeps this file isolated from that suite's unrelated, independently
 * observed flakiness under this session's heavy concurrent load.
 */

function fakeStore(required: { products: Product[] }, _optional: Record<string, never> = {}): StoreApi {
  return {
    listProducts: async () => required.products,
    checkout: async () => ({ ok: false, reason: "not-found", retries: 0 }),
  };
}

async function startServer(overrides: Partial<CommerceSiteTestDeps>) {
  const deps = { ...createRouteDeps(), ...overrides };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test("GET /products renders a store-plugin product with its formatted price and compare-at price", async (t) => {
  const product: Product & { compareAtPrice: number } = {
    id: "prod-1", slug: "classic-boxy-tee", title: "Classic Boxy Tee",
    price: 3500, compareAtPrice: 4500, stock: 5, version: 1,
  };

  const theme = createRouteDeps().themes.find((theme) => theme.manifest.id === "fashion-modern");
  assert.ok(theme, "the compare-at fixture must use the shipped storefront template");
  const { server, baseUrl } = await startServer({
    themes: [theme],
    store: fakeStore({ products: [product] }),
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Classic Boxy Tee/);
  assert.match(html, /\$35\.00/);
  const card = /<li\b[^>]*class="product-card"[^>]*>([\s\S]*?)<\/li>/.exec(html);
  assert.ok(card, "the product must render a storefront card");
  assert.match(card[1], /Classic Boxy Tee/);
  assert.match(card[1], /class="product-card__price-current">\$35\.00<\/span>/);
  assert.match(card[1], /class="product-card__price-compare">\$45\.00<\/span>/);
});

test("GET /products/:id renders the single store-plugin product's detail route", async (t) => {
  const product: Product = {
    id: "prod-1", slug: "classic-boxy-tee", title: "Classic Boxy Tee",
    price: 3500, stock: 5, version: 1,
  };

  const { server, baseUrl } = await startServer({
    store: fakeStore({ products: [product] }),
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products/prod-1`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Classic Boxy Tee/);
});

function storeProduct(required: { id: string; title: string; slug: string }, optional: { compareAtPrice?: number } = {}): Product & { compareAtPrice?: number } {
  return { ...required, price: 3500, stock: 5, version: 1, ...optional };
}

// Readable-slugs S7: the grid links by slug, so the detail route must resolve that slug.
test("GET /products/:slug resolves a store-plugin product by its slug", async (t) => {
  const { server, baseUrl } = await startServer({
    store: fakeStore({ products: [storeProduct({ id: "prod-1", title: "Classic Boxy Tee", slug: "classic-boxy-tee" })] }),
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products/classic-boxy-tee`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Classic Boxy Tee/);
});

// Id first, then slug: a product whose slug spells another product's id must not shadow it.
test("GET /products/:id prefers an id match over another product's identical slug", async (t) => {
  const { server, baseUrl } = await startServer({
    store: fakeStore({ products: [
      storeProduct({ id: "prod-a", title: "Id Owner", slug: "id-owner" }),
      storeProduct({ id: "prod-b", title: "Slug Squatter", slug: "prod-a" }),
    ] }),
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products/prod-a`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Id Owner/);
  assert.doesNotMatch(html, /Slug Squatter/);
});

test("GET /products renders the sample store plugin catalog", async (t) => {
  const { server, baseUrl } = await startServer({
    store: {
      listProducts: async () => [{ id: "store-prod-1", slug: "store-prod-1", title: "Sample Teacup", price: 2800, stock: 5, version: 0 }],
      checkout: async () => ({ ok: false, reason: "not-found", retries: 0 }),
    },
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Sample Teacup/);
});

test("GET /products renders an empty grid when no store plugin is wired (deps.store itself undefined)", async (t) => {
  const { server, baseUrl } = await startServer({
    store: undefined,
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  // Exercises `resolveStorefrontProducts`'s `deps.store?.listProducts() ?? []` fallback on BOTH
  // its optional-chaining short-circuit (`deps.store` itself undefined, not just an empty catalog)
  // and the trailing `?? []` — every other test in this file that reaches this line supplies an
  // explicit `store`, so this specific combination was otherwise untested.
  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 200, await res.clone().text());
  const html = await res.text();
  assert.match(html, /No products available yet\./);
  assert.match(html, /class="entry-list entry-list--products"/);
  assert.doesNotMatch(html, /href="\/products\/[^" ]+"/);
});

test("GET /products/:id returns 404 for an id that doesn't match any product", async (t) => {
  const { server, baseUrl } = await startServer({
    store: { listProducts: async () => [], checkout: async () => ({ ok: false, reason: "not-found", retries: 0 }) },
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products/does-not-exist`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /404/);
});

test("GET /products 500s with 'No themes installed' when resolveActiveTheme finds none", async (t) => {
  const { server, baseUrl } = await startServer({
    store: { listProducts: async () => [], checkout: async () => ({ ok: false, reason: "not-found", retries: 0 }) },
    themes: [],
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 500);
  assert.match(await res.text(), /No themes installed/);
});

test("GET /products/:id 500s with 'No themes installed' when resolveActiveTheme finds none", async (t) => {
  const product: Product = {
    id: "prod-1", slug: "classic-boxy-tee", title: "Classic Boxy Tee",
    price: 3500, stock: 5, version: 1,
  };
  const { server, baseUrl } = await startServer({
    store: fakeStore({ products: [product] }),
    themes: [],
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products/prod-1`);
  assert.equal(res.status, 500);
  assert.match(await res.text(), /No themes installed/);
});

test("GET /products 500s with a generic 'Site error' when an unexpected exception is thrown", async (t) => {
  const { server, baseUrl } = await startServer({
    store: {
      listProducts: async () => { throw new Error("boom"); },
      checkout: async () => ({ ok: false, reason: "not-found", retries: 0 }),
    },
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 500);
  assert.match(await res.text(), /Site error/);
});

test("GET /products/:id 500s with a generic 'Site error' when an unexpected exception is thrown", async (t) => {
  const { server, baseUrl } = await startServer({
    store: {
      listProducts: async () => { throw new Error("boom"); },
      checkout: async () => ({ ok: false, reason: "not-found", retries: 0 }),
    },
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products/anything`);
  assert.equal(res.status, 500);
  assert.match(await res.text(), /Site error/);
});

/** `/products/:id`'s `String(req.params.id ?? "")` is unreachable through any real HTTP request --
 *  `:id` is a required route segment, so Express's own router can never dispatch to this handler
 *  with it `undefined`. Reaching into the router stack and calling the registered handler directly
 *  with a hand-built `req` genuinely executes the fallback (same technique used for the other 4
 *  route files' identical `?? ""` param guards this session). */
interface ExpressHandlerLayer {
  route?: { path: string; stack: { handle: (req: unknown, res: unknown) => unknown }[] };
}
interface ExpressAppWithRouter {
  _router: { stack: ExpressHandlerLayer[] };
}

function extractHandler(app: ReturnType<typeof createApp>, path: string): (req: unknown, res: unknown) => unknown {
  const stack = (app as unknown as ExpressAppWithRouter)._router.stack;
  const layer = stack.find((l) => l.route?.path === path);
  if (!layer?.route) throw new Error(`route '${path}' was not found in the router stack`);
  return layer.route.stack[0].handle;
}

test("GET /products/:id -- `req.params.id ?? \"\"` fallback, forced via a direct handler call with id omitted -- still 404s (no product has an empty-string id), not a crash", async () => {
  const deps = { ...createRouteDeps(), store: fakeStore({ products: [] }) };
  const app = createApp(deps);
  const handler = extractHandler(app, "/products/:id");
  let statusCode: number | undefined;
  let body = "";
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    type() {
      return res;
    },
    send(payload: string) {
      body = payload;
      return res;
    },
  };

  await handler({ params: {} }, res);

  assert.equal(statusCode, 404);
  assert.match(body, /404/);
});

/**
 * A workspace with no `presentation_settings` row is a real, documented state —
 * `features/presentation/active-theme-id.ts`'s `resolveActiveThemeId` exists specifically to
 * degrade it to `""` rather than let `PresentationSettingsNotFoundError` escape, and `pages.ts`
 * has always routed through that helper.
 *
 * `products.ts` did not: both handlers called `getPresentationSettings` RAW, so the same missing row
 * that `GET /` absorbed threw here and landed in the catch as `<h1>Site error</h1>`. Two public
 * routes, two behaviours, one missing row.
 */
test("GET /products survives a workspace with no presentation_settings row, exactly as GET / already does", async (t) => {
  const { server, baseUrl } = await startServer({
    presentationRepo: new InMemoryPresentationSettingsRepo({}, { initialRows: [] }),
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const [products, home] = await Promise.all([fetch(`${baseUrl}/products`), fetch(`${baseUrl}/`)]);

  assert.equal(home.status, 200, "control: GET / has always absorbed this state");
  assert.equal(products.status, 200, "GET /products must absorb it the same way, not 500");
  assert.doesNotMatch(await products.text(), /Site error/);
});

test("GET /products/:id survives a workspace with no presentation_settings row", async (t) => {
  const product: Product = {
    id: "prod-1", slug: "classic-boxy-tee", title: "Classic Boxy Tee",
    price: 3500, stock: 5, version: 1,
  };

  const { server, baseUrl } = await startServer({
    presentationRepo: new InMemoryPresentationSettingsRepo({}, { initialRows: [] }),
    store: fakeStore({ products: [product] }),
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products/prod-1`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.doesNotMatch(html, /Site error/);
  assert.match(html, /Classic Boxy Tee/);
});


test("the product adapter preserves store-plugin sale prices and the handler renders the unwired empty state", async () => {
  const baseDeps = createRouteDeps();
  // The real HTTP test above owns the shipped sale-card markup and both formatted prices.
  // Assert adapter data here without repeating a worker render against the fixed 5s budget.
  const products = await resolveStorefrontProducts({
    ...baseDeps,
    store: fakeStore({ products: [storeProduct({ id: "sale", title: "Sale Tee", slug: "sale-tee" }, { compareAtPrice: 4500 })] }),
  });
  // A message on every assert.ok here: without one, Node regenerates the failing expression by
  // acorn-parsing this file's tsx output (one very long line), which takes minutes and looks like a hang.
  assert.ok(products[0], "the store adapter must return the sale product");
  assert.equal(products.length, 1);
  assert.equal(products[0].title, "Sale Tee");
  assert.equal(products[0].slug, "sale-tee");
  assert.equal(products[0].price, 3500);
  assert.equal(products[0].compareAtPrice, 4500);
  const deps = {
    ...baseDeps, store: undefined,
  };
  let html = "";
  let status = 200;
  const res = {
    status(code: number) { status = code; return res; },
    set() { return res; }, type() { return res; },
    send(body: string) { html = body; return res; },
  };
  await extractHandler(createApp(deps), "/products")({ header: () => undefined, hostname: "localhost" }, res);
  assert.equal(status, 200);
  assert.match(html, /No products available yet\./);
  assert.match(html, /class="entry-list entry-list--products"/);
  assert.doesNotMatch(html, /class="product-card"|href="\/products\/[^" ]+"/);
});
