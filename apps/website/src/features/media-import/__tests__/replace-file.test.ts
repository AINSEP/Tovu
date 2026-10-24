import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteMediaRepo, SqliteAssetBlobRepo, SqliteAssetRenditionRepo, SqliteMediaContentTypeStore } from "#src/platform/db/sqlite/media-repo.sqlite";
import { InMemoryBlobStore, InMemoryTransformDefinitionRepo, uploadMedia } from "../../media/index.js";
import { buildMediaImportRegistrations, type MediaImportToolDeps } from "../tool-registrations.js";
import { EgressRefusedError } from "../../../platform/http/index.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const replacement = Buffer.concat([png, Buffer.from("new version")]);

async function fixture(t: test.TestContext) {
  const db = openContentDb(":memory:");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-replace-tool-"));
  t.after(() => { db.$client.close(); fs.rmSync(root, { recursive: true, force: true }); });
  let ids = 0;
  let fetches = 0;
  const permissions: unknown[] = [];
  const deps: MediaImportToolDeps = {
    workspaceId: "workspace-local", siteBinding: { dir: root },
    clock: { nowMs: () => Date.parse("2026-10-17T12:00:00Z") }, idGen: { newId: () => `id-${++ids}` },
    authorize: async input => { permissions.push(input); return { allowed: true, reason: "matched" }; },
    mediaRepo: new SqliteMediaRepo(db), assetBlobRepo: new SqliteAssetBlobRepo(db), assetRenditionRepo: new SqliteAssetRenditionRepo(db),
    mediaContentTypeStore: new SqliteMediaContentTypeStore(db), blobStore: new InMemoryBlobStore(),
    transformDefinitionRepo: new InMemoryTransformDefinitionRepo({}),
    resolveRoots: () => ({ repo: root, site: root, custom: root }),
    mediaImportHttpClient: { send: async () => { fetches++; return { status: 200, headers: {}, bodyText: "", bodyBytes: replacement, bodyTruncated: false }; } },
  };
  const { media } = await uploadMedia({ deps: { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo },
    input: { workspaceId: deps.workspaceId, filename: "original.png", contentType: "image/png", bytes: png,
      alt: "keep alt", caption: "keep caption", credit: "keep credit", createdByPrincipal: "creator" } });
  await deps.assetRenditionRepo.save({ id: "old-preview", workspaceId: deps.workspaceId, assetId: media.id,
    transformName: "public", version: 1, storageKey: "old-preview-key", createdAt: media.createdAt });
  const registration = buildMediaImportRegistrations(deps).find(tool => tool.descriptor.id === "media_replace_file")!;
  const run = async (input: Record<string, unknown>) => registration.handler({ input, executionId: "exec", run: { id: "run" },
    principal: { id: "owner" }, signal: new AbortController().signal } as ToolExecutionContext,
  { emitSurface: async () => { assert.fail("replacement must not ask for deletion approval"); } }) as Promise<{ media: { id: string; slug: string; version: number; sha256: string } }>;
  return { deps, media, root, registration, run, permissions, fetches: () => fetches };
}

for (const source of ["local", "url"]) test(`${source} replacement preserves identity and metadata and invalidates old renditions`, async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.root, "new.png"), replacement);
  const input = source === "local" ? { root: "site", path: "new.png" } : { url: "https://cdn.example.com/new.png" };
  const result = await f.run({ mediaId: f.media.id, ...input });
  const sha256 = createHash("sha256").update(replacement).digest("hex");
  assert.equal(result.media.id, f.media.id);
  assert.equal(result.media.slug, f.media.slug);
  assert.equal(result.media.version, f.media.version + 1);
  assert.equal(result.media.sha256, sha256);
  assert.deepEqual(await f.deps.mediaRepo.findById({ workspaceId: f.deps.workspaceId, id: f.media.id }),
    { ...f.media, source: { sha256 }, version: f.media.version + 1 });
  assert.equal((await f.deps.mediaRepo.list({ workspaceId: f.deps.workspaceId })).length, 1);
  const renditions = await f.deps.assetRenditionRepo.listByAsset({ workspaceId: f.deps.workspaceId, assetId: f.media.id });
  assert.equal(renditions.length, 1);
  assert.equal(renditions[0]!.transformName, "original");
  assert.deepEqual(Buffer.from(await f.deps.blobStore.get({ storageKey: renditions[0]!.storageKey })), replacement);
  assert.equal((await f.deps.mediaContentTypeStore.getMany({ workspaceId: f.deps.workspaceId, sha256s: [sha256] })).get(sha256), "image/png");
  assert.equal((await f.deps.assetBlobRepo.findByHash({ workspaceId: f.deps.workspaceId, sha256: f.media.source.sha256 }))?.status, "active");
  assert.equal(f.fetches(), source === "url" ? 1 : 0);
  assert.deepEqual(f.permissions, [{ workspaceId: f.deps.workspaceId, principalId: "owner", permission: "media.update", entityType: "media", entityId: f.media.id }]);
});

test("permission denial precedes source reads and writes", async t => {
  const f = await fixture(t);
  f.deps.authorize = async () => ({ allowed: false, reason: "no_grant" });
  await assert.rejects(f.run({ mediaId: f.media.id, url: "https://cdn.example.com/new.png" }), /not authorized/);
  assert.equal(f.fetches(), 0);
  assert.deepEqual(await f.deps.mediaRepo.findById({ workspaceId: f.deps.workspaceId, id: f.media.id }), f.media);
});

test("concurrent metadata edits survive a replacement conflict", async t => {
  const f = await fixture(t);
  const put = f.deps.blobStore.put.bind(f.deps.blobStore);
  f.deps.blobStore.put = async input => {
    await f.deps.mediaRepo.save({ ...f.media, title: "concurrent title", version: f.media.version + 1 });
    return put(input);
  };
  await assert.rejects(f.run({ mediaId: f.media.id, url: "https://cdn.example.com/new.png" }), /changed while replacing/);
  assert.deepEqual(await f.deps.mediaRepo.findById({ workspaceId: f.deps.workspaceId, id: f.media.id }), { ...f.media, title: "concurrent title", version: f.media.version + 1 });
  assert.ok((await f.deps.assetRenditionRepo.listByAsset({ workspaceId: f.deps.workspaceId, assetId: f.media.id })).some(row => row.id === "old-preview"));
});

for (const input of [
  { url: "http://example.com/new.png" }, { root: "site", path: "../escape.png" },
  { root: "site", path: ".env" }, { url: "https://example.com/new.png", root: "site", path: "new.png" }, {},
]) test(`invalid replacement source is refused without mutation: ${JSON.stringify(input)}`, async t => {
  const f = await fixture(t);
  await assert.rejects(f.run({ mediaId: f.media.id, ...input }));
  assert.equal(f.fetches(), 0);
  assert.deepEqual(await f.deps.mediaRepo.findById({ workspaceId: f.deps.workspaceId, id: f.media.id }), f.media);
});

test("egress refusals expose only the guarded client's caller-safe reason", async t => {
  const f = await fixture(t);
  f.deps.mediaImportEgressRefusalLog = () => {};
  f.deps.mediaImportHttpClient.send = async () => { throw new EgressRefusedError({ message: "internal-db resolves to 10.2.3.4" }, { callerSafeMessage: "private destinations are refused" }); };
  await assert.rejects(f.run({ mediaId: f.media.id, url: "https://internal-db/new.png" }), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /private destinations are refused/);
    assert.doesNotMatch(error.message, /10\.2\.3\.4/);
    return true;
  });
  assert.deepEqual(await f.deps.mediaRepo.findById({ workspaceId: f.deps.workspaceId, id: f.media.id }), f.media);
});

test('trashed media and adapters without atomic replacement refuse before any fetch', async t => {
  const f = await fixture(t);
  await f.deps.mediaRepo.save({ ...f.media, status: 'trashed' });
  await assert.rejects(f.run({ mediaId: f.media.id, url: 'https://cdn.example.com/new.png' }), /in Trash/);
  await f.deps.mediaRepo.save(f.media);
  Object.defineProperty(f.deps.mediaRepo, 'replaceFileIfVersion', { value: undefined });
  await assert.rejects(f.run({ mediaId: f.media.id, url: 'https://cdn.example.com/new.png' }), /unavailable on this storage/);
  assert.equal(f.fetches(), 0);
});

test('oversized and unsupported local replacement bytes leave the media unchanged', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.root, 'bad.png'), '<html>not an image</html>');
  await assert.rejects(f.run({ mediaId: f.media.id, root: 'repo', path: 'bad.png' }));
  fs.writeFileSync(path.join(f.root, 'large.png'), replacement);
  f.deps.mediaImportLocalMaxBytes = replacement.byteLength - 1;
  await assert.rejects(f.run({ mediaId: f.media.id, root: 'repo', path: 'large.png' }));
  assert.deepEqual(await f.deps.mediaRepo.findById({ workspaceId: f.deps.workspaceId, id: f.media.id }), f.media);
  assert.equal((await f.deps.assetBlobRepo.list({ workspaceId: f.deps.workspaceId })).length, 1);
});

for (const source of [
  {},
  { root: "site" },
  { path: "new.png" },
  { url: "https://cdn.example.com/new.png", root: "site" },
  { url: "https://cdn.example.com/new.png", path: "new.png" },
  { url: "https://cdn.example.com/new.png", root: "site", path: "new.png" },
]) test(`source exclusivity is checked before looking up media: ${JSON.stringify(source)}`, async t => {
  const f = await fixture(t);
  f.deps.mediaRepo.findById = async () => { assert.fail("invalid source must precede media lookup"); };
  await assert.rejects(f.run({ mediaId: f.media.id, ...source }), /Pass either url or root and path, never both\./);
  assert.equal(f.fetches(), 0);
  assert.equal(f.permissions.length, 1);
});

test("explicit undefined URL selects local bytes; undefined local fields allow a URL", async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.root, "new.png"), replacement);
  const local = await f.run({ mediaId: f.media.id, url: undefined, root: "site", path: "new.png" });
  assert.equal(local.media.version, f.media.version + 1);
  assert.equal(f.fetches(), 0);
  const remote = await f.run({ mediaId: f.media.id, url: "https://cdn.example.com/new.png", root: undefined, path: undefined });
  assert.equal(remote.media.version, local.media.version + 1);
  assert.equal(f.fetches(), 1);
});

test("null URL counts as a supplied remote source before URL string validation", async t => {
  const f = await fixture(t);
  await assert.rejects(f.run({ mediaId: f.media.id, url: null, root: "site", path: "new.png" }), /Pass either url or root and path, never both\./);
  await assert.rejects(f.run({ mediaId: "missing-media", url: null }), /Media was not found or is in Trash/);
  assert.equal(f.fetches(), 0);
});

test("a traversal path or a file that is not valid media is refused as input, and the media is unchanged", async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.root, "notes.txt"), "plain text, not an image");
  const errors: Error[] = [];
  for (const input of [{ root: "site", path: "../../etc/passwd" }, { root: "site", path: "notes.txt" }]) {
    await assert.rejects(f.run({ mediaId: f.media.id, ...input }), (error: Error) => { errors.push(error); return true; });
  }
  assert.deepEqual(errors.map(e => e.name), ["ToolInputError", "ToolInputError"]);
  assert.match(errors[0]!.message, /^path '\.\.\/\.\.\/etc\/passwd' resolves outside the allowed root\. Fix the input and retry .*Schema for 'media_replace_file'/s);
  assert.match(errors[1]!.message, /^'notes\.txt' is not an importable file: its actual bytes are 'application\/octet-stream'\./);
  assert.deepEqual(await f.deps.mediaRepo.findById({ workspaceId: f.deps.workspaceId, id: f.media.id }), f.media);
});

test("site replacement refuses repo and outside custom roots without reading or changing the asset", async t => {
  const f = await fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'replace-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'payload.png'), Buffer.concat([png, Buffer.from('OUTSIDE_CANARY_CONTENT')]));
  fs.writeFileSync(path.join(outside, 'OUTSIDE_CANARY_NAME.png'), png);
  f.deps.resolveRoots = () => ({ repo: outside, custom: outside, site: f.root });
  const reads = t.mock.method(fs, 'createReadStream');
  for (const root of ['repo', 'custom']) {
    await assert.rejects(() => f.run({ mediaId: f.media.id, root, path: 'payload.png' }), error => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /OUTSIDE_CANARY_CONTENT|OUTSIDE_CANARY_NAME/);
      return true;
    });
  }
  assert.equal(reads.mock.callCount(), 0);
  const saved = await f.deps.mediaRepo.findById({ workspaceId: f.deps.workspaceId, id: f.media.id });
  assert.equal(saved?.version, f.media.version);
  assert.equal(saved?.source.sha256, f.media.source.sha256);
});
