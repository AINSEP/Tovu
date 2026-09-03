import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { FORM_FLASH_COOKIE_NAME } from "../../inbound/public-http/http/site/render.js";
import { MEMBER_SESSION_COOKIE } from "../../inbound/public-http/routes/members/complete-sign-in.js";
import { registerSiteRoutes } from "../../inbound/public-http/routes/site/pages.js";
import { registerProductRoutes } from "../../inbound/public-http/routes/site/products.js";
import { registerStoreRoutes } from "../../inbound/public-http/routes/site/store.js";
import { createSeoModule } from "../../runtime/composition/modules/seo.js";
import type { RouteDeps } from "../../routes/types.js";
import { startTestServer } from "../helpers/http-test-server.js";

/**
 * @file Measurement instrument — deliverable A of the public-site request-cost audit
 * (TM-TOVU-2026-08-12-A follow-up: "if somebody deploys Tovu to a website, is it putting a lot of
 * stress on the server / costing a lot of money?"). The `A:` tests began measurement-only; they and
 * the `B:` group added 2026-09-02 now also carry this repo's cache-header regression guards — the
 * one place that asserts what `Cache-Control` each public route actually sends. Run with:
 * `node --import tsx --test src/server/__tests__/routes/request-cost-cacheability.measurement.test.ts`
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

// ---------------------------------------------------------------------------
// B: form-result cacheability regression guard (2026-09-02).
//
// `799a6b1f` kept submitted field values OUT of the query string ("Values never touch the query
// string — a privacy requirement") and then sent the response body that repopulates those values
// under `CACHE_CONTROL_PUBLIC_PAGE` with no `Vary`. Two consequences the assertions below pin:
//   1. Shared-cache cross-visitor leak — `public` with no `Vary: Cookie` lets a CDN/proxy serve
//      visitor A's re-populated name/email/message body to visitor B.
//   2. The flash cookie's read-once contract is defeated by the HTTP cache — the cookie is cleared
//      with `Max-Age=0`, but the body holding the values stays cacheable for 60s under a
//      value-free URL, so a back-navigation re-serves them after the cookie is gone.
// `Vary: Cookie` alone would close (1) and leave (2); `private, no-store` closes both.
// ---------------------------------------------------------------------------

/** The directive a response whose body carries Post/Redirect/Get form state must send INSTEAD of
 *  {@link EXPECTED_CACHE_CONTROL}. Mirrors the literal `pages.ts` sets its own
 *  `CACHE_CONTROL_PRIVATE_FORM_RESULT` constant to, the same independent-copy convention
 *  {@link EXPECTED_CACHE_CONTROL} already documents. */
const EXPECTED_CACHE_CONTROL_FORM_RESULT = "private, no-store";

/** A hand-built PRG landing query — the real `form`/`form_status`/`form_errors` keys
 *  `encodeFormSubmissionResultQuery` writes and `decodeFormSubmissionResultFromQuery` reads. */
const VALIDATION_LANDING_QUERY = `form=contact&form_status=validation&form_errors=${encodeURIComponent(
  JSON.stringify([{ field: "email", reason: "required" }])
)}`;

/** A `tovu_form_flash` cookie in the exact wire shape `forms-submit.ts`'s `setFormFlashCookie`
 *  writes (`encodeURIComponent`-d JSON), so this exercises the real decode path rather than a
 *  test-only stand-in. */
function flashCookieHeader(values: Record<string, string>, slug = "contact"): string {
  return `${FORM_FLASH_COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ slug, values }))}`;
}

test("B: home — a PRG landing carrying form state must not be publicly cacheable", async (t) => {
  const { app } = buildPublicSiteApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/?${VALIDATION_LANDING_QUERY}`);
  assert.equal(res.status, 200);
  logRow("GET /?form_status=validation", summarizeCacheHeaders(res), "PRG landing on the home branch");
  assert.equal(
    res.headers.get("cache-control"),
    EXPECTED_CACHE_CONTROL_FORM_RESULT,
    "a response whose body was rewritten with this visitor's form result must never be stored by a shared cache"
  );
});

test("B: static-theme marketing page — a PRG landing carrying form state must not be publicly cacheable", async (t) => {
  const { app } = buildPublicSiteApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/about?${VALIDATION_LANDING_QUERY}`);
  assert.equal(res.status, 200);
  logRow("GET /about?form_status=validation", summarizeCacheHeaders(res), "PRG landing on the marketing-page branch");
  assert.equal(res.headers.get("cache-control"), EXPECTED_CACHE_CONTROL_FORM_RESULT, "the marketing-page branch splices the same form result in");
});

test("B: dynamic post page — a PRG landing carrying form state must not be publicly cacheable", async (t) => {
  const { app } = buildPublicSiteApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/the-weight-of-type?${VALIDATION_LANDING_QUERY}`);
  assert.equal(res.status, 200);
  logRow("GET /:slug?form_status=validation", summarizeCacheHeaders(res), "PRG landing on the generic post branch");
  assert.equal(res.headers.get("cache-control"), EXPECTED_CACHE_CONTROL_FORM_RESULT, "the generic post branch splices the same form result in");
});

test("B: the flash cookie's read-once clear must not ride a publicly cacheable response", async (t) => {
  const { app } = buildPublicSiteApp();
  const baseUrl = await startTestServer(app, t);

  // No `form_*` query params at all — this is the arm where the merged RESULT is `undefined` but a
  // flash cookie was still read and cleared. Caching this response publicly would let a shared cache
  // replay the clearing `Set-Cookie` to other visitors, and pin a body produced while per-visitor
  // state was in hand.
  const res = await fetch(`${baseUrl}/`, {
    headers: { cookie: flashCookieHeader({ name: "Ada Lovelace", email: "ada@example.com" }) },
  });
  assert.equal(res.status, 200);
  logRow("GET / (flash cookie, no form_* query)", summarizeCacheHeaders(res), "read-once clear arm");
  assert.match(
    res.headers.get("set-cookie") ?? "",
    /tovu_form_flash=;.*Max-Age=0/,
    "precondition: the flash cookie really was read and cleared on THIS response"
  );
  assert.equal(
    res.headers.get("cache-control"),
    EXPECTED_CACHE_CONTROL_FORM_RESULT,
    "a response that consumed the read-once flash cookie must not be stored — the cache would outlive the cookie it cleared"
  );
});

test("B: the ordinary no-form path must STAY publicly cacheable — the fix is scoped, not blanket", async (t) => {
  const { app } = buildPublicSiteApp();
  const baseUrl = await startTestServer(app, t);

  for (const path of ["/", "/about", "/the-weight-of-type"]) {
    const res = await fetch(`${baseUrl}${path}`);
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get("cache-control"),
      EXPECTED_CACHE_CONTROL,
      `${path} carries no form state, so it must keep the owner-decided public directive — making every page private would forfeit Phase 2 entirely`
    );
  }
});

// ---------------------------------------------------------------------------
// B: member-session cacheability regression guard (2026-09-02, ADR-030 §4 gating).
//
// A real hole opened by the member-gating wiring, not a pre-existing one restored. Once
// `filterVisiblePosts` runs on `GET /` and `GET /:slug`, the rendered body VARIES BY THE
// `tovu_member_session` COOKIE: a signed-in member's home grid and "more dispatches" region list
// gated entries an anonymous visitor must never see. Sending that body as `public, max-age=60,
// stale-while-revalidate=300` with no `Vary` lets a CDN replay a member's body — gated titles and
// links included — to anonymous visitors for a minute (five, stale). That defeats precisely what
// gating the listing was for: a gated post whose own page 404s would still be advertised, only now
// by the cache instead of by the renderer.
//
// `private, no-store`, matching the form-result decision immediately above rather than `Vary:
// Cookie` — see `pages.ts`'s `CACHE_CONTROL_PRIVATE_FORM_RESULT` doc block for why `Vary` closes the
// shared-cache leak but leaves the response STORABLE.
// ---------------------------------------------------------------------------

/** The directive a response produced with THIS visitor's member session in hand must send INSTEAD of
 *  {@link EXPECTED_CACHE_CONTROL}. Mirrors the literal `pages.ts` sets its own sibling
 *  `CACHE_CONTROL_PRIVATE_MEMBER_RESPONSE` constant to — same independent-copy convention
 *  {@link EXPECTED_CACHE_CONTROL} and {@link EXPECTED_CACHE_CONTROL_FORM_RESULT} already document.
 *  Same string as the form-result directive by design (both mean "never store this"), asserted
 *  through its own named constant so a later divergence in either decision stays legible here. */
const EXPECTED_CACHE_CONTROL_MEMBER_RESPONSE = "private, no-store";

/** A `tovu_member_session` cookie whose token matches NO stored session. Deliberately unrecognized:
 *  the directive must be decided on cookie PRESENCE, never on whether the session validated or on
 *  whether the filter actually dropped anything this time — a content-dependent trigger leaks the
 *  answer through response timing and header variance. An unrecognized token also keeps every page
 *  below a plain public 200 (`resolveContext` maps it to the anonymous context), so these assertions
 *  read the header on the SAME rendered bodies the anonymous control gets. */
const UNRECOGNIZED_MEMBER_SESSION_COOKIE = `${MEMBER_SESSION_COOKIE}=not-a-real-member-session-token`;

test("B: a member-session response must not be publicly cacheable — anonymous must stay public, and both cookies must not regress", async (t) => {
  const { app } = buildPublicSiteApp();
  const baseUrl = await startTestServer(app, t);

  // All three render branches that now thread a member-filtered `posts` list or sit behind the
  // member gate: home, the static-theme marketing page, and the generic dynamic post page.
  for (const path of ["/", "/about", "/the-weight-of-type"]) {
    const memberRes = await fetch(`${baseUrl}${path}`, { headers: { cookie: UNRECOGNIZED_MEMBER_SESSION_COOKIE } });
    assert.equal(memberRes.status, 200, `precondition: ${path} must still render for a cookie-bearing visitor`);
    logRow(`GET ${path} (member session cookie)`, summarizeCacheHeaders(memberRes), "member-gated per-visitor body");
    assert.equal(
      memberRes.headers.get("cache-control"),
      EXPECTED_CACHE_CONTROL_MEMBER_RESPONSE,
      `${path} was rendered with a member session in hand, so its body varies by cookie and a shared cache must never store it`
    );

    // Anonymous control on the SAME URL — proves the fix is scoped to per-visitor responses and did
    // not simply make every public page private, forfeiting the Phase 2 CDN decision.
    const anonRes = await fetch(`${baseUrl}${path}`);
    assert.equal(anonRes.status, 200);
    assert.equal(
      anonRes.headers.get("cache-control"),
      EXPECTED_CACHE_CONTROL,
      `${path} carries no member session, so it must keep the owner-decided public directive byte-for-byte`
    );
  }

  // Both cookies at once. Two independent per-visitor triggers reach the same one resolver, so this
  // pins that neither can overwrite the other back to `public` — the failure mode a second,
  // branch-local header computation would have produced.
  const bothRes = await fetch(`${baseUrl}/?${VALIDATION_LANDING_QUERY}`, {
    headers: { cookie: `${flashCookieHeader({ name: "Ada Lovelace", email: "ada@example.com" })}; ${UNRECOGNIZED_MEMBER_SESSION_COOKIE}` },
  });
  assert.equal(bothRes.status, 200);
  logRow("GET / (member session + form flash)", summarizeCacheHeaders(bothRes), "both per-visitor triggers at once");
  assert.notEqual(
    bothRes.headers.get("cache-control"),
    EXPECTED_CACHE_CONTROL,
    "a request carrying BOTH a member session and a form flash must never fall back to the public directive"
  );
  assert.equal(
    bothRes.headers.get("cache-control"),
    EXPECTED_CACHE_CONTROL_FORM_RESULT,
    "both triggers resolve to the same never-store directive; neither path may overwrite the other"
  );
});
