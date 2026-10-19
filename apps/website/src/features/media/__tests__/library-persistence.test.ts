/** Library L1 step 2: actual adapters, Trash marker and restart. RED: kind/name never persisted. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eachDialect } from '#src/platform/db/kernel/__tests__/dialect-matrix';
import { SqlMediaRepo, SqlAssetBlobRepo, SqlAssetRenditionRepo } from '#src/platform/db/repos/media-repo';
import { openContentDb } from '#src/platform/db/sqlite/content-db';
import { SqliteMediaRepo, SqliteAssetBlobRepo, SqliteAssetRenditionRepo } from '#src/platform/db/sqlite/media-repo.sqlite';
import { createMediaTrashAdapter } from '#src/features/trash/adapters/media';
import { uploadMedia, updateMediaMetadata, readDocumentText, LocalFsBlobStore } from '../index.js';
import { InMemoryBlobGcJournalRepo } from '@jini-ai/cms/media';
import { libraryFixture } from './library.fixture.js';

for (const adapter of eachDialect({ tables: ['media_slug_history', 'asset_renditions', 'media', 'asset_blobs'], make: kernel => kernel })) {
  test(`[${adapter.name}] document round trip, immutable name/kind, rename and actual Trash adapter restore/purge`, async () => {
    const kernel = adapter.make(); const { deps: memory } = libraryFixture();
    const mediaRepo = new SqlMediaRepo(kernel); const blobRepo = new SqlAssetBlobRepo(kernel);
    const deps = { ...memory, mediaRepo, blobRepo, renditionRepo: new SqlAssetRenditionRepo(kernel),
      journalRepo: new InMemoryBlobGcJournalRepo({}) };
    try {
      const { media } = await uploadMedia({ deps, input: { workspaceId: 'site-a', kind: 'document', filename: 'plan.md',
        contentType: 'text/markdown', bytes: Buffer.from('# Plan'), createdByPrincipal: 'uploader' } });
      const { media: renamed } = await updateMediaMetadata({ deps, input: { workspaceId: 'site-a', id: media.id, title: 'New plan' } });
      await mediaRepo.save({ ...renamed, kind: 'media', originalFilename: 'changed.exe', createdBy: 'forged' });
      const persisted = await mediaRepo.findById({ workspaceId: 'site-a', id: media.id });
      assert.equal(persisted?.kind, 'document'); assert.equal(persisted?.originalFilename, 'plan.md');
      assert.equal(persisted?.createdBy, 'uploader'); assert.equal(persisted?.source.sha256, media.source.sha256);
      assert.equal((await readDocumentText({ deps, input: { workspaceId: 'site-a', id: media.id } })).text, '# Plan');
      const trash = createMediaTrashAdapter({ db: kernel, purgeAsset: async ({ workspaceId, entityId }) => {
        const { purgeMedia: sharedPurge } = await import('@jini-ai/cms/media');
        await sharedPurge({ deps: { ...deps, referenceCheck: { findReferences: async () => [] } }, input: { workspaceId, id: entityId } });
      } });
      assert.equal((await trash.hide({ workspaceId: 'site-a', entityId: media.id, at: memory.clock.nowIso(), expectedVersion: persisted!.version })).ok, true);
      const hidden = await mediaRepo.findById({ workspaceId: 'site-a', id: media.id }); assert.equal(hidden?.status, 'trashed');
      await assert.rejects(readDocumentText({ deps, input: { workspaceId: 'site-a', id: media.id } }));
      await trash.unhide({ workspaceId: 'site-a', entityId: media.id, at: memory.clock.nowIso(), expectedVersion: hidden!.version });
      assert.equal((await mediaRepo.findById({ workspaceId: 'site-a', id: media.id }))?.kind, 'document');
      assert.equal((await readDocumentText({ deps, input: { workspaceId: 'site-a', id: media.id } })).text, '# Plan');
      const restored = await mediaRepo.findById({ workspaceId: 'site-a', id: media.id });
      await trash.hide({ workspaceId: 'site-a', entityId: media.id, at: memory.clock.nowIso(), expectedVersion: restored!.version });
      assert.equal(await trash.purge({ workspaceId: 'site-a', entityId: media.id, expectedVersion: null }), 'purged');
      assert.equal(await mediaRepo.findById({ workspaceId: 'site-a', id: media.id }), null);
      assert.equal((await blobRepo.findByHash({ workspaceId: 'site-a', sha256: media.source.sha256 }))?.status, 'tombstoned');
    } finally { if (adapter.name === 'sqlite') await kernel.close(); }
  });
}

test('Library: document metadata and original bytes survive a real SQLite and filesystem restart', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'library-restart-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const { deps: memory } = libraryFixture();
  const filename = join(dir, 'content.db'); let db = openContentDb(filename);
  const makeDeps = () => ({ ...memory, mediaRepo: new SqliteMediaRepo(db), blobRepo: new SqliteAssetBlobRepo(db),
    renditionRepo: new SqliteAssetRenditionRepo(db), blobStore: new LocalFsBlobStore({ rootDir: join(dir, 'uploads') }) });
  const first = makeDeps();
  const { media } = await uploadMedia({ deps: first, input: { workspaceId: 'site-a', kind: 'document', filename: 'restart.md',
    contentType: 'text/markdown', bytes: Buffer.from('Persistent source'), createdByPrincipal: 'uploader' } });
  db.$client.close(); db = openContentDb(filename);
  try {
    const later = makeDeps();
    assert.equal((await later.mediaRepo.findById({ workspaceId: 'site-a', id: media.id }))?.originalFilename, 'restart.md');
    assert.equal((await readDocumentText({ deps: later, input: { workspaceId: 'site-a', id: media.id } })).text, 'Persistent source');
    await assert.rejects(readDocumentText({ deps: later, input: { workspaceId: 'site-b', id: media.id } }));
  } finally { db.$client.close(); }
});
