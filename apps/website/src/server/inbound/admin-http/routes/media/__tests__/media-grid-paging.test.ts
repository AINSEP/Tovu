import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import '../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { Express } from 'express';
import type { MediaRecord } from '@jini-ai/cms/media';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { BASE, WS, fixture } from '#src/server/__tests__/helpers/admin-route-failures';
import { freshSqliteContentKernel } from '#src/platform/db/kernel/__tests__/dialect-matrix';
import { SqlAssetBlobRepo, SqlMediaContentTypeStore, SqlMediaRepo } from '#src/platform/db/repos/media-repo';
import { registerAdminMediaGridRoute } from '#src/server/runtime/composition/modules/media';

/** The bounded media grid route against the real SQLite adapters: every page is a `limit + 1` read
 *  after filtering, and the workspace counts come from their own aggregate, never from the page. */

interface GridBody { media: Array<{ id: string; contentType: string | null; status: string }>; nextCursor: string | null; counts: Record<string, number>; hasUntypedActive: boolean }

/** Real SQLite media, blob and content-type adapters behind the admin fixture, with the grid route mounted. */
function gridApp(t: TestContext): { app: Express; repo: SqlMediaRepo; blobs: SqlAssetBlobRepo; types: SqlMediaContentTypeStore } {
  const kernel = freshSqliteContentKernel();
  t.after(() => kernel.close());
  const repo = new SqlMediaRepo(kernel);
  const blobs = new SqlAssetBlobRepo(kernel);
  const types = new SqlMediaContentTypeStore(kernel);
  const { app } = fixture(({ app: target, deps }) => registerAdminMediaGridRoute({ errors: createRouteIncidentReporter().errors, app: target, deps }), { mediaRepo: repo, assetBlobRepo: blobs, mediaContentTypeStore: types });
  return { app, repo, blobs, types };
}

interface Seed { id: string; createdAt: string; contentType?: string | null; status?: 'active' | 'trashed'; kind?: 'media' | 'document' }

/** Stores one asset the way upload does: its blob row, its recorded MIME (unless untyped), then the media row. */
async function seed(ctx: { repo: SqlMediaRepo; blobs: SqlAssetBlobRepo; types: SqlMediaContentTypeStore }, row: Seed): Promise<void> {
  const sha256 = row.id.padStart(64, '0');
  await ctx.blobs.save({ id: `blob-${row.id}`, workspaceId: WS, sha256, storageKey: `blobs/${row.id}`, createdByPrincipal: 'owner', createdAt: row.createdAt, status: 'active' });
  if (row.contentType !== null) await ctx.types.set({ workspaceId: WS, sha256, contentType: row.contentType ?? 'image/png' });
  const record: MediaRecord = {
    kind: row.kind ?? 'media', originalFilename: null, id: row.id, workspaceId: WS, title: `asset ${row.id}`, slug: `asset-${row.id}`,
    alt: '', caption: '', credit: '', source: { sha256 }, status: row.status ?? 'active', createdAt: row.createdAt, updatedAt: row.createdAt,
    version: 1, width: null, height: null, cssClass: null, htmlAttributes: null,
  };
  await ctx.repo.save(record);
}

/** One grid request; asserts it answered 200. */
async function grid(app: Express, query: Record<string, string>): Promise<GridBody> {
  const response = await dispatchJsonRequest(app, 'GET', `${BASE}/media/grid?${new URLSearchParams(query).toString()}`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body as GridBody;
}

/** Follows `nextCursor` to the end, asserting no page exceeds `limit`. */
async function allPages(app: Express, query: Record<string, string>, limit: number): Promise<{ ids: string[]; pages: number }> {
  const ids: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const body: GridBody = await grid(app, { ...query, limit: String(limit), ...(cursor ? { cursor } : {}) });
    assert.ok(body.media.length <= limit, 'a page never exceeds its limit');
    ids.push(...body.media.map((item) => item.id));
    cursor = body.nextCursor;
    pages += 1;
    assert.ok(pages <= 1000, 'paging terminates');
  } while (cursor);
  return { ids, pages };
}

test('500 tied and untied assets round trip once in bounded pages without a full list', async (t) => {
  const ctx = gridApp(t);
  const rows: Seed[] = [];
  for (let index = 0; index < 500; index += 1) {
    // Every other asset shares one of five instants, so ids alone must break those ties.
    const tied = index % 2 === 0;
    const second = tied ? index % 5 : 10 + index;
    const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + second * 1000).toISOString();
    rows.push({ id: `m${String((index * 7919) % 1000).padStart(4, '0')}`, createdAt });
  }
  for (const row of rows) await seed(ctx, row);
  const listCalls = t.mock.method(ctx.repo, 'list');

  const { ids, pages } = await allPages(ctx.app, { tab: 'all', orderBy: 'created' }, 37);

  const expected = [...rows].sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1)).map((row) => row.id);
  assert.equal(new Set(ids).size, 500, 'no asset repeats across pages');
  assert.deepEqual(ids, expected, 'pages concatenate to newest first, then id descending');
  assert.equal(pages, Math.ceil(500 / 37));
  assert.equal(listCalls.mock.callCount(), 0, 'the grid never reads the whole library');
});

test('tabs and counts use all matching rows not the first fetched page', async (t) => {
  const ctx = gridApp(t);
  const at = (minute: number): string => new Date(Date.UTC(2026, 1, 1, 0, minute)).toISOString();
  // Newest first: 12 videos, then 3 untyped, then 9 images; 4 trashed images and 2 documents sit among them.
  for (let index = 0; index < 12; index += 1) await seed(ctx, { id: `v${index}`, createdAt: at(500 - index), contentType: 'video/mp4' });
  for (let index = 0; index < 3; index += 1) await seed(ctx, { id: `u${index}`, createdAt: at(400 - index), contentType: null });
  for (let index = 0; index < 9; index += 1) await seed(ctx, { id: `i${index}`, createdAt: at(300 - index), contentType: 'image/webp' });
  for (let index = 0; index < 4; index += 1) await seed(ctx, { id: `t${index}`, createdAt: at(450 - index), contentType: 'image/png', status: 'trashed' });
  for (let index = 0; index < 2; index += 1) await seed(ctx, { id: `d${index}`, createdAt: at(600 - index), contentType: 'application/pdf', kind: 'document' });

  const firstImages = await grid(ctx.app, { tab: 'images', orderBy: 'created', limit: '5' });
  assert.deepEqual(firstImages.media.map((item) => item.id), ['i0', 'i1', 'i2', 'i3', 'i4']);
  assert.ok(firstImages.nextCursor);
  assert.deepEqual(firstImages.counts, { all: 24, images: 9, videos: 12, trash: 4 });
  assert.equal(firstImages.hasUntypedActive, true);

  assert.deepEqual((await allPages(ctx.app, { tab: 'images', orderBy: 'created' }, 4)).ids, ['i0', 'i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8']);
  assert.deepEqual((await allPages(ctx.app, { tab: 'trash', orderBy: 'created' }, 3)).ids, ['t0', 't1', 't2', 't3']);
  const everything = await allPages(ctx.app, { tab: 'all', orderBy: 'created' }, 5);
  assert.equal(everything.ids.length, 24);
  assert.ok(!everything.ids.some((id) => id.startsWith('d') || id.startsWith('t')), 'documents and trashed assets stay off All');

  // An exact lookup answers one asset beyond page one, and only inside its tab.
  const exact = await grid(ctx.app, { tab: 'images', orderBy: 'created', itemId: 'i8' });
  assert.deepEqual(exact.media.map((item) => [item.id, item.contentType]), [['i8', 'image/webp']]);
  assert.equal(exact.counts.images, 9);
  const wrongTab = await dispatchJsonRequest(ctx.app, 'GET', `${BASE}/media/grid?tab=images&orderBy=created&itemId=v0`);
  assert.equal(wrongTab.status, 404);
});

test('alphabetical pages match the admin comparator across case, whitespace and non-ASCII titles', async (t) => {
  const ctx = gridApp(t);
  const titles = ['banana', 'Banana', '  banana  ', '', '   ', 'apple', 'Apple', 'Zebra', 'zebra', 'Éclair', 'éclair', 'eclair', 'ÉCLAIR', 'Ångström', 'angstrom', 'ärger', 'Zürich', 'zurich', 'ñandú', 'nandu', '日本', '東京', 'Straße', 'strasse', 'İstanbul', 'istanbul'];
  const rows = titles.map((title, index) => ({ id: `a${String((index * 7) % 50).padStart(2, '0')}`, title, createdAt: new Date(Date.UTC(2026, 2, 1, 0, index)).toISOString() }));
  for (const row of rows) {
    await seed(ctx, { id: row.id, createdAt: row.createdAt });
    const saved = await ctx.repo.findById({ workspaceId: WS, id: row.id as never });
    await ctx.repo.save({ ...(saved as MediaRecord), title: row.title });
  }
  const listCalls = t.mock.method(ctx.repo, 'list');

  // The admin's own comparator (Jini `rules.ts` `sortMediaByOrder`), restated so a drift in either side fails here.
  const expected = [...rows].sort((a, b) => {
    const byTitle = a.title.trim().toLocaleLowerCase().localeCompare(b.title.trim().toLocaleLowerCase());
    return byTitle !== 0 ? byTitle : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }).map((row) => row.id);
  for (const limit of [1, 3, 5, 24]) {
    const { ids } = await allPages(ctx.app, { tab: 'all', orderBy: 'alphabetical' }, limit);
    assert.deepEqual(ids, expected, `pages of ${limit} concatenate to the admin's alphabetical order`);
  }
  assert.equal(listCalls.mock.callCount(), 0, 'alphabetical paging never reads the whole library');
});

test("the media grid refuses a store without bounded queries instead of reading the whole library", async () => {
  let fullReads = 0;
  const { app } = fixture(registerAdminMediaGridRoute, {
    mediaRepo: { list: async () => { fullReads += 1; return []; } },
  });
  assert.deepEqual(await dispatchJsonRequest(app, "GET", `${BASE}/media/grid?limit=7`), {
    status: 501, body: { error: "this media store cannot answer grid pages" },
  });
  assert.equal(fullReads, 0);
});
