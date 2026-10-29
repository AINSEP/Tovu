/** L1 isolation includes peer blob reads and manual raw-row publishing, not just typed pack(). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { uploadMedia, trashMedia, purgeMedia } from '@jini-ai/cms/media';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryChangeSetRepo } from '#src/contracts/core/commands/index';
import { InMemoryOutbox } from '#src/contracts/core/events/index';
import { contributeRawFilePublish } from '#src/features/publish-content/raw-file-contributor';
import { contributeThemeFilesPublish } from '#src/features/theme/publish-content';
import { createRawFileSitePort } from '#src/features/publish-content/publish-backstop-file';
import { contentHash } from '#src/features/publish-content/content-hash';
import { MAX_SECRET_SCAN_BYTES } from '#src/features/publish-content/file-tree-policy';
import type { PackedEntity, PublishContentDeps } from '#src/features/publish-content/type-registry';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { createFileBlobIndex } from '#src/features/publish-content/file-blob-index';
import { contributeRawRowPublish } from '#src/features/publish-content/raw-row-contributor';
import type { RawRowSnapshot } from '#src/features/publish-content/backstop-ports';
import { registerPublishContentBlobGetRoute } from '#src/server/inbound/admin-http/routes/publish-content/blob-get';
import { registerPublishContentBlobPutRoute } from '#src/server/inbound/admin-http/routes/publish-content/blob-put';
import type { PublishContentRouteDeps } from '#src/server/inbound/admin-http/routes/publish-content/deps';
import { contributeMediaPublish } from '../publish-content.js';
import { libraryFixture } from './library.fixture.js';

test('Library document-only blob hashes cannot be downloaded through publish peer transport', async t => {
  const { deps } = libraryFixture();
  const { media } = await uploadMedia({ deps: { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo },
    input: { workspaceId: deps.workspaceId, kind: 'document', filename: 'private.txt', bytes: Buffer.from('secret document'), contentType: 'text/plain', createdByPrincipal: 'owner' } });
  let reads = 0; const get = deps.blobStore.get.bind(deps.blobStore);
  deps.blobStore.get = async input => { reads++; return get(input); };
  const app = express(); app.use(express.json()); app.use((_req, res, next) => { res.locals.principal = { id: 'owner' }; next(); });
  const routeDeps = { ...deps, fileBlobIndex: createFileBlobIndex() } as unknown as PublishContentRouteDeps;
  registerPublishContentBlobGetRoute(app, routeDeps); registerPublishContentBlobPutRoute(app, routeDeps);
  const base = await startTestServer(app, t);
  const sharedDeps = { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo,
    referenceCheck: { findReferences: async () => [] } };
  const outbox = new InMemoryOutbox();
  const handler = contributeMediaPublish().build({ ...deps, outbox, changeSets: new InMemoryChangeSetRepo([], [], outbox), ports: {
    media: { repo: deps.mediaRepo, assetBlobRepo: deps.assetBlobRepo, blobStore: deps.blobStore, contentTypeStore: deps.mediaContentTypeStore },
  } });
  const id = 'forged-public-id';
  const entity: PackedEntity = { entityType: 'media', id, schemaVersion: 1, hashVersion: 1,
    contentHash: 'forged', requiredBlobs: [media.source.sha256], state: { ...media, id, slug: id, kind: 'media' } };
  for (const phase of ['active', 'trashed', 'purged']) {
    if (phase === 'trashed') await trashMedia({ deps: sharedDeps, input: { workspaceId: deps.workspaceId, id: media.id } });
    if (phase === 'purged') await purgeMedia({ deps: sharedDeps, input: { workspaceId: deps.workspaceId, id: media.id } });
    const response = await fetch(`${base}/api/admin/v1/workspaces/site-a/publish-content/blobs/${media.source.sha256}`);
    assert.equal(response.status, 404, phase); await response.arrayBuffer();
    assert.match((await handler.precheck(entity))!, /documents cannot be published/i);
    await assert.rejects(handler.apply({ entity, expectedVersion: undefined, principalId: 'owner', idempotencyKey: phase }), /documents cannot be published/i);
    assert.equal(await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id }), null);
    assert.equal(reads, 0, phase);
  }
  assert.equal((await deps.assetBlobRepo.findByHash({ workspaceId: deps.workspaceId, sha256: media.source.sha256 }))?.status, 'tombstoned');
  // Legitimate peer staging has bytes but no asset metadata. It must remain downloadable.
  const staged = Buffer.from('staged peer file'); const sha = createHash('sha256').update(staged).digest('hex');
  const url = `${base}/api/admin/v1/workspaces/site-a/publish-content/blobs/${sha}`;
  const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataBase64: staged.toString('base64') }) });
  assert.equal(put.status, 200); await put.arrayBuffer();
  const stagedResponse = await fetch(url); assert.equal(stagedResponse.status, 200);
  assert.equal((await stagedResponse.json() as { dataBase64: string }).dataBase64, staged.toString('base64'));
});

test('Library forged raw-file/theme apply refuses private hashes before blob I/O or file writes, including after purge', async t => {
  const siteDir = await realpath(await mkdtemp(join(tmpdir(), 'library-publish-')));
  t.after(() => rm(siteDir, { recursive: true, force: true }));
  const themesDir = join(siteDir, 'themes'); await mkdir(themesDir);
  for (const size of [32, MAX_SECRET_SCAN_BYTES + 1]) {
    const { deps } = libraryFixture(); const bytes = Buffer.alloc(size, 65);
    const sharedDeps = { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo,
      referenceCheck: { findReferences: async () => [] } };
    const { media } = await uploadMedia({ deps: sharedDeps, input: { workspaceId: deps.workspaceId, kind: 'document',
      filename: 'private.txt', bytes, contentType: 'text/plain', createdByPrincipal: 'owner' } });
    let reads = 0; const get = deps.blobStore.get.bind(deps.blobStore);
    deps.blobStore.get = async input => { reads++; return get(input); };
    const outbox = new InMemoryOutbox();
    const publishDeps: PublishContentDeps = { ...deps, outbox, changeSets: new InMemoryChangeSetRepo([], [], outbox),
      ports: { media: { repo: deps.mediaRepo, assetBlobRepo: deps.assetBlobRepo, blobStore: deps.blobStore, contentTypeStore: deps.mediaContentTypeStore },
        'theme-files': { themesDir } },
      backstop: { coveredRoots: ['themes'], coveredTables: [], files: createRawFileSitePort({ siteDir }), blobs: deps.blobStore } };
    const rawState = { path: 'snippets/leaked.html', sha256: media.source.sha256, size, mode: 0o644 };
    const themeState = { title: 'Theme: static/leaked', kind: 'theme-files', treeKey: 'static/leaked',
      files: [{ path: 'render/partials/leaked.html', sha256: media.source.sha256, size, mode: 0o644 }] };
    for (const phase of ['active', 'trashed', 'purged']) {
      if (phase === 'trashed') await trashMedia({ deps: sharedDeps, input: { workspaceId: deps.workspaceId, id: media.id } });
      if (phase === 'purged') await purgeMedia({ deps: sharedDeps, input: { workspaceId: deps.workspaceId, id: media.id } });
      for (const [contributor, state, id] of [
        [contributeRawFilePublish(), rawState, rawState.path], [contributeThemeFilesPublish(), themeState, themeState.treeKey],
      ] as const) {
        const handler = contributor.build(publishDeps);
        const entity: PackedEntity = { entityType: contributor.entityType, id, state, schemaVersion: 1, hashVersion: 1,
          contentHash: contentHash(contributor.entityType, state), requiredBlobs: [media.source.sha256] };
        // Call apply directly: a forged sender need not have passed the planner's precheck.
        await assert.rejects(handler.apply({ entity, expectedVersion: undefined, principalId: 'owner',
          idempotencyKey: `${contributor.entityType}-${size}-${phase}` }), /Library documents cannot be published/);
        assert.equal(reads, 0, `${contributor.entityType}/${size}/${phase}`);
      }
      assert.deepEqual(await readdir(siteDir), ['themes']); assert.deepEqual(await readdir(themesDir), []);
    }
  }
});

test('Library sidecars cannot escape as manually selected raw publish rows', async () => {
  const { deps } = libraryFixture();
  const contributor = contributeMediaPublish();
  const columns = ['workspace_id', 'slug', 'media_id', 'retired_at'].map((name, i) => ({ name, type: 'TEXT', pk: i < 2 ? i + 1 : 0, notnull: 1 }));
  const row: RawRowSnapshot = { table: 'media_slug_history', pk: { workspace_id: 'site-a', slug: 'private-document' }, columns,
    values: { workspace_id: 'site-a', slug: 'private-document', media_id: 'doc-id', retired_at: 'now' } };
  const handler = contributeRawRowPublish().build({ workspaceId: deps.workspaceId, clock: deps.clock, idGen: deps.idGen, ports: {},
    backstop: { coveredTables: contributor.coversTables ?? [], coveredRoots: [], selection: { rows: [{ table: row.table, pk: row.pk }] },
      rows: { columns: async () => columns, read: async () => row, upsert: async () => {}, removeCreated: async () => {}, transaction: async ({ work }) => work() } } });
  const packed = []; for await (const entity of handler.pack()) packed.push(entity);
  assert.deepEqual(packed, []);
});

// RED: an ordinary blob retained after purge was denied by every shared hash gate.
test('ordinary retained blobs allow peer download, raw-file/theme apply and media publish', async t => {
  const siteDir = await realpath(await mkdtemp(join(tmpdir(), 'ordinary-publish-')));
  t.after(() => rm(siteDir, { recursive: true, force: true }));
  const themesDir = join(siteDir, 'themes'); await mkdir(themesDir);
  const { deps } = libraryFixture();
  const sharedDeps = { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo,
    referenceCheck: { findReferences: async () => [] } };
  const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');
  const { media } = await uploadMedia({ deps: sharedDeps, input: { workspaceId: deps.workspaceId,
    filename: 'ordinary.svg', bytes, contentType: 'image/svg+xml', createdByPrincipal: 'owner' } });
  await trashMedia({ deps: sharedDeps, input: { workspaceId: deps.workspaceId, id: media.id } });
  await purgeMedia({ deps: sharedDeps, input: { workspaceId: deps.workspaceId, id: media.id } });
  assert.equal(await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: media.id }), null);
  const retained = (await deps.assetBlobRepo.findByHash({ workspaceId: deps.workspaceId, sha256: media.source.sha256 }))!;
  const storedBytes = Buffer.from(await deps.blobStore.get({ storageKey: retained.storageKey }));
  // Cover both the pending-GC tombstone and an orphan already present on a destination.
  const outbox = new InMemoryOutbox();
  const publishDeps: PublishContentDeps = { ...deps, outbox, changeSets: new InMemoryChangeSetRepo([], [], outbox),
    ports: { media: { repo: deps.mediaRepo, assetBlobRepo: deps.assetBlobRepo, blobStore: deps.blobStore, contentTypeStore: deps.mediaContentTypeStore },
      'theme-files': { themesDir } },
    backstop: { coveredRoots: ['themes'], coveredTables: [], files: createRawFileSitePort({ siteDir }), blobs: deps.blobStore } };
  const app = express(); app.use((_req, res, next) => { res.locals.principal = { id: 'owner' }; next(); });
  registerPublishContentBlobGetRoute(app, { ...deps, fileBlobIndex: createFileBlobIndex() } as unknown as PublishContentRouteDeps);
  const base = await startTestServer(app, t);
  for (const status of ['tombstoned', 'active'] as const) {
    await deps.assetBlobRepo.save({ ...retained, status });
    const response = await fetch(`${base}/api/admin/v1/workspaces/site-a/publish-content/blobs/${media.source.sha256}`);
    assert.equal(response.status, 200, status);
    assert.equal((await response.json() as { dataBase64: string }).dataBase64, storedBytes.toString('base64'));
    const rawState = { path: `snippets/${status}.html`, sha256: media.source.sha256, size: storedBytes.length, mode: 0o644 };
    const themeState = { title: `Theme: static/${status}`, kind: 'theme-files', treeKey: `static/${status}`,
      files: [{ path: 'render/partials/ordinary.html', sha256: media.source.sha256, size: storedBytes.length, mode: 0o644 }] };
    for (const [contributor, state, id, path] of [
      [contributeRawFilePublish(), rawState, rawState.path, join(siteDir, rawState.path)],
      [contributeThemeFilesPublish(), themeState, themeState.treeKey, join(themesDir, themeState.treeKey, 'render/partials/ordinary.html')],
    ] as const) {
      const handler = contributor.build(publishDeps);
      const entity: PackedEntity = { entityType: contributor.entityType, id, state, schemaVersion: 1, hashVersion: 1,
        contentHash: contentHash(contributor.entityType, state), requiredBlobs: [media.source.sha256] };
      await handler.apply({ entity, expectedVersion: undefined, principalId: 'owner', idempotencyKey: `${contributor.entityType}-${status}` });
      assert.deepEqual(await readFile(path), storedBytes);
    }
    const handler = contributeMediaPublish().build(publishDeps);
    const state = { ...media, id: `republished-${status}`, slug: `republished-${status}` };
    const entity: PackedEntity = { entityType: 'media', id: state.id, state, schemaVersion: 1, hashVersion: 1,
      contentHash: contentHash('media', state), requiredBlobs: [media.source.sha256] };
    assert.equal(await handler.precheck(entity), null, status);
    await handler.apply({ entity, expectedVersion: undefined, principalId: 'owner', idempotencyKey: `ordinary-media-${status}` });
    assert.equal((await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: state.id }))?.source.sha256, media.source.sha256);
    // Drop the new live owner so the next status case still has no ordinary media row.
    await deps.mediaRepo.remove({ workspaceId: deps.workspaceId, id: state.id });
  }
});
