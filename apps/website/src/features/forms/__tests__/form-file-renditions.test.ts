import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { uploadMedia, purgeMedia, trashMedia, InMemoryBlobStore, withSha256Lock } from '@jini-ai/cms/media';
import { registerFormAttachmentCleanup } from '@jini-ai/cms/forms';
import { contentKernel } from '#src/platform/db/content-kernel';
import { openContentDb } from '#src/platform/db/sqlite/content-db';
import { SqlMediaRepo, SqlAssetBlobRepo, SqlAssetRenditionRepo } from '#src/platform/db/repos/media-repo';
import { SqlOutboxAdapter } from '#src/platform/db/repos/outbox-repo';
import { InMemoryEventBus } from '#src/contracts/core/events/index';
import { createFormMediaCleanup, hasFormFileOwners, hasFormFileStorageKeyOwners, withFormFileStorageKeyLock } from '../form-file-purge.js';

test('rendition journal and row removal roll back together and survive a database reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'form-renditions-')); const path = join(dir, 'content.sqlite');
  let db = openContentDb(path), kernel = contentKernel(db); let id = 0;
  const blobStore = new InMemoryBlobStore();
  try {
    db.$client.prepare('INSERT OR IGNORE INTO workspaces (id,name,slug,created_at) VALUES (?,?,?,?)').run('w','w','w','now');
    const mediaRepo = new SqlMediaRepo(kernel), blobRepo = new SqlAssetBlobRepo(kernel), renditionRepo = new SqlAssetRenditionRepo(kernel);
    const outbox = new SqlOutboxAdapter(kernel), clock = { nowMs: () => 0 };
    const base = { mediaRepo, blobRepo, renditionRepo, blobStore, clock, idGen: { newId: () => `m-${++id}` } };
    const { media } = await uploadMedia({ deps: base, input: { workspaceId: 'w', filename: 'photo.png', contentType: 'image/png', bytes: Uint8Array.of(137,80,78,71,13,10,26,10), createdByPrincipal: 'system', access: 'private' } });
    const originalKey = (await blobRepo.findByHash({ workspaceId: 'w', sha256: media.source.sha256 }))!.storageKey;
    const { storageKey: thumbKey } = await blobStore.put({ workspaceId: 'w', sha256: createHash('sha256').update(Uint8Array.of(1,2,3)).digest('hex'), bytes: Uint8Array.of(1,2,3) });
    await renditionRepo.save({ workspaceId: 'w', id: 'thumb', assetId: media.id, transformName: 'thumb', version: 1, storageKey: thumbKey, createdAt: 'now' });
    await trashMedia({ deps: base, input: { workspaceId: 'w', id: media.id } });
    const cleanup = { ...base, referenceCheck: { findReferences: async () => [] },
      ...createFormMediaCleanup({ kernel, outbox, clock, graceMs: 1 }),
    };
    const brokenMedia = new Proxy(mediaRepo, { get(target, key) {
      if (key === 'remove') return async () => { throw new Error('remove failed after rendition removal'); };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
    await assert.rejects(purgeMedia({ deps: { ...cleanup, mediaRepo: brokenMedia }, input: { workspaceId: 'w', id: media.id } }), /remove failed/);
    assert.equal((await renditionRepo.listByAsset({ workspaceId: 'w', assetId: media.id })).length, 2);
    assert.ok(await mediaRepo.findById({ workspaceId: 'w', id: media.id }));
    assert.equal((await kernel.run(q => q.selectFrom('outbox_events').select('id').execute())).length, 0);
    await purgeMedia({ deps: cleanup, input: { workspaceId: 'w', id: media.id } });
    db.$client.close(); db = openContentDb(path); kernel = contentKernel(db);
    const row = await kernel.run(q => q.selectFrom('outbox_events').select('event_json').executeTakeFirstOrThrow());
    const event = JSON.parse(row.event_json);
    assert.deepEqual(event.payload.storageKeys, [originalKey, thumbKey]);
    assert.equal((await kernel.run(q => q.selectFrom('asset_renditions').select('id').execute())).length, 0);
    const reopenedBlobs = new SqlAssetBlobRepo(kernel);
    const bus = new InMemoryEventBus();
    await registerFormAttachmentCleanup({
      bus,
      withHashLock: withSha256Lock, withStorageKeyLock: withFormFileStorageKeyLock, findBlob: input => reopenedBlobs.findByHash(input),
      hasOwners: input => hasFormFileOwners({ kernel, ...input }),
      hasStorageKeyOwners: input => hasFormFileStorageKeyOwners({ kernel, ...input }),
      deleteBytes: input => blobStore.remove(input), removeBlob: input => reopenedBlobs.remove(input),
    });
    await bus.publish(event);
    assert.equal(await blobStore.exists({ storageKey: originalKey }), false);
    assert.equal(await blobStore.exists({ storageKey: thumbKey }), false);
    assert.equal(await reopenedBlobs.findByHash({ workspaceId: 'w', sha256: media.source.sha256 }), null);
  } finally { db.$client.close(); await rm(dir, { recursive: true, force: true }); }
});

test('exact-key ownership includes other assets and workspaces while excluding only this tombstone', async () => {
  const db = openContentDb(':memory:'); const kernel = contentKernel(db);
  try {
    for (const workspace of ['w','other']) db.$client.prepare('INSERT OR IGNORE INTO workspaces (id,name,slug,created_at) VALUES (?,?,?,?)').run(workspace,workspace,workspace,'now');
    const blobs = new SqlAssetBlobRepo(kernel), renditions = new SqlAssetRenditionRepo(kernel);
    const blob = { id: 'blob', workspaceId: 'w', sha256: 'sha', storageKey: 'shared-key', contentType: 'image/png', byteSize: 1, status: 'tombstoned' as const, createdAt: 'now', createdByPrincipal: 'system', tombstonedAt: 'now' };
    await blobs.save(blob);
    const input = { kernel, workspaceId: 'w', sha256: 'sha', storageKey: 'shared-key' };
    assert.equal(await hasFormFileStorageKeyOwners(input), false);
    await renditions.save({ workspaceId: 'other', assetId: 'restorable', id: 'rendition', transformName: 'thumb', version: 1, storageKey: 'shared-key', createdAt: 'now' });
    assert.equal(await hasFormFileStorageKeyOwners(input), true);
    await renditions.removeByAsset({ workspaceId: 'other', assetId: 'restorable' });
    await blobs.save({ ...blob, id: 'other-blob', workspaceId: 'other', sha256: 'other-sha' });
    assert.equal(await hasFormFileStorageKeyOwners(input), true);
    assert.equal(await hasFormFileStorageKeyOwners({ ...input, storageKey: 'missing' }), false);
  } finally { db.$client.close(); }
});

test('canonical captured keys wait for the matching upload hash lock and unknown layouts keep bytes', async () => {
  const sha256 = 'a'.repeat(64), storageKey = `ws/w/blobs/aa/${sha256}`;
  let release!: () => void, entered = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const upload = withSha256Lock({ key: sha256, criticalSection: () => gate });
  const cleanup = withFormFileStorageKeyLock({ workspaceId: 'w', storageKey, criticalSection: async () => { entered = true; } });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(entered, false);
  release(); await Promise.all([upload, cleanup]); assert.equal(entered, true);
  await assert.rejects(withFormFileStorageKeyLock({ workspaceId: 'w', storageKey: 'unknown-layout', criticalSection: async () => assert.fail('unknown bytes must stay') }));
  await assert.rejects(withFormFileStorageKeyLock({ workspaceId: 'other', storageKey, criticalSection: async () => assert.fail('a different workspace must stay protected') }));
});

test('SQLite compensation commits before a same-hash upload waiting for its database turn', async () => {
  const { createFormFileStorage } = await import('../form-file-storage.js');
  const db = openContentDb(':memory:'); const kernel = contentKernel(db); let id = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    db.$client.prepare('INSERT OR IGNORE INTO workspaces (id,name,slug,created_at) VALUES (?,?,?,?)').run('w','w','w','now');
    const mediaRepo = new SqlMediaRepo(kernel), blobRepo = new SqlAssetBlobRepo(kernel), renditionRepo = new SqlAssetRenditionRepo(kernel), blobStore = new InMemoryBlobStore();
    const base = { mediaRepo, blobRepo, renditionRepo, blobStore, clock: { nowMs: () => 0 }, idGen: { newId: () => `race-${++id}` } };
    const input = { workspaceId: 'w', filename: 'private.png', contentType: 'image/png', bytes: Uint8Array.of(137,80,78,71,13,10,26,10), createdByPrincipal: 'system', access: 'private' as const };
    const { media } = await uploadMedia({ deps: base, input });
    let hashHeld!: () => void, releaseWriter!: () => void;
    const held = new Promise<void>(resolve => { hashHeld = resolve; }), gate = new Promise<void>(resolve => { releaseWriter = resolve; });
    const writerBlobs = new Proxy(blobRepo, { get(target, key) {
      if (key === 'findByHash') return async (required: { workspaceId: string; sha256: string }) => { hashHeld(); await gate; return target.findByHash(required); };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
    const writer = uploadMedia({ deps: { ...base, blobRepo: writerBlobs }, input: { ...input, filename: 'second.png' } });
    await held;
    const outbox = new SqlOutboxAdapter(kernel);
    const files = createFormFileStorage({ media: { ...base, entryRefsRepo: { findByTarget: async () => [] }, postRepo: { list: async () => [] },
      ...createFormMediaCleanup({ kernel, clock: base.clock, graceMs: 1, outbox: { enqueue: async event => { await outbox.enqueue(event); releaseWriter(); } } }),
    }, contentTypes: { set: async () => {}, getMany: async () => new Map() }, resolveCreatedByPrincipal: async () => 'system' });
    const discard = files.discard({ workspaceId: 'w', reference: { mediaId: media.id } });
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('compensation and upload deadlocked')), 1500); });
    const [, uploaded] = await Promise.race([Promise.all([discard, writer]), deadline]);
    assert.equal(await mediaRepo.findById({ workspaceId: 'w', id: media.id }), null);
    assert.ok(await mediaRepo.findById({ workspaceId: 'w', id: uploaded.media.id }));
    const blob = await blobRepo.findByHash({ workspaceId: 'w', sha256: uploaded.media.source.sha256 });
    assert.equal(blob!.status, 'active'); assert.equal(await blobStore.exists({ storageKey: blob!.storageKey }), true);
  } finally { if (timer) clearTimeout(timer); db.$client.close(); }
});

test('tombstoning keeps the hash lock outside SQLite transactions and for other dialects', async () => {
  const db = openContentDb(':memory:'); const kernel = contentKernel(db);
  try {
    const options = { outbox: { enqueue: async () => {} }, clock: { nowMs: () => 0 }, graceMs: 1 };
    assert.equal(createFormMediaCleanup(options).cleanupTransaction, undefined);
    assert.equal(createFormMediaCleanup(options).tombstoneLock, undefined);
    for (const mode of ['sqlite-outside', 'postgres-inside'] as const) {
      const selected = mode === 'sqlite-outside' ? kernel : new Proxy(kernel, { get(target, key) {
        if (key === 'dialect') return 'postgres';
        if (key === 'inTransaction') return () => true;
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      } });
      const cleanup = createFormMediaCleanup({ ...options, kernel: selected });
      let release!: () => void, entered = false;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const upload = withSha256Lock({ key: mode, criticalSection: () => gate });
      const tombstone = cleanup.tombstoneLock!({ key: mode, criticalSection: async () => { entered = true; return 'completed'; } });
      await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(entered, false);
      release(); await upload; assert.equal(await tombstone, 'completed'); assert.equal(entered, true);
    }
  } finally { db.$client.close(); }
});
