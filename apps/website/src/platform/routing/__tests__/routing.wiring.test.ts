import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryPostRepo } from '#src/features/post/index';
import { buildPostRecord } from '#src/features/post/__tests__/post-record.fixture';
import { registerRedirectsPhaseHandlers } from '#src/features/redirects/phase-handler';
import { entryPublicPath, getNamedRoute, getSlugChangeCapture, registerSlugChangeCapture,
  resetRoutingRegistrationsForTests, runPostContentPhase, runPreContentPhase, urlFor } from '../adapter.js';

const ctx = { workspaceId: 'workspace-rt', originOverride: 'https://rt.example/' };
test.beforeEach(() => resetRoutingRegistrationsForTests({}));
test.afterEach(() => resetRoutingRegistrationsForTests({}));

test('Tovu binds its existing publication, scheduling and Trash policy to Jini routing', async () => {
  const published = buildPostRecord({ id: 'post-rt', workspaceId: ctx.workspaceId, slug: 'hello', status: 'published' });
  const cases = [
    { post: published, expected: { path: '/hello', canonicalUrl: 'https://rt.example/hello' } },
    { post: { ...published, slug: '/' }, expected: { path: '/', canonicalUrl: 'https://rt.example/' } },
    { post: { ...published, status: 'draft' as const }, expected: null },
    { post: { ...published, deletedAt: '2026-10-09T00:00:00.000Z' }, expected: null },
    { post: { ...published, publishAt: '2999-01-01T00:00:00.000Z' }, expected: null },
    { post: { ...published, publishAt: '2000-01-01T00:00:00.000Z' }, expected: { path: '/hello', canonicalUrl: 'https://rt.example/hello' } },
  ];
  for (const { post, expected } of cases) {
    assert.deepEqual(entryPublicPath({ post, ctx }), expected);
    const repo = new InMemoryPostRepo([post]);
    assert.deepEqual(await urlFor({ deps: { postRepo: repo }, target: { kind: 'entryRef', entryId: post.id }, ctx }), expected);
    assert.equal(await urlFor({ deps: { postRepo: repo }, target: { kind: 'entryRef', entryId: post.id }, ctx: { workspaceId: 'other' } }), null);
  }
  assert.equal(getNamedRoute({ name: 'home' }), '/');
  assert.equal(getNamedRoute({ name: 'search' }), '/search');
});

test('redirect registration and site phase readers use the same Jini instance; stale teardown preserves its replacement', async () => {
  const register = (location: string) => registerRedirectsPhaseHandlers({ resolver: {
    resolve: async ({ phase }) => ({ matched: true, location: `${location}/${phase}`, statusCode: 301, redirectId: 'rule-rt', matchType: 'exact' }),
  } });
  const stale = register('/stale');
  const current = register('/current');
  stale();
  assert.deepEqual(await runPreContentPhase({ path: '/old', ctx }), { kind: 'redirect', location: '/current/pre_content', statusCode: 301 });
  assert.deepEqual(await runPostContentPhase({ path: '/old', ctx }), { kind: 'redirect', location: '/current/post_content', statusCode: 301 });
  current();
  assert.equal(await runPreContentPhase({ path: '/old', ctx }), null);
  assert.equal(await runPostContentPhase({ path: '/old', ctx }), null);
});

test('Tovu shares the Jini capture slot and stale disposers cannot unbind a newer capture', () => {
  const staleCapture = { onSlugChange: async () => {} };
  const currentCapture = { onSlugChange: async () => {} };
  const stale = registerSlugChangeCapture({ impl: staleCapture });
  const current = registerSlugChangeCapture({ impl: currentCapture });
  stale();
  assert.equal(getSlugChangeCapture({}), currentCapture);
  current();
  assert.equal(getSlugChangeCapture({}), undefined);
});
