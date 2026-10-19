import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";
import type { ArtifactStorePort } from "@jini-ai/devops/deploy";
import { createDeployHostKit } from "../../deployments/deploy-targets/host-kit.js";
import { SiteShareRegistry } from "../share-registry.js";
import { SHARE_DOWNLOAD_HEADERS, createSiteShare, revokeSiteShare } from "../share-service.js";
import { createRuntimeShareDelivery } from "../share-hosting.js";
import { registerPublicShareRoutes } from "#src/server/inbound/public-http/routes/site-share";

const key = `_share/${"a".repeat(64)}/site.tovu.zip`;
const bytes = Buffer.from("PK artifact contract");

async function runtime(t: TestContext): Promise<ArtifactStorePort> {
  const directory = await mkdtemp(path.join(tmpdir(), "share-contract-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const registry = new SiteShareRegistry({ directory });
  const app = express();
  registerPublicShareRoutes({ app, registry });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const port = (server.address() as { port: number }).port;
  return createRuntimeShareDelivery({ registry, site: "ws", publicOrigin: "https://share.example.test", http: {
    send: async ({ request }) => {
      const response = await fetch(`http://127.0.0.1:${port}${new URL(request.url).pathname}`, { method: request.method });
      return { status: response.status, headers: Object.fromEntries(response.headers), bodyText: "" };
    },
  } }).store;
}

async function s3() {
  const objects = new Map<string, { bytes: Buffer; headers: Headers }>();
  objects.set("unrelated.txt", { bytes: Buffer.from("keep"), headers: new Headers() });
  const fetchObject = async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const objectKey = decodeURIComponent(url.pathname.replace(/^\/bucket\//, "").replace(/^\//, ""));
    if (init.method === "PUT") {
      const data = typeof init.body === "string" ? Buffer.from(init.body) : Buffer.from(init.body as Uint8Array);
      objects.set(objectKey, { bytes: data, headers: new Headers(init.headers) });
      return new Response(null, { status: 200, headers: { etag: '"written"' } });
    }
    if (init.method === "DELETE") { objects.delete(objectKey); return new Response(null, { status: 204 }); }
    const object = objects.get(objectKey);
    if (!object) return new Response(null, { status: 404 });
    // Model a plain S3 bucket: return only persisted HTTP headers.
    const headers = new Headers(object.headers);
    headers.set("content-length", String(object.bytes.length));
    headers.set("etag", '"written"');
    return new Response(init.method === "HEAD" ? null : new Uint8Array(object.bytes), { status: 200, headers });
  };
  const kit = { ...createDeployHostKit({ fetchFn: fetchObject as typeof fetch }),
    checkDeploymentUrl: async () => ({ reachable: true, status: "ready" as const }),
    createSigV4Client: () => ({ fetch: fetchObject, sign: async () => { throw new Error("No signing is needed by this fixture"); } }),
  };
  const module = (await import(pathToFileURL(path.join(process.cwd(), "content/agent-plugins/s3-compatible/targets/s3-compatible.mjs")).href)).default;
  const context = { credential: { token: "fixture-secret", accessKeyId: "fixture-id", bucket: "bucket", region: "test", publicUrl: "https://objects.example.test", endpoint: "https://api.example.test" }, config: {}, kit };
  return { store: module.createArtifactStore(context) as ArtifactStorePort, target: module.create(context), objects };
}

for (const provider of ["runtime", "s3"] as const) {
  test(`${provider} artifact contract: upload/anonymous verify/delete/confirmed absence; unrelated objects survive`, async t => {
    const fixture = provider === "s3" ? await s3() : undefined;
    const store = fixture?.store ?? await runtime(t);
    const { url } = await store.upload({ key, bytes, headers: { ...SHARE_DOWNLOAD_HEADERS, "Content-Disposition": 'attachment; filename="site.tovu.zip"' } });
    assert.equal(await store.verify({ key, url, present: true, bytes: bytes.length }), true);
    await assert.rejects(store.delete({ key: "unrelated.txt" }), /Invalid share/i);
    await store.delete({ key });
    assert.equal(await store.verify({ key, url, present: false }), true);
    await store.delete({ key });
    if (fixture) assert.equal(fixture.objects.get("unrelated.txt")?.bytes.toString(), "keep");
  });
}

test("ordinary S3 publishing preserves share objects even if an old cleanup manifest names them", async () => {
  const fixture = await s3();
  const { url } = await fixture.store.upload({ key, bytes, headers: SHARE_DOWNLOAD_HEADERS });
  fixture.objects.set(".tovu/managed-keys.json", { bytes: Buffer.from(JSON.stringify({ version: 2, keys: [{ key, etag: '"written"' }] })), headers: new Headers() });
  await fixture.target.publish({ files: [], projectName: "site" });
  assert.equal(fixture.objects.get(key)?.bytes.toString(), bytes.toString());
  await assert.rejects(fixture.target.publish({ files: [{ file: key, data: Buffer.from("overwrite") }], projectName: "site" }), /cannot write share artifacts/);
  assert.equal(await fixture.store.verify({ key, url, present: true, bytes: bytes.length }), false, "missing attachment header is not verified as safe delivery");
});

test("failed deletion never reports success, and the token is disabled before the provider is called", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-revoke-failure-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const registry = new SiteShareRegistry({ directory });
  const delivery = { provider: "fixture", store: {
    upload: async () => ({ url: "https://share.example.test/export" }),
    verify: async () => true,
    delete: async () => {
      assert.equal((await registry.list({ site: "ws" }))[0]!.status, "revoked");
      throw new Error("provider outage");
    },
  } };
  const row = await createSiteShare({ registry, site: "ws", name: "site", archive: bytes }, { delivery });
  await assert.rejects(revokeSiteShare({ registry, site: "ws", shareId: row.shareId }, { delivery }), /disabled locally.*not verified/);
  assert.equal(await registry.findToken({ token: row.token, file: row.file }), null);
});

test("changing the default storage cannot delete objects in a different bucket", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-storage-binding-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const registry = new SiteShareRegistry({ directory });
  let wrongBucketDeletes = 0;
  const store = { upload: async () => ({ url: "https://share.example.test/site.tovu.zip" }), verify: async () => true, delete: async () => { wrongBucketDeletes++; } };
  const row = await createSiteShare({ registry, site: "ws", name: "site", archive: bytes }, { delivery: { provider: "s3-compatible", binding: "bucket-a", store } });
  await assert.rejects(revokeSiteShare({ registry, site: "ws", shareId: row.shareId }, { delivery: { provider: "s3-compatible", binding: "bucket-b", store } }), /original storage/);
  assert.equal(wrongBucketDeletes, 0);
  assert.equal(await registry.findToken({ token: row.token, file: row.file }), null);
});
