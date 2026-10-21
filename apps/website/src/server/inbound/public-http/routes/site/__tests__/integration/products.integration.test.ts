import "../../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createCommerceSiteTestApp as createApp } from "../commerce-site-app.js";
import type { CommerceSiteTestDeps } from "../commerce-site-app.js";
import assert from "node:assert/strict";
import test from "node:test";

import type { Product, StoreApi } from "#src/features/plugins/store/store-plugin";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

/**
 * @file Integration-tier coverage for the public `/products`/`/products/:id` routes — through the
 * REAL composed app (`createApp`), unauthenticated (public site routes). Mirrors
 * `products.route.test.ts`'s (unit-tier) fixtures, trimmed to the branches that file doesn't
 * already cover through this real-app path.
 */

function fakeStore(required: { products: Product[] }, _optional: Record<string, never> = {}): StoreApi {
  return {
    listProducts: async () => required.products,
    checkout: async () => ({ ok: false, reason: "not-found", retries: 0 }),
  };
}

function testDeps(overrides: Partial<CommerceSiteTestDeps> = {}): CommerceSiteTestDeps {
  return { ...createRouteDeps(), ...overrides };
}

test("products: a store-plugin product renders through the real composed app", async (t) => {
  const product: Product = {
    id: "prod-int-1", slug: "integration-tee", title: "Integration Tee",
    price: 4200, stock: 5, version: 1,
  };
  const app = createApp(
    testDeps({ store: fakeStore({ products: [product] }) })
  );
  const baseUrl = await startTestServer(app, t);

  const list = await fetch(`${baseUrl}/products`);
  assert.equal(list.status, 200);
  assert.match(await list.text(), /Integration Tee/);

  const detail = await fetch(`${baseUrl}/products/prod-int-1`);
  assert.equal(detail.status, 200);
  assert.match(await detail.text(), /Integration Tee/);
});

test("products: the sample store plugin catalog renders through the composed app", async (t) => {
  const app = createApp(
    testDeps({
      store: {
        listProducts: async () => [{ id: "sample-1", slug: "sample-1", title: "Sample Fallback Product", price: 999, stock: 1, version: 0 }],
        checkout: async () => ({ ok: false, reason: "not-found", retries: 0 }),
      },
    })
  );
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Sample Fallback Product/);
});

test("products: an empty store plugin catalog renders an empty grid through the composed app", async (t) => {
  const app = createApp(testDeps({ store: fakeStore({ products: [] }) }));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /No products available yet\./);
});

test("products: no store plugin is wired — resolveStorefrontProducts's `deps.store?.listProducts() ?? []` fallback yields an empty grid, not a crash", async (t) => {
  const app = createApp(
    testDeps({ store: undefined })
  );
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 200, await res.clone().text());
  assert.doesNotMatch(await res.text(), /Sample Teacup|Integration Tee|Sample Fallback Product/);
});

test("products: an unknown product id 404s through the real composed app", async (t) => {
  const app = createApp(
    testDeps({ store: fakeStore({ products: [] }) })
  );
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/products/does-not-exist`);
  assert.equal(res.status, 404);
});

/** `/products/:id`'s `String(req.params.id ?? "")` is unreachable through any real HTTP request on
 *  the REAL composed app either -- `:id` is a required route segment. Same technique as
 *  `products.route.test.ts`'s (unit-tier) identical test -- see its comment. */
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

test("products: /products/:id's `req.params.id ?? \"\"` fallback, forced via a direct handler call on the REAL composed app with id omitted -- still 404s, not a crash", async () => {
  const app = createApp(
    testDeps({ store: fakeStore({ products: [] }) })
  );
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

test("products: 'No themes installed' 500s when no theme is discovered (both routes)", async (t) => {
  const product: Product = {
    id: "prod-int-2", slug: "no-theme-product", title: "No Theme Product",
    price: 1000, stock: 5, version: 1,
  };
  const app = createApp(
    testDeps({
      store: fakeStore({ products: [product] }),
      themes: [],
    })
  );
  const baseUrl = await startTestServer(app, t);

  const list = await fetch(`${baseUrl}/products`);
  assert.equal(list.status, 500);
  assert.match(await list.text(), /No themes installed/);

  const detail = await fetch(`${baseUrl}/products/prod-int-2`);
  assert.equal(detail.status, 500);
  assert.match(await detail.text(), /No themes installed/);
});

test("products: an unexpected exception 500s with 'Site error' (both routes)", async (t) => {
  const app = createApp(testDeps({ store: {
    listProducts: async () => { throw new Error("boom"); },
    checkout: async () => ({ ok: false, reason: "not-found", retries: 0 }),
  } }));
  const baseUrl = await startTestServer(app, t);

  const list = await fetch(`${baseUrl}/products`);
  assert.equal(list.status, 500);
  assert.match(await list.text(), /Site error/);

  const detail = await fetch(`${baseUrl}/products/anything`);
  assert.equal(detail.status, 500);
  assert.match(await detail.text(), /Site error/);
});
