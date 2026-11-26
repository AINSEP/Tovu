import assert from "node:assert/strict";
import { Server } from "node:http";
import test from "node:test";
import { selectConnectedDestination, type PublishContentPeerRecord } from "@jini-ai/cms/publish/content/peer-registry";
import { listKnownLiveOrigins } from "@jini-ai/diagnostics/web-evidence/live-url";
import { readPageBodyOptions, shapePageBody } from "@jini-ai/diagnostics/web-evidence/page-body";
import { RESERVED_SEGMENTS } from "@jini-ai/cms/routing/site/reserved-paths";
import { fetchPublishedPage, type FetchPublishedPageDeps, type FetchPublishedPageOptions } from "@jini-ai/diagnostics/web-evidence/published-page";
import { trackFetch } from "@jini-ai/diagnostics/observability";

const origin = "https://site.example";

test("L131: option validation preserves boundaries, omitted keys and first failure", () => {
  assert.deepEqual(readPageBodyOptions({ input: {} }), { find: undefined, textOnly: undefined, maxBytes: undefined });
  for (const maxBytes of [1, 1_000_000]) {
    assert.deepEqual(readPageBodyOptions({ input: { find: "a".repeat(200), textOnly: false, maxBytes } }), { find: "a".repeat(200), textOnly: false, maxBytes });
  }
  for (const maxBytes of [null, "1", NaN, Infinity, 0, -1, 1.5, 1_000_001]) {
    assert.throws(() => readPageBodyOptions({ input: { maxBytes } }), { message: "maxBytes must be an integer of 1..1000000." });
  }
  for (const find of [null, 1, "", "x".repeat(201)]) {
    assert.throws(() => readPageBodyOptions({ input: { find, textOnly: "bad", maxBytes: 0 } }), { message: "find must be a string of 1..200 characters." });
  }
  assert.throws(() => readPageBodyOptions({ input: { textOnly: null, maxBytes: 0 } }), { message: "textOnly must be a boolean." });
  assert.deepEqual(readPageBodyOptions({ input: { find: "x", textOnly: true } }), { find: "x", textOnly: true, maxBytes: undefined });
});

test("L131: visible traversal keeps inline order, block gaps and decoded text while omitting inert nodes", () => {
  const html = '<!--hidden--><title>Title</title><main>A<span>B</span><br>C<div>D &amp; é</div><script>bad</script><style>bad</style><noscript>bad</noscript><template><p>bad</p></template><img alt="bad"><!--hidden-->E</main>';
  assert.deepEqual(shapePageBody({ body: html }, { textOnly: true }), { body: "Title AB C D & é E", bodyBytes: 19, truncated: false });
  assert.deepEqual(shapePageBody({ body: "<div>".repeat(5000) + "ok" + "</div>".repeat(5000) }, { textOnly: true }), { body: "ok", bodyBytes: 2, truncated: false });
  assert.deepEqual(shapePageBody({ body: "<!--only--><script>bad</script>" }, { textOnly: true }), { body: "", bodyBytes: 0, truncated: false });
});

function peer(required: { baseUrl: string; updatedAt: string; keyed: boolean }): PublishContentPeerRecord {
  return { workspaceId: "w", id: required.baseUrl, label: "peer", baseUrl: required.baseUrl, remoteWorkspaceId: "remote", sealed: required.keyed ? { keyId: "test", ciphertext: "", nonce: "", alg: "test" } : null, masked: null, aadVersion: 1, createdAt: "2026-01-01", updatedAt: required.updatedAt };
}

test("L131: origin sources retain keyed peers and latest connected peer, normalize, sort and deduplicate", async () => {
  const rows = [peer({ baseUrl: "https://old.example", updatedAt: "a", keyed: false }), peer({ baseUrl: origin + "/path", updatedAt: "b", keyed: false }), peer({ baseUrl: "https://keyed.example", updatedAt: "a", keyed: true })];
  assert.deepEqual(await listKnownLiveOrigins({ selectConnectedDestination, workspaceId: "w" }), []);
  assert.deepEqual(await listKnownLiveOrigins({ selectConnectedDestination, workspaceId: "w", publishContentPeerRepo: { listByWorkspace: async input => { assert.equal(input.workspaceId, "w"); return rows; } }, publishHistoryStore: { listLiveUrls: async input => { assert.equal(input.workspaceId, "w"); return [origin, "https://history.example/page"]; } } }), ["https://history.example", "https://keyed.example", origin]);
  assert.deepEqual(await listKnownLiveOrigins({ selectConnectedDestination, workspaceId: "w", publishHistoryStore: { listLiveUrls: async () => Array.from({ length: 200 }, () => origin) } }), [origin]);
  await assert.rejects(listKnownLiveOrigins({ selectConnectedDestination, workspaceId: "w", publishHistoryStore: { listLiveUrls: async () => Array.from({ length: 201 }, () => origin) } }), { message: "fetch_live_url: more than 200 distinct live addresses are recorded. Review the publish history before fetching." });
});

function publishedFixture(fetch: typeof globalThis.fetch) {
  let closed = 0;
  const deps: FetchPublishedPageDeps = { reservedSegments: RESERVED_SEGMENTS, trackFetch, createSiteApp: () => () => {}, fetch, createServer: listener => {
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
    const result = await fetchPublishedPage({ deps: f.deps, input: { path: "/page?q=1" } }, options);
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
    await assert.rejects(fetchPublishedPage({ deps: f.deps, input: { path: "/" } }, { timeoutMs: 12 }), name === "OtherError" ? error => error === failure : { name: "PublishedPageTimeoutError", message: "rendering '/' exceeded 12ms" });
    assert.equal(f.closed(), 1);
  }
  const f = publishedFixture(async () => { throw "transport failure"; });
  await assert.rejects(fetchPublishedPage({ deps: f.deps, input: { path: "/" } }), error => error === "transport failure");
  assert.equal(f.closed(), 1);
});


test("L131: published body timeout escapes transport error mapping (reported, not fixed)", async () => {
  const failure = new Error("body timed out"); failure.name = "TimeoutError";
  const f = publishedFixture(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.error(failure); } })));
  await assert.rejects(fetchPublishedPage({ deps: f.deps, input: { path: "/" } }), error => error === failure);
  assert.equal(f.closed(), 1);
});
