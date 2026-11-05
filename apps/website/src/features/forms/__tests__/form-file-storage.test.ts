import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryMediaRepo, InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore } from '@jini-ai/cms/media';
import { createFormFileStorage } from '../form-file-storage.js';

test('form photos are private before store resolves and failed submission compensation removes their asset', async () => {
  let id = 0;
  const media = { mediaRepo: Object.assign(new InMemoryMediaRepo({}), { listRetiredSlugs: async () => [] }), blobRepo: new InMemoryAssetBlobRepo({}), renditionRepo: new InMemoryAssetRenditionRepo({}), blobStore: new InMemoryBlobStore(), clock: { nowMs: () => 0 }, idGen: { newId: () => `m-${++id}` }, entryRefsRepo: { findByTarget: async () => [] }, postRepo: { list: async () => [] } };
  const files = createFormFileStorage({ media, contentTypes: { set: async () => {}, get: async () => null }, resolveCreatedByPrincipal: async () => 'system' });
  const reference = await files.store({ workspaceId: 'w', submissionId: 's', fieldId: 'photo', file: { filename: 'photo.png', contentType: 'image/png', bytes: Uint8Array.of(137,80,78,71,13,10,26,10) } });
  const asset = await media.mediaRepo.findById({ workspaceId: 'w', id: reference.mediaId });
  assert.equal(asset!.source.private, true);
  await files.discard({ workspaceId: 'w', reference });
  assert.equal(await media.mediaRepo.findById({ workspaceId: 'w', id: reference.mediaId }), null);
});
