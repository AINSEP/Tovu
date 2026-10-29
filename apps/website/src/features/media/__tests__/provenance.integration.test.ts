import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eachDialect } from '#src/platform/db/kernel/__tests__/dialect-matrix';
import { SqlMediaRepo, SqlAssetBlobRepo, SqlAssetRenditionRepo } from '#src/platform/db/repos/media-repo';
import { buildMediaRegistrations, uploadMedia, updateMediaMetadata } from '@jini-ai/cms/media';
import { libraryFixture, libraryContext } from './library.fixture.js';

for (const adapter of eachDialect({ tables: ['media_slug_history', 'asset_renditions', 'media', 'asset_blobs'], make: kernel => kernel })) {
  test(`[${adapter.name}] provenance survives repository recreation and metadata edits and reaches Library list`, async () => {
    const kernel = adapter.make(); const { deps: memory } = libraryFixture();
    const deps = { ...memory, mediaRepo: new SqlMediaRepo(kernel), assetBlobRepo: new SqlAssetBlobRepo(kernel), assetRenditionRepo: new SqlAssetRenditionRepo(kernel) };
    try {
      const { media } = await uploadMedia({ deps: { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo },
        input: { workspaceId: deps.workspaceId, kind: 'document', filename: 'brand.md', contentType: 'text/markdown',
          bytes: Buffer.from('# Brand'), createdByPrincipal: 'owner', provenance: { kind: 'url', url: 'https://example.com/brand.md?token=secret' } } });
      await updateMediaMetadata({ deps: { mediaRepo: deps.mediaRepo, clock: deps.clock }, input: { workspaceId: deps.workspaceId, id: media.id, title: 'Brand guide' } });
      deps.mediaRepo = new SqlMediaRepo(kernel);
      const stored = await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: media.id });
      assert.deepEqual(stored?.source.provenance, { kind: 'url', url: 'https://example.com/brand.md' });
      assert.equal(stored?.source.contentType, 'text/markdown');
      const { media: picked } = await uploadMedia({ deps: { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo },
        input: { workspaceId: deps.workspaceId, kind: 'document', filename: 'picked.md', contentType: 'text/markdown',
          bytes: Buffer.from('# Brand'), createdByPrincipal: 'owner', provenance: { kind: 'picked-folder', path: 'export/picked.md' } } });
      assert.equal(picked.source.sha256, media.source.sha256, 'dedup must not merge editorial provenance');
      assert.deepEqual((await new SqlMediaRepo(kernel).findById({ workspaceId: deps.workspaceId, id: picked.id }))?.source.provenance,
        { kind: 'picked-folder', path: 'export/picked.md' });
      const list = buildMediaRegistrations(deps).find(t => t.descriptor.id === 'library_list')!;
      const page = await list.handler(libraryContext({ query: 'brand', limit: 1 })) as { documents: { source: unknown }[]; nextCursor: null };
      assert.deepEqual(page.documents[0]!.source, stored?.source.provenance); assert.equal(page.nextCursor, null);
    } finally { if (adapter.name === 'sqlite') await kernel.close(); }
  });
}
