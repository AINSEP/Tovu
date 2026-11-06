import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryTransformDefinitionRepo,
  InMemoryBlobStore, uploadMedia, registerTransform, replaceMediaFile } from '@jini-ai/cms/media';
import { InMemoryVersionedMediaRepo } from '#src/features/media/versioned-media-repo';
import { InMemoryPostRepo } from '#src/features/post/repo.memory';
import { SqlitePostRepo } from '#src/features/post/repo.sqlite';
import { SqliteEntryRepo } from '#src/features/entries/repo.sqlite';
import { openContentDb } from '#src/platform/db/sqlite/content-db';
import { TrashAwareInMemoryEntryRepo } from '#src/features/entries/trash-aware-memory-repo';
import { buildWidgetInstanceFieldsJson } from '@jini-ai/cms/widgets';
import type { MediaRenditionRouteDeps } from '#src/server/inbound/admin-http/routes/media/deps';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { registerMediaRenditionRoute } from '../../media-rendition.js';

async function fixture(t: test.TestContext, storage: 'memory' | 'sqlite' = 'memory') {
  const db = storage === 'sqlite' ? openContentDb(':memory:') : null;
  if (db) t.after(() => db.$client.close());
  let now = 1_800_000_000_000;
  const deps = { workspaceId: 'workspace', mediaRepo: new InMemoryVersionedMediaRepo(),
    assetBlobRepo: new InMemoryAssetBlobRepo({}), assetRenditionRepo: new InMemoryAssetRenditionRepo({}),
    transformDefinitionRepo: new InMemoryTransformDefinitionRepo({}), blobStore: new InMemoryBlobStore(),
    clock: { nowMs: () => now, nowIso: () => new Date(now).toISOString() }, idGen: { newId: randomUUID },
    postRepo: db ? new SqlitePostRepo(db) : new InMemoryPostRepo(), entryRepo: db ? new SqliteEntryRepo(db) : new TrashAwareInMemoryEntryRepo(), imageTransformer: { transform: async () => { throw new Error('SVG needs no raster transform'); } },
  };
  const { media } = await uploadMedia({ deps: { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo },
    input: { workspaceId: deps.workspaceId, bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>'),
      filename: 'cached.svg', contentType: 'image/svg+xml', createdByPrincipal: 'owner' } });
  await registerTransform({ deps: { ...deps, transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: deps.workspaceId, name: 'public', params: { format: 'webp' }, owner: 'core' } });
  const app = express();
  // No authorization/member adapters are needed for this unreferenced public asset.
  registerMediaRenditionRoute(app, deps as unknown as MediaRenditionRouteDeps);
  const baseUrl = await startTestServer(app, t);
  return { deps, media, url: `${baseUrl}/m/${media.id}/public.v1/cached.webp`, advance: () => { now += 60_000; } };
}

test('public image validation reuses bounded access evidence and skips unchanged blob bytes', async t => {
  const { deps, url, advance } = await fixture(t);
  const scans = t.mock.method(deps.postRepo, 'list');
  const reads = t.mock.method(deps.blobStore, 'get');
  const first = await fetch(url);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'public, max-age=60');
  const etag = first.headers.get('etag'); assert.ok(etag);
  const firstReads = reads.mock.callCount();
  const unchanged = await fetch(url, { headers: { 'if-none-match': `W/${etag}, "other"` } });
  assert.equal(unchanged.status, 304);
  assert.equal(reads.mock.callCount(), firstReads, 'unchanged source evidence requires no byte load');
  assert.equal(scans.mock.callCount(), 1, 'one access scan per asset within the bounded freshness period');
  advance();
  const refreshed = await fetch(url, { headers: { 'if-none-match': etag } });
  assert.equal(refreshed.status, 304);
  assert.equal(scans.mock.callCount(), 2, 'access evidence refreshes by sixty seconds');
});

test('a source replacement changes validation immediately while a conditional request loads no old bytes', async t => {
  const { deps, media, url } = await fixture(t);
  const before = await fetch(url);
  const etag = before.headers.get('etag'); assert.ok(etag);
  const beforeText = await before.text();
  await replaceMediaFile({ deps, media, bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>'),
    contentType: 'image/svg+xml', principalId: 'owner' });
  const after = await fetch(url, { headers: { 'if-none-match': etag } });
  assert.equal(after.status, 200);
  assert.notEqual(after.headers.get('etag'), etag);
  assert.notEqual(await after.text(), beforeText);
});

for (const storage of ['memory', 'sqlite'] as const) {
test(`${storage}: saving access changes denies an anonymous request before applying its public validator`, async t => {
  const { deps, media, url } = await fixture(t, storage);
  const before = await fetch(url);
  const etag = before.headers.get('etag'); assert.ok(etag);
  await deps.postRepo.save({ id: 'members', workspaceId: deps.workspaceId, slug: 'members', title: 'Members',
    status: 'published', kind: 'post', bodyFormat: 'doc', bodyHtml: null, updatedAt: media.updatedAt, version: 1,
    bodyJson: { type: 'doc', content: [{ type: 'image', attrs: { assetId: media.id, transformName: 'public' } }] },
    memberAccessJson: JSON.stringify({ visibility: 'members' }) });
  const denied = await fetch(url, { headers: { 'if-none-match': etag } });
  assert.equal(denied.status, 404);
  assert.equal(denied.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await denied.json(), { error: 'rendition not found' });
});


test(`${storage}: a conditional post save refreshes media access`, async t => {
  const { deps, media, url } = await fixture(t, storage);
  const post = { id: 'conditional', workspaceId: deps.workspaceId, slug: 'conditional', title: 'Conditional',
    status: 'published' as const, kind: 'post' as const, bodyFormat: 'doc' as const, bodyHtml: null,
    updatedAt: media.updatedAt, version: 1, featuredMediaId: media.id, bodyJson: { type: 'doc', content: [] } };
  await deps.postRepo.save(post);
  const before = await fetch(url);
  assert.equal(before.status, 200);
  assert.deepEqual(await deps.postRepo.saveIfVersion({ ifVersion: 1,
    record: { ...post, version: 2, memberAccessJson: JSON.stringify({ visibility: 'members' }) } }), { applied: true });
  const denied = await fetch(url, { headers: { 'if-none-match': before.headers.get('etag')! } });
  assert.equal(denied.status, 404);
});

test(`${storage}: saving a placed widget refreshes its media access before public validation`, async t => {
  const { deps, media, url } = await fixture(t, storage);
  const widget = { id: 'widget', workspaceId: deps.workspaceId, type: 'widget', slug: 'widget', title: 'Widget',
    status: 'draft' as const, bodyJson: null, publishedAt: null, createdAt: media.createdAt, updatedAt: media.updatedAt, version: 1,
    fieldsJson: buildWidgetInstanceFieldsJson({ payload: { widgetType: 'media', status: 'active', config: { items: [] } } }) };
  await deps.entryRepo.save(widget);
  await deps.postRepo.save({ id: 'members', workspaceId: deps.workspaceId, slug: 'members', title: 'Members',
    status: 'published', kind: 'post', bodyFormat: 'doc', bodyHtml: null, updatedAt: media.updatedAt, version: 1,
    bodyJson: { type: 'doc', content: [{ type: 'widgetEmbed', attrs: { widgetEntryId: widget.id } }] },
    memberAccessJson: JSON.stringify({ visibility: 'members' }) });
  const before = await fetch(url);
  assert.equal(before.status, 200);
  const etag = before.headers.get('etag'); assert.ok(etag);
  await deps.entryRepo.save({ ...widget, version: 2,
    fieldsJson: buildWidgetInstanceFieldsJson({ payload: { widgetType: 'media', status: 'active', config: { items: [{ slug: media.slug }] } } }) });
  const denied = await fetch(url, { headers: { 'if-none-match': etag } });
  assert.equal(denied.status, 404);
  assert.equal(denied.headers.get('cache-control'), 'private, no-store');
});


}

test('an old failed access scan does not erase evidence collected after a save', { timeout: 10_000 }, async t => {
  const { deps, media, url } = await fixture(t);
  const originalList = deps.postRepo.list.bind(deps.postRepo);
  let started!: () => void;
  const firstStarted = new Promise<void>(resolve => { started = resolve; });
  let failOld!: (reason: Error) => void;
  let calls = 0;
  t.mock.method(deps.postRepo, 'list', async (input: Parameters<typeof originalList>[0]) => {
    calls += 1;
    if (calls !== 1) return originalList(input);
    started();
    return new Promise<Awaited<ReturnType<typeof originalList>>>((_resolve, reject) => { failOld = reject; });
  });
  t.after(() => failOld(new Error('scan cleanup')));
  const oldRequest = fetch(url);
  await firstStarted;
  await deps.postRepo.save({ id: 'public', workspaceId: deps.workspaceId, slug: 'public', title: 'Public',
    status: 'published', kind: 'post', bodyFormat: 'doc', bodyHtml: null, updatedAt: media.updatedAt, version: 1,
    bodyJson: { type: 'doc', content: [] } });
  const current = await fetch(url);
  assert.equal(current.status, 200);
  failOld(new Error('old access read failed'));
  assert.equal((await oldRequest).status, 500);
  const validated = await fetch(url, { headers: { 'if-none-match': current.headers.get('etag')! } });
  assert.equal(validated.status, 304);
  assert.equal(calls, 2, 'the late failure must retain the fresh access evidence');
});
