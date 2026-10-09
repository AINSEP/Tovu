import assert from "node:assert/strict";
import test from "node:test";

import { createHttpClient } from "#src/platform/http/client";
import type { HttpRequest, HttpResponse, HttpTransportAdapter } from "#src/platform/http/ports";
import { WEB_SCREENSHOT_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import { createRequestRouter, decideRequest, MAX_REDIRECT_HOPS, type FetchedResource, type OwnSiteFetch, type RouteLike } from "../request-guard.js";

/**
 * @file The screenshot browser's request router, against the REAL guarded client (`platform/http`)
 * with a fake DNS and a fake pinned transport — so every "refused" below is the production SSRF
 * guard refusing, and "the transport was never called" proves no socket would have opened.
 */

const DNS: Record<string, string[]> = {
  "public.example": ["93.184.216.34"],
  "cdn.example": ["151.101.1.1"],
  "intranet.example": ["10.0.0.5"],
  "rebind.example": ["93.184.216.35", "127.0.0.1"],
  "metadata.example": ["169.254.169.254"],
  localhost: ["127.0.0.1"],
};

function guardedClient(respond: (request: HttpRequest) => HttpResponse = () => ({ status: 200, headers: { "content-type": "text/html" }, bodyText: "<p>ok</p>", bodyBytes: Buffer.from("<p>ok</p>") })) {
  const sent: string[] = [];
  const transport: HttpTransportAdapter = {
    async requestPinned(request, peer) {
      sent.push(`${request.method} ${request.url} @${peer.ip}`);
      return respond(request);
    },
  };
  const client = createHttpClient(
    { transport, policy: WEB_SCREENSHOT_EGRESS_POLICY },
    { dns: { resolve: async ({ hostname }) => { const found = DNS[hostname]; if (!found) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }); return found; } } },
  );
  return { client, sent };
}

interface FakeRouteOptions { method?: string; resourceType?: string; navigation?: boolean; mainFrame?: boolean; headers?: Record<string, string> }

function fakeRoute(url: string, { method = "GET", resourceType = "image", navigation = false, mainFrame = true, headers = {} }: FakeRouteOptions = {}) {
  const outcome: { aborted?: string; fulfilled?: { status: number; headers: Record<string, string>; body: string } } = {};
  const route: RouteLike = {
    request: () => ({
      url: () => url, method: () => method, headers: () => headers, resourceType: () => resourceType,
      isNavigationRequest: () => navigation,
      frame: () => ({ parentFrame: () => (mainFrame ? null : {}) }),
    }),
    fulfill: async ({ status, headers: responseHeaders, body }) => { outcome.fulfilled = { status, headers: responseHeaders, body: body.toString() }; },
    abort: async (code) => { outcome.aborted = code ?? "aborted"; },
  };
  return { route, outcome };
}

const neverOwnSite: OwnSiteFetch = async () => assert.fail("the own-site fetch must not be used for this origin");

function router(client: ReturnType<typeof guardedClient>["client"], { allowedOrigins = [] as string[], ownSiteFetch = neverOwnSite, ...options }: { allowedOrigins?: string[]; ownSiteFetch?: OwnSiteFetch; maxRequests?: number; maxTotalBytes?: number; maxConcurrent?: number } = {}) {
  return createRequestRouter({ httpClient: client, ownSiteFetch, allowedOrigins, signal: new AbortController().signal }, options);
}

test("decideRequest: only http(s) GET/HEAD is fetched; allowlisted origins take the own-site path", () => {
  const base = { method: "GET", resourceType: "image", allowedOrigins: ["http://127.0.0.1:5000"] };
  assert.deepEqual(decideRequest({ ...base, url: "https://public.example/a.png" }), { action: "fetch", via: "guarded", method: "GET" });
  assert.deepEqual(decideRequest({ ...base, url: "http://127.0.0.1:5000/a.png", method: "head" }), { action: "fetch", via: "own-site", method: "HEAD" });
  assert.deepEqual(decideRequest({ ...base, url: "http://127.0.0.1:5001/a.png" }), { action: "fetch", via: "guarded", method: "GET" }, "another loopback port is NOT the allowlisted origin");
  for (const url of ["file:///etc/passwd", "ftp://public.example/x", "chrome://settings", "not a url"]) {
    assert.deepEqual(decideRequest({ ...base, url }), { action: "abort", reason: "scheme" }, url);
  }
  assert.deepEqual(decideRequest({ ...base, url: "https://public.example/beacon", method: "POST" }), { action: "abort", reason: "method" });
  assert.deepEqual(decideRequest({ ...base, url: "https://public.example/v.mp4", resourceType: "media" }), { action: "abort", reason: "resource-type" });
  assert.deepEqual(decideRequest({ ...base, url: "https://public.example/live", resourceType: "eventsource" }), { action: "abort", reason: "resource-type" });
});

test("a public subresource is fetched through the guard (pinned to its vetted address) and fulfilled", async () => {
  const { client, sent } = guardedClient();
  const r = router(client);
  const { route, outcome } = fakeRoute("https://public.example/style.css", { resourceType: "stylesheet" });
  await r.handle(route);
  assert.deepEqual(sent, ["GET https://public.example/style.css @93.184.216.34"]);
  assert.equal(outcome.fulfilled?.status, 200);
  assert.equal(outcome.fulfilled?.body, "<p>ok</p>");
  assert.deepEqual(r.report(), { fulfilled: 1, blocked: 0, navigationRefused: false, bytes: 9 });
});

test("SSRF: subresources aimed at private, loopback, metadata or rebinding hosts are blocked and never reach the transport", async () => {
  const { client, sent } = guardedClient();
  const r = router(client);
  const targets = ["http://intranet.example/x.png", "http://metadata.example/latest/meta-data/", "http://rebind.example/x.js", "http://127.0.0.1:3000/admin", "http://[::1]/", "http://localhost/", "http://169.254.169.254/", "http://192.168.1.1/"];
  for (const url of targets) {
    const { route, outcome } = fakeRoute(url, { resourceType: "script" });
    await r.handle(route);
    assert.equal(outcome.aborted, "blockedbyclient", url);
    assert.equal(outcome.fulfilled, undefined, url);
  }
  assert.deepEqual(sent, [], "no private target may reach the transport");
  assert.equal(r.report().blocked, targets.length);
  assert.equal(r.report().navigationRefused, false, "subresource refusals are not a refused page");
});

// Playwright does not route the next hop of a FULFILLED 3xx (Chromium sends it to the network), so
// no redirect may ever be fulfilled: the page's own is recorded for the capture to navigate to.
test("SSRF: the page's redirect is never fulfilled; its target is recorded, and that next hop is refused as the page's navigation", async () => {
  const { client, sent } = guardedClient(() => ({ status: 302, headers: { location: "http://intranet.example/secret" }, bodyText: "", bodyBytes: new Uint8Array() }));
  const r = router(client);
  const first = fakeRoute("https://public.example/", { resourceType: "document", navigation: true });
  await r.handle(first.route);
  assert.equal(first.outcome.fulfilled, undefined, "a fulfilled 3xx would be followed by Chromium outside the router");
  assert.equal(first.outcome.aborted, "aborted", "ERR_ABORTED commits no error page that would interrupt the next navigation");
  assert.equal(r.takeNavigationRedirect(), "http://intranet.example/secret");
  assert.equal(r.takeNavigationRedirect(), undefined, "taking the target clears it");
  assert.deepEqual(sent, ["GET https://public.example/ @93.184.216.34"], "the guard must not follow the redirect itself");
  assert.equal(r.report().blocked, 0, "a recorded redirect is not a block");

  const hop = fakeRoute("http://intranet.example/secret", { resourceType: "document", navigation: true });
  await r.handle(hop.route);
  assert.equal(hop.outcome.aborted, "blockedbyclient");
  assert.equal(sent.length, 1);
  assert.equal(r.report().navigationRefused, true);
});

test("a subresource redirect is followed here, hop by hop through the guard, and only the final answer is fulfilled", async () => {
  const { client, sent } = guardedClient((request): HttpResponse => request.url === "https://public.example/logo.png"
    ? { status: 301, headers: { location: "https://cdn.example/logo.png" }, bodyText: "", bodyBytes: new Uint8Array() }
    : { status: 200, headers: { "content-type": "image/png" }, bodyText: "", bodyBytes: Buffer.from("PNG") });
  const r = router(client);
  const { route, outcome } = fakeRoute("https://public.example/logo.png");
  await r.handle(route);
  assert.deepEqual(sent, ["GET https://public.example/logo.png @93.184.216.34", "GET https://cdn.example/logo.png @151.101.1.1"]);
  assert.equal(outcome.fulfilled?.status, 200);
  assert.equal(outcome.fulfilled?.body, "PNG");
  assert.equal(r.takeNavigationRedirect(), undefined, "a subresource redirect is not the page's");
});

test("SSRF: a subresource redirect to a private address is refused at that hop; a redirect loop stops at MAX_REDIRECT_HOPS", async () => {
  const toPrivate = guardedClient();
  const ownSiteFetch: OwnSiteFetch = async () => ({ status: 302, headers: { Location: "http://127.0.0.1:3000/admin" }, body: Buffer.alloc(0), truncated: false });
  const leaving = router(toPrivate.client, { allowedOrigins: ["http://127.0.0.1:5000"], ownSiteFetch });
  const own = fakeRoute("http://127.0.0.1:5000/a.js", { resourceType: "script" });
  await leaving.handle(own.route);
  assert.equal(own.outcome.aborted, "blockedbyclient", "the own-site origin cannot redirect the browser onto another loopback port");
  assert.deepEqual(toPrivate.sent, [], "the private hop never reaches the transport");

  const loop = guardedClient(() => ({ status: 302, headers: { location: "/again" }, bodyText: "", bodyBytes: new Uint8Array() }));
  const looping = router(loop.client);
  const { route, outcome } = fakeRoute("https://public.example/start");
  await looping.handle(route);
  assert.equal(outcome.aborted, "failed");
  assert.equal(loop.sent.length, MAX_REDIRECT_HOPS + 1);
});

test("a refused navigation inside an iframe blocks that frame but does not mark the page refused", async () => {
  const { client } = guardedClient();
  const r = router(client);
  const { route, outcome } = fakeRoute("http://intranet.example/", { resourceType: "document", navigation: true, mainFrame: false });
  await r.handle(route);
  assert.equal(outcome.aborted, "blockedbyclient");
  assert.equal(r.report().navigationRefused, false);
});

test("own-site allowlist: the injected origin is fetched through ownSiteFetch only, with the same header hygiene", async () => {
  const { client, sent } = guardedClient();
  const ownCalls: string[] = [];
  const ownSiteFetch: OwnSiteFetch = async ({ url, method, headers }) => {
    ownCalls.push(`${method} ${url} ${JSON.stringify(headers)}`);
    return { status: 200, headers: { "content-type": "text/html", "set-cookie": "sid=1" }, body: Buffer.from("own"), truncated: false } satisfies FetchedResource;
  };
  const r = router(client, { allowedOrigins: ["http://127.0.0.1:5000"], ownSiteFetch });
  const own = fakeRoute("http://127.0.0.1:5000/about", { resourceType: "document", navigation: true, headers: { cookie: "a=b", accept: "text/html" } });
  await r.handle(own.route);
  assert.deepEqual(ownCalls, ['GET http://127.0.0.1:5000/about {"accept":"text/html"}']);
  assert.equal(own.outcome.fulfilled?.body, "own");
  assert.equal(own.outcome.fulfilled?.headers["set-cookie"], undefined);

  const otherPort = fakeRoute("http://127.0.0.1:5001/", { resourceType: "fetch" });
  await r.handle(otherPort.route);
  assert.equal(otherPort.outcome.aborted, "blockedbyclient", "loopback beyond the one injected origin stays refused");
  assert.deepEqual(sent, []);
});

test("credentials never travel: Cookie/Authorization are dropped outbound, Set-Cookie and encoding headers stripped inbound", async () => {
  const seen: Array<Readonly<Record<string, string>>> = [];
  const { client } = guardedClient((request) => {
    seen.push(request.headers);
    return { status: 200, headers: { "content-type": "image/png", "set-cookie": "track=1", "content-encoding": "gzip", "content-length": "999", "access-control-allow-origin": "*" }, bodyText: "", bodyBytes: Buffer.from("PNG") };
  });
  const r = router(client);
  const { route, outcome } = fakeRoute("https://cdn.example/logo.png", { headers: { cookie: "sid=secret", authorization: "Bearer x", referer: "https://public.example/", ":authority": "cdn.example" } });
  await r.handle(route);
  const outbound = Object.keys(seen[0]!).map((name) => name.toLowerCase());
  assert.ok(!outbound.includes("cookie") && !outbound.includes("authorization") && !outbound.includes(":authority"), outbound.join(","));
  assert.ok(outbound.includes("referer"));
  assert.deepEqual(outcome.fulfilled?.headers, { "content-type": "image/png", "access-control-allow-origin": "*" });
});

test("budgets: requests past maxRequests, bytes past maxTotalBytes, and clipped bodies are aborted, not fulfilled", async () => {
  const { client } = guardedClient(() => ({ status: 200, headers: {}, bodyText: "", bodyBytes: Buffer.alloc(10) }));
  const r = router(client, { maxRequests: 2, maxTotalBytes: 15 });
  const outcomes = [];
  for (let index = 0; index < 3; index += 1) {
    const { route, outcome } = fakeRoute(`https://public.example/${index}.png`);
    await r.handle(route);
    outcomes.push(outcome.fulfilled ? "fulfilled" : outcome.aborted);
  }
  assert.deepEqual(outcomes, ["fulfilled", "blockedbyclient", "blockedbyclient"], "second exceeds the 15-byte budget, third the 2-request budget");

  const clipped = guardedClient(() => ({ status: 200, headers: {}, bodyText: "", bodyBytes: Buffer.alloc(4), bodyBytesTruncated: true }));
  const { route, outcome } = fakeRoute("https://public.example/huge.jpg");
  await router(clipped.client).handle(route);
  assert.equal(outcome.aborted, "blockedbyclient", "a half image is corrupt; it must not be fulfilled");
});

test("a transport failure aborts the request as 'failed' and does not count as an SSRF refusal", async () => {
  const { client } = guardedClient(() => { throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }); });
  const r = router(client);
  const { route, outcome } = fakeRoute("https://public.example/", { resourceType: "document", navigation: true });
  await r.handle(route);
  assert.equal(outcome.aborted, "failed");
  assert.equal(r.report().navigationRefused, false);
});

test("at most maxConcurrent fetches are in flight at once", async () => {
  let inFlight = 0;
  let peak = 0;
  const transport: HttpTransportAdapter = {
    async requestPinned() {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { status: 200, headers: {}, bodyText: "", bodyBytes: Buffer.from("x") };
    },
  };
  const client = createHttpClient({ transport, policy: WEB_SCREENSHOT_EGRESS_POLICY }, { dns: { resolve: async () => ["93.184.216.34"] } });
  const r = router(client, { maxConcurrent: 2 });
  await Promise.all(Array.from({ length: 6 }, (_, index) => r.handle(fakeRoute(`https://public.example/${index}`).route)));
  assert.equal(peak, 2);
  assert.equal(r.report().fulfilled, 6);
});
