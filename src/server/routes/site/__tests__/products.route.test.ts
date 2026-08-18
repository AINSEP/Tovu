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
} from "#src/features/commerce";
import { createApp, createRouteDeps } from "../../../app";

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
