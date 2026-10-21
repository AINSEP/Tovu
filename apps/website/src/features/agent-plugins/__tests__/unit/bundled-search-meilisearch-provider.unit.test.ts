import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import type { HttpRequest, HttpResponse } from "@jini-ai/core/primitives";
import type { ProviderResult } from "@jini-ai/core/provider-registry";
import { encodeSearchKey, type SearchDocument, type SearchDocumentKey, type SearchProvider, type SearchProviderContext } from "@jini-ai/search";
import { createFakeHttpClient, type FakeHttpClient } from "@jini-ai/search/testkit";

import { createMeilisearchEmulator } from "../fixtures/meilisearch-emulator.js";
import { loadSearchProviderContributionsFromSource } from "../../search-provider-registry.js";

/**
 * @file The bundled `meilisearch` provider's request mapping and every error branch, one scripted
 * vendor answer at a time (a fake `HttpClientPort`, never the network). The behavioral bar itself is
 * the conformance kit (`bundled-search-meilisearch-conformance.unit.test.ts`); this file pins what
 * the kit cannot see: the exact Meilisearch requests, the contract code each vendor failure maps to,
 * that nothing restricted is ever sent, and that no result message ever carries the API key.
 */

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/meilisearch");
const HOST = "https://ms.example.test";
const API_KEY = "sk-meili-SECRET-123";
const INDEX = "js_install_site_meilisearch_g1";

const loaded = await loadSearchProviderContributionsFromSource({ pluginId: "meilisearch", packageRoot: PACKAGE_ROOT });
const provider: SearchProvider = (loaded.items[0] as (typeof loaded.items)[number]).definition.provider;
const awaitTask = provider.awaitTask as NonNullable<SearchProvider["awaitTask"]>;

type Scripted = HttpResponse | Error | string;

const json = (status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse => ({ status, headers, bodyText: JSON.stringify(body) });
const meiliError = (status: number, code: string, type = "invalid_request"): HttpResponse => json(status, { message: `free text that must not leak ${code}`, code, type });
const accepted = (taskUid: number): HttpResponse => json(202, { taskUid, status: "enqueued" });
const task = (status: string, errorCode?: string): HttpResponse => json(200, { uid: 1, status, ...(errorCode === undefined ? {} : { error: { code: errorCode } }) });

/** A client answering each request with the next scripted entry; an Error is thrown, a string thrown as-is. */
function scripted(...answers: Scripted[]): FakeHttpClient {
  const queue = [...answers];
  return createFakeHttpClient({
    handle: () => {
      const next = queue.shift();
      assert.ok(next !== undefined, "the provider sent more requests than scripted");
      if (next instanceof Error || typeof next === "string") throw next;
      return next;
    },
  });
}

function ctxWith(httpClient: FakeHttpClient, overrides: Partial<SearchProviderContext> = {}): SearchProviderContext {
  return {
    workspaceId: "ws_1", siteId: "site_1", mode: "test", indexName: INDEX, credentials: { host: HOST, apiKey: API_KEY },
    httpClient, timeoutMs: 1_000, now: () => 0, ...overrides,
  };
}

const keyOf = (documentId: string): SearchDocumentKey => ({ siteId: "site_1", workspaceId: "ws_1", collection: "post", documentId });
const idOf = (key: SearchDocumentKey): string => Buffer.from(encodeSearchKey({ key })).toString("base64url");

function docOf(documentId: string, revision: number, extra: Partial<SearchDocument> = {}): SearchDocument {
  return { key: keyOf(documentId), revision, url: `/post/${documentId}`, title: `Title ${documentId}`, body: `Body of ${documentId}`, visibility: { kind: "public" }, ...extra };
}

/** Every result must be free of the API key, whatever path produced it. */
function safe<T>(result: ProviderResult<T>): ProviderResult<T> {
  assert.ok(!JSON.stringify(result).includes(API_KEY), `a result carried the API key: ${JSON.stringify(result)}`);
  return result;
}

function expectError(result: ProviderResult<unknown>, status: "rejected" | "unknown", code: string): string {
  safe(result);
  assert.ok(result.status !== "ok", JSON.stringify(result));
  assert.equal(result.status, status, JSON.stringify(result));
  assert.equal(result.error.code, code, JSON.stringify(result));
  return result.error.message;
}

const bodyOf = (request: HttpRequest | undefined): unknown => JSON.parse(String(request?.body));
const emptyFetch = json(200, { results: [], offset: 0, limit: 1, total: 0 });
/** `GET /tasks` with nothing queued for the index: the write may decide right away. */
const noTasks = json(200, { results: [], limit: 1, total: 0 });

// ---------------------------------------------------------------------------------------------
// Shape and configuration
// ---------------------------------------------------------------------------------------------

test("declares the contract shape: id, credential keys and public-only async capabilities", () => {
  assert.equal(provider.id, "meilisearch");
  assert.equal(provider.label, "Meilisearch");
  assert.deepEqual(provider.credentialKeys, ["host", "apiKey"]);
  assert.deepEqual(provider.capabilities, { acceptsRestricted: false, typoTolerance: true, locales: "any", maxBatch: 500, asyncIndexing: true });
});

test("every method answers not_configured, without a request, when host or apiKey is missing or the host is not http(s)", async () => {
  const cases: Partial<SearchProviderContext>[] = [
    { credentials: { apiKey: API_KEY } }, { credentials: { host: HOST } }, { credentials: { host: " ", apiKey: API_KEY } },
    { credentials: { host: "ftp://ms.example.test", apiKey: API_KEY } }, { credentials: undefined as unknown as Record<string, string> },
  ];
  for (const overrides of cases) {
    const client = scripted();
    const ctx = ctxWith(client, overrides);
    const calls = [
      provider.ensureIndex(ctx), provider.dropIndex(ctx), provider.upsert(ctx, { documents: [docOf("a", 1)] }), provider.remove(ctx, { tombstones: [{ key: keyOf("a"), revision: 1 }] }),
      provider.query(ctx, { query: { text: "x" } }), provider.revisionOf(ctx, { keys: [keyOf("a")] }), awaitTask.call(provider, ctx, { taskId: "1" }),
    ];
    for (const result of await Promise.all(calls)) expectError(result, "rejected", "not_configured");
    assert.equal(client.requests.length, 0);
  }
});

test("requests go to the trimmed host with the bearer key and the per-request idle budget", async () => {
  const client = scripted(task("succeeded"));
  await awaitTask.call(provider, ctxWith(client, { credentials: { host: `${HOST}//`, apiKey: API_KEY }, timeoutMs: 1234 }), { taskId: "7" });
  assert.deepEqual(client.requests[0], { method: "GET", url: `${HOST}/tasks/7`, idleTimeoutMs: 1234, headers: { Authorization: `Bearer ${API_KEY}` } });
});

// ---------------------------------------------------------------------------------------------
// Error mapping (through awaitTask: one GET, the shortest path to `call`)
// ---------------------------------------------------------------------------------------------

test("transport faults are unknown: timeout for an abort or timeout, network otherwise; the cause is never echoed", async () => {
  const abort = Object.assign(new Error("operation cancelled"), { name: "AbortError" });
  const timeoutByName = Object.assign(new Error("x"), { name: "TimeoutError" });
  const cases: [Scripted, string][] = [
    [abort, "timeout"], [timeoutByName, "timeout"], [new Error("socket timed out after 5s"), "timeout"], [new Error(`ECONNREFUSED ${HOST} ${API_KEY}`), "network"], ["a thrown string", "network"],
  ];
  for (const [fault, code] of cases) {
    const message = expectError(await awaitTask.call(provider, ctxWith(scripted(fault)), { taskId: "1" }), "unknown", code);
    assert.ok(!message.includes("ECONNREFUSED"));
  }
});

test("vendor statuses map onto contract codes, naming only the status and Meilisearch's error code", async () => {
  const cases: [HttpResponse, "rejected" | "unknown", string][] = [
    [meiliError(503, "internal"), "unknown", "provider_unavailable"],
    [meiliError(401, "invalid_api_key", "auth"), "rejected", "unauthorized"],
    [meiliError(403, "invalid_api_key", "auth"), "rejected", "forbidden"],
    [meiliError(404, "task_not_found"), "rejected", "not_found"],
    [meiliError(400, "invalid_task_uids"), "rejected", "invalid_request"],
    [meiliError(413, "payload_too_large", "system"), "rejected", "provider_error"],
    [{ status: 418, headers: {}, bodyText: "<html>teapot</html>" }, "rejected", "provider_error"],
    [{ status: 302, headers: {}, bodyText: "" }, "unknown", "unexpected_response"],
    [{ status: 200, headers: {}, bodyText: "not json" }, "unknown", "unexpected_response"],
  ];
  for (const [response, status, code] of cases) {
    const message = expectError(await awaitTask.call(provider, ctxWith(scripted(response)), { taskId: "1" }), status, code);
    assert.ok(!message.includes("free text that must not leak"), message);
  }
  assert.equal(expectError(await awaitTask.call(provider, ctxWith(scripted(meiliError(400, "invalid_task_uids"))), { taskId: "1" }), "rejected", "invalid_request"), "Meilisearch answered HTTP 400 (invalid_task_uids)");
  assert.equal(expectError(await awaitTask.call(provider, ctxWith(scripted({ status: 418, headers: {}, bodyText: "x" })), { taskId: "1" }), "rejected", "provider_error"), "Meilisearch answered HTTP 418");
});

test("429 is rate_limited with retryAfterMs from Retry-After (seconds or an HTTP date, read case-insensitively)", async () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  const cases: [Record<string, string> | undefined, number | undefined][] = [
    [{ "Retry-After": "3" }, 3000],
    [{ "retry-after": "Wed, 21 Oct 2026 12:00:10 GMT" }, 10_000],
    [{ "retry-after": "Wed, 21 Oct 2026 11:59:00 GMT" }, 0],
    [{ "retry-after": "soon" }, undefined],
    [{}, undefined],
    [undefined, undefined],
  ];
  for (const [headers, retryAfterMs] of cases) {
    const response = { status: 429, bodyText: JSON.stringify({ code: "too_many_requests" }), ...(headers === undefined ? {} : { headers }) } as HttpResponse;
    const result = safe(await awaitTask.call(provider, ctxWith(scripted(response), { now: () => now }), { taskId: "1" }));
    assert.deepEqual(result, { status: "rejected", error: { code: "rate_limited", message: "Meilisearch answered HTTP 429 (too_many_requests)", ...(retryAfterMs === undefined ? {} : { retryAfterMs }) } });
  }
});

// ---------------------------------------------------------------------------------------------
// awaitTask
// ---------------------------------------------------------------------------------------------

test("awaitTask maps Meilisearch task statuses; an unrecognised status is unexpected_response", async () => {
  const cases: [string, string][] = [["succeeded", "succeeded"], ["failed", "failed"], ["canceled", "failed"], ["enqueued", "pending"], ["processing", "pending"]];
  for (const [status, state] of cases) {
    assert.deepEqual(safe(await awaitTask.call(provider, ctxWith(scripted(task(status))), { taskId: "9" })), { status: "ok", value: state });
  }
  expectError(await awaitTask.call(provider, ctxWith(scripted(task("exploded"))), { taskId: "9" }), "unknown", "unexpected_response");
  const client = scripted(task("succeeded"));
  await awaitTask.call(provider, ctxWith(client), { taskId: "a/b" });
  assert.equal(client.requests[0]?.url, `${HOST}/tasks/a%2Fb`, "a task id is path-encoded, never interpolated raw");
});

// ---------------------------------------------------------------------------------------------
// ensureIndex and dropIndex
// ---------------------------------------------------------------------------------------------

test("ensureIndex creates the index with primary key id, applies the settings, and waits for the settings task", async () => {
  const client = scripted(accepted(1), accepted(2), task("succeeded"));
  assert.deepEqual(safe(await provider.ensureIndex(ctxWith(client))), { status: "ok", value: undefined });
  const [create, settings, poll] = client.requests;
  assert.deepEqual([create?.method, create?.url, bodyOf(create)], ["POST", `${HOST}/indexes`, { uid: INDEX, primaryKey: "id" }]);
  assert.deepEqual([settings?.method, settings?.url], ["PATCH", `${HOST}/indexes/${INDEX}/settings`]);
  assert.deepEqual(bodyOf(settings), {
    filterableAttributes: ["id", "site_id", "workspace_id", "collection", "locale", "deleted", "f_fields"],
    searchableAttributes: ["title", "body"],
  });
  assert.equal(settings?.headers["content-type"], "application/json");
  assert.equal(poll?.url, `${HOST}/tasks/2`);
});

test("ensureIndex is idempotent: a synchronous index_already_exists still applies the settings", async () => {
  const client = scripted(meiliError(409, "index_already_exists"), accepted(2), task("succeeded"));
  assert.equal(safe(await provider.ensureIndex(ctxWith(client))).status, "ok");
  assert.equal(client.requests.length, 3);
});

test("ensureIndex surfaces a failed create, a failed settings request, a missing task uid and a failed settings task", async () => {
  expectError(await provider.ensureIndex(ctxWith(scripted(meiliError(400, "invalid_index_uid")))), "rejected", "invalid_request");
  expectError(await provider.ensureIndex(ctxWith(scripted(accepted(1), meiliError(500, "internal")))), "unknown", "provider_unavailable");
  expectError(await provider.ensureIndex(ctxWith(scripted(accepted(1), json(202, { status: "enqueued" })))), "unknown", "unexpected_response");
  assert.match(expectError(await provider.ensureIndex(ctxWith(scripted(accepted(1), accepted(2), task("failed", "invalid_settings_filterable_attributes")))), "rejected", "provider_error"), /invalid_settings_filterable_attributes/);
  assert.equal(expectError(await provider.ensureIndex(ctxWith(scripted(accepted(1), accepted(2), task("failed")))), "rejected", "provider_error"), "Meilisearch task 2 failed");
  expectError(await provider.ensureIndex(ctxWith(scripted(accepted(1), accepted(2), new Error("reset")))), "unknown", "network");
});

test("ensureIndex polls a pending settings task again after a pause, and gives up as timeout at the injected clock's deadline", async () => {
  const settled = scripted(accepted(1), accepted(2), task("enqueued"), task("processing"), task("succeeded"));
  assert.equal(safe(await provider.ensureIndex(ctxWith(settled))).status, "ok");
  assert.equal(settled.requests.length, 5);

  let clock = 0;
  const stuck = scripted(accepted(1), accepted(2), task("processing"), task("processing"));
  const result = provider.ensureIndex(ctxWith(stuck, { timeoutMs: 100, now: () => clock }));
  // The first poll sees pending before the deadline; the clock then passes it during the pause.
  setTimeout(() => { clock = 100; }, 5);
  assert.match(expectError(await result, "unknown", "timeout"), /task 2 was still pending after 100 ms/);
});

test("dropIndex deletes the index and waits; an absent index (sync 404 or failed task) is ok", async () => {
  const client = scripted(accepted(4), task("succeeded"));
  assert.equal(safe(await provider.dropIndex(ctxWith(client))).status, "ok");
  assert.deepEqual([client.requests[0]?.method, client.requests[0]?.url, client.requests[0]?.body], ["DELETE", `${HOST}/indexes/${INDEX}`, undefined]);
  assert.equal(client.requests[0]?.headers["content-type"], undefined);
  assert.equal(safe(await provider.dropIndex(ctxWith(scripted(meiliError(404, "index_not_found"))))).status, "ok");
  assert.equal(safe(await provider.dropIndex(ctxWith(scripted(accepted(4), task("failed", "index_not_found"))))).status, "ok");
  expectError(await provider.dropIndex(ctxWith(scripted(meiliError(403, "invalid_api_key", "auth")))), "rejected", "forbidden");
  expectError(await provider.dropIndex(ctxWith(scripted(accepted(4), task("failed", "internal")))), "rejected", "provider_error");
});

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

test("upsert fetches current revisions, sends whole documents keyed by base64url(encodeSearchKey) and answers pending with the task id", async () => {
  const client = scripted(noTasks, emptyFetch, accepted(12));
  const document = docOf("hello/world", 3, { locale: "en", fields: { color: "red", size: 3, sale: true, tags: ["a", "b"] } });
  const result = safe(await provider.upsert(ctxWith(client), { documents: [document] }));
  assert.deepEqual(result, { status: "ok", value: { outcomes: [{ key: document.key, revision: 3, status: "pending" }], taskId: "12" } });
  const [drain, fetch, write] = client.requests;
  assert.deepEqual([drain?.method, drain?.url], ["GET", `${HOST}/tasks?indexUids=${INDEX}&statuses=enqueued,processing&limit=1`]);
  assert.deepEqual([fetch?.method, fetch?.url], ["POST", `${HOST}/indexes/${INDEX}/documents/fetch`]);
  assert.deepEqual(bodyOf(fetch), { filter: `id IN ["${idOf(document.key)}"]`, fields: ["id", "revision", "deleted"], limit: 1 });
  assert.deepEqual([write?.method, write?.url], ["POST", `${HOST}/indexes/${INDEX}/documents?primaryKey=id`]);
  assert.deepEqual(bodyOf(write), [{
    id: idOf(document.key), site_id: "site_1", workspace_id: "ws_1", collection: "post", document_id: "hello/world", revision: 3, deleted: false,
    url: "/post/hello/world", title: "Title hello/world", body: "Body of hello/world", locale: "en",
    f_fields: ['["color","red"]', '["size",3]', '["sale",true]', '["tags","a"]', '["tags","b"]'],
  }]);
  assert.match(idOf(document.key), /^[A-Za-z0-9_-]+$/);
});

test("a document without locale or fields stores locale null and no field tokens", async () => {
  const client = scripted(noTasks, emptyFetch, accepted(1));
  await provider.upsert(ctxWith(client), { documents: [docOf("plain", 1)] });
  const [stored] = bodyOf(client.requests[2]) as Record<string, unknown>[];
  assert.deepEqual([stored?.locale, stored?.f_fields], [null, []]);
});

test("the stale check: an equal or lower revision than the stored one (document or tombstone) or an earlier item of the batch is stale and not sent", async () => {
  const [kept, gone, fresh] = [keyOf("kept"), keyOf("gone"), keyOf("fresh")];
  const stored = json(200, { results: [{ id: idOf(kept), revision: 5, deleted: false }, { id: idOf(gone), revision: 4, deleted: true }] });
  const client = scripted(noTasks, stored, accepted(2));
  const result = safe(await provider.upsert(ctxWith(client), { documents: [docOf("kept", 5), docOf("gone", 3), docOf("fresh", 2), docOf("fresh", 2), docOf("kept", 6), docOf("fresh", 4)] }));
  assert.deepEqual(result.status === "ok" && result.value.outcomes.map((outcome) => [outcome.key.documentId, outcome.revision, outcome.status]), [
    ["kept", 5, "stale"], ["gone", 3, "stale"], ["fresh", 2, "pending"], ["fresh", 2, "stale"], ["kept", 6, "pending"], ["fresh", 4, "pending"],
  ]);
  const sent = bodyOf(client.requests[2]) as { id: string; revision: number }[];
  assert.deepEqual(sent.map((doc) => [doc.id, doc.revision]), [[idOf(fresh), 4], [idOf(kept), 6]], "one document per key, the highest accepted revision");
});

test("a write whose every item is stale or refused sends nothing and answers without a task id", async () => {
  const client = scripted(noTasks, json(200, { results: [{ id: idOf(keyOf("a")), revision: 9 }] }));
  const result = safe(await provider.upsert(ctxWith(client), { documents: [docOf("a", 2)] }));
  assert.deepEqual(result, { status: "ok", value: { outcomes: [{ key: keyOf("a"), revision: 2, status: "stale" }] } });
  assert.equal(client.requests.length, 2);
});

test("restricted documents, bad revisions and over-long keys are refused per key and never reach any request body", async () => {
  const restricted = docOf("members", 1, { title: "Members-only secret", body: "classified members text", visibility: { kind: "restricted", audiences: ["members"] } });
  const longKey = { ...keyOf("x".repeat(400)) };
  const client = scripted();
  const result = safe(await provider.upsert(ctxWith(client), { documents: [restricted, docOf("neg", -1), docOf("frac", 1.5), { ...docOf("long", 1), key: longKey }] }));
  assert.deepEqual(result.status === "ok" && result.value.outcomes.map((outcome) => [outcome.status, outcome.message]), [
    ["rejected", "restricted documents are never sent to Meilisearch (public content only)"],
    ["rejected", "revision must be a non-negative safe integer"],
    ["rejected", "revision must be a non-negative safe integer"],
    ["rejected", "the document key is too long for a Meilisearch document id"],
  ]);
  assert.equal(client.requests.length, 0, "nothing writable, so not even the revision fetch is sent");

  const mixed = scripted(noTasks, emptyFetch, accepted(3));
  await provider.upsert(ctxWith(mixed), { documents: [restricted, docOf("open", 1)] });
  const bodies = mixed.requests.map((request) => String(request.body));
  assert.ok(bodies.some((body) => body.includes("Body of open")));
  assert.ok(!bodies.some((body) => body.includes("classified") || body.includes("Members-only") || body.includes(idOf(restricted.key))));
});

test("remove writes tombstones that carry no content, through the same stale check", async () => {
  const client = scripted(noTasks, emptyFetch, accepted(5));
  const result = safe(await provider.remove(ctxWith(client), { tombstones: [{ key: keyOf("a"), revision: 2 }] }));
  assert.deepEqual(result, { status: "ok", value: { outcomes: [{ key: keyOf("a"), revision: 2, status: "pending" }], taskId: "5" } });
  assert.deepEqual(bodyOf(client.requests[2]), [{
    id: idOf(keyOf("a")), site_id: "site_1", workspace_id: "ws_1", collection: "post", document_id: "a", revision: 2, deleted: true,
    url: "", title: "", body: "", locale: null, f_fields: [],
  }]);
});

test("writes refuse more than maxBatch items, and surface revision-fetch and document-write failures", async () => {
  const many = Array.from({ length: 501 }, (_, index) => docOf(`d${index}`, 1));
  const client = scripted();
  expectError(await provider.upsert(ctxWith(client), { documents: many }), "rejected", "invalid_request");
  assert.equal(client.requests.length, 0);
  expectError(await provider.upsert(ctxWith(scripted(noTasks, meiliError(401, "invalid_api_key", "auth"))), { documents: [docOf("a", 1)] }), "rejected", "unauthorized");
  expectError(await provider.upsert(ctxWith(scripted(noTasks, json(200, { results: "nope" }))), { documents: [docOf("a", 1)] }), "unknown", "unexpected_response");
  expectError(await provider.upsert(ctxWith(scripted(noTasks, json(200, { results: [{ id: "x" }] }))), { documents: [docOf("a", 1)] }), "unknown", "unexpected_response");
  expectError(await provider.upsert(ctxWith(scripted(noTasks, json(200, {}))), { documents: [docOf("a", 1)] }), "unknown", "unexpected_response");
  expectError(await provider.upsert(ctxWith(scripted(noTasks, emptyFetch, meiliError(429, "too_many_requests"))), { documents: [docOf("a", 1)] }), "rejected", "rate_limited");
  expectError(await provider.remove(ctxWith(scripted(noTasks, emptyFetch, json(202, {}))), { tombstones: [{ key: keyOf("a"), revision: 1 }] }), "unknown", "unexpected_response");
  expectError(await provider.upsert(ctxWith(scripted(noTasks, emptyFetch, new Error("reset"))), { documents: [docOf("a", 1)] }), "unknown", "network");
});

test("a write to an index that does not exist yet treats every key as never written", async () => {
  const client = scripted(noTasks, meiliError(404, "index_not_found"), accepted(1));
  const result = safe(await provider.upsert(ctxWith(client), { documents: [docOf("a", 1)] }));
  assert.equal(result.status === "ok" && result.value.outcomes[0]?.status, "pending");
  expectError(await provider.upsert(ctxWith(scripted(noTasks, meiliError(404, "not_found"))), { documents: [docOf("a", 1)] }), "rejected", "not_found");
});

const queuedTask = (uid: unknown): HttpResponse => json(200, { results: [{ uid, indexUid: INDEX, status: "enqueued" }], limit: 1, total: 1 });

test("a write first waits for the index's newest queued task, so its revision read sees every earlier write", async () => {
  const tombstoned = json(200, { results: [{ id: idOf(keyOf("a")), revision: 5, deleted: true }] });
  const client = scripted(queuedTask(7), task("succeeded"), tombstoned);
  const result = safe(await provider.upsert(ctxWith(client), { documents: [docOf("a", 3)] }));
  assert.deepEqual(result, { status: "ok", value: { outcomes: [{ key: keyOf("a"), revision: 3, status: "stale" }] } }, "the queued tombstone 5 blocks revision 3");
  assert.deepEqual(client.requests.map((request) => `${request.method} ${request.url}`), [
    `GET ${HOST}/tasks?indexUids=${INDEX}&statuses=enqueued,processing&limit=1`, `GET ${HOST}/tasks/7`, `POST ${HOST}/indexes/${INDEX}/documents/fetch`,
  ]);
  // A failed earlier task has settled too: the write goes ahead.
  const afterFailure = safe(await provider.upsert(ctxWith(scripted(queuedTask(7), task("failed"), emptyFetch, accepted(8))), { documents: [docOf("a", 3)] }));
  assert.equal(afterFailure.status === "ok" && afterFailure.value.taskId, "8");
});

test("a write whose queue wait is indeterminate is not attempted and answers unknown", async () => {
  expectError(await provider.upsert(ctxWith(scripted(meiliError(500, "internal"))), { documents: [docOf("a", 1)] }), "unknown", "provider_unavailable");
  expectError(await provider.upsert(ctxWith(scripted(json(200, {}))), { documents: [docOf("a", 1)] }), "unknown", "unexpected_response");
  expectError(await provider.upsert(ctxWith(scripted(queuedTask("7"))), { documents: [docOf("a", 1)] }), "unknown", "unexpected_response");
  let clock = 0;
  const stuck = scripted(queuedTask(7), task("processing"), task("processing"));
  expectError(await provider.remove(ctxWith(stuck, { now: () => (clock += 600) }), { tombstones: [{ key: keyOf("a"), revision: 1 }] }), "unknown", "timeout");
  assert.equal(stuck.requests.length, 3, "no revision fetch and no write after an unsettled wait");
});

test("overlapping writes to one index are serialized: the second decides only after the first was queued and ran", async () => {
  const emulator = createMeilisearchEmulator({ host: HOST, apiKey: API_KEY });
  const ctx = ctxWith(createFakeHttpClient({ handle: emulator.handle }));
  assert.equal(safe(await provider.ensureIndex(ctx)).status, "ok");
  const [tombstone, upsert] = await Promise.all([
    provider.remove(ctx, { tombstones: [{ key: keyOf("a"), revision: 5 }] }),
    provider.upsert(ctx, { documents: [docOf("a", 3)] }),
  ]);
  assert.equal(safe(tombstone).status === "ok" && tombstone.value.outcomes[0]?.status, "pending");
  assert.deepEqual(safe(upsert).status === "ok" && upsert.value, { outcomes: [{ key: keyOf("a"), revision: 3, status: "stale" }] });
  assert.deepEqual(emulator.documents(INDEX)?.map((doc) => [doc.revision, doc.deleted]), [[5, true]]);
});

// ---------------------------------------------------------------------------------------------
// revisionOf
// ---------------------------------------------------------------------------------------------

test("revisionOf answers per key in input order: absent, live and tombstoned; an absent index holds nothing", async () => {
  const [absent, live, gone] = [keyOf("absent"), keyOf("live"), keyOf("gone")];
  const client = scripted(json(200, { results: [{ id: idOf(live), revision: 3, deleted: false }, { id: idOf(gone), revision: 4, deleted: true }] }));
  const result = safe(await provider.revisionOf(ctxWith(client), { keys: [absent, live, gone, live] }));
  assert.deepEqual(result, { status: "ok", value: [
    { key: absent, revision: null, deleted: false }, { key: live, revision: 3, deleted: false }, { key: gone, revision: 4, deleted: true }, { key: live, revision: 3, deleted: false },
  ] });
  assert.equal((bodyOf(client.requests[0]) as { limit: number }).limit, 3, "duplicate keys are fetched once");
  assert.deepEqual(safe(await provider.revisionOf(ctxWith(scripted(meiliError(404, "index_not_found"))), { keys: [live] })), { status: "ok", value: [{ key: live, revision: null, deleted: false }] });
  const none = scripted();
  assert.deepEqual(safe(await provider.revisionOf(ctxWith(none), { keys: [] })), { status: "ok", value: [] });
  assert.equal(none.requests.length, 0);
  expectError(await provider.revisionOf(ctxWith(scripted(meiliError(502, "internal"))), { keys: [live] }), "unknown", "provider_unavailable");
});

// ---------------------------------------------------------------------------------------------
// query
// ---------------------------------------------------------------------------------------------

function hit(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    site_id: "site_1", workspace_id: "ws_1", collection: "post", document_id: "hello", revision: 2, url: "/post/hello", title: "Hello",
    body: "full body", _formatted: { body: "…before \u0001match\u0002 after…" }, _rankingScore: 0.75, ...overrides,
  };
}

test("query sends one scoped search (deleted, site, workspace, collections, locale, typed field tokens) and maps the hits", async () => {
  const client = scripted(json(200, { hits: [hit()] }));
  const result = safe(await provider.query(ctxWith(client), { query: { text: "match", collections: ["post", "page"], locale: "en", filters: { color: 'say "hi"', size: 3 }, limit: 5, cursor: "10", audiences: ["members"] } }));
  assert.deepEqual(result, { status: "ok", value: { hits: [{
    key: keyOf("hello"), revision: 2, url: "/post/hello", title: "Hello", snippet: "…before match after…", highlights: [{ start: 8, end: 13 }], score: 0.75,
  }] } });
  const request = client.requests[0];
  assert.deepEqual([request?.method, request?.url], ["POST", `${HOST}/indexes/${INDEX}/search`]);
  assert.deepEqual(bodyOf(request), {
    q: "match",
    filter: 'deleted = false AND site_id = "site_1" AND workspace_id = "ws_1" AND collection IN ["post", "page"] AND locale = "en" AND f_fields = "[\\"color\\",\\"say \\\\\\"hi\\\\\\"\\"]" AND f_fields = "[\\"size\\",3]"',
    limit: 6, offset: 10, attributesToRetrieve: ["site_id", "workspace_id", "collection", "document_id", "revision", "url", "title", "body"],
    attributesToCrop: ["body"], cropLength: 30, attributesToHighlight: ["body"], highlightPreTag: "\u0001", highlightPostTag: "\u0002", showRankingScore: true,
  });
});

test("an extra hit beyond the limit becomes nextCursor = offset + limit, and is not returned", async () => {
  const hits = [hit({ document_id: "a" }), hit({ document_id: "b" }), hit({ document_id: "c" })];
  const result = safe(await provider.query(ctxWith(scripted(json(200, { hits }))), { query: { text: "x", limit: 2 } }));
  assert.equal(result.status === "ok" && result.value.nextCursor, "2");
  assert.deepEqual(result.status === "ok" && result.value.hits.map((entry) => entry.key.documentId), ["a", "b"]);
  const client = scripted(json(200, { hits: [] }));
  assert.deepEqual(safe(await provider.query(ctxWith(client), { query: { text: "x" } })), { status: "ok", value: { hits: [] } });
  assert.deepEqual([(bodyOf(client.requests[0]) as { limit: number }).limit, (bodyOf(client.requests[0]) as { offset: number }).offset], [11, 0], "defaults: limit 10, offset 0");
});

test("snippets are plain text: markup and stray angle brackets are removed, control characters become spaces, offsets stay exact", async () => {
  const formatted = "<b>bold</b> a\u0001<i>hi</i>\u0002 x<y\u0003z\u0001<br/>\u0002 \u0001end\u0002";
  const result = safe(await provider.query(ctxWith(scripted(json(200, { hits: [hit({ _formatted: { body: formatted } })] }))), { query: { text: "x" } }));
  const [first] = result.status === "ok" ? result.value.hits : [];
  assert.equal(first?.snippet, "bold ahi xy z end");
  assert.deepEqual(first?.highlights, [{ start: 6, end: 8 }, { start: 14, end: 17 }], "an emptied highlighted segment yields no range");
  for (const range of first?.highlights ?? []) assert.ok(range.end <= (first?.snippet.length ?? 0));
});

test("a hit without _formatted falls back to its body, and without _rankingScore scores 0", async () => {
  const result = safe(await provider.query(ctxWith(scripted(json(200, { hits: [hit({ _formatted: undefined, _rankingScore: undefined })] }))), { query: { text: "x" } }));
  assert.deepEqual(result.status === "ok" && [result.value.hits[0]?.snippet, result.value.hits[0]?.highlights, result.value.hits[0]?.score], ["full body", [], 0]);
});

test("query refuses empty text, a bad limit or cursor, without a request; an empty collections list is empty without a request", async () => {
  const client = scripted();
  const ctx = ctxWith(client);
  for (const query of [{ text: "" }, { text: "   " }, { text: undefined as unknown as string }, { text: "x", limit: 0 }, { text: "x", limit: 101 }, { text: "x", limit: 1.5 }, { text: "x", cursor: "abc" }, { text: "x", cursor: "-1" }]) {
    expectError(await provider.query(ctx, { query }), "rejected", "invalid_request");
  }
  assert.deepEqual(safe(await provider.query(ctx, { query: { text: "x", collections: [] } })), { status: "ok", value: { hits: [] } });
  assert.equal(client.requests.length, 0);
});

test("a query of a missing index is an empty page; other failures and malformed hits are surfaced", async () => {
  assert.deepEqual(safe(await provider.query(ctxWith(scripted(meiliError(404, "index_not_found"))), { query: { text: "x" } })), { status: "ok", value: { hits: [] } });
  expectError(await provider.query(ctxWith(scripted(meiliError(400, "invalid_search_filter"))), { query: { text: "x" } }), "rejected", "invalid_request");
  expectError(await provider.query(ctxWith(scripted(json(200, { hits: "x" }))), { query: { text: "x" } }), "unknown", "unexpected_response");
  expectError(await provider.query(ctxWith(scripted(json(200, { hits: [hit({ revision: "2" })] }))), { query: { text: "x" } }), "unknown", "unexpected_response");
  expectError(await provider.query(ctxWith(scripted(json(200, { hits: [hit({ title: 1 })] }))), { query: { text: "x" } }), "unknown", "unexpected_response");
  expectError(await provider.query(ctxWith(scripted(json(200, {}))), { query: { text: "x" } }), "unknown", "unexpected_response");
});

// ---------------------------------------------------------------------------------------------
// Against the emulator: what the vendor ends up holding
// ---------------------------------------------------------------------------------------------

test("against the emulator, a removal leaves a content-free tombstone and the stored id is base64url(encodeSearchKey(key))", async () => {
  const emulator = createMeilisearchEmulator({ host: HOST, apiKey: API_KEY });
  const ctx = ctxWith(createFakeHttpClient({ handle: emulator.handle }), { now: () => Date.now() });
  assert.equal((await provider.ensureIndex(ctx)).status, "ok");
  const document = docOf("ünïcode/ id", 1, { fields: { color: "red" } });
  const written = await provider.upsert(ctx, { documents: [document] });
  assert.equal(written.status, "ok");
  await awaitTask.call(provider, ctx, { taskId: written.status === "ok" ? String(written.value.taskId) : "" });
  const removed = await provider.remove(ctx, { tombstones: [{ key: document.key, revision: 2 }] });
  await awaitTask.call(provider, ctx, { taskId: removed.status === "ok" ? String(removed.value.taskId) : "" });
  assert.deepEqual(emulator.documents(INDEX), [{
    id: idOf(document.key), site_id: "site_1", workspace_id: "ws_1", collection: "post", document_id: "ünïcode/ id", revision: 2, deleted: true,
    url: "", title: "", body: "", locale: null, f_fields: [],
  }]);
  assert.deepEqual(await provider.query(ctx, { query: { text: "Body" } }), { status: "ok", value: { hits: [] } });
  assert.deepEqual(await provider.revisionOf(ctx, { keys: [document.key] }), { status: "ok", value: [{ key: document.key, revision: 2, deleted: true }] });
});

test("against the emulator, exact-match field filters are typed: the string '3' does not match the number 3", async () => {
  const emulator = createMeilisearchEmulator({ host: HOST, apiKey: API_KEY }, { pollsBeforeDone: 1 });
  const ctx = ctxWith(createFakeHttpClient({ handle: emulator.handle }), { now: () => Date.now() });
  assert.equal((await provider.ensureIndex(ctx)).status, "ok", "ensureIndex waits through a processing poll");
  const written = await provider.upsert(ctx, { documents: [docOf("num", 1, { fields: { size: 3, tags: ["x", "y"] } }), docOf("str", 1, { fields: { size: "3" } })] });
  const taskId = written.status === "ok" ? String(written.value.taskId) : "";
  assert.deepEqual(await awaitTask.call(provider, ctx, { taskId }), { status: "ok", value: "pending" });
  assert.deepEqual(await awaitTask.call(provider, ctx, { taskId }), { status: "ok", value: "succeeded" });
  const ids = async (filters: Record<string, string | number>) => {
    const page = await provider.query(ctx, { query: { text: "Body", filters } });
    return page.status === "ok" ? page.value.hits.map((entry) => entry.key.documentId).sort() : [];
  };
  assert.deepEqual(await ids({ size: 3 }), ["num"]);
  assert.deepEqual(await ids({ size: "3" }), ["str"]);
  assert.deepEqual(await ids({ tags: "y" }), ["num"]);
  assert.deepEqual(await ids({ tags: "z" }), []);
});
