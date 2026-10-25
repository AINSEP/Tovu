import assert from "node:assert/strict";
import { Server } from "node:http";
import test from "node:test";
import { OriginNotVerifiedError, type VerifiedOrigin } from "@jini-ai/http-kit/verified-origin";
import type { HttpRequest, HttpResponse } from "#src/platform/http/index";
import type { PublishContentPeerRecord } from "#src/features/publish-content/peers";
import { fetchLiveUrl, listKnownLiveOrigins, type FetchLiveUrlDeps } from "../live-url.js";
import { readPageBodyOptions, shapePageBody } from "../page-body.js";
import { fetchPublishedPage, type FetchPublishedPageDeps, type FetchPublishedPageOptions } from "../published-page.js";

const origin = "https://site.example";

test("L131: option validation preserves boundaries, omitted keys and first failure", () => {
  assert.deepEqual(readPageBodyOptions({}), { find: undefined, textOnly: undefined, maxBytes: undefined });
  for (const maxBytes of [1, 1_000_000]) {
    assert.deepEqual(readPageBodyOptions({ find: "a".repeat(200), textOnly: false, maxBytes }), { find: "a".repeat(200), textOnly: false, maxBytes });
  }
  for (const maxBytes of [null, "1", NaN, Infinity, 0, -1, 1.5, 1_000_001]) {
    assert.throws(() => readPageBodyOptions({ maxBytes }), { message: "maxBytes must be an integer of 1..1000000." });
  }
  for (const find of [null, 1, "", "x".repeat(201)]) {
    assert.throws(() => readPageBodyOptions({ find, textOnly: "bad", maxBytes: 0 }), { message: "find must be a string of 1..200 characters." });
  }
  assert.throws(() => readPageBodyOptions({ textOnly: null, maxBytes: 0 }), { message: "textOnly must be a boolean." });
  assert.deepEqual(readPageBodyOptions({ find: "x", textOnly: true }), { find: "x", textOnly: true, maxBytes: undefined });
});

test("L131: visible traversal keeps inline order, block gaps and decoded text while omitting inert nodes", () => {
  const html = '<!--hidden--><title>Title</title><main>A<span>B</span><br>C<div>D &amp; é</div><script>bad</script><style>bad</style><noscript>bad</noscript><template><p>bad</p></template><img alt="bad"><!--hidden-->E</main>';
  assert.deepEqual(shapePageBody(html, { textOnly: true }), { body: "Title AB C D & é E", bodyBytes: 19, truncated: false });
  assert.deepEqual(shapePageBody("<div>".repeat(5000) + "ok" + "</div>".repeat(5000), { textOnly: true }), { body: "ok", bodyBytes: 2, truncated: false });
  assert.deepEqual(shapePageBody("<!--only--><script>bad</script>", { textOnly: true }), { body: "", bodyBytes: 0, truncated: false });
});

function peer(required: { baseUrl: string; updatedAt: string; keyed: boolean }): PublishContentPeerRecord {
  return { workspaceId: "w", id: required.baseUrl, label: "peer", baseUrl: required.baseUrl, remoteWorkspaceId: "remote", sealed: required.keyed ? { keyId: "test", ciphertext: "", nonce: "", alg: "test" } : null, masked: null, aadVersion: 1, createdAt: "2026-01-01", updatedAt: required.updatedAt };
}

test("L131: origin sources retain keyed peers and latest connected peer, normalize, sort and deduplicate", async () => {
  const rows = [peer({ baseUrl: "https://old.example", updatedAt: "a", keyed: false }), peer({ baseUrl: origin + "/path", updatedAt: "b", keyed: false }), peer({ baseUrl: "https://keyed.example", updatedAt: "a", keyed: true })];
  assert.deepEqual(await listKnownLiveOrigins({ workspaceId: "w" }), []);
  assert.deepEqual(await listKnownLiveOrigins({ workspaceId: "w", publishContentPeerRepo: { listByWorkspace: async input => { assert.equal(input.workspaceId, "w"); return rows; } }, publishHistoryStore: { listLiveUrls: async input => { assert.equal(input.workspaceId, "w"); return [origin, "https://history.example/page"]; } } }), ["https://history.example", "https://keyed.example", origin]);
  assert.deepEqual(await listKnownLiveOrigins({ workspaceId: "w", publishHistoryStore: { listLiveUrls: async () => Array.from({ length: 200 }, () => origin) } }), [origin]);
  await assert.rejects(listKnownLiveOrigins({ workspaceId: "w", publishHistoryStore: { listLiveUrls: async () => Array.from({ length: 201 }, () => origin) } }), { message: "fetch_live_url: more than 200 distinct live addresses are recorded. Review the publish history before fetching." });
});

test("L131: configured origins include only workspace settings and suppress only missing verification", async () => {
  const configured: VerifiedOrigin = { scheme: "https", host: "configured.example", source: "workspace-setting", verifiedAt: "2026-01-01" };
  for (const port of [undefined, 443]) {
    assert.deepEqual(await listKnownLiveOrigins({ workspaceId: "w", originRegistry: { canonicalOrigin: async input => { assert.equal(input.workspaceId, "w"); return { ...configured, ...(port === undefined ? {} : { port }) }; } } }), ["https://configured.example"]);
  }
  assert.deepEqual(await listKnownLiveOrigins({ workspaceId: "w", originRegistry: { canonicalOrigin: async () => ({ ...configured, source: "dev-capability" }) } }), []);
  assert.deepEqual(await listKnownLiveOrigins({ workspaceId: "w", originRegistry: { canonicalOrigin: async () => { throw new OriginNotVerifiedError({ message: "missing" }); } } }), []);
  const failure = new Error("registry failed");
  await assert.rejects(listKnownLiveOrigins({ workspaceId: "w", originRegistry: { canonicalOrigin: async () => { throw failure; } } }), error => error === failure);
  for (const saved of ["invalid", "http://site.example", "https://site.example:8443", "https://user:pass@site.example"]) {
    await assert.rejects(listKnownLiveOrigins({ workspaceId: "w", publishHistoryStore: { listLiveUrls: async () => [saved] } }), { message: saved === "invalid" ? "fetch_live_url: a saved live address is invalid. Correct the publishing address and retry." : "fetch_live_url: live origins must use HTTPS on port 443 without credentials." });
  }
});

function liveFixture(responses: HttpResponse[]) {
  const calls: HttpRequest[] = [];
  const deps: FetchLiveUrlDeps = { listKnownOrigins: async () => [origin], httpClient: { send: async request => {
    calls.push(request);
    const response = responses.shift();
    assert.ok(response, "unexpected request");
    return response;
  } } };
  return { deps, calls };
}

test("L131: live response projection preserves status edges, headers, cookie shapes and read caps", async () => {
  for (const status of [199, 200, 299, 300, 302, 404]) {
    const { deps, calls } = liveFixture([{ status, headers: { "X-Test": "kept", "Set-Cookie": "sid=value", Location: "/next" }, setCookies: ["sid=value; Secure; Path=/"], bodyText: "hello" }]);
    // Nonredirect statuses retain a Location header but expose no separate location property.
    if (status === 302) deps.httpClient.send = async request => { calls.push(request); return { status, headers: { Location: "https://elsewhere.example/" }, bodyText: "hello" }; };
    const result = await fetchLiveUrl(deps, { path: "/about?q=1", maxBytes: 3 });
    assert.equal(result.ok, status >= 200 && status < 300);
    assert.equal(result.path, "/about?q=1");
    assert.equal(result.body, "hel"); assert.equal(result.truncated, true);
    assert.equal(calls[0]!.maxResponseBytes, 3);
    assert.equal(result.location, status === 302 ? "https://elsewhere.example/" : undefined);
    if (status !== 302) {
      assert.deepEqual(result.headers, { "x-test": "kept", location: "/next" });
      assert.deepEqual(result.cookies, [{ name: "sid", attributes: ["Secure", "Path=/"] }]);
    }
  }
  const emptyRedirect = liveFixture([{ status: 302, headers: { location: "" }, bodyText: "" }]);
  assert.equal((await fetchLiveUrl(emptyRedirect.deps, { path: "/" })).location, undefined);
  assert.equal(emptyRedirect.calls[0]!.maxResponseBytes, 20_000);
  for (const options of [{ textOnly: true }, { find: "x" }]) {
    const f = liveFixture([{ status: 200, headers: {}, bodyText: "x", bodyTruncated: true }]);
    assert.equal((await fetchLiveUrl(f.deps, { path: "/", ...options })).truncated, true);
    assert.equal(f.calls[0]!.maxResponseBytes, 1_000_000);
  }
  const oversized = liveFixture([{ status: 200, headers: {}, bodyText: "x".repeat(1_000_001) }]);
  const capped = await fetchLiveUrl(oversized.deps, { path: "/", maxBytes: 1_000_000 });
  assert.equal(capped.bodyBytes, 1_000_000); assert.equal(capped.truncated, true);
});

test("L131: live redirect loop stops at three hops or off-origin and returns final evidence", async () => {
  const chain = liveFixture(Array.from({ length: 4 }, (_, i) => ({ status: 302, headers: { location: "/hop" + i }, bodyText: "moved" })));
  const stopped = await fetchLiveUrl(chain.deps, { path: "/" });
  assert.deepEqual(stopped.redirects, [origin + "/hop0", origin + "/hop1", origin + "/hop2"]);
  assert.equal(stopped.url, origin + "/hop2"); assert.equal(stopped.location, "/hop3"); assert.equal(chain.calls.length, 4);
  const cross = liveFixture([{ status: 301, headers: { location: "https://elsewhere.example/" }, bodyText: "moved" }]);
  assert.deepEqual((await fetchLiveUrl(cross.deps, { path: "/" })).redirects, []);
  assert.equal(cross.calls.length, 1);
});

function publishedFixture(fetch: typeof globalThis.fetch) {
  let closed = 0;
  const deps: FetchPublishedPageDeps = { createSiteApp: () => () => {}, fetch, createServer: listener => {
    const server = new Server(listener);
    Object.assign(server, {
      listen: () => { queueMicrotask(() => server.emit("listening")); return server; },
      address: () => ({ address: "127.0.0.1", family: "IPv4", port: 53142 }),
      closeAllConnections: () => {},
      close: (done: () => void) => { closed++; done(); return server; },
    });
    return server;
  } };
  return { deps, closed: () => closed };
}

test("L131: published rendering keeps manual redirects, cookie redaction and legacy/shaped byte counts", async () => {
  const cases: FetchPublishedPageOptions[] = [{ maxBytes: 1 }, { maxBytes: 1, textOnly: true }, { find: "é" }, {}];
  for (const options of cases) {
    const f = publishedFixture(async (url, init) => {
      assert.equal(url, "http://127.0.0.1:53142/page?q=1"); assert.equal(init?.redirect, "manual"); assert.ok(init?.signal);
      return new Response("é", { status: 302, headers: { "set-cookie": "sid=value; Secure", location: "/next" } });
    });
    const result = await fetchPublishedPage(f.deps, { path: "/page?q=1" }, options);
    assert.equal(result.status, 302); assert.equal(result.ok, false);
    assert.equal(result.headers["set-cookie"], undefined); assert.equal(result.headers.location, "/next");
    assert.deepEqual(result.cookies, [{ name: "sid", attributes: ["Secure"] }]);
    assert.equal(result.truncated, options.maxBytes === 1);
    if (options.find) assert.deepEqual(result.matches, [{ offset: 0, snippet: "é" }]);
    else assert.equal(result.body, options.maxBytes === 1 ? (options.textOnly ? "" : "�") : "é");
    assert.equal(result.bodyBytes, options.maxBytes === 1 ? (options.textOnly ? 0 : 1) : 2);
    assert.equal(f.closed(), 1);
  }
});

test("L131: published transport maps only timeout/abort errors and always closes", async () => {
  for (const name of ["TimeoutError", "AbortError", "OtherError"]) {
    const failure = new Error("failed"); failure.name = name;
    const f = publishedFixture(async () => { throw failure; });
    await assert.rejects(fetchPublishedPage(f.deps, { path: "/" }, { timeoutMs: 12 }), name === "OtherError" ? error => error === failure : { name: "PublishedPageTimeoutError", message: "rendering '/' exceeded 12ms" });
    assert.equal(f.closed(), 1);
  }
  const f = publishedFixture(async () => { throw "transport failure"; });
  await assert.rejects(fetchPublishedPage(f.deps, { path: "/" }), error => error === "transport failure");
  assert.equal(f.closed(), 1);
});


test("L131: published body timeout escapes transport error mapping (reported, not fixed)", async () => {
  const failure = new Error("body timed out"); failure.name = "TimeoutError";
  const f = publishedFixture(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.error(failure); } })));
  await assert.rejects(fetchPublishedPage(f.deps, { path: "/" }), error => error === failure);
  assert.equal(f.closed(), 1);
});
