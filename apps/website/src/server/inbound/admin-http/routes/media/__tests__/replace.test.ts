import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import express from 'express';
import type { Request, Response } from 'express';
import { openContentDb } from '#src/platform/db/sqlite/content-db';
import { SqliteMediaRepo, SqliteAssetBlobRepo, SqliteAssetRenditionRepo, SqliteMediaContentTypeStore } from '#src/platform/db/sqlite/media-repo.sqlite';
import { InMemoryBlobStore, InMemoryTransformDefinitionRepo, InMemoryImageTransformer, MediaConflictError, uploadMedia, TOVU_MAX_UPLOAD_BYTES } from '#src/features/media/index';
import { registerAdminMediaReplaceRoute } from '../replace.js';
import type { MediaRouteDeps } from '../deps.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const replacement = Buffer.concat([Buffer.from(png, 'base64'), Buffer.from('replacement')]);
const body = { filename: 'replacement.png', contentType: 'image/png', dataBase64: replacement.toString('base64') };
const hash = createHash('sha256').update(replacement).digest('hex');

async function fixture(t: test.TestContext) {
  const db = openContentDb(':memory:'); t.after(() => db.$client.close());
  let sequence = 0;
  const deps = {
    workspaceId: 'workspace-local', authorize: async () => ({ allowed: true, reason: 'matched' }),
    clock: { nowMs: () => Date.parse('2026-10-03T12:00:00.000Z') }, idGen: { newId: () => `id-${++sequence}` },
    mediaRepo: new SqliteMediaRepo(db), assetBlobRepo: new SqliteAssetBlobRepo(db),
    assetRenditionRepo: new SqliteAssetRenditionRepo(db), mediaContentTypeStore: new SqliteMediaContentTypeStore(db),
    blobStore: new InMemoryBlobStore(), transformDefinitionRepo: new InMemoryTransformDefinitionRepo({}),
    imageTransformer: new InMemoryImageTransformer(),
  } as unknown as MediaRouteDeps;
  const { media } = await uploadMedia({ deps: { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo },
    input: { workspaceId: deps.workspaceId, filename: 'original.png', contentType: 'image/png', bytes: Buffer.from(png, 'base64'),
      alt: 'keep alt', caption: 'keep caption', credit: 'keep credit', createdByPrincipal: 'u1' } });
  await deps.assetRenditionRepo.save({ id: 'preview', workspaceId: deps.workspaceId, assetId: media.id,
    transformName: 'public', version: 1, storageKey: 'old-preview', createdAt: media.createdAt });
  const before = await deps.assetRenditionRepo.listByAsset({ workspaceId: deps.workspaceId, assetId: media.id });
  return { db, deps, media, before };
}

/** Invoke the registered Express handler without binding a socket. The sandbox denies listen;
 * real SQL repositories still verify the entire mutation/transaction, including persisted rows. */
async function invoke({ deps, id, input = body, workspaceId = deps.workspaceId, principal = true }:
  { deps: MediaRouteDeps; id: string; input?: unknown; workspaceId?: string; principal?: boolean }) {
  const app = express(); registerAdminMediaReplaceRoute({ app, deps });
  const layer = (app as any)._router.stack.find((entry: any) => entry.route?.path.endsWith('/:mediaId/replace'));
  assert.equal(layer.route.path, '/api/admin/v1/workspaces/:workspaceId/media/:mediaId/replace');
  assert.equal(layer.route.methods.post, true);
  let status = 200; let json: any;
  const res = { locals: principal ? { principal: { id: 'u1' } } : {},
    status(value: number) { status = value; return this; }, json(value: unknown) { json = value; return this; } } as unknown as Response;
  await layer.route.stack[0].handle({ params: { workspaceId, mediaId: id }, body: input } as unknown as Request, res);
  return { status, json };
}

test('replace preserves identity/editorial metadata and atomically switches the file and renditions', async t => {
  const { deps, media } = await fixture(t);
  const result = await invoke({ deps, id: media.id });
  assert.equal(result.status, 200);
  const saved = await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: media.id });
  assert.deepEqual(saved, { ...media, source: { sha256: hash }, updatedAt: '2026-10-03T12:00:00.000Z', version: media.version + 1 });
  assert.equal((await deps.mediaRepo.list({ workspaceId: deps.workspaceId })).length, 1);
  assert.equal(result.json.media.id, media.id); assert.equal(result.json.media.slug, media.slug);
  assert.equal(result.json.media.contentType, 'image/png');
  const renditions = await deps.assetRenditionRepo.listByAsset({ workspaceId: deps.workspaceId, assetId: media.id });
  assert.equal(renditions.length, 1); assert.equal(renditions[0].transformName, 'original');
  assert.deepEqual(Buffer.from(await deps.blobStore.get({ storageKey: renditions[0].storageKey })), replacement);
  assert.equal((await deps.mediaContentTypeStore.getMany({ workspaceId: deps.workspaceId, sha256s: [hash] })).get(hash), 'image/png');
  // Other assets may still reference the old content-addressed blob. Replacement never purges it.
  const oldBlob = await deps.assetBlobRepo.findByHash({ workspaceId: deps.workspaceId, sha256: media.source.sha256 });
  assert.equal(oldBlob?.status, 'active');
  assert.deepEqual(Buffer.from(await deps.blobStore.get({ storageKey: oldBlob!.storageKey })), Buffer.from(png, 'base64'));
});

test('replace authorizes media.update for the exact entity before any file write', async t => {
  const { deps, media, before } = await fixture(t); let seen: unknown;
  deps.authorize = async input => { seen = input; return { allowed: false, reason: 'no_grant' }; };
  const result = await invoke({ deps, id: media.id, input: {} });
  assert.deepEqual(result, { status: 403, json: {
    error: "principal 'u1' is not authorized for 'media.update' (no_grant)", code: 'FORBIDDEN',
    details: { permission: 'media.update', reason: 'no_grant' },
  } });
  assert.deepEqual(seen, { principalId: 'u1', permission: 'media.update', workspaceId: deps.workspaceId, entityType: 'media', entityId: media.id });
  assert.deepEqual(await deps.assetRenditionRepo.listByAsset({ workspaceId: deps.workspaceId, assetId: media.id }), before);
  assert.equal((await deps.assetBlobRepo.list({ workspaceId: deps.workspaceId })).length, 1);
});

for (const [input, error] of [
  [{}, 'filename, contentType, and dataBase64 are required'],
  [{ ...body, filename: {} }, 'filename, contentType, and dataBase64 are required'],
  [{ ...body, dataBase64: '%%%invalid' }, 'dataBase64 is not valid base64'],
  [{ ...body, contentType: 'image/svg+xml' }, "content type 'image/svg+xml' is not allowed for upload"],
  [{ ...body, dataBase64: Buffer.from('<svg/>').toString('base64') }, "the file's content (image/svg+xml) is not an allowed media type"],
] as const) {
  test(`replace refuses invalid upload: ${error}`, async t => {
    const { deps, media } = await fixture(t);
    assert.deepEqual(await invoke({ deps, id: media.id, input }), { status: 400, json: { error } });
    assert.deepEqual(await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: media.id }), media);
    assert.equal((await deps.assetBlobRepo.list({ workspaceId: deps.workspaceId })).length, 1);
  });
}

test('replace enforces the host upload size cap before writing', async t => {
  const { deps, media } = await fixture(t);
  const large = Buffer.alloc(TOVU_MAX_UPLOAD_BYTES + 1); Buffer.from(png, 'base64').copy(large);
  assert.deepEqual(await invoke({ deps, id: media.id, input: { ...body, dataBase64: large.toString('base64') } }),
    { status: 400, json: { error: 'uploaded file exceeds the 50 MB size cap' } });
  assert.deepEqual(await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: media.id }), media);
});

test('replace fails closed on wrong workspace, missing principal, missing asset, trash and missing transaction capability', async t => {
  const { deps, media } = await fixture(t);
  assert.deepEqual(await invoke({ deps, id: media.id, workspaceId: 'other' }), { status: 404, json: { error: 'workspace was not found' } });
  assert.deepEqual(await invoke({ deps, id: media.id, principal: false }), { status: 500, json: { error: 'internal error' } });
  assert.deepEqual(await invoke({ deps, id: 'missing' }), { status: 404, json: { error: "media 'missing' was not found" } });
  await deps.mediaRepo.save({ ...media, status: 'trashed' });
  assert.deepEqual(await invoke({ deps, id: media.id }), { status: 409, json: { error: 'trashed media cannot be replaced', code: 'ENTITY_IN_TRASH' } });
  await deps.mediaRepo.save(media);
  Object.defineProperty(deps.mediaRepo, 'replaceFileIfVersion', { value: undefined });
  assert.deepEqual(await invoke({ deps, id: media.id }), { status: 503, json: { error: 'media file replacement is unavailable', code: 'MEDIA_REPLACE_UNAVAILABLE' } });
  assert.equal((await deps.assetBlobRepo.list({ workspaceId: deps.workspaceId })).length, 1);
});

test('replace detects a concurrent edit without erasing metadata or previews', async t => {
  const { deps, media, before } = await fixture(t);
  const put = deps.blobStore.put.bind(deps.blobStore);
  deps.blobStore.put = async input => {
    await deps.mediaRepo.save({ ...media, title: 'concurrent edit', version: media.version + 1 });
    return put(input);
  };
  assert.deepEqual(await invoke({ deps, id: media.id }), { status: 409, json: { error: 'media changed while replacing its file', code: 'MEDIA_REPLACE_CONFLICT' } });
  assert.deepEqual(await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: media.id }), { ...media, title: 'concurrent edit', version: media.version + 1 });
  assert.deepEqual(await deps.assetRenditionRepo.listByAsset({ workspaceId: deps.workspaceId, assetId: media.id }), before);
});

test('replace rolls back the source change and preview invalidation if the original rendition insert fails', async t => {
  const { deps, media, before } = await fixture(t);
  await deps.assetRenditionRepo.save({ ...before[0], id: 'occupied', assetId: 'another-asset' });
  deps.idGen = { newId: () => 'occupied' };
  assert.deepEqual(await invoke({ deps, id: media.id }), { status: 500, json: { error: 'internal error' } });
  assert.deepEqual(await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: media.id }), media);
  assert.deepEqual(await deps.assetRenditionRepo.listByAsset({ workspaceId: deps.workspaceId, assetId: media.id }), before);
});

test('an old metadata draft cannot undo an already committed file replacement', async t => {
  const { deps, media } = await fixture(t);
  assert.equal((await invoke({ deps, id: media.id })).status, 200);
  await assert.rejects(deps.mediaRepo.save({ ...media, title: 'stale edit', version: media.version + 1 }), error => {
    assert.ok(error instanceof MediaConflictError);
    assert.equal(error.message, 'media file changed before metadata could be saved'); return true;
  });
  assert.equal((await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: media.id }))?.source.sha256, hash);
});

test('a preview started before replacement cannot reinsert an obsolete rendition', async t => {
  const { guardMediaRenditionRepo } = await import('#src/features/media/guard-rendition-repo');
  const { deps, media, before } = await fixture(t);
  const guarded = guardMediaRenditionRepo({ mediaRepo: deps.mediaRepo, renditionRepo: deps.assetRenditionRepo, media });
  const preview = before.find(row => row.transformName === 'public')!;
  await guarded.save(preview); // Matching-source generation still persists normally.
  assert.equal((await invoke({ deps, id: media.id })).status, 200);
  await assert.rejects(guarded.save({ ...preview, id: 'late-preview' }), error => {
    assert.ok(error instanceof MediaConflictError);
    assert.equal(error.message, 'media file changed while generating its preview'); return true;
  });
  const rows = await deps.assetRenditionRepo.listByAsset({ workspaceId: deps.workspaceId, assetId: media.id });
  assert.equal(rows.length, 1); assert.equal(rows[0].transformName, 'original');
});
