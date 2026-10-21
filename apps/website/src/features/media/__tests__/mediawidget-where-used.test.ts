/** Slug-aware where-used including fresh post content absent from the entry reference index. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Clock } from '@jini-ai/core/primitives';
import { InMemoryVersionedMediaRepo } from '../versioned-media-repo.js';
import { findMediaWhereUsed } from '#src/features/media/where-used';
import { extractEntryRefs } from '#src/contracts/core/entry-refs/extractor';
import { InMemoryEntryRefsRepo } from '#src/contracts/core/entry-refs/repo.memory';
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createPost, InMemoryPostRepo } from '#src/features/post/index';

test('usage queries canonical id and slug and combines indexed widgets with current raw and placement post bodies', async () => {
  const clock: Clock = { nowMs: () => Date.parse('2026-10-10T00:00:00.000Z') };
  const workspaceId = 'usage-ws', mediaRepo = new InMemoryVersionedMediaRepo(), entryRefsRepo = new InMemoryEntryRefsRepo(), postRepo = new InMemoryPostRepo();
  await entryRefsRepo.replaceForSource({ workspaceId, sourceEntryId: 'widget', refs: extractEntryRefs({ workspaceId, sourceEntryId: 'widget', sourceEntryType: 'widget', bodyJson: null, fieldsExt: { widget: { widgetType: 'media', config: { items: [{ slug: 'photo' }] } } } }) });
  const raw = await createPost({ deps: { clock, repo: postRepo, outbox: new InMemoryOutbox() }, input: { id: 'raw-post', workspaceId, title: 'Raw', slug: 'raw', actorId: 'owner', bodyJson: { type: 'doc', content: [{ type: 'widgetEmbed', attrs: { widgetEntryId: 'w', placementId: 'p', content: { html: '<img data-media-slug="photo">' } } }] } } });
  const placed = await createPost({ deps: { clock, repo: postRepo, outbox: new InMemoryOutbox() }, input: { id: 'placed-post', workspaceId, title: 'Placed', slug: 'placed', actorId: 'owner', bodyJson: { type: 'doc', content: [{ type: 'widgetEmbed', attrs: { widgetEntryId: 'w', placementId: 'p', content: { items: [{ slug: 'photo' }] } } }] } } });
  const usage = await findMediaWhereUsed({ deps: { entryRefsRepo, postRepo, mediaRepo }, input: { workspaceId, mediaId: 'canonical-photo', slug: 'photo' } });
  assert.deepEqual(usage.references.map(ref => ref.sourceEntryId).sort(), [raw.post.id, placed.post.id, 'widget'].sort());
  assert.equal(usage.count, 3);
  const other = await findMediaWhereUsed({ deps: { entryRefsRepo, postRepo, mediaRepo }, input: { workspaceId: 'other', mediaId: 'canonical-photo', slug: 'photo' } });
  assert.equal(other.count, 0);
});

test('usage HTTP route enforces workspace and media.read before any asset lookup', async () => {
  const { registerAdminMediaWhereUsedRoute } = await import('#src/server/inbound/admin-http/routes/media/where-used');
  const { InMemoryVersionedMediaRepo } = await import('#src/features/media/index');
  let handler: (req: any, res: any) => Promise<void> = async () => {};
  let reads = 0, allowed = false, status = 200, body: any;
  class MediaRepo extends InMemoryVersionedMediaRepo { override async findById(input: Parameters<InstanceType<typeof InMemoryVersionedMediaRepo>['findById']>[0]) { reads++; return super.findById(input); } }
  const mediaRepo = new MediaRepo();
  const app = { get: (_path: string, fn: typeof handler) => { handler = fn; } } as unknown as Parameters<typeof registerAdminMediaWhereUsedRoute>[0]['app'];
  registerAdminMediaWhereUsedRoute({ app, deps: { workspaceId: 'ws', mediaRepo, entryRefsRepo: new InMemoryEntryRefsRepo(), postRepo: new InMemoryPostRepo(), authorize: async () => ({ allowed, reason: allowed ? 'matched' : 'insufficient_permission' }) } });
  const res = { locals: { principal: { id: 'owner', kind: 'user' } }, status: (code: number) => { status = code; return res; }, json: (value: unknown) => { body = value; return res; } };
  await handler({ params: { workspaceId: 'other', mediaId: 'm' } }, res);
  assert.equal(status, 404); assert.equal(reads, 0);
  await handler({ params: { workspaceId: 'ws', mediaId: 'm' } }, res);
  assert.equal(status, 403); assert.equal(body.code, 'FORBIDDEN'); assert.equal(reads, 0);
  allowed = true;
  await handler({ params: { workspaceId: 'ws', mediaId: 'm' } }, res);
  assert.equal(status, 404); assert.equal(reads, 1);
  await mediaRepo.save({ id: 'm', workspaceId: 'ws', slug: 'photo', title: 'Photo', alt: '', caption: '', credit: '', source: { sha256: 'photo-sha' }, status: 'active', createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z', version: 1, width: null, height: null, cssClass: null, htmlAttributes: null });
  await handler({ params: { workspaceId: 'ws', mediaId: 'm' } }, res);
  assert.deepEqual(body, { mediaId: 'm', whereUsed: { count: 0, references: [] } });
  mediaRepo.findById = async () => { throw new Error('read failure'); };
  await handler({ params: { workspaceId: 'ws', mediaId: 'm' } }, res);
  assert.equal(status, 500); assert.deepEqual(body, { error: 'internal error' });
});

// Exercise the purge adapter, not a second copy of the scanner or deletion ladder.
test('Tovu purge refuses retired slug references from current post bodies and succeeds after removal', async () => {
  const { purgeMedia, InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore } = await import('../index.js');
  const workspaceId = 'purge-ws', entryRefsRepo = new InMemoryEntryRefsRepo(), postRepo = new InMemoryPostRepo();
  const mediaRepo = new InMemoryVersionedMediaRepo();
  const deps = { entryRefsRepo, postRepo, mediaRepo, blobRepo: new InMemoryAssetBlobRepo({}), renditionRepo: new InMemoryAssetRenditionRepo({}), blobStore: new InMemoryBlobStore() };
  await mediaRepo.save({ id: 'asset', workspaceId, slug: 'photo', title: 'Photo', alt: '', caption: '', credit: '', source: { sha256: 'sha' }, status: 'trashed', createdAt: '2026-10-17T00:00:00.000Z', updatedAt: '2026-10-17T00:00:00.000Z', version: 1, width: null, height: null, cssClass: null, htmlAttributes: null });
  const { post } = await createPost({ deps: { clock: { nowMs: () => 0 }, repo: postRepo, outbox: new InMemoryOutbox() }, input: { id: 'ref-post', workspaceId, title: 'Referencing post', slug: 'ref-post', actorId: 'owner', bodyJson: { type: 'doc', content: [{ type: 'image', attrs: { src: '/m/photo' } }] } } });
  // Use the same raw-HTML placement format as the existing scanner contract above.
  await postRepo.save({ ...post, bodyJson: { type: 'doc', content: [{ type: 'widgetEmbed', attrs: { widgetEntryId: 'w', placementId: 'p', content: { html: '<img data-media-slug="photo">' } } }] } });
  const asset = await mediaRepo.findById({ workspaceId, id: 'asset' });
  assert.ok(asset);
  await mediaRepo.saveIfVersion({ record: { ...asset, slug: 'renamed', version: 2 }, ifVersion: asset.version });
  const input = { workspaceId, id: 'asset' };
  await assert.rejects(purgeMedia({ deps, input }), (error: unknown) => error instanceof Error && error.message.includes('still referenced'));
  assert.ok(await mediaRepo.findById(input));
  await postRepo.save({ ...post, bodyJson: { type: 'doc', content: [] } });
  assert.deepEqual(await purgeMedia({ deps, input }), { purged: true });
  assert.equal(await mediaRepo.findById(input), null);
});

test('usage reports an html-format post body under bodyHtml and never counts a soft-deleted post', async () => {
  const clock: Clock = { nowMs: () => Date.parse('2026-10-10T00:00:00.000Z') };
  const workspaceId = 'usage-html-ws', seedRepo = new InMemoryPostRepo();
  const embed = { type: 'doc', content: [{ type: 'widgetEmbed', attrs: { widgetEntryId: 'w', placementId: 'p', content: { html: '<img data-media-slug="photo">' } } }] };
  const html = await createPost({ deps: { clock, repo: seedRepo, outbox: new InMemoryOutbox() }, input: { id: 'html-post', workspaceId, title: 'Html', slug: 'html', actorId: 'owner', bodyJson: embed } });
  const gone = await createPost({ deps: { clock, repo: seedRepo, outbox: new InMemoryOutbox() }, input: { id: 'gone-post', workspaceId, title: 'Gone', slug: 'gone', actorId: 'owner', bodyJson: embed } });
  const posts = [{ ...html.post, bodyFormat: 'html' as const }, { ...gone.post, deletedAt: '2026-10-11T00:00:00.000Z' }];
  const usage = await findMediaWhereUsed({ deps: { entryRefsRepo: new InMemoryEntryRefsRepo(), postRepo: { list: async () => posts }, mediaRepo: new InMemoryVersionedMediaRepo() }, input: { workspaceId, mediaId: 'canonical-photo', slug: 'photo' } });
  assert.equal(usage.count, 1);
  assert.deepEqual(usage.references.map(ref => [ref.sourceEntryId, ref.fieldPath, ref.targetId]), [['html-post', 'bodyHtml', 'canonical-photo']]);
});
