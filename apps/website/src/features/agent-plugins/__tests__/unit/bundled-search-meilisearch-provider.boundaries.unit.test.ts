import assert from "node:assert/strict";
import path from "node:path";
import test, { mock } from "node:test";

import type { HttpResponse } from "@jini-ai/core/primitives";
import type { ProviderResult } from "@jini-ai/core/provider-registry";
import type { SearchDocument, SearchDocumentKey, SearchProvider, SearchProviderContext } from "@jini-ai/search";
import { createFakeHttpClient, type FakeHttpClient } from "@jini-ai/search/testkit";

import { loadSearchProviderContributionsFromSource } from "../../search-provider-registry.js";

/**
 * @file F9 (Stryker L15 re-score): the bundled `meilisearch` provider scored 91.2 % once its website
 * suite was in the test set (L15's 15–20 % was a basename-mapping artifact). This file kills the real
 * survivors: host/credential guards (AP7), every limit at limit/limit±1 (AP9), the Retry-After and
 * timeout regexes per anchor (AP4), a `null` JSON body on every endpoint (AP3), the 2xx boundary, the
 * tolerated-task gate and the poll back-off (controlled timers, AP10).
 */

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/meilisearch");
const HOST = "https://ms.example.test";
const API_KEY = "sk-meili-SECRET-123";
const INDEX = "js_install_site_meilisearch_g1";

const loaded = await loadSearchProviderContributionsFromSource({ pluginId: "meilisearch", packageRoot: PACKAGE_ROOT });
const provider: SearchProvider = (loaded.items[0] as (typeof loaded.items)[number]).definition.provider;
const awaitTask = provider.awaitTask as NonNullable<SearchProvider["awaitTask"]>;
const ensureIndex = provider.ensureIndex as NonNullable<SearchProvider["ensureIndex"]>;
const dropIndex = provider.dropIndex as NonNullable<SearchProvider["dropIndex"]>;

const json = (status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse => ({ status, headers, bodyText: JSON.stringify(body) });
const raw = (status: number, bodyText: string): HttpResponse => ({ status, headers: {}, bodyText });
const accepted = (taskUid: number): HttpResponse => json(202, { taskUid, status: "enqueued" });
const task = (status: string, errorCode?: string): HttpResponse => json(200, { uid: 1, status, ...(errorCode === undefined ? {} : { error: { code: errorCode } }) });
const noTasks = json(200, { results: [], limit: 1, total: 0 });
const emptyFetch = json(200, { results: [] });

function scripted(...answers: (HttpResponse | Error)[]): FakeHttpClient {
  const queue = [...answers];
  return createFakeHttpClient({
    handle: () => {
      const next = queue.shift();
      assert.ok(next !== undefined, "the provider sent more requests than scripted");
      if (next instanceof Error) throw next;
      return next;
    },
  });
}

function ctxWith(httpClient: FakeHttpClient, overrides: Partial<SearchProviderContext> = {}): SearchProviderContext {
  return { workspaceId: "ws_1", siteId: "site_1", mode: "test", indexName: INDEX, credentials: { host: HOST, apiKey: API_KEY }, httpClient, timeoutMs: 1_000, now: () => 0, ...overrides };
}

const keyOf = (documentId: string, collection = "post"): SearchDocumentKey => ({ siteId: "site_1", workspaceId: "ws_1", collection, documentId });
const docOf = (documentId: string, revision: number, key = keyOf(documentId)): SearchDocument =>
  ({ key, revision, url: `/post/${documentId}`, title: "T", body: "B", visibility: { kind: "public" } });

function errorOf(result: ProviderResult<unknown>): { status: string; code: string; message: string; retryAfterMs?: number } {
  assert.ok(!JSON.stringify(result).includes(API_KEY));
  assert.ok(result.status !== "ok", JSON.stringify(result));
  return { status: result.status, ...result.error };
}
const valueOf = (result: ProviderResult<unknown>): any => {
  assert.equal(result.status, "ok", JSON.stringify(result));
  return (result as { value: unknown }).value;
};
function hit(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { site_id: "site_1", workspace_id: "ws_1", collection: "post", document_id: "h", revision: 2, url: "/h", title: "H", body: "b", _rankingScore: 0.5, ...overrides };
}

// ---------------------------------------------------------------------------------------------
// Credentials and host (security guards: each negative refuses locally, without a request)
// ---------------------------------------------------------------------------------------------

test("whitespace-only host or apiKey is not_configured, without a request", async () => {
  for (const credentials of [{ host: "   ", apiKey: API_KEY }, { host: HOST, apiKey: " \t " }]) {
    const client = scripted();
    assert.equal(errorOf(await awaitTask.call(provider, ctxWith(client, { credentials }), { taskId: "1" })).code, "not_configured");
    assert.equal(client.requests.length, 0);
  }
});

test("the host must START with http(s)://: plain http is accepted, a scheme anywhere else is refused", async () => {
  const httpClient = scripted(task("succeeded"));
  valueOf(await awaitTask.call(provider, ctxWith(httpClient, { credentials: { host: "http://ms.local", apiKey: API_KEY } }), { taskId: "1" }));
  assert.equal(httpClient.requests[0]?.url, "http://ms.local/tasks/1");
  for (const host of ["xhttps://evil.example", "ftp://ms.example", "ms.example/https://x"]) {
    const client = scripted();
    const error = errorOf(await awaitTask.call(provider, ctxWith(client, { credentials: { host, apiKey: API_KEY } }), { taskId: "1" }));
    assert.deepEqual([error.status, error.code], ["rejected", "not_configured"], host);
    assert.equal(client.requests.length, 0, host);
  }
});

test("surrounding whitespace on the host is trimmed before the URL is built", async () => {
  const client = scripted(task("succeeded"));
  await awaitTask.call(provider, ctxWith(client, { credentials: { host: `${HOST}/  `, apiKey: API_KEY } }), { taskId: "1" });
  assert.equal(client.requests[0]?.url, `${HOST}/tasks/1`);
});

// ---------------------------------------------------------------------------------------------
// Transport mapping
// ---------------------------------------------------------------------------------------------

test("timeout wording: 'timeout', 'time out' and 'timed out' are all timeouts; other faults are network", async () => {
  for (const [message, code] of [["request timeout", "timeout"], ["read time out", "timeout"], ["timed out", "timeout"], ["connection reset", "network"]] as const) {
    assert.equal(errorOf(await awaitTask.call(provider, ctxWith(scripted(new Error(message))), { taskId: "1" })).code, code, message);
  }
});

test("HTTP 300 is outside 2xx: unexpected_response, not a success", async () => {
  const error = errorOf(await awaitTask.call(provider, ctxWith(scripted(json(300, { uid: 1, status: "succeeded" }))), { taskId: "1" }));
  assert.deepEqual([error.status, error.code, error.message], ["unknown", "unexpected_response", "Meilisearch answered HTTP 300"]);
});

test("a 2xx body that is not JSON is unexpected_response naming that, on every read path", async () => {
  const notJson = "Meilisearch answered HTTP 200 with a body that is not JSON";
  assert.equal(errorOf(await awaitTask.call(provider, ctxWith(scripted(raw(200, "<html>"))), { taskId: "1" })).message, notJson);
  assert.equal(errorOf(await provider.query(ctxWith(scripted(raw(200, "oops"))), { query: { text: "x" } })).message, notJson);
});

test("Retry-After: header found case-insensitively among others; delta-seconds anchored at both ends", async () => {
  const cases: [string, number | undefined][] = [["12", 12_000], [" 3 ", 3_000], ["x3", undefined], ["3x", undefined]];
  for (const [value, expected] of cases) {
    const response = json(429, { code: "too_many_requests" }, { "x-other": "99", "Retry-After": value });
    const error = errorOf(await awaitTask.call(provider, ctxWith(scripted(response)), { taskId: "1" }));
    assert.equal(error.code, "rate_limited", value);
    assert.equal(error.retryAfterMs, expected, JSON.stringify(value));
    assert.equal("retryAfterMs" in error, expected !== undefined, JSON.stringify(value));
  }
});

// ---------------------------------------------------------------------------------------------
// Hostile JSON: a `null` (or null-entry) 2xx body never throws, it is unexpected_response
// ---------------------------------------------------------------------------------------------

test("a JSON null body on each endpoint is unexpected_response, never a TypeError", async () => {
  assert.equal(errorOf(await awaitTask.call(provider, ctxWith(scripted(raw(200, "null"))), { taskId: "1" })).code, "unexpected_response");
  assert.equal(errorOf(await ensureIndex.call(provider, ctxWith(scripted(accepted(1), raw(202, "null"))))).code, "unexpected_response");
  assert.equal(errorOf(await provider.query(ctxWith(scripted(raw(200, "null"))), { query: { text: "x" } })).code, "unexpected_response");
  assert.equal(errorOf(await provider.query(ctxWith(scripted(json(200, { hits: [null] }))), { query: { text: "x" } })).code, "unexpected_response");
  assert.equal(errorOf(await provider.revisionOf(ctxWith(scripted(raw(200, "null"))), { keys: [keyOf("a")] })).code, "unexpected_response");
  assert.equal(errorOf(await provider.revisionOf(ctxWith(scripted(json(200, { results: [null] }))), { keys: [keyOf("a")] })).code, "unexpected_response");
  assert.equal(errorOf(await provider.upsert(ctxWith(scripted(raw(200, "null"))), { documents: [docOf("a", 1)] })).code, "unexpected_response");
  assert.equal(errorOf(await provider.upsert(ctxWith(scripted(json(200, { results: [null] }))), { documents: [docOf("a", 1)] })).code, "unexpected_response");
});

test("a task whose error is null still settles by status; a stored revision without a string id is refused", async () => {
  assert.equal(valueOf(await awaitTask.call(provider, ctxWith(scripted(json(200, { uid: 1, status: "succeeded", error: null }))), { taskId: "1" })), "succeeded");
  const error = errorOf(await provider.revisionOf(ctxWith(scripted(json(200, { results: [{ id: 5, revision: 1, deleted: false }] }))), { keys: [keyOf("a")] }));
  assert.deepEqual([error.code, error.message], ["unexpected_response", "Meilisearch returned documents without an id and revision"]);
});

// ---------------------------------------------------------------------------------------------
// Tasks: tolerated codes only when NAMED; poll back-off doubles up to the cap
// ---------------------------------------------------------------------------------------------

test("dropIndex: a failed deletion task whose code is NOT tolerated is rejected with that code", async () => {
  const error = errorOf(await dropIndex.call(provider, ctxWith(scripted(accepted(4), task("failed", "internal")))));
  assert.deepEqual([error.status, error.code, error.message], ["rejected", "provider_error", "Meilisearch task 4 failed (internal)"]);
  const bare = errorOf(await dropIndex.call(provider, ctxWith(scripted(accepted(5), task("failed")))));
  assert.equal(bare.message, "Meilisearch task 5 failed");
});

test("ensureIndex polls a pending task after 25 ms, then 50 ms (doubling), never sooner", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const client = scripted(accepted(1), accepted(2), task("enqueued"), task("processing"), task("succeeded"));
    const done = ensureIndex.call(provider, ctxWith(client, { timeoutMs: 10_000 }));
    const settle = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
    await settle();
    assert.equal(client.requests.length, 3, "create, settings, first poll");
    mock.timers.tick(24); await settle();
    assert.equal(client.requests.length, 3, "no poll before 25 ms");
    mock.timers.tick(1); await settle();
    assert.equal(client.requests.length, 4, "second poll at 25 ms");
    mock.timers.tick(49); await settle();
    assert.equal(client.requests.length, 4, "the next pause is 50 ms, not shorter");
    mock.timers.tick(1); await settle();
    assert.equal(client.requests.length, 5);
    assert.deepEqual(await done, { status: "ok", value: undefined });
  } finally {
    mock.timers.reset();
  }
});

// ---------------------------------------------------------------------------------------------
// Limits at limit / limit+1
// ---------------------------------------------------------------------------------------------

test("revision 0 is writable; -1 is refused per key", async () => {
  const result = valueOf(await provider.upsert(ctxWith(scripted(noTasks, emptyFetch, accepted(9))), { documents: [docOf("zero", 0), docOf("neg", -1)] }));
  assert.deepEqual(result.outcomes.map((o: { status: string }) => o.status), ["pending", "rejected"]);
});

test("a key whose document id is exactly 511 chars is writable; 512 is refused", async () => {
  // "site_1/ws_1/c/" is 14 chars; a 383-char encoded key is 511 base64url chars, 384 is 512.
  const atLimit = keyOf("a".repeat(383 - 14), "c");
  const over = keyOf("a".repeat(384 - 14), "c");
  const result = valueOf(await provider.upsert(ctxWith(scripted(noTasks, emptyFetch, accepted(9))), { documents: [docOf("x", 1, atLimit), docOf("y", 1, over)] }));
  assert.deepEqual(result.outcomes.map((o: { status: string; message?: string }) => [o.status, o.message]), [
    ["pending", undefined], ["rejected", "the document key is too long for a Meilisearch document id"],
  ]);
});

test("a write of exactly maxBatch (500) items is sent; 501 is refused before any request", async () => {
  const documents = Array.from({ length: 500 }, (_, i) => docOf(`d${i}`, 1));
  const result = valueOf(await provider.upsert(ctxWith(scripted(noTasks, emptyFetch, accepted(9))), { documents }));
  assert.equal(result.taskId, "9");
  const client = scripted();
  const error = errorOf(await provider.upsert(ctxWith(client), { documents: [...documents, docOf("d500", 1)] }));
  assert.deepEqual([error.code, error.message], ["invalid_request", "Meilisearch accepts at most 500 documents per write"]);
  assert.equal(client.requests.length, 0);
});

test("query limit 1 and 100 are accepted; a cursor with trailing junk is refused", async () => {
  for (const limit of [1, 100]) {
    const client = scripted(json(200, { hits: [] }));
    valueOf(await provider.query(ctxWith(client), { query: { text: "x", limit } }));
    assert.equal(JSON.parse(String(client.requests[0]?.body)).limit, limit + 1);
  }
  const client = scripted();
  const error = errorOf(await provider.query(ctxWith(client), { query: { text: "x", cursor: "12x" } }));
  assert.deepEqual([error.code, error.message], ["invalid_request", "cursor is not a cursor of this provider"]);
  assert.equal(client.requests.length, 0);
});

test("exactly `limit` hits means no next page; limit + 1 hits means nextCursor", async () => {
  const two = valueOf(await provider.query(ctxWith(scripted(json(200, { hits: [hit({ document_id: "a" }), hit({ document_id: "b" })] }))), { query: { text: "x", limit: 2 } }));
  assert.equal(two.hits.length, 2);
  assert.equal("nextCursor" in two, false);
  const three = valueOf(await provider.query(ctxWith(scripted(json(200, { hits: [hit(), hit(), hit()] }))), { query: { text: "x", limit: 2 } }));
  assert.equal(three.nextCursor, "2");
});
