/**
 * Pins every branch of share hosting: the artifact-key gate, the public-origin gate, the anonymous
 * attachment verification, both delivery adapters, and delivery selection. Typed HTTP fakes record
 * every outbound request and a real temp-dir registry holds rows, so endpoint safety (what is sent,
 * to which URL, with which credential) stays provably identical across refactors.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { createHash } from "node:crypto";
import type { HttpClientPort as AnonymousHttpPort, HttpRequest, HttpResponse } from "@jini-ai/core/primitives";
import type { HttpClientPort as PeerHttpPort } from "#src/platform/http/index";
import type { PeerCallDeps } from "../../publish-content/peer-transport.js";
import { SiteShareRegistry } from "../share-registry.js";
import type { ShareDelivery } from "../share-service.js";
import { createPeerShareDelivery, createRuntimeShareDelivery, resolveShareDelivery } from "../share-hosting.js";

const TOKEN = "a".repeat(64);
const KEY = `_share/${TOKEN}/site.tovu.zip`;
const ORIGIN = "https://share.example.test";
const PEER_BASE = "https://live.example.test";
const BYTES = Buffer.from("PK artifact");
const INVALID_KEY = { code: "INVALID_INPUT", message: "Invalid share artifact key." };
const GOOD_HEADERS = { "content-length": String(BYTES.length), "cache-control": "no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow", "content-disposition": "attachment; filename=\"site.tovu.zip\"" };
const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** The anonymous verifier's HTTP port: records each call and answers with `response`. */
function anonymousHttp(response: Partial<HttpResponse> = {}) {
  const calls: { required: { request: HttpRequest }; optional?: { redirect?: RequestRedirect } }[] = [];
  const http: AnonymousHttpPort = { send: async (required, optional) => { calls.push({ required, optional }); return { status: 200, headers: GOOD_HEADERS, bodyText: "", ...response }; } };
  return { http, calls };
}
/** The authenticated peer transport: records each request and answers with `status`. */
function peerDeps(status = 204) {
  const requests: HttpRequest[] = [];
  const httpClient: PeerHttpPort = { send: async request => { requests.push(request); return { status, headers: {}, bodyText: "" }; } };
  const peer: PeerCallDeps = { httpClient, credential: { id: "live", label: "Live", baseUrl: PEER_BASE, remoteWorkspaceId: "remote ws", apiKey: "opened-key" } };
  return { peer, requests };
}
function registryIn(t: TestContext): SiteShareRegistry {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "share-hosting-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return new SiteShareRegistry({ directory });
}
function runtime(t: TestContext, options: { site?: string; publicOrigin?: string; registry?: SiteShareRegistry; http?: AnonymousHttpPort } = {}) {
  const registry = options.registry ?? registryIn(t);
  const delivery = createRuntimeShareDelivery({ registry, site: options.site ?? "ws", publicOrigin: options.publicOrigin ?? ORIGIN, http: options.http ?? anonymousHttp().http });
  return { registry, delivery };
}

// ---- artifact key gate (shared by every store operation) ----

for (const key of [
  `share/${TOKEN}/site.tovu.zip`, `_share/${"A".repeat(64)}/site.tovu.zip`, `_share/${"a".repeat(63)}/site.tovu.zip`, `_share/${TOKEN}/-site.tovu.zip`,
  `_share/${TOKEN}/Site.tovu.zip`, `_share/${TOKEN}/site.zip`, `_share/${TOKEN}/${"s".repeat(81)}.tovu.zip`, `_share/${TOKEN}/a/b.tovu.zip`, `${KEY}\n`,
]) {
  test(`an invalid artifact key is refused before any I/O (${JSON.stringify(key.replace(TOKEN, "<token>")).slice(0, 48)})`, async t => {
    const { http, calls } = anonymousHttp();
    const { delivery } = runtime(t, { http });
    await assert.rejects(delivery.store.verify({ key, url: `${ORIGIN}/${key}`, present: true, bytes: 1 }), INVALID_KEY);
    assert.equal(calls.length, 0);
  });
}

test("the longest valid artifact file stem is accepted", async t => {
  const key = `_share/${TOKEN}/${"s".repeat(80)}.tovu.zip`;
  const { delivery } = runtime(t);
  assert.equal(await delivery.store.verify({ key, url: `${ORIGIN}/${key}`, present: true, bytes: BYTES.length }), true);
});

// ---- public origin gate ----

for (const publicOrigin of ["http://share.example.test", "https://user@share.example.test", "https://:pw@share.example.test", "https://share.example.test/sub", "https://share.example.test/?a=1", "https://share.example.test/#x"]) {
  test(`a public origin that is not a bare HTTPS origin is refused (${publicOrigin})`, t => {
    assert.throws(() => runtime(t, { publicOrigin }), { code: "STORAGE_SETUP", message: "TOVU_SHARE_PUBLIC_ORIGIN must be a public HTTPS origin without a path or credentials." });
  });
}

test("an unparseable public origin fails as an invalid URL", t => {
  assert.throws(() => runtime(t, { publicOrigin: "not a url" }), { code: "ERR_INVALID_URL" });
});

test("the runtime delivery names the server provider and binds to its registry directory", t => {
  const { registry, delivery } = runtime(t, { publicOrigin: `${ORIGIN}/` });
  assert.deepEqual({ provider: delivery.provider, binding: delivery.binding }, { provider: "tovu-server", binding: registry.directory });
});

// ---- anonymous verification ----

test("verification sends one credential-free HEAD with bounded timeouts and redirects refused", async t => {
  const { http, calls } = anonymousHttp();
  const signal = new AbortController().signal;
  await runtime(t, { http }).delivery.store.verify({ key: KEY, url: `${ORIGIN}/${KEY}`, present: true, bytes: BYTES.length }, { signal });
  assert.deepEqual(calls, [{ required: { request: { method: "HEAD", url: `${ORIGIN}/${KEY}`, headers: {}, idleTimeoutMs: 15_000, totalDeadlineMs: 20_000, maxResponseBytes: 1024, signal } }, optional: { redirect: "error" } }]);
});

test("a URL other than the delivery's own artifact URL is not verified and sends nothing", async t => {
  const { http, calls } = anonymousHttp();
  assert.equal(await runtime(t, { http }).delivery.store.verify({ key: KEY, url: `https://elsewhere.example.test/${KEY}`, present: true, bytes: BYTES.length }), false);
  assert.equal(calls.length, 0);
});

for (const status of [404, 410]) {
  test(`an absent artifact is confirmed by HTTP ${status}`, async t => {
    assert.equal(await runtime(t, { http: anonymousHttp({ status }).http }).delivery.store.verify({ key: KEY, url: `${ORIGIN}/${KEY}`, present: false }), true);
  });
}

test("an absent artifact is not confirmed by any other status", async t => {
  assert.equal(await runtime(t, { http: anonymousHttp({ status: 200 }).http }).delivery.store.verify({ key: KEY, url: `${ORIGIN}/${KEY}`, present: false }), false);
});

test("a present artifact is confirmed by a 200 public attachment of the expected size", async t => {
  assert.equal(await runtime(t).delivery.store.verify({ key: KEY, url: `${ORIGIN}/${KEY}`, present: true, bytes: BYTES.length }), true);
});

for (const disposition of ["attachment", "ATTACHMENT;filename=x"]) {
  test(`a bare or case-folded attachment disposition is accepted (${disposition})`, async t => {
    const { http } = anonymousHttp({ headers: { ...GOOD_HEADERS, "content-disposition": disposition } });
    assert.equal(await runtime(t, { http }).delivery.store.verify({ key: KEY, url: `${ORIGIN}/${KEY}`, present: true, bytes: BYTES.length }), true);
  });
}

for (const [label, response] of [
  ["a non-200 status", { status: 206 }],
  ["a different content-length", { headers: { ...GOOD_HEADERS, "content-length": String(BYTES.length + 1) } }],
  ["a cacheable response", { headers: { ...GOOD_HEADERS, "cache-control": "public" } }],
  ["a sniffable response", { headers: { ...GOOD_HEADERS, "x-content-type-options": "" } }],
  ["an indexable response", { headers: { ...GOOD_HEADERS, "x-robots-tag": "noindex" } }],
  ["an inline disposition", { headers: { ...GOOD_HEADERS, "content-disposition": "inline; filename=x" } }],
  ["an attachment-prefixed token", { headers: { ...GOOD_HEADERS, "content-disposition": "attachmentx" } }],
  ["no disposition", { headers: Object.fromEntries(Object.entries(GOOD_HEADERS).filter(([name]) => name !== "content-disposition")) }],
] as const) {
  test(`a present artifact is not confirmed by ${label}`, async t => {
    assert.equal(await runtime(t, { http: anonymousHttp(response).http }).delivery.store.verify({ key: KEY, url: `${ORIGIN}/${KEY}`, present: true, bytes: BYTES.length }), false);
  });
}

// ---- runtime store ----

test("a runtime upload of a new token receives the artifact and returns its public URL", async t => {
  const { registry, delivery } = runtime(t);
  assert.deepEqual(await delivery.store.upload({ key: KEY, bytes: BYTES, headers: {} }), { url: `${ORIGIN}/${KEY}` });
  const row = await registry.findToken({ token: TOKEN, file: "site.tovu.zip" });
  assert.deepEqual({ site: row?.site, sha256: row?.sha256, bytes: row?.bytes }, { site: "ws", sha256: sha(BYTES), bytes: BYTES.length });
});

test("a repeated runtime upload of the same artifact is idempotent", async t => {
  const { registry, delivery } = runtime(t);
  await delivery.store.upload({ key: KEY, bytes: BYTES, headers: {} });
  assert.deepEqual(await delivery.store.upload({ key: KEY, bytes: BYTES, headers: {} }), { url: `${ORIGIN}/${KEY}` });
  assert.equal((await registry.list({ site: "ws" })).length, 1);
});

test("a runtime upload refuses an invalid key", async t => {
  await assert.rejects(runtime(t).delivery.store.upload({ key: "bad", bytes: BYTES, headers: {} }), INVALID_KEY);
});

test("a runtime upload refuses a token already naming different bytes", async t => {
  const { delivery } = runtime(t);
  await delivery.store.upload({ key: KEY, bytes: BYTES, headers: {} });
  await assert.rejects(delivery.store.upload({ key: KEY, bytes: Buffer.from("other"), headers: {} }), { code: "ARTIFACT_CHANGED", message: "This token already names a different artifact." });
});

test("a runtime upload refuses a token already owned by another site", async t => {
  const registry = registryIn(t);
  await runtime(t, { registry, site: "other" }).delivery.store.upload({ key: KEY, bytes: BYTES, headers: {} });
  await assert.rejects(runtime(t, { registry }).delivery.store.upload({ key: KEY, bytes: BYTES, headers: {} }), { code: "ARTIFACT_CHANGED", message: "This token already names a different artifact." });
});

test("a runtime delete disables and removes only this site's matching row", async t => {
  const { registry, delivery } = runtime(t);
  await delivery.store.upload({ key: KEY, bytes: BYTES, headers: {} });
  const row = (await registry.findToken({ token: TOKEN, file: "site.tovu.zip" }))!;
  await delivery.store.delete({ key: KEY });
  assert.deepEqual({ status: (await registry.get({ shareId: row.shareId }))?.status, artifact: fs.existsSync(registry.artifactPath({ shareId: row.shareId })) }, { status: "revoked", artifact: false });
});

test("a runtime delete of an unknown key (or another site's row) changes nothing", async t => {
  const registry = registryIn(t);
  await runtime(t, { registry, site: "other" }).delivery.store.upload({ key: KEY, bytes: BYTES, headers: {} });
  await runtime(t, { registry }).delivery.store.delete({ key: KEY });
  assert.deepEqual((await registry.list({ site: "other" })).map(row => row.status), ["active"]);
});

test("a runtime delete refuses an invalid key", async t => {
  await assert.rejects(runtime(t).delivery.store.delete({ key: "bad" }), INVALID_KEY);
});

// ---- peer store ----

test("the peer delivery names the server provider and binds to the peer base URL", () => {
  const delivery = createPeerShareDelivery({ peer: peerDeps().peer, http: anonymousHttp().http });
  assert.deepEqual({ provider: delivery.provider, binding: delivery.binding }, { provider: "tovu-server", binding: PEER_BASE });
});

test("a peer upload PUTs the archive to the remote workspace's artifact route and returns the peer URL", async () => {
  const { peer, requests } = peerDeps();
  const signal = new AbortController().signal;
  assert.deepEqual(await createPeerShareDelivery({ peer, http: anonymousHttp().http }).store.upload({ key: KEY, bytes: BYTES, headers: {} }, { signal }), { url: `${PEER_BASE}/${KEY}` });
  assert.deepEqual(requests.map(request => ({ method: request.method, url: request.url, body: request.body, signal: request.signal, auth: request.headers?.authorization })),
    [{ method: "PUT", url: `${PEER_BASE}/api/admin/v1/workspaces/remote%20ws/site-shares/artifacts/${TOKEN}/site.tovu.zip`, body: BYTES, signal, auth: "Bearer opened-key" }]);
});

test("a peer upload refuses an invalid key before any request", async () => {
  const { peer, requests } = peerDeps();
  await assert.rejects(createPeerShareDelivery({ peer, http: anonymousHttp().http }).store.upload({ key: "bad", bytes: BYTES, headers: {} }), INVALID_KEY);
  assert.equal(requests.length, 0);
});

test("a peer delete sends DELETE to the artifact route", async () => {
  const { peer, requests } = peerDeps();
  await createPeerShareDelivery({ peer, http: anonymousHttp().http }).store.delete({ key: KEY });
  assert.deepEqual(requests.map(request => `${request.method} ${request.url}`), [`DELETE ${PEER_BASE}/api/admin/v1/workspaces/remote%20ws/site-shares/artifacts/${TOKEN}/site.tovu.zip`]);
});

test("a peer delete treats a 404 as already deleted", async () => {
  assert.equal(await createPeerShareDelivery({ peer: peerDeps(404).peer, http: anonymousHttp().http }).store.delete({ key: KEY }), undefined);
});

test("a peer delete propagates any other peer failure", async () => {
  await assert.rejects(createPeerShareDelivery({ peer: peerDeps(500).peer, http: anonymousHttp().http }).store.delete({ key: KEY }), { peerStatus: 500 });
});

test("a peer delete refuses an invalid key before any request", async () => {
  const { peer, requests } = peerDeps();
  await assert.rejects(createPeerShareDelivery({ peer, http: anonymousHttp().http }).store.delete({ key: "bad" }), INVALID_KEY);
  assert.equal(requests.length, 0);
});

test("peer verification checks the peer URL anonymously, never through the peer credential", async () => {
  const { peer, requests } = peerDeps();
  const { http, calls } = anonymousHttp();
  assert.equal(await createPeerShareDelivery({ peer, http }).store.verify({ key: KEY, url: `${PEER_BASE}/${KEY}`, present: true, bytes: BYTES.length }), true);
  assert.deepEqual({ urls: calls.map(call => call.required.request.url), headers: calls.map(call => call.required.request.headers), peerRequests: requests.length }, { urls: [`${PEER_BASE}/${KEY}`], headers: [{}], peerRequests: 0 });
});

test("peer verification refuses the runtime origin's URL for the same key", async () => {
  assert.equal(await createPeerShareDelivery({ peer: peerDeps().peer, http: anonymousHttp().http }).store.verify({ key: KEY, url: `${ORIGIN}/${KEY}`, present: true, bytes: 1 }), false);
});

// ---- delivery selection ----

const store = { upload: async () => ({ url: "unused" }), delete: async () => {}, verify: async () => true };
const RUNTIME: ShareDelivery = { provider: "tovu-server", binding: "/srv/shares", store };
const S3: ShareDelivery = { provider: "s3-compatible", binding: "bucket-a", store };
function selection(overrides: { peer?: () => Promise<PeerCallDeps | undefined>; s3?: () => Promise<ShareDelivery | undefined>; runtime?: () => ShareDelivery } = {}) {
  const calls: string[] = [];
  const { peer } = peerDeps();
  return {
    calls,
    required: {
      http: anonymousHttp().http,
      peer: overrides.peer ?? (async () => { calls.push("peer"); return peer; }),
      s3: overrides.s3 ?? (async () => { calls.push("s3"); return S3; }),
      ...(overrides.runtime ? { runtime: overrides.runtime } : {}),
    },
  };
}
const noPeer = async (): Promise<undefined> => undefined;

test("selection prefers a connected peer and does not consult S3", async () => {
  const { required, calls } = selection();
  const chosen = await resolveShareDelivery(required);
  assert.deepEqual({ binding: chosen?.binding, calls }, { binding: PEER_BASE, calls: ["peer"] });
});

test("selection keeps the peer when the saved binding is its base URL", async () => {
  assert.equal((await resolveShareDelivery(selection().required, { provider: "tovu-server", binding: PEER_BASE }))?.binding, PEER_BASE);
});

test("selection falls back to the runtime delivery when no peer is connected", async () => {
  assert.equal(await resolveShareDelivery(selection({ peer: noPeer, runtime: () => RUNTIME }).required), RUNTIME);
});

test("selection falls back to the runtime delivery when the peer connection fails", async () => {
  assert.equal(await resolveShareDelivery(selection({ peer: async () => { throw new Error("disconnected"); }, runtime: () => RUNTIME }).required), RUNTIME);
});

test("selection skips a peer bound elsewhere and takes the runtime delivery matching the saved binding", async () => {
  assert.equal(await resolveShareDelivery(selection({ runtime: () => RUNTIME }).required, { provider: "tovu-server", binding: "/srv/shares" }), RUNTIME);
});

test("a saved server binding matching neither peer nor runtime selects nothing and never S3", async () => {
  const { required, calls } = selection({ runtime: () => RUNTIME });
  assert.deepEqual({ chosen: await resolveShareDelivery(required, { provider: "tovu-server", binding: "https://old.example.test" }), calls }, { chosen: undefined, calls: ["peer"] });
});

test("a saved server provider without any server delivery selects nothing", async () => {
  assert.equal(await resolveShareDelivery(selection({ peer: noPeer }).required, { provider: "tovu-server" }), undefined);
});

test("with no provider, a runtime bound elsewhere falls through to S3", async () => {
  assert.equal(await resolveShareDelivery(selection({ peer: noPeer, runtime: () => ({ ...RUNTIME, binding: "/other" }) }).required, { binding: "bucket-a" }), S3);
});

test("with no provider and no server delivery, S3 is selected", async () => {
  assert.equal(await resolveShareDelivery(selection({ peer: noPeer }).required), S3);
});

test("an empty provider is treated as no provider", async () => {
  assert.equal(await resolveShareDelivery(selection({ peer: noPeer }).required, { provider: "" }), S3);
});

test("a saved S3 provider skips the server deliveries", async () => {
  const { required, calls } = selection({ runtime: () => assert.fail("runtime must not be consulted") });
  assert.deepEqual({ chosen: await resolveShareDelivery(required, { provider: "s3-compatible", binding: "bucket-a" }), calls }, { chosen: S3, calls: ["s3"] });
});

test("a saved S3 binding that differs selects nothing", async () => {
  assert.equal(await resolveShareDelivery(selection().required, { provider: "s3-compatible", binding: "bucket-b" }), undefined);
});

test("a saved provider the site's object store does not resolve to selects nothing (the server deliveries are not consulted)", async () => {
  // Object-store providers are an open set now, so a non-server provider asks the object-store
  // source and keeps only a delivery of that same provider.
  const { required, calls } = selection();
  assert.deepEqual({ chosen: await resolveShareDelivery(required, { provider: "ftp" }), calls }, { chosen: undefined, calls: ["s3"] });
});

test("no configured S3 selects nothing", async () => {
  assert.equal(await resolveShareDelivery(selection({ peer: noPeer, s3: async () => undefined }).required), undefined);
});

test("a failed S3 credential resolution selects nothing", async () => {
  assert.equal(await resolveShareDelivery(selection({ peer: noPeer, s3: async () => { throw new Error("missing credentials"); } }).required), undefined);
});
