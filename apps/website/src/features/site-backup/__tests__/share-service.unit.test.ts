/**
 * Pins share creation, delivery, failed-delivery cleanup and revoke with a real registry in a temp
 * folder and a typed in-memory artifact store. Each test removes its folder.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import type { ArtifactStorePort } from "@jini-ai/devops/deploy";
import { SiteShareRegistry, type SiteShareRecord } from "../share-registry.js";
import { createSiteShare, receiveSiteShareArtifact, revokeSiteShare, SHARE_DOWNLOAD_HEADERS, type ShareDelivery } from "../share-service.js";
import { SHARE_LIMITS } from "../share-policy.js";

const ARCHIVE = Buffer.from("PK zip bytes");
const URL = "https://cdn.example/share.zip";

async function registryIn(t: TestContext): Promise<SiteShareRegistry> {
  const directory = await mkdtemp(path.join(tmpdir(), "tovu-share-service-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new SiteShareRegistry({ directory });
}
interface StoreCalls { uploads: Parameters<ArtifactStorePort["upload"]>[0][]; deletes: string[]; verifies: Parameters<ArtifactStorePort["verify"]>[0][] }
function store(behaviour: Partial<ArtifactStorePort> = {}): { store: ArtifactStorePort; calls: StoreCalls } {
  const calls: StoreCalls = { uploads: [], deletes: [], verifies: [] };
  return {
    calls,
    store: {
      upload: async (required, optional) => { calls.uploads.push(required); return behaviour.upload ? behaviour.upload(required, optional) : { url: URL }; },
      delete: async (required, optional) => { calls.deletes.push(required.key); if (behaviour.delete) await behaviour.delete(required, optional); },
      verify: async (required, optional) => { calls.verifies.push(required); return behaviour.verify ? behaviour.verify(required, optional) : true; },
    },
  };
}
const delivery = (artifactStore: ArtifactStorePort, overrides: Partial<ShareDelivery> = {}): ShareDelivery => ({ provider: "s3", store: artifactStore, ...overrides });
const failureOf = (promise: Promise<unknown>): Promise<{ code?: string; message: string }> => promise.then(() => assert.fail("must refuse"), (error: { code?: string; message: string }) => error);

// receiveSiteShareArtifact --------------------------------------------------------------------

for (const file of ["../x.tovu.zip", "Site.tovu.zip", "site.zip", "-site.tovu.zip"]) {
  test(`the share file name ${file} is refused before the token is reserved`, async t => {
    const registry = await registryIn(t);
    await assert.rejects(receiveSiteShareArtifact({ registry, site: "ws", token: "a".repeat(16), file, archive: ARCHIVE }), { code: "INVALID_INPUT", message: "Invalid share file name." });
    assert.deepEqual(await registry.list({}), []);
  });
}
test("a received artifact is stored with its hash and the given storage locator", async t => {
  const registry = await registryIn(t), storage = { provider: "s3", key: "_share/k/site.tovu.zip" };
  const row = await receiveSiteShareArtifact({ registry, site: "ws", token: "b".repeat(16), file: "site.tovu.zip", archive: ARCHIVE }, { storage });
  assert.deepEqual([row.status, row.bytes, row.url, row.storage, row.sha256.length], ["active", ARCHIVE.length, null, storage, 64]);
  assert.deepEqual(await registry.get({ shareId: row.shareId }), row);
});
test("an artifact the registry cannot write is removed and the write error is rethrown", async t => {
  const registry = await registryIn(t);
  await assert.rejects(receiveSiteShareArtifact({ registry, site: "ws", token: "c".repeat(16), file: "site.tovu.zip", archive: Buffer.allocUnsafeSlow(SHARE_LIMITS.maxArchiveBytes + 1) }), { code: "LIMIT_EXCEEDED", message: "Share exceeds the 300 MiB archive cap." });
  assert.deepEqual(await registry.list({}), []);
});

// createSiteShare -------------------------------------------------------------------------------

for (const [name, file] of [["My Site!", "my-site.tovu.zip"], ["中文", "site.tovu.zip"], ["--x--", "x.tovu.zip"], ["a".repeat(90), "a".repeat(80) + ".tovu.zip"]] as const) {
  test(`a share named ${JSON.stringify(name).slice(0, 12)} is filed as ${file.slice(0, 20)}`, async t => {
    const registry = await registryIn(t);
    assert.equal((await createSiteShare({ registry, site: "ws", name, archive: ARCHIVE })).file, file);
  });
}
test("a share without delivery stays a local, URL-less artifact", async t => {
  const registry = await registryIn(t);
  const row = await createSiteShare({ registry, site: "ws", name: "Site", archive: ARCHIVE });
  assert.deepEqual([row.status, row.url, row.storage], ["active", null, undefined]);
});
test("a share cancelled after it was received is disabled, its ZIP deleted and the export refused", async t => {
  const registry = await registryIn(t), fake = store(), controller = new AbortController();
  controller.abort();
  await assert.rejects(createSiteShare({ registry, site: "ws", name: "Site", archive: ARCHIVE }, { delivery: delivery(fake.store), signal: controller.signal }), { code: "CANCELLED", message: "Share export was cancelled." });
  const [row] = await registry.list({});
  assert.equal(row?.status, "revoked");
  assert.deepEqual(fake.calls.uploads, []);
});
test("a delivered share uploads with download headers, verifies anonymously and publishes its URL", async t => {
  const registry = await registryIn(t), fake = store();
  const row = await createSiteShare({ registry, site: "ws", name: "Site", archive: ARCHIVE }, { delivery: delivery(fake.store, { binding: "bucket" }) });
  const key = `_share/${row.token}/site.tovu.zip`;
  assert.deepEqual(fake.calls.uploads, [{ key, bytes: ARCHIVE, headers: { ...SHARE_DOWNLOAD_HEADERS, "Content-Disposition": 'attachment; filename="site.tovu.zip"' } }]);
  assert.deepEqual(fake.calls.verifies, [{ key, url: URL, present: true, bytes: ARCHIVE.length }]);
  assert.deepEqual([row.url, row.storage], [URL, { provider: "s3", key, binding: "bucket" }]);
  assert.deepEqual(await registry.get({ shareId: row.shareId }), row);
});
test("a delivery without a binding records no binding", async t => {
  const registry = await registryIn(t);
  assert.equal((await createSiteShare({ registry, site: "ws", name: "Site", archive: ARCHIVE }, { delivery: delivery(store().store) })).storage?.binding, undefined);
});
test("an upload that cannot be verified anonymously is purged and refused", async t => {
  const registry = await registryIn(t), fake = store({ verify: async required => !required.present });
  const failure = await failureOf(createSiteShare({ registry, site: "ws", name: "Site", archive: ARCHIVE }, { delivery: delivery(fake.store) }));
  assert.deepEqual([failure.code, failure.message], ["DELIVERY_FAILED", "Storage upload could not be verified anonymously with the required download headers. Configure public object access and download headers."]);
  const [row] = await registry.list({});
  assert.deepEqual([row?.status, row?.storage?.url], ["failed", URL]);
  assert.equal(fake.calls.deletes.length, 1);
  assert.deepEqual(fake.calls.verifies.map(call => call.present), [true, false]);
});
test("a share revoked during upload is refused as revoked", async t => {
  const registry = await registryIn(t);
  const fake = store({ upload: async () => { const [row] = await registry.list({}); await registry.disable({ shareId: row!.shareId, site: "ws" }); return { url: URL }; } });
  await assert.rejects(createSiteShare({ registry, site: "ws", name: "Site", archive: ARCHIVE }, { delivery: delivery(fake.store) }), { code: "REVOKED", message: "Share was revoked during upload." });
});
test("a failed upload is recorded failed without a URL and reported as a delivery failure", async t => {
  const registry = await registryIn(t), fake = store({ upload: async () => { throw new Error("network down"); } });
  const failure = await failureOf(createSiteShare({ registry, site: "ws", name: "Site", archive: ARCHIVE }, { delivery: delivery(fake.store) }));
  const [row] = await registry.list({});
  assert.deepEqual([failure.code, failure.message], ["DELIVERY_FAILED", `Share ${row!.shareId} delivery failed. Download the ZIP or configure storage and retry.`]);
  assert.deepEqual([row?.status, row?.storage?.url], ["failed", undefined]);
  assert.deepEqual([fake.calls.deletes.length, fake.calls.verifies.length], [1, 0]);
});
for (const [label, behaviour] of [["remote deletion fails", { verify: async (required: { present: boolean }) => !required.present, delete: async () => { throw new Error("denied"); } }], ["the purge cannot be verified", { verify: async () => false }]] as const) {
  test(`a failed delivery whose ${label} is refused as a cleanup failure`, async t => {
    const registry = await registryIn(t), fake = store(behaviour);
    const failure = await failureOf(createSiteShare({ registry, site: "ws", name: "Site", archive: ARCHIVE }, { delivery: delivery(fake.store) }));
    const [row] = await registry.list({});
    assert.deepEqual([failure.code, failure.message], ["DELIVERY_CLEANUP_FAILED", `Share ${row!.shareId} delivery failed and remote deletion/purge could not be verified. Retry site_share_revoke.`]);
  });
}
test("a failed delivery to this server's own share folder deletes nothing remotely", async t => {
  const registry = await registryIn(t), fake = store({ upload: async () => { throw new Error("down"); } });
  await assert.rejects(createSiteShare({ registry, site: "ws", name: "Site", archive: ARCHIVE }, { delivery: delivery(fake.store, { provider: "tovu-server", binding: registry.directory }) }), { code: "DELIVERY_FAILED" });
  assert.deepEqual(fake.calls.deletes, []);
});
test("a failed delivery to another server's share folder is deleted remotely", async t => {
  const registry = await registryIn(t), fake = store({ upload: async () => { throw new Error("down"); } });
  await assert.rejects(createSiteShare({ registry, site: "ws", name: "Site", archive: ARCHIVE }, { delivery: delivery(fake.store, { provider: "tovu-server", binding: "https://peer.example" }) }), { code: "DELIVERY_FAILED" });
  assert.equal(fake.calls.deletes.length, 1);
});

// revokeSiteShare -------------------------------------------------------------------------------

async function sharedRow(t: TestContext, storage?: SiteShareRecord["storage"], url: string | null = null): Promise<{ registry: SiteShareRegistry; row: SiteShareRecord }> {
  const registry = await registryIn(t);
  const received = await receiveSiteShareArtifact({ registry, site: "ws", token: "d".repeat(16), file: "site.tovu.zip", archive: ARCHIVE }, storage ? { storage } : {});
  const row = { ...received, url };
  await registry.put({ record: row });
  return { registry, row };
}
test("revoking an unknown share is refused as not found", async t => {
  const registry = await registryIn(t);
  await assert.rejects(revokeSiteShare({ registry, site: "ws", shareId: "00000000-0000-4000-8000-000000000000" }), { code: "NOT_FOUND", message: "Share not found for this site." });
});
test("a local ZIP that cannot be deleted is refused after the token is disabled", async t => {
  const { registry, row } = await sharedRow(t);
  class UndeletableRegistry extends SiteShareRegistry { override async deleteArtifact(): Promise<void> { throw new Error("busy"); } }
  const undeletable = new UndeletableRegistry({ directory: registry.directory });
  await assert.rejects(revokeSiteShare({ registry: undeletable, site: "ws", shareId: row.shareId }), { code: "DELETE_FAILED", message: "Share token is disabled but its ZIP could not be deleted. Retry revoke." });
  assert.equal((await registry.get({ shareId: row.shareId }))?.status, "revoked");
});
test("a share without remote storage is revoked locally", async t => {
  const { registry, row } = await sharedRow(t);
  assert.equal((await revokeSiteShare({ registry, site: "ws", shareId: row.shareId })).status, "revoked");
});
test("a share in this server's own share folder needs no delivery to revoke", async t => {
  const { registry, row } = await sharedRow(t);
  await registry.put({ record: { ...row, storage: { provider: "tovu-server", key: "k", binding: registry.directory } } });
  assert.equal((await revokeSiteShare({ registry, site: "ws", shareId: row.shareId })).status, "revoked");
});
test("a share in another server's share folder needs its delivery to revoke", async t => {
  const { registry, row } = await sharedRow(t, { provider: "tovu-server", key: "k", binding: "https://peer.example" });
  await assert.rejects(revokeSiteShare({ registry, site: "ws", shareId: row.shareId }), { code: "DELETE_FAILED", message: "Share is disabled locally; configure its original storage to delete the remote artifact." });
});
for (const [label, configured] of [["no delivery", undefined], ["another provider", { provider: "gcs" }], ["another binding", { provider: "s3", binding: "other" }]] as const) {
  test(`a remote share revoked with ${label} is refused until its storage is configured`, async t => {
    const { registry, row } = await sharedRow(t, { provider: "s3", key: "k", binding: "bucket" });
    await assert.rejects(revokeSiteShare({ registry, site: "ws", shareId: row.shareId }, configured ? { delivery: delivery(store().store, configured) } : {}), { code: "DELETE_FAILED", message: "Share is disabled locally; configure its original storage to delete the remote artifact." });
  });
}
test("a remote share is deleted and its published URL verified absent", async t => {
  const { registry, row } = await sharedRow(t, { provider: "s3", key: "k", binding: "bucket", url: "https://stored" }, URL), fake = store();
  await revokeSiteShare({ registry, site: "ws", shareId: row.shareId }, { delivery: delivery(fake.store, { binding: "bucket" }) });
  assert.deepEqual([fake.calls.deletes, fake.calls.verifies], [["k"], [{ key: "k", url: URL, present: false }]]);
});
test("a remote share without a published URL is verified at its stored URL", async t => {
  const { registry, row } = await sharedRow(t, { provider: "s3", key: "k", url: "https://stored" }), fake = store();
  await revokeSiteShare({ registry, site: "ws", shareId: row.shareId }, { delivery: delivery(fake.store) });
  assert.deepEqual(fake.calls.verifies, [{ key: "k", url: "https://stored", present: false }]);
});
test("a remote share with no URL at all is deleted without verification", async t => {
  const { registry, row } = await sharedRow(t, { provider: "s3", key: "k" }), fake = store();
  await revokeSiteShare({ registry, site: "ws", shareId: row.shareId }, { delivery: delivery(fake.store) });
  assert.deepEqual([fake.calls.deletes, fake.calls.verifies], [["k"], []]);
});
for (const [label, behaviour] of [["deletion fails", { delete: async () => { throw new Error("denied"); } }], ["the purge is not verified", { verify: async () => false }]] as const) {
  test(`a remote share whose ${label} is refused as unverified`, async t => {
    const { registry, row } = await sharedRow(t, { provider: "s3", key: "k" }, URL);
    await assert.rejects(revokeSiteShare({ registry, site: "ws", shareId: row.shareId }, { delivery: delivery(store(behaviour).store) }), { code: "DELETE_FAILED", message: "Share is disabled locally but remote deletion/purge is not verified. Retry revoke." });
  });
}
