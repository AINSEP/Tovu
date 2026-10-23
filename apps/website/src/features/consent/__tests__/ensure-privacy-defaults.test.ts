import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryPostRepo } from '../../post/repo.memory.js';
import { createPost } from '../../post/index.js';
import { InMemoryPagesHtmlDocumentStore } from '../../pages/html-document-store.memory.js';
import { createPrivacyPageCheck } from '#src/server/inbound/public-http/middleware/site-consent';
import { createSiteConsentService } from '../service.js';
import { SITE_CONSENT_DEFAULTS } from '../config.js';
import type { SiteConsentRevision } from '../revisions.js';
import { ensureSitePrivacyDefaults, type PrivacyDefaultsDeps } from '../ensure-privacy-defaults.js';

const clock = { nowMs: () => 0, nowIso: () => '2026-10-22T00:00:00.000Z' };
function fixture() {
  const repo = new InMemoryPostRepo();
  let counter = 0, url = '', writes = 0, seeds = 0, inTransaction = false;
  const transact = repo.transaction.bind(repo);
  repo.transaction = async fn => transact(async () => {
    const previous = inTransaction;
    inTransaction = true;
    try { return await fn(); } finally { inTransaction = previous; }
  });
  const deps: PrivacyDefaultsDeps = {
    workspaceId: 'site-a', post: { repo, clock }, ids: { newId: () => `id-${++counter}` },
    readUrl: async () => url,
    setUrl: async ({ url: value }) => { url = value; writes++; },
    readIdentity: async () => ({ siteTitle: 'A & B', email: 'owner@example.test', principalId: 'owner' }),
    pagesHtmlStore: scope => {
      const store = new InMemoryPagesHtmlDocumentStore(scope, { repo, clock });
      return { ensureHtmlFormat: async html => {
        assert.equal(inTransaction, true, 'create and HTML seed share a transaction');
        seeds++;
        await store.ensureHtmlFormat(html);
      } };
    },
  };
  const add = async (input: { slug?: string; title?: string; kind?: 'post' | 'page'; deletedAt?: string; status?: 'draft' | 'published'; publishAt?: string } = {}) => {
    const { post } = await createPost({ deps: { repo, clock }, input: {
      workspaceId: deps.workspaceId, id: `existing-${++counter}`, title: 'Privacy Policy', kind: 'page', slug: 'privacy', ...input,
    } });
    if (input.deletedAt) await repo.save({ ...post, deletedAt: input.deletedAt });
    return repo.findById({ workspaceId: deps.workspaceId, id: post.id });
  };
  return { deps, repo, add, setOwnerUrl: (value: string) => { url = value; }, state: () => ({ url, writes, seeds }) };
}

test('creates an ordinary published editable HTML Page and links it once', async () => {
  const f = fixture();
  await ensureSitePrivacyDefaults(f.deps);
  const [page] = await f.repo.list({ workspaceId: 'site-a' });
  assert.equal(page.kind, 'page'); assert.equal(page.status, 'published');
  assert.equal(page.slug, 'privacy'); assert.equal(page.bodyFormat, 'html');
  assert.match(page.bodyHtml!, /A &amp; B/); assert.match(page.bodyHtml!, /owner@example.test/);
  assert.match(page.bodyHtml!, /data-agent-element="privacy-policy"/);
  assert.ok(!page.bodyHtml!.includes('<mark>'));
  const before = structuredClone(page);
  await ensureSitePrivacyDefaults(f.deps);
  assert.deepEqual(await f.repo.list({ workspaceId: 'site-a' }), [before]);
  assert.deepEqual(f.state(), { url: '/privacy', writes: 1, seeds: 1 });
});

test('reuses policies by conventional slug or exact title without converting or publishing them', async () => {
  for (const input of [{ slug: 'privacy', title: 'Our policy' }, { slug: 'privacy-policy' }, { slug: 'legal', title: 'Privacy Policy' }, { slug: 'scheduled', status: 'published' as const, publishAt: '2099-01-01T00:00:00.000Z' }, { slug: 'privacy', deletedAt: clock.nowIso() }]) {
    const f = fixture(); const page = await f.add(input);
    await ensureSitePrivacyDefaults(f.deps);
    assert.deepEqual(await f.repo.list({ workspaceId: 'site-a' }), [page]);
    assert.deepEqual(f.state(), { url: `/${input.slug}`, writes: 1, seeds: 0 });
  }
});

test('reserves collisions including trashed rows and chooses a numbered available slug', async () => {
  const f = fixture();
  await f.add({ kind: 'post', title: 'Unrelated', slug: 'privacy', deletedAt: clock.nowIso() });
  await f.add({ kind: 'post', title: 'Unrelated', slug: 'privacy-policy' });
  await f.add({ kind: 'post', title: 'Unrelated', slug: 'privacy-policy-2' });
  const before = structuredClone(await f.repo.list({ workspaceId: 'site-a' }));
  await ensureSitePrivacyDefaults(f.deps);
  assert.equal(f.state().url, '/privacy-policy-3');
  assert.deepEqual((await f.repo.list({ workspaceId: 'site-a' })).slice(0, 3), before);
});

test('ranks published live policies above drafts and trash without altering any candidate', async () => {
  for (const published of [false, true]) {
    const f = fixture();
    await f.add({ slug: 'old-policy', status: 'published', deletedAt: clock.nowIso() });
    await f.add({ slug: 'draft-policy', status: 'draft' });
    if (published) await f.add({ slug: 'live-policy', status: 'published' });
    const before = structuredClone(await f.repo.list({ workspaceId: 'site-a' }));
    await ensureSitePrivacyDefaults(f.deps);
    assert.equal(f.state().url, published ? '/live-policy' : '/draft-policy');
    assert.equal(f.state().seeds, 0);
    assert.deepEqual(await f.repo.list({ workspaceId: 'site-a' }), before);
  }
});

test('highlights missing contact and escapes the site title', async () => {
  const f = fixture();
  f.deps.readIdentity = async () => ({ siteTitle: '<script>bad</script>', principalId: 'owner' });
  await ensureSitePrivacyDefaults(f.deps);
  const [page] = await f.repo.list({ workspaceId: 'site-a' });
  assert.match(page.bodyHtml!, /<mark>ADD YOUR CONTACT EMAIL<\/mark>/);
  assert.match(page.bodyHtml!, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.ok(!page.bodyHtml!.includes('<script>'));
});

test('an owner URL is the marker, including external, renamed, or missing targets', async () => {
  for (const url of ['https://example.test/policy', '/renamed', '/missing']) {
    const f = fixture(); f.setOwnerUrl(url);
    f.deps.readIdentity = async () => assert.fail('owner URL must skip creation');
    await ensureSitePrivacyDefaults(f.deps);
    assert.deepEqual(f.state(), { url, writes: 0, seeds: 0 });
    assert.deepEqual(await f.repo.list({ workspaceId: 'site-a' }), []);
  }
});

test('rereads URL immediately before writing so a concurrent owner URL wins', async () => {
  const f = fixture(); let reads = 0;
  f.deps.readUrl = async () => ++reads === 1 ? '' : '/owner-choice';
  await ensureSitePrivacyDefaults(f.deps);
  assert.equal(reads, 2); assert.equal(f.state().writes, 0);
});

test('a failed seed rolls back the Page and the next open retries', async () => {
  const f = fixture(); const store = f.deps.pagesHtmlStore;
  f.deps.pagesHtmlStore = () => ({ ensureHtmlFormat: async () => { throw new Error('seed failed'); } });
  await assert.rejects(ensureSitePrivacyDefaults(f.deps), /seed failed/);
  assert.deepEqual(await f.repo.list({ workspaceId: 'site-a' }), []);
  assert.equal(f.state().writes, 0);
  f.deps.pagesHtmlStore = store;
  await ensureSitePrivacyDefaults(f.deps);
  assert.equal(f.state().url, '/privacy');
});

test('discovery and creation stay within the current workspace', async () => {
  const f = fixture(); await f.add(); f.deps.workspaceId = 'site-b';
  await ensureSitePrivacyDefaults(f.deps);
  assert.equal((await f.repo.list({ workspaceId: 'site-a' })).length, 1);
  assert.equal((await f.repo.list({ workspaceId: 'site-b' }))[0].status, 'published');
});

test('a vague privacy mention is not a policy and a free privacy-policy slug is used after privacy', async () => {
  const f = fixture();
  await f.add({ slug: 'privacy-tips', title: 'Privacy tips for photographers' });
  await f.add({ slug: 'privacy', title: 'Unrelated', kind: 'post' });
  await ensureSitePrivacyDefaults(f.deps);
  assert.equal(f.state().url, '/privacy-policy');
  assert.equal((await f.repo.list({ workspaceId: 'site-a' })).length, 3);
});

test('a URL-write failure retries by reusing the already complete Page', async () => {
  const f = fixture(); const write = f.deps.setUrl;
  f.deps.setUrl = async () => { throw new Error('settings unavailable'); };
  await assert.rejects(ensureSitePrivacyDefaults(f.deps), /settings unavailable/);
  f.deps.setUrl = write;
  await ensureSitePrivacyDefaults(f.deps);
  assert.equal((await f.repo.list({ workspaceId: 'site-a' })).length, 1);
  assert.deepEqual(f.state(), { url: '/privacy', writes: 1, seeds: 1 });
});

test('ensuring an unpublished policy retains PRIVACY_PAGE_MISSING and cannot publish consent', async () => {
  const f = fixture(); await f.add({ status: 'draft' });
  await ensureSitePrivacyDefaults(f.deps);
  let draft: SiteConsentRevision | null = null;
  const config = { ...SITE_CONSENT_DEFAULTS, privacyPolicyUrl: f.state().url };
  const service = createSiteConsentService({ ports: {
    workspaceId: 'site-a', ready: Promise.resolve(), clock, ids: { newId: () => 'revision' },
    authorize: async () => ({ allowed: true, reason: 'test owner' }), trustedRegion: false,
    readLegacy: async () => config,
    store: { read: async () => ({ draft, published: null }),
      saveDraft: async ({ revision }) => { draft = revision; },
      publish: async () => assert.fail('missing privacy Page must block publication') },
    privacyPageExists: createPrivacyPageCheck({ deps: { postRepo: f.repo, workspaceId: 'site-a' } }),
    renderPage: async () => ({ html: '<html><head></head><body>Site</body></html>', ok: true, truncated: false }),
    necessaryScripts: async () => [], receiptStorage: async () => ({ writable: true, count: 0 }),
  } });
  const readiness = await service.readiness({ principalId: 'owner', config });
  assert.ok(readiness.blockingProblems.some(problem => problem.code === 'PRIVACY_PAGE_MISSING'));
  const saved = await service.saveDraft({ principalId: 'owner', config, expectedDraftId: null });
  await assert.rejects(service.publish({ principalId: 'owner', draftId: saved.revision.id, expectedPublishedId: null }));
  assert.equal((await f.repo.list({ workspaceId: 'site-a' }))[0].status, 'draft');
});

test('owner email is escaped as text rather than inserted as HTML', async () => {
  const f = fixture();
  f.deps.readIdentity = async () => ({ siteTitle: 'Site', email: '<img src=x onerror=bad>', principalId: 'owner' });
  await ensureSitePrivacyDefaults(f.deps);
  const [page] = await f.repo.list({ workspaceId: 'site-a' });
  assert.match(page.bodyHtml!, /&lt;img src=x onerror=bad&gt;/);
  assert.ok(!page.bodyHtml!.includes('<img'));
});
