import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAssetRenditionRepo, type AssetRenditionRecord, type MediaRecord } from '@jini-ai/cms/media';
import { InMemoryVersionedMediaRepo } from '../versioned-media-repo.js';

const media = { id: 'asset', workspaceId: 'ws', status: 'active', source: { sha256: 'source-a' } } as MediaRecord;
const record: AssetRenditionRecord = { id: 'rendition', workspaceId: 'ws', assetId: 'asset', transformName: 'thumb', version: 1, storageKey: 'thumb', createdAt: '2026-11-01T00:00:00Z' };
const lookup = { workspaceId: 'ws', assetId: 'asset', transformName: 'thumb', version: 1 };

test('memory source-conditional rendition persistence writes to the shared rendition repository', async () => {
  const renditionRepo = new InMemoryAssetRenditionRepo({});
  const repo = new InMemoryVersionedMediaRepo([media], { renditionRepo });
  assert.deepEqual(await repo.saveRenditionIfSource({ record, sourceSha256: 'source-a' }), { applied: true });
  assert.deepEqual(await renditionRepo.findOne(lookup), record);
});

test('memory rendition persistence refuses a replaced, missing, foreign or inactive source without writes', async () => {
  for (const current of [null, { ...media, source: { sha256: 'source-b' } }, { ...media, workspaceId: 'other' }, { ...media, status: 'trashed' as const }]) {
    const renditionRepo = new InMemoryAssetRenditionRepo({});
    const repo = new InMemoryVersionedMediaRepo(current ? [current] : [], { renditionRepo });
    assert.deepEqual(await repo.saveRenditionIfSource({ record, sourceSha256: 'source-a' }), { applied: false });
    assert.equal(await renditionRepo.findOne(lookup), null);
  }
});

test('memory rendition compare and persistence cannot interleave with a later source update', async () => {
  const renditionRepo = new InMemoryAssetRenditionRepo({});
  const repo = new InMemoryVersionedMediaRepo([media], { renditionRepo });
  const writing = repo.saveRenditionIfSource({ record, sourceSha256: 'source-a' });
  const persisted = renditionRepo.findOne(lookup);
  await repo.save({ ...media, source: { sha256: 'source-b' } });
  assert.deepEqual(await writing, { applied: true });
  assert.deepEqual(await persisted, record);
  assert.deepEqual(await repo.saveRenditionIfSource({ record: { ...record, id: 'late' }, sourceSha256: 'source-a' }), { applied: false });
  assert.deepEqual(await renditionRepo.listByAsset({ workspaceId: 'ws', assetId: 'asset' }), [record]);
});
