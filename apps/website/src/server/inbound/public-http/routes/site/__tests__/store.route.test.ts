import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";
import { registerStoreRoutes } from "../store.js";

/**
 * @file Route-level coverage for `/store/buy`'s caller-chosen `returnTo` (t91 open-redirect fix,
 * 2026-09-16).
 *
 * The route is unauthenticated and a GET, so any page on the internet can link a visitor to it.
 * Before this fix `returnTo` was honored whenever it started with `/` and not `//`, so
 * `?returnTo=/\evil.example` produced `Location: /\evil.example` — Express 4's `encodeurl` leaves a
 * backslash as-is, and a browser reads `/\` like `//`, landing on `evil.example`. Each case below is
 * sent the way an attacker's link would carry it (percent-encoded in the query string, decoded by
 * Express's query parser) and must come back to this site's own `/store`.
 *
 * Built on a bare `express()` app with only `registerStoreRoutes` mounted — the route reads nothing
 * but `deps.store`, so the full `createApp` composition would add boot cost and no coverage.
 */

/** Values an attacker would put in `returnTo`. Each must be refused. */
const ATTACK_RETURN_TOS: readonly string[] = [
  "/\\evil.example",
  "/\\\\evil.example",
  "/\\/evil.example",
  "/\t/evil.example",
  "/\n/evil.example",
  "/%5Cevil.example",
  "//evil.example",
  "https://evil.example",
  "javascript:alert(1)",
  "back",
  // t85 independent review (2026-09-16): the site-relative check resolves against a fixed probe
  // origin and asks whether the origin survived, so naming that origin answered "yes" and this
  // left the site as `Location: //reserved-path-probe.invalid/x`.
  "//reserved-path-probe.invalid/x",
];

type StoreDep = NonNullable<RouteDeps["store"]>;

const purchasingStore: StoreDep = {
  listProducts: async () => [],
  checkout: async () => ({ ok: true, orderId: "order-1", remainingStock: 4, retries: 0 }),
};

/** Boots the store routes alone and returns a `GET /store/buy` caller that never follows redirects. */
async function bootStore(t: import("node:test").TestContext, store: StoreDep | undefined) {
  const app = express();
  registerStoreRoutes(app, { store });
  const baseUrl = await startTestServer(app, t);
  return async (returnTo: string): Promise<{ status: number; location: string | null }> => {
    const res = await fetch(`${baseUrl}/store/buy?productId=p1&returnTo=${encodeURIComponent(returnTo)}`, {
      redirect: "manual",
    });
    return { status: res.status, location: res.headers.get("location") };
  };
}

/**
 * Sends every {@link ATTACK_RETURN_TOS} value and returns the ones whose response differs from
 * `expected`, so one failing run names every leaking input rather than only the first.
 */
async function responsesNotMatching(
  buy: (returnTo: string) => Promise<{ status: number; location: string | null }>,
  expected: { status: number; location: string }
): Promise<{ returnTo: string; status: number; location: string | null }[]> {
  const mismatches: { returnTo: string; status: number; location: string | null }[] = [];
  for (const returnTo of ATTACK_RETURN_TOS) {
    const { status, location } = await buy(returnTo);
    if (status !== expected.status || location !== expected.location) mismatches.push({ returnTo, status, location });
  }
  return mismatches;
}

test("GET /store/buy with no store plugin: every off-site returnTo falls back to /store", async (t) => {
  const buy = await bootStore(t, undefined);
  assert.deepEqual(await responsesNotMatching(buy, { status: 302, location: "/store" }), []);
});

test("GET /store/buy after a purchase: every off-site returnTo falls back to /store with the flash message", async (t) => {
  const buy = await bootStore(t, purchasingStore);
  const expected = `/store?msg=${encodeURIComponent("Purchased — order order-1, 4 left.")}`;
  assert.deepEqual(await responsesNotMatching(buy, { status: 302, location: expected }), []);
});

test("GET /store/buy honors an on-site returnTo: /products and /store?x=1", async (t) => {
  const buyWithoutStore = await bootStore(t, undefined);
  assert.equal((await buyWithoutStore("/products")).location, "/products");
  assert.equal((await buyWithoutStore("/store?x=1")).location, "/store?x=1");

  const buyWithStore = await bootStore(t, purchasingStore);
  assert.equal(
    (await buyWithStore("/products")).location,
    `/products?msg=${encodeURIComponent("Purchased — order order-1, 4 left.")}`
  );
});

test("GET /store renders prices, escapes hostile text, and keeps sold-out products unpurchasable", async (t) => {
  const app = express();
  registerStoreRoutes(app, { store: {
    listProducts: async () => [
      { id: "available&1", slug: "available", title: '<script>alert("product")</script>', price: 4200, stock: 2, version: 1 },
      { id: "sold", slug: "sold", title: "Sold product", price: 999, stock: 0, version: 1 },
    ], checkout: purchasingStore.checkout,
  } });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/store?msg=${encodeURIComponent('<img src=x onerror="bad">')}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /&lt;script&gt;alert\(&quot;product&quot;\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=&quot;bad&quot;&gt;/);
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /\$42\.00 · 2 in stock/);
  assert.match(html, /href="\/store\/buy\?productId=available%261"/);
  const sold = html.match(/<li><strong>Sold product<\/strong>[\s\S]*?<\/li>/)?.[0];
  assert.ok(sold);
  assert.match(sold, /\$9\.99 · 0 in stock · <span>sold out<\/span>/);
  assert.doesNotMatch(sold, /<a /);
});

test("store listing/checkout failures complete with a fixed 500, and refused purchases redirect with a reason", async (t) => {
  for (const failure of ["listing", "checkout"] as const) {
    const app = express();
    registerStoreRoutes(app, { store: {
      listProducts: async () => { if (failure === "listing") throw new Error("private storage details"); return []; },
      checkout: async () => { throw new Error("private checkout details"); },
    } });
    const baseUrl = await startTestServer(app, t);
    const res = await fetch(`${baseUrl}${failure === "listing" ? "/store" : "/store/buy?productId=p1"}`, { redirect: "manual", signal: AbortSignal.timeout(3000) });
    assert.equal(res.status, 500);
    assert.equal(await res.text(), "<h1>Store error</h1>");
  }
  const buy = await bootStore(t, { listProducts: async () => [], checkout: async () => ({ ok: false, reason: "not-found", retries: 0 }) });
  assert.deepEqual(await buy("/products"), { status: 302, location: `/products?msg=${encodeURIComponent("Could not buy: not-found.")}` });
});
