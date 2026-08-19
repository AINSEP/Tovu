import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../../app.js";
import { registerSiteRoutes } from "../../routes/site/pages.js";
import { registerProductRoutes } from "../../routes/site/products.js";
import { registerStoreRoutes } from "../../routes/site/store.js";
import { createSeoModule } from "../../modules/seo.js";
import type { RouteDeps } from "../../routes/types.js";
import { startTestServer } from "../helpers/http-test-server.js";

/**
 * @file Measurement instrument — deliverable A of the public-site request-cost audit
 * (TM-TOVU-2026-08-12-A follow-up: "if somebody deploys Tovu to a website, is it putting a lot of
 * stress on the server / costing a lot of money?"). MEASUREMENT-ONLY, NOT a correctness test. Run
 * with: `node --import tsx --test src/server/__tests__/routes/request-cost-cacheability.measurement.test.ts`
 *
 * Boots a real `node:http` server (`startTestServer`, the same helper every `*-site-serving.test.ts`
 * uses) over the real Express app wired to `createRouteDeps()`'s in-memory repos (the established
 * test-only composition root — NOT `TOVU_DB=memory`, which is a different, production-adjacent mode
 * with its own RBAC caveat that doesn't apply here). Real HTTP requests via `fetch()`, real response
 * headers read directly off the wire.
 *
 * Per route: (1) what `Cache-Control`/`ETag`/`Last-Modified` it sends today, and (2) whether the
 * response is cacheable IN PRINCIPLE — same bytes for two different anonymous requests to the same
 * URL, or does it vary. (2) is proven empirically (diff two real responses with different
 * cookies/headers), not asserted from reading the source.
 */

function buildPublicSiteApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  // Registration order matters — mirrors `app.ts`'s real order: SEO (sitemap/robots) and
  // store/products must precede `registerSiteRoutes`'s `/:slug` catch-all.
  createSeoModule(deps).registerRoutes?.(app);
  registerStoreRoutes(app, deps);
  registerProductRoutes(app, deps);
  registerSiteRoutes(app, deps);
  return { app, deps };
}

const CACHE_HEADER_NAMES = ["cache-control", "etag", "last-modified", "expires", "vary"];

/** Owner-decided value (TM-TOVU-2026-08-12-A Phase 2) — matches the literal each route file sets
 *  its own local `CACHE_CONTROL_PUBLIC_PAGE` constant to (`pages.ts`/`products.ts`/`sitemap.ts`/
 *  `robots.ts` each keep an independent copy rather than importing this one — see those files' own
 *  doc comments for why). This is the before/after regression guard: before Phase 2 these routes
 *  sent no `Cache-Control` at all (deliverable A's own finding); now they must send exactly this. */
const EXPECTED_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

function summarizeCacheHeaders(res: Response): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const name of CACHE_HEADER_NAMES) out[name] = res.headers.get(name);
  return out;
}

function logRow(route: string, headers: Record<string, string | null>, note: string) {
  const present = Object.entries(headers).filter(([, v]) => v !== null);
  // eslint-disable-next-line no-console
  console.log(`CACHE\t${route}\t${present.length === 0 ? "NONE" : JSON.stringify(Object.fromEntries(present))}\t${note}`);
}

test("A: GET / (home) — headers today, and cacheability proven by diffing two differently-flavored requests", async (t) => {
  const { app } = buildPublicSiteApp();
  const baseUrl = await startTestServer(app, t);

  const plain = await fetch(`${baseUrl}/`);
  assert.equal(plain.status, 200);
  logRow("GET /", summarizeCacheHeaders(plain), "seeded default (basic theme)");
  assert.equal(plain.headers.get("cache-control"), EXPECTED_CACHE_CONTROL, "Phase 2: home must send the owner-decided Cache-Control");

  // Same URL, different "visitor": an arbitrary cookie and a different Accept-Language, standing in
  // for "two different anonymous browsers." If the byte-for-byte body differs, something is reading
  // per-visitor state; if identical, the response is trivially cacheable for anonymous traffic.
  const bodyA = await plain.text();
  const flavored = await fetch(`${baseUrl}/`, {
    headers: { cookie: "some_random_visitor_cookie=abc123", "accept-language": "fr-FR" },
  });
  const bodyB = await flavored.text();
  assert.equal(bodyA, bodyB, "home page body must be identical regardless of cookie/Accept-Language for this to be safely CDN-cacheable");
});

test("A: GET /:slug (a real post, dynamic render path) — headers + cacheability", async (t) => {
  const { app } = buildPublicSiteApp();
  const baseUrl = await startTestServer(app, t);

  const plain = await fetch(`${baseUrl}/the-weight-of-type`);
  assert.equal(plain.status, 200);
  logRow("GET /:slug (post)", summarizeCacheHeaders(plain), "seeded post, not a static-theme page id");
  assert.equal(plain.headers.get("cache-control"), EXPECTED_CACHE_CONTROL, "Phase 2: the dynamic post render path must send the owner-decided Cache-Control");

  const bodyA = await plain.text();
  const flavored = await fetch(`${baseUrl}/the-weight-of-type`, {
    headers: { cookie: "some_random_visitor_cookie=abc123" },
  });
  const bodyB = await flavored.text();
  assert.equal(bodyA, bodyB, "post page body must be identical regardless of cookie for this to be safely CDN-cacheable");
});

test("A: GET /:slug (a static-theme marketing page) — headers + cacheability", async (t) => {
  const { app } = buildPublicSiteApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/about`);
  assert.equal(res.status, 200);
  logRow("GET /:slug (static theme page)", summarizeCacheHeaders(res), "matches basic theme's own page id");
  assert.equal(res.headers.get("cache-control"), EXPECTED_CACHE_CONTROL, "Phase 2: the static-theme-page short-circuit must send the owner-decided Cache-Control too — same cacheability property, not just the dynamic path");
});

test("A: GET /products (grid) and /products/:id (detail) — headers + cacheability", async (t) => {
  const { app } = buildPublicSiteApp();
  const baseUrl = await startTestServer(app, t);

  const grid = await fetch(`${baseUrl}/products`);
  logRow("GET /products", summarizeCacheHeaders(grid), `status=${grid.status} (deps.store unset in this harness -> empty grid, still exercises the real handler)`);
  assert.equal(grid.headers.get("cache-control"), EXPECTED_CACHE_CONTROL, "Phase 2: /products must send the owner-decided Cache-Control");

  const bodyA = await grid.text();
  const flavored = await fetch(`${baseUrl}/products`, { headers: { cookie: "x=1" } });
  const bodyB = await flavored.text();
  assert.equal(bodyA, bodyB, "product grid body must be identical regardless of cookie");
});

test("A: GET /store — plugin NOT wired (createRouteDeps()'s own default) — headers + cacheability", async (t) => {
  const { app } = buildPublicSiteApp();
  const baseUrl = await startTestServer(app, t);

  const plain = await fetch(`${baseUrl}/store`);
  logRow("GET /store (no store plugin)", summarizeCacheHeaders(plain), "deps.store unset — matches createRouteDeps()'s own default, and per its file header, only the real SQLite runtime ever wires it");
  assert.equal(plain.headers.get("cache-control"), null, "Phase 2 explicitly excluded /store — it must NOT get a cache header (cacheable only by full URL including query, not by path alone)");
  const bodyPlain = await plain.text();
  const withMsg = await fetch(`${baseUrl}/store?msg=hello`);
  const bodyMsg = await withMsg.text();
  assert.equal(bodyPlain, bodyMsg, "with no store plugin wired, the early-return branch never reaches req.query.msg at all — body is identical regardless of query string in this state");
});

test("A: GET /store — plugin wired — query-string-dependent (not visitor-dependent) variance", async (t) => {
  const deps: RouteDeps = createRouteDeps();
  // Minimal fake matching RouteDeps' own `store?` shape (types.ts:518) — exercises the flash-message
  // branch `req.query.msg` actually reads, which the no-plugin default above never reaches.
  deps.store = {
    listProducts: () => [{ id: "p1", title: "Test Widget", price: 500, stock: 3, version: 1 }],
    checkout: () => ({ ok: true, orderId: "o1", remainingStock: 2, retries: 0 }),
  };
  const app = express();
  registerStoreRoutes(app, deps);
  const t2 = t;
  const baseUrl = await startTestServer(app, t2);

  const plain = await fetch(`${baseUrl}/store`);
  logRow("GET /store (plugin wired)", summarizeCacheHeaders(plain), "no ?msg=");
  assert.equal(plain.headers.get("cache-control"), null, "Phase 2 explicitly excluded /store — left alone regardless of plugin state");
  const withMsg = await fetch(`${baseUrl}/store?msg=hello`);
  logRow("GET /store?msg=... (plugin wired)", summarizeCacheHeaders(withMsg), "flash message present");
  assert.equal(withMsg.headers.get("cache-control"), null, "Phase 2 explicitly excluded /store, including the ?msg= variant");

  const bodyPlain = await plain.text();
  const bodyMsg = await withMsg.text();
  assert.notEqual(bodyPlain, bodyMsg, "confirms /store's body DOES vary by query string (?msg=) when the plugin is active — cacheable only by full URL including query, not by path alone");

  // Two requests with the SAME query string, different cookies, must still match — proves the
  // variance is query-string-driven, not visitor-driven.
  const withMsgOtherCookie = await fetch(`${baseUrl}/store?msg=hello`, { headers: { cookie: "visitor=2" } });
  const bodyMsgOtherCookie = await withMsgOtherCookie.text();
  assert.equal(bodyMsg, bodyMsgOtherCookie, "same query string, different cookie -> identical body (not visitor-dependent)");
});

test("A: GET /store/buy — MUST NEVER get a cache header of any kind (it's a GET that mutates)", async (t) => {
  const deps: RouteDeps = createRouteDeps();
  deps.store = {
    listProducts: () => [{ id: "p1", title: "Test Widget", price: 500, stock: 3, version: 1 }],
    checkout: () => ({ ok: true, orderId: "o1", remainingStock: 2, retries: 0 }),
  };
  const app = express();
  registerStoreRoutes(app, deps);
  const baseUrl = await startTestServer(app, t);

  // redirect: false so we can inspect the redirect response itself, not follow it.
  const res = await fetch(`${baseUrl}/store/buy?productId=p1`, { redirect: "manual" });
  logRow("GET /store/buy", summarizeCacheHeaders(res), `status=${res.status} (a redirect, per the handler's own res.redirect())`);
  assert.equal(
    res.headers.get("cache-control"),
    null,
    "Phase 2 explicitly forbids ANY cache header here — this GET mutates (stock decrement + order write); caching or a CDN/crawler prefetching it would be actively dangerous"
  );
});

test("A: does the auto-generated ETag actually short-circuit a conditional GET today?", async (t) => {
  const { app } = buildPublicSiteApp();
  const baseUrl = await startTestServer(app, t);

  const first = await fetch(`${baseUrl}/about`);
  const etag = first.headers.get("etag");
  assert.ok(etag, "expected Express's own default ETag to be present");
  const conditional = await fetch(`${baseUrl}/about`, { headers: { "if-none-match": etag! } });
  const secondBody = conditional.status === 200 ? (await conditional.text()).length : 0;
  // eslint-disable-next-line no-console
  console.log(
    `CACHE\tGET /about (If-None-Match: ${etag})\tstatus=${conditional.status}\tbody bytes re-sent=${secondBody}\t` +
      `FINDING: an ETag is present, but a matching If-None-Match does NOT short-circuit to 304 today — the full body is re-sent every time regardless`
  );
  // Measured, not assumed: this app does NOT return 304 for a matching conditional GET as things
  // stand — the auto-ETag is computed and sent on every response but currently buys nothing, since
  // nothing (server or CDN) ever gets to use it to skip re-sending the body.
  assert.equal(conditional.status, 200, "confirms the measured (not assumed) behavior: no 304 short-circuit today");
});

test("A: GET /products/:id (detail)", async (t) => {
  const deps: RouteDeps = createRouteDeps();
  deps.store = { listProducts: () => [{ id: "p1", title: "Test Widget", price: 500, stock: 3, version: 1 }], checkout: () => ({ ok: true, orderId: "o1", remainingStock: 2, retries: 0 }) };
  const app = express();
  registerProductRoutes(app, deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/products/p1`);
  assert.equal(res.status, 200);
  logRow("GET /products/:id", summarizeCacheHeaders(res), "");
  assert.equal(res.headers.get("cache-control"), EXPECTED_CACHE_CONTROL, "Phase 2: /products/:id must send the owner-decided Cache-Control");
  const bodyA = await res.text();
  const flavored = await fetch(`${baseUrl}/products/p1`, { headers: { cookie: "x=1" } });
  const bodyB = await flavored.text();
  assert.equal(bodyA, bodyB, "product detail body must be identical regardless of cookie");
});

test("A: GET /sitemap.xml and /robots.txt — headers + cacheability", async (t) => {
  const { app } = buildPublicSiteApp();
  const baseUrl = await startTestServer(app, t);

  const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  logRow("GET /sitemap.xml", summarizeCacheHeaders(sitemap), "");
  assert.equal(sitemap.headers.get("cache-control"), EXPECTED_CACHE_CONTROL, "Phase 2: /sitemap.xml must send the owner-decided Cache-Control");

  const robots = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(robots.status, 200);
  logRow("GET /robots.txt", summarizeCacheHeaders(robots), "");
  assert.equal(robots.headers.get("cache-control"), EXPECTED_CACHE_CONTROL, "Phase 2: /robots.txt must send the owner-decided Cache-Control");

  const bodyA = await sitemap.text();
  const sitemapAgain = await fetch(`${baseUrl}/sitemap.xml`, { headers: { cookie: "x=1" } });
  const bodyB = await sitemapAgain.text();
  assert.equal(bodyA, bodyB, "sitemap body must be identical regardless of cookie");
});
