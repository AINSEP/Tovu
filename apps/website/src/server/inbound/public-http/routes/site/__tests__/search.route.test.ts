import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { SearchServiceResult } from "@jini-ai/search";

import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { SiteSearchRuntime } from "#src/server/runtime/composition/modules/site-search";
import { parseSearchRequest, registerSiteSearchRoute, SEARCH_QUERY_MAX_LENGTH, SEARCH_ROUTE_MAX_LIMIT } from "../search.js";

/**
 * @file `GET /api/search` over a real Express listener with a fake search runtime: input bounds,
 * the public JSON contract, 503 when unavailable, and audiences taken only from the member cookie.
 */

const WS = "ws-search";
const HIT = {
  key: { siteId: WS, workspaceId: WS, collection: "post", documentId: "p1" }, revision: 3, url: "/blog/hello",
  title: "Hello", snippet: "Hello <b>world</b> as plain text", highlights: [{ start: 0, end: 5 }], score: 0.9,
};

function fakeRuntime(answer: () => Promise<SearchServiceResult>) {
  const queries: unknown[] = [];
  const sessions: unknown[] = [];
  const runtime = {
    siteId: WS, workspaceId: WS, ready: Promise.resolve(),
    audiencesForSession: async (input: { sessionToken?: string }) => { sessions.push(input); return input.sessionToken ? ["members"] : []; },
    service: { query: async (required: unknown, optional: unknown) => { queries.push([required, optional]); return answer(); } },
  } as unknown as SiteSearchRuntime;
  return { runtime, queries, sessions };
}

async function serve(t: import("node:test").TestContext, siteSearch?: SiteSearchRuntime): Promise<string> {
  const app = express();
  registerSiteSearchRoute(app, siteSearch ? { siteSearch } : {});
  return startTestServer(app, t);
}

test("a hit page maps to the public contract; collection, limit and cursor reach the service; responses are private", async (t) => {
  const { runtime, queries, sessions } = fakeRuntime(async () => ({ status: "ok", providerId: "builtin", page: { hits: [HIT], nextCursor: "c2" } }));
  const base = await serve(t, runtime);
  const res = await fetch(`${base}/api/search?q=%20hello%20&collection=post,page&limit=5&cursor=c1&audiences=admin`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await res.json(), {
    hits: [{ url: "/blog/hello", title: "Hello", snippet: "Hello <b>world</b> as plain text", highlights: [{ start: 0, end: 5 }], collection: "post" }],
    nextCursor: "c2",
  });
  assert.deepEqual(queries, [[{ siteId: WS, workspaceId: WS, query: { text: "hello", collections: ["post", "page"], limit: 5, cursor: "c1" } }, { audiences: [] }]],
    "an audiences query parameter is ignored; an anonymous visitor is public only");
  assert.deepEqual(sessions, [{}]);
});

test("the member session cookie is the only source of audiences; the last page has nextCursor null", async (t) => {
  const { runtime, queries, sessions } = fakeRuntime(async () => ({ status: "ok", providerId: "builtin", page: { hits: [] } }));
  const base = await serve(t, runtime);
  const res = await fetch(`${base}/api/search?q=hello`, { headers: { cookie: "tovu_member_session=tok-1" } });
  assert.deepEqual(await res.json(), { hits: [], nextCursor: null });
  assert.deepEqual(sessions, [{ sessionToken: "tok-1" }]);
  assert.deepEqual(queries, [[{ siteId: WS, workspaceId: WS, query: { text: "hello" } }, { audiences: ["members"] }]]);
});

test("malformed input is a 400 before the runtime is touched", async (t) => {
  const { runtime, queries } = fakeRuntime(async () => { throw new Error("unreachable"); });
  const base = await serve(t, runtime);
  const cases: [string, RegExp][] = [
    ["", /'q' is required/],
    ["q=%20%20", /'q' is required/],
    [`q=${"a".repeat(SEARCH_QUERY_MAX_LENGTH + 1)}`, /at most 256/],
    ["q=a&q=b", /'q' must be given once/],
    ["q=a&collection=Post", /'collection' must be/],
    [`q=a&collection=${Array.from({ length: 11 }, (_, i) => `c${i}`).join(",")}`, /'collection' must be/],
    ["q=a&limit=0", /'limit' must be an integer from 1 to 50/],
    [`q=a&limit=${SEARCH_ROUTE_MAX_LIMIT + 1}`, /'limit'/],
    ["q=a&limit=2.5", /'limit'/],
    ["q=a&cursor=", /'cursor'/],
    [`q=a&cursor=${"c".repeat(1025)}`, /'cursor'/],
  ];
  for (const [qs, message] of cases) {
    const res = await fetch(`${base}/api/search?${qs}`);
    assert.equal(res.status, 400, qs);
    const body = await res.json() as { error: string; message: string };
    assert.equal(body.error, "invalid_request");
    assert.match(body.message, message, qs);
  }
  assert.deepEqual(queries, []);
  // The longest accepted q still passes.
  assert.equal("query" in parseSearchRequest({ query: { q: "a".repeat(SEARCH_QUERY_MAX_LENGTH) } }), true);
});

test("an invalid answer from the service is a 400; an unavailable one a 503 with its reason", async (t) => {
  let answer: SearchServiceResult = { status: "invalid", message: "cursor is not from this query" };
  const { runtime } = fakeRuntime(async () => answer);
  const base = await serve(t, runtime);
  let res = await fetch(`${base}/api/search?q=x`);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid_request", message: "cursor is not from this query" });
  answer = { status: "unavailable", reason: "timeout" };
  res = await fetch(`${base}/api/search?q=x`);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "search_unavailable", reason: "timeout" });
});

test("a composition without search answers 503 not_configured", async (t) => {
  const base = await serve(t);
  const res = await fetch(`${base}/api/search?q=x`);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "search_unavailable", reason: "not_configured" });
});

test("an unexpected failure is logged and answered with a 500", async (t) => {
  const errors = t.mock.method(console, "error", () => undefined);
  const { runtime } = fakeRuntime(async () => { throw new Error("db closed"); });
  const base = await serve(t, runtime);
  const res = await fetch(`${base}/api/search?q=x`);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error" });
  assert.equal(errors.mock.callCount(), 1);
});
