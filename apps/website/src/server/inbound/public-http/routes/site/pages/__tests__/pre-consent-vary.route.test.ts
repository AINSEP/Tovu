import "../../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { CONFIG_ID, CONSENT_COOKIE } from "@jini-ai/cookie-consent";
import type { RouteDeps } from "#src/server/routes/types";
import { CACHE_CONTROL_PUBLIC_PAGE } from "../request-policy.js";
import { CACHE_CONTROL_PRE_CONSENT_TRACKING } from "@jini-ai/cookie-consent/site/pre-consent-cache";
import { listingState } from "@jini-ai/cms/public-http/routes/site/pages/listing/listing-state";
import { sendPublicPage } from "../response.js";

/**
 * @file Review rv1123n item 10. A consent-gated page is cacheable only once the visitor made a
 * (parsed, valid) choice; that copy differs from the cookie-free `no-store` one, so a shared cache
 * must key it on `Cookie`. Mounted on a real Express server through the real `sendPublicPage`.
 */

const config = (scripts: unknown[]) => `<script type="application/json" id="${CONFIG_ID}">${JSON.stringify({ contract: 1, banner: "jini", scripts })}</script>`;
const TRACKED = `<html><head>${config([{ src: "https://analytics.example/t.js", consent: "analytics" }])}</head><body>tracked</body></html>`;
const PLAIN = `<html><head>${config([])}</head><body>plain</body></html>`;
const CHOICE = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({ v: 1, p: "policy-1", t: 1_700_000_000_000, a: "accept", c: { functional: true, analytics: true, marketing: true } }))}`;

async function startServer(t: test.TestContext) {
  // `sendPublicPage` reads only these two deps for a page without forms or plugins.
  const deps = { workspaceId: "ws", clock: { nowMs: () => Date.now() } } as unknown as RouteDeps;
  const app = express();
  app.get("/tracked", (req, res, next) => { sendPublicPage({ req, res, deps, html: TRACKED, perVisitor: { cacheControl: CACHE_CONTROL_PUBLIC_PAGE, result: undefined } }).catch(next); });
  app.get("/plain", (req, res, next) => { sendPublicPage({ req, res, deps, html: PLAIN, perVisitor: { cacheControl: CACHE_CONTROL_PUBLIC_PAGE, result: undefined } }).catch(next); });
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const varyTokens = (res: { headers: Headers }) => (res.headers.get("vary") ?? "").split(",").map((token) => token.trim().toLowerCase());

test("cookie-free request first: no-store; the consented copy that follows is public AND varies on Cookie", async (t) => {
  const base = await startServer(t);
  const anonymous = await fetch(`${base}/tracked`);
  assert.equal(anonymous.headers.get("cache-control"), CACHE_CONTROL_PRE_CONSENT_TRACKING);
  const consented = await fetch(`${base}/tracked`, { headers: { cookie: CHOICE } });
  assert.equal(consented.headers.get("cache-control"), CACHE_CONTROL_PUBLIC_PAGE);
  assert.ok(varyTokens(consented).includes("cookie"), `Vary was ${consented.headers.get("vary")}`);
});

test("cookie-bearing request first: the public copy varies on Cookie, so the cookie-free visitor is not served it", async (t) => {
  const base = await startServer(t);
  const consented = await fetch(`${base}/tracked`, { headers: { cookie: CHOICE } });
  assert.equal(consented.headers.get("cache-control"), CACHE_CONTROL_PUBLIC_PAGE);
  assert.ok(varyTokens(consented).includes("cookie"), `Vary was ${consented.headers.get("vary")}`);
  const anonymous = await fetch(`${base}/tracked`);
  assert.equal(anonymous.headers.get("cache-control"), CACHE_CONTROL_PRE_CONSENT_TRACKING);
});

test("a malformed or unrelated consent cookie is no choice at all: still private, no-store", async (t) => {
  const base = await startServer(t);
  for (const cookie of [`${CONSENT_COOKIE}=v1.abc`, `${CONSENT_COOKIE}=%7Bnot-json`, `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({ v: 2, a: "accept" }))}`, "analytics=1"]) {
    const res = await fetch(`${base}/tracked`, { headers: { cookie } });
    assert.equal(res.headers.get("cache-control"), CACHE_CONTROL_PRE_CONSENT_TRACKING, cookie);
  }
});

test("a page with no consent-gated scripts stays an ordinary public page, with no consent Vary", async (t) => {
  const base = await startServer(t);
  const res = await fetch(`${base}/plain`);
  assert.equal(res.headers.get("cache-control"), CACHE_CONTROL_PUBLIC_PAGE);
  assert.ok(!varyTokens(res).includes("cookie"));
});


test("an invalid cookie on a page with gated scripts does not make it public-cacheable", async (t) => {
  const base = await startServer(t);
  const response = await fetch(`${base}/tracked`, { headers: { cookie: `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({ v: 1, a: "accept" }))}` } });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(await response.text(), /analytics\.example\/t\.js/);
});


test("a later JSON listing type does not erase the cache decision or an existing Vary value", async (t) => {
  const app = express();
  const deps = { workspaceId: "ws", clock: { nowMs: () => Date.now() } } as unknown as RouteDeps;
  app.get("/batch", async (req, res, next) => {
    try {
      const listingBatch = { pagePath: "/batch", key: 1, after: 12, format: "json" as const };
      listingState.recordListingBatchRequest({ req, listingBatch });
      await listingState.storeListingJsonPage({ listingBatch, keyed: new Map([[1, { posts: [], next: null }]]), toItem: ({ post }) => post });
      res.vary("Accept-Encoding");
      await sendPublicPage({ req, res, deps, html: TRACKED, perVisitor: { cacheControl: CACHE_CONTROL_PUBLIC_PAGE, result: undefined } });
    } catch (error) { next(error); }
  });
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/batch`, { headers: { cookie: CHOICE } });
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.equal(response.headers.get("cache-control"), CACHE_CONTROL_PUBLIC_PAGE);
  assert.deepEqual(varyTokens(response).sort(), ["accept-encoding", "cookie"]);
  assert.deepEqual(await response.json(), { items: [], nextCursor: null });
});
