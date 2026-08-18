import assert from "node:assert/strict";
import test from "node:test";

import type { CommercePriceRecord, CommercePriceRepoPort, CommerceProductRecord, CommerceProductRepoPort } from "#src/features/commerce";
import { createApp, createRouteDeps } from "#src/server/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Integration-tier coverage for the public `/products`/`/products/:id` routes — through the
 * REAL composed app (`createApp`), unauthenticated (public site routes). Mirrors
 * `products.route.test.ts`'s (unit-tier) fixtures, trimmed to the branches that file doesn't
 * already cover through this real-app path.
 */

const WORKSPACE_ID = "workspace-local";
const NOW = "2026-08-18T00:00:00.000Z";

function fakeProductRepo(products: CommerceProductRecord[]): CommerceProductRepoPort {
  return {
    findById: async ({ id }) => products.find((p) => p.id === id) ?? null,
    findBySlug: async ({ slug }) => products.find((p) => p.slug === slug) ?? null,
    listActive: async ({ workspaceId }) => products.filter((p) => p.workspaceId === workspaceId && p.status === "active"),
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

function testDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return { ...createRouteDeps(), ...overrides };
}

test("products: a Commerce-sourced product renders through the real composed app", async (t) => {
  const product: CommerceProductRecord = {
    id: "prod-int-1",
    workspaceId: WORKSPACE_ID,
    name: "Integration Tee",
    slug: "integration-tee",
    kind: "one_time",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  };
  const price: CommercePriceRecord = {
    id: "price-int-1",
    workspaceId: WORKSPACE_ID,
    productId: "prod-int-1",
    unitAmountCents: 4200,
    currency: "usd",
    status: "active",
    createdAt: NOW,
    version: 1,
  };
  const app = createApp(
    testDeps({ commerceProductRepo: fakeProductRepo([product]), commercePriceRepo: fakePriceRepo({ "prod-int-1": [price] }) })
  );
  const baseUrl = await startTestServer(app, t);

  const list = await fetch(`${baseUrl}/products`);
  assert.equal(list.status, 200);
  assert.match(await list.text(), /Integration Tee/);

  const detail = await fetch(`${baseUrl}/products/prod-int-1`);
  assert.equal(detail.status, 200);
  assert.match(await detail.text(), /Integration Tee/);
});

test("products: with no Commerce repos wired, falls back to the sample store plugin", async (t) => {
  const app = createApp(
    testDeps({
      commerceProductRepo: undefined,
      commercePriceRepo: undefined,
      store: {
        listProducts: () => [{ id: "sample-1", title: "Sample Fallback Product", price: 999, stock: 1, version: 0 }],
        checkout: () => ({ ok: false, reason: "not-found", retries: 0 }),
      },
    })
  );
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Sample Fallback Product/);
});

test("products: an unknown product id 404s through the real composed app", async (t) => {
  const app = createApp(
    testDeps({ commerceProductRepo: fakeProductRepo([]), commercePriceRepo: fakePriceRepo({}), store: { listProducts: () => [], checkout: () => ({ ok: false, reason: "not-found", retries: 0 }) } })
  );
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/products/does-not-exist`);
  assert.equal(res.status, 404);
});

test("products: 'No themes installed' 500s when no theme is discovered (both routes)", async (t) => {
  const product: CommerceProductRecord = {
    id: "prod-int-2",
    workspaceId: WORKSPACE_ID,
    name: "No Theme Product",
    slug: "no-theme-product",
    kind: "one_time",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  };
  const price: CommercePriceRecord = {
    id: "price-int-2",
    workspaceId: WORKSPACE_ID,
    productId: "prod-int-2",
    unitAmountCents: 1000,
    currency: "usd",
    status: "active",
    createdAt: NOW,
    version: 1,
  };
  const app = createApp(
    testDeps({
      commerceProductRepo: fakeProductRepo([product]),
      commercePriceRepo: fakePriceRepo({ "prod-int-2": [price] }),
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
  const throwingRepo: CommerceProductRepoPort = {
    listActive: async () => {
      throw new Error("boom");
    },
    findById: async () => null,
    findBySlug: async () => null,
    save: async () => {
      throw new Error("not implemented in this fake");
    },
  };
  const app = createApp(testDeps({ commerceProductRepo: throwingRepo, commercePriceRepo: fakePriceRepo({}) }));
  const baseUrl = await startTestServer(app, t);

  const list = await fetch(`${baseUrl}/products`);
  assert.equal(list.status, 500);
  assert.match(await list.text(), /Site error/);

  const detail = await fetch(`${baseUrl}/products/anything`);
  assert.equal(detail.status, 500);
  assert.match(await detail.text(), /Site error/);
});
