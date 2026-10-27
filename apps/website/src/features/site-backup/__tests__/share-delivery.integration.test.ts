import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSiteShareRoutes } from "#src/server/inbound/admin-http/routes/system/site-shares";
import { registerPublicShareRoutes } from "#src/server/inbound/public-http/routes/site-share";
import type { RouteDeps } from "#src/server/routes/types";
import type { PeerCallDeps } from "../../publish-content/peer-transport.js";
import { createPeerShareDelivery, resolveShareDelivery } from "../share-hosting.js";
import { SiteShareRegistry } from "../share-registry.js";
import { createSiteShare, revokeSiteShare } from "../share-service.js";
import { createSiteShareBackend } from "../share-backend.js";

// RED: no peer delivery existed, no binding to live, and publishing tokens failed artifact auth.
test("peer artifact PUT → anonymous HEAD/GET → DELETE uses remote workspace and no receiver env opt-in", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-peer-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = new SiteShareRegistry({ directory: path.join(directory, "source") });
  const receiver = new SiteShareRegistry({ directory: path.join(directory, ".hidden", "received") });
  const app = express();
  registerPublicShareRoutes({ app, registry: receiver });
  let apply = true;
  app.use((req, res, next) => {
    if (req.get("authorization") !== "Bearer fixture-destination-session") { res.sendStatus(401); return; }
    res.locals.principal = { id: "pub:source" };
    res.locals.publishTrust = { sourceInstallationId: "source", capabilities: apply ? ["publish_content.apply"] : ["publish_content.read"], entityTypes: [], generation: 1 };
    next();
  });
  registerAdminSiteShareRoutes({ app, deps: { workspaceId: "remote-ws", authorize: async () => { throw new Error("Publishing sessions cannot use RBAC"); }, siteShareBackend: { registry: receiver } } as unknown as RouteDeps });
  const local = await startTestServer(app, t);
  const baseUrl = "https://deployed.example.test/tovu";
  const requests: { method: string; path: string; authorized: boolean }[] = [];
  const send: PeerCallDeps["httpClient"]["send"] = async request => {
    assert.ok(request.url.startsWith(baseUrl + "/"));
    const route = request.url.slice(baseUrl.length);
    requests.push({ method: request.method, path: route, authorized: !!request.headers.authorization });
    const response = await fetch(local + route, { method: request.method, headers: request.headers, body: request.body as BodyInit | undefined });
    return { status: response.status, headers: Object.fromEntries(response.headers), bodyText: await response.text() };
  };
  const peer: PeerCallDeps = { credential: { id: "live", label: "Live", baseUrl, remoteWorkspaceId: "remote-ws", apiKey: "fixture-destination-session" }, httpClient: { send } };
  const http = { send: async ({ request }: { request: Parameters<typeof send>[0] }) => send(request) };
  const delivery = createPeerShareDelivery({ peer, http });
  assert.equal(delivery.binding, baseUrl);
  const archive = Buffer.from([0x50, 0x4b, 3, 4, 0, 0xff, 0xc3, 0x28]);
  const row = await createSiteShare({ registry: source, site: "local-ws", name: "Site", archive }, { delivery });
  assert.equal(row.storage?.binding, baseUrl);
  assert.equal(row.url, `${baseUrl}/_share/${row.token}/${row.file}`);
  const response = await fetch(`${local}/_share/${row.token}/${row.file}`);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), archive);
  assert.deepEqual(requests.map(r => [r.method, r.authorized]), [["PUT", true], ["HEAD", false]]);
  assert.match(requests[0]!.path, /^\/api\/admin\/v1\/workspaces\/remote-ws\/site-shares\/artifacts\//);
  apply = false;
  await assert.rejects(delivery.store.delete({ key: row.storage!.key }), /403/);
  assert.equal((await fetch(`${local}/_share/${row.token}/${row.file}`)).status, 200);
  apply = true;
  await revokeSiteShare({ registry: source, site: "local-ws", shareId: row.shareId }, { delivery });
  assert.equal((await fetch(`${local}/_share/${row.token}/${row.file}`)).status, 404);
  assert.equal((await source.get({ shareId: row.shareId }))?.status, "revoked");
  assert.equal((await receiver.list({}))[0]!.status, "revoked");
});

test("delivery selection prefers connected live, falls back to object storage then ZIP, and pins revoke binding", async () => {
  const calls: string[] = [];
  const peer: PeerCallDeps = { credential: { id: "live", label: "Live", baseUrl: "https://live.example.test", remoteWorkspaceId: "remote", apiKey: "private" }, httpClient: { send: async () => { throw new Error("not called at selection"); } } };
  const objectStore = { provider: "example-store", binding: "bucket-a", store: { upload: async () => ({ url: "https://bucket.example.test" }), delete: async () => {}, verify: async () => true } };
  const deps = { peer: async () => { calls.push("peer"); return peer; }, http: { send: async () => { throw new Error("not called at selection"); } }, objectStore: async () => { calls.push("objectStore"); return objectStore; } };
  const selected = await resolveShareDelivery(deps);
  assert.equal(selected?.provider, "tovu-server");
  assert.equal(selected?.binding, peer.credential.baseUrl);
  assert.deepEqual(calls, ["peer"]);
  assert.equal(await resolveShareDelivery({ ...deps, peer: async () => undefined }), objectStore);
  assert.equal(await resolveShareDelivery({ ...deps, peer: async () => { throw new Error("disconnected"); } }), objectStore);
  assert.equal(await resolveShareDelivery({ ...deps, peer: async () => undefined, objectStore: async () => undefined }), undefined);
  assert.equal(await resolveShareDelivery({ ...deps, peer: async () => undefined, objectStore: async () => { throw new Error("missing credentials"); } }), undefined);
  assert.equal(await resolveShareDelivery(deps, { provider: "tovu-server", binding: "https://old.example.test" }), undefined);
  assert.equal(await resolveShareDelivery(deps, { provider: "example-store", binding: "bucket-b" }), undefined);
  calls.length = 0;
  assert.equal(await resolveShareDelivery(deps, { provider: "example-store", binding: "bucket-a" }), objectStore);
  assert.deepEqual(calls, ["objectStore"]);
});

test("backend revoke resolves local rows without a delivery and disables exactly once", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-local-revoke-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const registry = new SiteShareRegistry({ directory });
  const row = await createSiteShare({ registry, site: "ws", name: "site", archive: Buffer.from("PK fixture") });
  await registry.put({ record: { ...row, storage: { provider: "tovu-server", binding: directory, key: `_share/${row.token}/${row.file}` } } });
  let disables = 0;
  const disable = registry.disable.bind(registry);
  registry.disable = async input => { disables++; return disable(input); };
  const backend = createSiteShareBackend({ registry, site: "ws", prepare: async () => { throw new Error("not creating"); }, zip: async () => { throw new Error("not creating"); }, delivery: async () => { throw new Error("env is unset"); } });
  assert.equal((await backend.revoke({ shareId: row.shareId })).status, "revoked");
  assert.equal(disables, 1);
  assert.equal(await registry.findToken({ token: row.token, file: row.file }), null);
});

// RED: the old cleanup skipped every tovu-server provider, including remote peer artifacts.
test("a failed peer verification removes the remote upload and keeps the source row failed", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-peer-cleanup-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const registry = new SiteShareRegistry({ directory });
  let deleted = 0;
  const delivery = { provider: "tovu-server", binding: "https://live.example.test", store: {
    upload: async () => ({ url: "https://live.example.test/export" }),
    delete: async () => { deleted++; },
    verify: async ({ present }: { present: boolean }) => !present,
  } };
  await assert.rejects(createSiteShare({ registry, site: "ws", name: "site", archive: Buffer.from("PK artifact") }, { delivery }), (error: unknown) => (error as { code: string }).code === "DELIVERY_FAILED");
  assert.equal(deleted, 1);
  const [row] = await registry.list({});
  assert.equal(row?.status, "failed");
  assert.equal(await registry.findToken({ token: row!.token, file: row!.file }), null);
});

// RED: the previous result described manual persistent-storage setup instead of the delivery order.
test("no delivery returns a private ZIP download and a clear link-setup message", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-zip-only-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const registry = new SiteShareRegistry({ directory });
  const backend = createSiteShareBackend({ registry, site: "ws", zip: zipFolderFiles, delivery: async () => undefined,
    prepare: async () => ({ profile: "share", target: { kind: "zip" }, include: { database: true, media: true, themes: true, plugins: true, settings: true },
      // A v2 share always carries settings.json beside content.db.
      database: { bytes: Buffer.from("projected database"), watermarkAtCapture: 42 }, files: [], bufferedFiles: [{ path: "settings.json", content: Buffer.from("{}") }], skipped: [], scopeNotes: {}, totalBytes: Buffer.byteLength("projected database") + 2,
      site: { name: "Site", folderName: "site" }, schema: { index: 14, tag: "0014_media_library" }, tovuVersion: "test", createdAt: "2026-10-18T12:00:00.000Z" }),
  });
  const result = await backend.create({ principalId: "owner", signal: new AbortController().signal }, { waitMs: 1000 }) as { url: string | null; downloadUrl: string; message: string };
  assert.equal(result.url, null);
  assert.match(result.downloadUrl, /\/site-shares\/[0-9a-f-]+\/download$/);
  assert.match(result.message, /Download zip only.*deployed Tovu.*S3-compatible/);
});

test("peer deletion treats only 404 as already absent and never sends an invalid artifact path", async () => {
  let status = 404;
  const requests: unknown[] = [];
  const peer: PeerCallDeps = { credential: { id: "live", label: "Live", baseUrl: "https://live.example.test", remoteWorkspaceId: "space /remote", apiKey: "private" }, httpClient: { send: async request => { requests.push(request); return { status, headers: {}, bodyText: "unavailable" }; } } };
  const delivery = createPeerShareDelivery({ peer, http: { send: async () => assert.fail("DELETE must not use anonymous HEAD") } });
  const key = `_share/${"a".repeat(16)}/site.tovu.zip`;
  await assert.rejects(delivery.store.delete({ key: "../private" }), { code: "INVALID_INPUT" });
  assert.deepEqual(requests, []);
  await delivery.store.delete({ key });
  const request = requests[0] as { method: string; url: string; headers: Record<string, string> };
  assert.equal(request.method, "DELETE");
  assert.equal(request.url, `https://live.example.test/api/admin/v1/workspaces/space%20%2Fremote/site-shares/artifacts/${"a".repeat(16)}/site.tovu.zip`);
  assert.equal(request.headers.authorization, "Bearer private");
  status = 500;
  await assert.rejects(delivery.store.delete({ key }), error => (error as { peerStatus?: number }).peerStatus === 500);
});
