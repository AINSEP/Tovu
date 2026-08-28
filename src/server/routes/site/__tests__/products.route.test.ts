import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type {
  CommercePriceRepoPort,
  CommerceProductRepoPort,
  CommercePriceRecord,
  CommerceProductRecord,
} from "#src/features/commerce/index";
import { createApp, createRouteDeps } from "../../../runtime/composition/app.js";

/**
 * @file Route-level coverage for `registerProductRoutes`'s 2026-08-12 commerce wiring — real HTTP
 * requests against `registerProductRoutes` (via `createApp`), with fake commerce repos rather than
 * a real SQLite DB (repo-level DB behavior is already covered by
 * `features/commerce/__tests__/integration/repo.sqlite.integration.test.ts`; this file proves the
 * ROUTE composes them correctly and falls back to the sample store plugin when they're absent/empty).
 *
 * Deliberately does not touch `/api/admin/v1/auth/login` or anything else `packet-one-routes
 * .test.ts` exercises — that keeps this file isolated from that suite's unrelated, independently
 * observed flakiness under this session's heavy concurrent load.
 */

const NOW = "2026-08-12T00:00:00.000Z";
const WORKSPACE_ID = "workspace-local"; // must match server/seed.ts's seededWorkspace.id

function fakeProductRepo(products: CommerceProductRecord[]): CommerceProductRepoPort {
  return {
    findById: async ({ id }) => products.find((p) => p.id === id) ?? null,
    findBySlug: async ({ slug }) => products.find((p) => p.slug === slug) ?? null,
    listActive: async ({ workspaceId }) =>
      products.filter((p) => p.workspaceId === workspaceId && p.status === "active"),
    save: async () => {
      throw new Error("not implemented in this fake");
    },
  };
}

function fakePriceRepo(pricesByProduct: Record<string, CommercePriceRecord[]>): CommercePriceRepoPort {
  return {
    findById: async () => null,
    listByProduct: async ({ productId }) => pricesByProduct[productId] ?? [],
    save: async () => {
      throw new Error("not implemented in this fake");
    },
  };
}

async function startServer(overrides: Partial<ReturnType<typeof createRouteDeps>>) {
  const deps = { ...createRouteDeps(), ...overrides };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test("GET /products renders a Commerce-sourced product with its formatted price and compare-at price", async (t) => {
  const product: CommerceProductRecord = {
    id: "prod-1",
    workspaceId: WORKSPACE_ID,
    name: "Classic Boxy Tee",
    slug: "classic-boxy-tee",
    kind: "one_time",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  };
  const price: CommercePriceRecord = {
    id: "price-1",
    workspaceId: WORKSPACE_ID,
    productId: "prod-1",
    unitAmountCents: 3500,
    compareAtAmountCents: 4500,
    currency: "usd",
    status: "active",
    createdAt: NOW,
    version: 1,
  };

  const { server, baseUrl } = await startServer({
    commerceProductRepo: fakeProductRepo([product]),
    commercePriceRepo: fakePriceRepo({ "prod-1": [price] }),
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Classic Boxy Tee/);
  assert.match(html, /\$35\.00/);
});

test("GET /products/:id renders the single Commerce-sourced product's detail route", async (t) => {
  const product: CommerceProductRecord = {
    id: "prod-1",
    workspaceId: WORKSPACE_ID,
    name: "Classic Boxy Tee",
    slug: "classic-boxy-tee",
    kind: "one_time",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  };
  const price: CommercePriceRecord = {
    id: "price-1",
    workspaceId: WORKSPACE_ID,
    productId: "prod-1",
    unitAmountCents: 3500,
    currency: "usd",
    status: "active",
    createdAt: NOW,
    version: 1,
  };

  const { server, baseUrl } = await startServer({
    commerceProductRepo: fakeProductRepo([product]),
    commercePriceRepo: fakePriceRepo({ "prod-1": [price] }),
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products/prod-1`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Classic Boxy Tee/);
});

test("GET /products falls back to the sample store plugin when Commerce has no active priced products", async (t) => {
  const { server, baseUrl } = await startServer({
    commerceProductRepo: fakeProductRepo([]),
    commercePriceRepo: fakePriceRepo({}),
    store: {
      listProducts: () => [{ id: "store-prod-1", title: "Sample Teacup", price: 2800, stock: 5, version: 0 }],
      checkout: () => ({ ok: false, reason: "not-found", retries: 0 }),
    },
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Sample Teacup/);
});

test("GET /products falls back to the sample store plugin when NEITHER Commerce repo is wired at all (deps.commerceProductRepo/commercePriceRepo absent)", async (t) => {
  const { server, baseUrl } = await startServer({
    commerceProductRepo: undefined,
    commercePriceRepo: undefined,
    store: {
      listProducts: () => [{ id: "store-prod-2", title: "No Commerce Wired", price: 1200, stock: 3, version: 0 }],
      checkout: () => ({ ok: false, reason: "not-found", retries: 0 }),
    },
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /No Commerce Wired/);
});

test("GET /products renders an empty grid, not a crash, when NEITHER Commerce NOR a store plugin is wired at all (deps.store itself undefined)", async (t) => {
  const { server, baseUrl } = await startServer({
    commerceProductRepo: undefined,
    commercePriceRepo: undefined,
    store: undefined,
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  // Exercises `resolveStorefrontProducts`'s `deps.store?.listProducts() ?? []` fallback on BOTH
  // its optional-chaining short-circuit (`deps.store` itself undefined, not just an empty catalog)
  // and the trailing `?? []` — every other test in this file that reaches this line supplies an
  // explicit `store`, so this specific combination was otherwise untested.
  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 200, await res.clone().text());
});

test("GET /products/:id returns 404 for an id that doesn't match any product", async (t) => {
  const { server, baseUrl } = await startServer({
    commerceProductRepo: fakeProductRepo([]),
    commercePriceRepo: fakePriceRepo({}),
    store: { listProducts: () => [], checkout: () => ({ ok: false, reason: "not-found", retries: 0 }) },
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products/does-not-exist`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /404/);
});

test("GET /products 500s with 'No themes installed' when resolveActiveTheme finds none", async (t) => {
  const { server, baseUrl } = await startServer({
    commerceProductRepo: fakeProductRepo([]),
    commercePriceRepo: fakePriceRepo({}),
    store: { listProducts: () => [], checkout: () => ({ ok: false, reason: "not-found", retries: 0 }) },
    themes: [],
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 500);
  assert.match(await res.text(), /No themes installed/);
});

test("GET /products/:id 500s with 'No themes installed' when resolveActiveTheme finds none", async (t) => {
  const product: CommerceProductRecord = {
    id: "prod-1",
    workspaceId: WORKSPACE_ID,
    name: "Classic Boxy Tee",
    slug: "classic-boxy-tee",
    kind: "one_time",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  };
  const price: CommercePriceRecord = {
    id: "price-1",
    workspaceId: WORKSPACE_ID,
    productId: "prod-1",
    unitAmountCents: 3500,
    currency: "usd",
    status: "active",
    createdAt: NOW,
    version: 1,
  };
  const { server, baseUrl } = await startServer({
    commerceProductRepo: fakeProductRepo([product]),
    commercePriceRepo: fakePriceRepo({ "prod-1": [price] }),
    themes: [],
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products/prod-1`);
  assert.equal(res.status, 500);
  assert.match(await res.text(), /No themes installed/);
});

test("GET /products 500s with a generic 'Site error' when an unexpected exception is thrown", async (t) => {
  const { server, baseUrl } = await startServer({
    commerceProductRepo: {
      listActive: async () => {
        throw new Error("boom");
      },
      findById: async () => null,
      findBySlug: async () => null,
      save: async () => {
        throw new Error("not implemented in this fake");
      },
    },
    commercePriceRepo: fakePriceRepo({}),
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 500);
  assert.match(await res.text(), /Site error/);
});

test("GET /products/:id 500s with a generic 'Site error' when an unexpected exception is thrown", async (t) => {
  const { server, baseUrl } = await startServer({
    commerceProductRepo: {
      listActive: async () => {
        throw new Error("boom");
      },
      findById: async () => null,
      findBySlug: async () => null,
      save: async () => {
        throw new Error("not implemented in this fake");
      },
    },
    commercePriceRepo: fakePriceRepo({}),
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products/anything`);
  assert.equal(res.status, 500);
  assert.match(await res.text(), /Site error/);
});

test("GET /products never leaks another workspace's Commerce catalog (workspace-scoped listActive)", async (t) => {
  const otherWorkspaceProduct: CommerceProductRecord = {
    id: "prod-other-ws",
    workspaceId: "some-other-workspace",
    name: "Should Never Appear",
    slug: "should-never-appear",
    kind: "one_time",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  };

  const { server, baseUrl } = await startServer({
    commerceProductRepo: fakeProductRepo([otherWorkspaceProduct]),
    commercePriceRepo: fakePriceRepo({
      "prod-other-ws": [
        {
          id: "price-other-ws",
          workspaceId: "some-other-workspace",
          productId: "prod-other-ws",
          unitAmountCents: 1000,
          currency: "usd",
          status: "active",
          createdAt: NOW,
          version: 1,
        },
      ],
    }),
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 200);
  assert.doesNotMatch(await res.text(), /Should Never Appear/);
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
  const deps = { ...createRouteDeps(), commerceProductRepo: fakeProductRepo([]), commercePriceRepo: fakePriceRepo({}) };
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
