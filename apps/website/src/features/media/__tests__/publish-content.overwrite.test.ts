import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteMediaRepo, SqliteAssetBlobRepo, SqliteAssetRenditionRepo, SqliteMediaContentTypeStore } from "#src/platform/db/sqlite/media-repo.sqlite";
import { InMemoryBlobStore, mediaPublicPath, type MediaRecord } from "../index.js";
import { contributeMediaPublish, MediaApplyBlockedError, MediaApplyConflictError } from "../publish-content.js";
import { planImport } from "#src/features/publish-content/planner";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "#src/features/publish-content/artifact-format";
import { CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import { registerPublishContentContributor, resetPublishContentContributorsForTests, type PublishContentDeps } from "#src/features/publish-content/type-registry";

const workspaceId = "11111111-1111-1111-1111-111111111111";
const oldBytes = new Uint8Array([1]);
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

async function fixture(t: TestContext) {
  const db = openContentDb(":memory:");
  t.after(() => db.$client.close());
  const repo = new SqliteMediaRepo(db);
  const assetBlobRepo = new SqliteAssetBlobRepo(db);
  const renditions = new SqliteAssetRenditionRepo(db);
  const contentTypeStore = new SqliteMediaContentTypeStore(db);
  const blobStore = new InMemoryBlobStore();
  const prior: MediaRecord = { id: "photo", workspaceId, kind: "media", originalFilename: "first.jpg", createdBy: "creator",
    title: "Before", slug: "before", alt: "Old alt", caption: "", credit: "", source: { sha256: digest(oldBytes) },
    version: 3, status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    width: 10, height: 20, cssClass: null, htmlAttributes: null };
  await repo.save(prior);
  for (const value of [oldBytes, bytes]) {
    const sha256 = digest(value);
    const { storageKey } = await blobStore.putIfAbsent({ workspaceId, sha256, bytes: value });
    await assetBlobRepo.save({ id: sha256, workspaceId, sha256, storageKey, status: "active", createdAt: prior.createdAt, createdByPrincipal: "blob-owner" });
  }
  await renditions.save({ id: "preview", workspaceId, assetId: prior.id, transformName: "thumb", version: 1, storageKey: "old-preview", createdAt: prior.createdAt });
  const incoming = { ...prior, title: "After", slug: "after", alt: "New alt", width: 100, height: 200,
    createdBy: "forged-creator", source: { sha256: digest(bytes), contentType: "image/png", provenance: { kind: "url" as const, url: "https://user:secret@example.com/new.jpg?token=secret" } } };
  const entity = { entityType: "media", id: prior.id, schemaVersion: 1, contentHash: "incoming", hashVersion: CONTENT_HASH_VERSION,
    requiredBlobs: [incoming.source.sha256], state: { ...incoming } };
  const outbox = new InMemoryOutbox();
  const changeSets = new InMemoryChangeSetRepo([], [], outbox);
  let ids = 0;
  const deps: PublishContentDeps = { workspaceId, clock: createFakeClock({ startIso: "2026-11-04T00:00:00.000Z" }),
    idGen: { newId: () => `generated-${++ids}` }, authorize: async () => ({ allowed: true, reason: "test" }),
    changeSets, outbox, ports: { media: { repo, assetBlobRepo, contentTypeStore, blobStore } } };
  const handler = contributeMediaPublish().build(deps);
  const sourceReplacement = { version: prior.version, sourceSha256: prior.source.sha256 };
  const apply = (confirmed = true) => handler.apply({ entity, expectedVersion: prior.version, principalId: "operator", idempotencyKey: "replace",
    ...(confirmed ? { sourceReplacement } : {}) });
  return { db, repo, renditions, assetBlobRepo, contentTypeStore, blobStore, changeSets, deps, handler, prior, entity, incoming, sourceReplacement, apply };
}

test("changed bytes require Overwrite even when the destination still matches its baseline", async t => {
  const f = await fixture(t);
  resetPublishContentContributorsForTests();
  t.after(resetPublishContentContributorsForTests);
  registerPublishContentContributor(contributeMediaPublish());
  const destination = await f.handler.inspect(f.prior.id);
  const bundle = { artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION, hashVersion: CONTENT_HASH_VERSION, entities: [f.entity] };
  const deps = { publishContentDeps: f.deps, hasBlob: async () => true,
    getBaseline: async () => ({ hashAtLastSync: destination!.hash, hashVersion: CONTENT_HASH_VERSION }) };
  const blocked = (await planImport(bundle, deps)).rows[0]!;
  assert.equal(blocked.outcome, "blocked");
  assert.equal(blocked.writes, false);
  assert.equal(blocked.canOverwrite, true);
  assert.match(blocked.reason!, /Tick Overwrite on live/);
  const forced = (await planImport(bundle, { ...deps, forcedEntityKeys: new Set(["media:photo"]) })).rows[0]!;
  assert.equal(forced.outcome, "forced");
  assert.deepEqual(forced.sourceReplacement, f.sourceReplacement);
  assert.equal((await f.repo.findById({ workspaceId, id: "photo" }))!.version, 3);
});

test("a confirmed replacement switches bytes, metadata, type and renditions once while preserving identity and attribution", async t => {
  const f = await fixture(t);
  await f.apply();
  const saved = (await f.repo.findById({ workspaceId, id: "photo" }))!;
  assert.equal(saved.version, 4);
  assert.equal(saved.title, "After");
  assert.equal(saved.alt, "New alt");
  assert.equal(saved.width, 100);
  assert.equal(saved.slug, "after");
  assert.equal(saved.createdBy, "creator");
  assert.equal(saved.createdAt, f.prior.createdAt);
  assert.equal(saved.originalFilename, f.prior.originalFilename);
  assert.deepEqual(saved.source, { sha256: digest(bytes), contentType: "image/jpeg", provenance: { kind: "url", url: "https://example.com/new.jpg" } });
  assert.equal((await f.assetBlobRepo.findByHash({ workspaceId, sha256: digest(bytes) }))!.createdByPrincipal, "blob-owner");
  assert.equal((await f.contentTypeStore.getMany({ workspaceId, sha256s: [digest(bytes)] })).get(digest(bytes)), "image/jpeg");
  const previews = await f.renditions.listByAsset({ workspaceId, assetId: "photo" });
  assert.deepEqual(previews.map(row => row.transformName), ["original"]);
  assert.equal((await f.repo.findBySlug({ workspaceId, slug: "before" }))!.id, "photo");
  assert.match(mediaPublicPath({ key: saved.slug, sha256: saved.source.sha256, variant: { kind: "original", contentType: "image/jpeg" } }), new RegExp(`v=${digest(bytes).slice(0, 12)}`));
  await assert.rejects(f.apply());
  assert.equal((await f.repo.findById({ workspaceId, id: "photo" }))!.version, 4, "command retry must not bump twice");
});

test("packed overwrite flags cannot authorize replacement and ordinary imports stay strict", async t => {
  const f = await fixture(t);
  Object.assign(f.entity.state, { overwrite: true, writes: true, sourceReplacement: f.sourceReplacement });
  await assert.rejects(f.apply(false), MediaApplyBlockedError);
  assert.equal((await f.repo.findById({ workspaceId, id: "photo" }))!.source.sha256, f.prior.source.sha256);
});

test("a live edit during staged-byte I/O refuses replacement without invalidating previews", async t => {
  const f = await fixture(t);
  const get = f.blobStore.get.bind(f.blobStore);
  f.blobStore.get = async input => {
    await f.repo.save({ ...f.prior, title: "Concurrent edit", version: 4 });
    return get(input);
  };
  await assert.rejects(f.apply(), MediaApplyConflictError);
  assert.equal((await f.repo.findById({ workspaceId, id: "photo" }))!.title, "Concurrent edit");
  assert.deepEqual((await f.renditions.listByAsset({ workspaceId, assetId: "photo" })).map(row => row.id), ["preview"]);
});

test("recording failure restores source and metadata through the replacement seam", async t => {
  const f = await fixture(t);
  const storageError = new Error("change set unavailable");
  f.changeSets.insert = async () => { throw storageError; };
  await assert.rejects(f.apply(), error => error === storageError);
  const restored = (await f.repo.findById({ workspaceId, id: "photo" }))!;
  assert.deepEqual(restored, f.prior);
  const originals = await f.renditions.listByAsset({ workspaceId, assetId: "photo" });
  assert.deepEqual(originals.map(row => row.transformName), ["original"]);
  const oldBlob = await f.assetBlobRepo.findByHash({ workspaceId, sha256: f.prior.source.sha256 });
  assert.equal(originals[0]!.storageKey, oldBlob!.storageKey);
});

test("publishing a replacement retains Tovu's upload cap above the Jini default", async t => {
  const f = await fixture(t);
  const large = new Uint8Array(10 * 1024 * 1024 + 1);
  const sha256 = digest(large);
  await f.blobStore.putIfAbsent({ workspaceId, sha256, bytes: large });
  const entity = { ...f.entity, requiredBlobs: [sha256], state: { ...f.incoming, source: { sha256 } } };
  await f.handler.apply({ entity, expectedVersion: 3, principalId: "operator", idempotencyKey: "large",
    sourceReplacement: f.sourceReplacement });
  assert.equal((await f.repo.findById({ workspaceId, id: "photo" }))!.source.sha256, sha256);
});

test("rollback cannot clobber an edit that restores the old source while audit recording fails", async t => {
  const f = await fixture(t);
  f.changeSets.insert = async () => {
    // A competing rollback may point at the old bytes but contains a newer editorial decision.
    await f.repo.save({ ...f.prior, title: "Concurrent restoration", version: 5 });
    throw new Error("change set unavailable");
  };
  await assert.rejects(f.apply(), /Could not restore media/);
  assert.equal((await f.repo.findById({ workspaceId, id: "photo" }))!.title, "Concurrent restoration");
  assert.equal((await f.repo.findById({ workspaceId, id: "photo" }))!.version, 5);
});

test("stale reviewed source or version cannot replace the live file", async t => {
  const f = await fixture(t);
  for (const sourceReplacement of [ { ...f.sourceReplacement, version: 2 }, { ...f.sourceReplacement, sourceSha256: "f".repeat(64) } ]) {
    await assert.rejects(f.handler.apply({ entity: f.entity, expectedVersion: 3, principalId: "operator", idempotencyKey: "stale",
      sourceReplacement }), MediaApplyConflictError);
  }
  assert.equal((await f.repo.findById({ workspaceId, id: "photo" }))!.version, 3);
  assert.deepEqual((await f.renditions.listByAsset({ workspaceId, assetId: "photo" })).map(row => row.id), ["preview"]);
});

test("a missing replacement adapter remains a hard refusal even when overwrite is requested", async t => {
  const f = await fixture(t);
  f.repo.replaceFileIfVersion = undefined as never;
  const refusal = await f.handler.precheck(f.entity);
  assert.equal(typeof refusal, "string");
  assert.match(refusal as string, /Update the live site/);
  await assert.rejects(f.apply(), MediaApplyBlockedError);
  assert.equal((await f.repo.findById({ workspaceId, id: "photo" }))!.version, 3);
});

test("a denied publish permission cannot reach replacement", async t => {
  const f = await fixture(t);
  const handler = contributeMediaPublish().build({ ...f.deps, authorize: async () => ({ allowed: false, reason: "Permission denied" }) });
  await assert.rejects(handler.apply({ entity: f.entity, expectedVersion: 3, principalId: "operator", idempotencyKey: "denied", sourceReplacement: f.sourceReplacement }));
  assert.equal((await f.repo.findById({ workspaceId, id: "photo" }))!.version, 3);
  assert.deepEqual((await f.renditions.listByAsset({ workspaceId, assetId: "photo" })).map(row => row.id), ["preview"]);
});

test("rollback can restore a replacement that also trashed the media row", async t => {
  const f = await fixture(t);
  f.entity.state.status = "trashed";
  const storageError = new Error("change set unavailable");
  f.changeSets.insert = async () => { throw storageError; };
  await assert.rejects(f.apply(), error => error === storageError);
  assert.deepEqual(await f.repo.findById({ workspaceId, id: "photo" }), f.prior);
});

for (const failure of ["missing", "mismatched"] as const) {
  test(`confirmed overwrite still refuses ${failure} staged bytes`, async t => {
    const f = await fixture(t);
    if (failure === "missing") f.blobStore.exists = async () => false;
    else f.blobStore.get = async () => new Uint8Array([99]);
    await assert.rejects(f.apply(), MediaApplyBlockedError);
    assert.equal((await f.repo.findById({ workspaceId, id: "photo" }))!.source.sha256, f.prior.source.sha256);
    assert.deepEqual((await f.renditions.listByAsset({ workspaceId, assetId: "photo" })).map(row => row.id), ["preview"]);
  });
}

test("private submitted media refuses Overwrite during planning", async t => {
  const f = await fixture(t);
  await f.repo.save({ ...f.prior, source: { ...f.prior.source, private: true } });
  const refusal = await f.handler.precheck(f.entity);
  assert.equal(typeof refusal, "string");
  assert.match(refusal as string, /private.*file|submitted.*file/i);
});

test("file replacement offers explain destination edits since the last sync", async t => {
  const f = await fixture(t);
  resetPublishContentContributorsForTests();
  t.after(resetPublishContentContributorsForTests);
  registerPublishContentContributor(contributeMediaPublish());
  const report = await planImport({ artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION,
    hashVersion: CONTENT_HASH_VERSION, entities: [f.entity] }, {
    publishContentDeps: f.deps, hasBlob: async () => true,
    getBaseline: async () => ({ hashAtLastSync: "before-live-edit", hashVersion: CONTENT_HASH_VERSION }),
  });
  assert.match(report.rows[0]!.reason!, /edited on the destination since the last sync/);
  assert.match(report.rows[0]!.reason!, /Tick Overwrite/);
});
