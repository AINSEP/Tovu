import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import type { ArtifactStorePort } from "@jini-ai/devops/deploy";
import { SiteShareRegistry } from "../share-registry.js";
import { SHARE_DOWNLOAD_HEADERS, createSiteShare, revokeSiteShare } from "../share-service.js";
import { createRuntimeShareDelivery } from "../share-hosting.js";
import { registerPublicShareRoutes } from "#src/server/inbound/public-http/routes/site-share";

const key = `_share/${"a".repeat(16)}/site.tovu.zip`;
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

test(`runtime artifact contract: upload/anonymous verify/delete/confirmed absence; unrelated objects survive`, async t => {
  const store = await runtime(t);
  const { url } = await store.upload({ key, bytes, headers: { ...SHARE_DOWNLOAD_HEADERS, "Content-Disposition": 'attachment; filename="site.tovu.zip"' } });
  assert.equal(await store.verify({ key, url, present: true, bytes: bytes.length }), true);
  await assert.rejects(store.delete({ key: "unrelated.txt" }), /Invalid share/i);
  await store.delete({ key });
  assert.equal(await store.verify({ key, url, present: false }), true);
  await store.delete({ key });
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
  const row = await createSiteShare({ registry, site: "ws", name: "site", archive: bytes }, { delivery: { provider: "example-store", binding: "bucket-a", store } });
  await assert.rejects(revokeSiteShare({ registry, site: "ws", shareId: row.shareId }, { delivery: { provider: "example-store", binding: "bucket-b", store } }), /original storage/);
  assert.equal(wrongBucketDeletes, 0);
  assert.equal(await registry.findToken({ token: row.token, file: row.file }), null);
});
