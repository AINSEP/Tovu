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
  listProducts: () => [],
  checkout: () => ({ ok: true, orderId: "order-1", remainingStock: 4, retries: 0 }),
};

/** Boots the store routes alone and returns a `GET /store/buy` caller that never follows redirects. */
async function bootStore(t: import("node:test").TestContext, store: StoreDep | undefined) {
  const app = express();
  registerStoreRoutes(app, { store } as RouteDeps);
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
