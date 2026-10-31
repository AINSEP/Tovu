import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVisitorPageTarget } from '../visitor-page-tools.js';
import { anonymousMemberAccess } from './member-access.fixture.js';
import { InMemoryPostRepo, listPublishedPosts } from '#src/features/post/index';
import { buildPostRecord } from '#src/features/post/__tests__/post-record.fixture';

test('visitor navigation requires published public IDs and rejects encoded reserved paths and queries', async () => {
  const posts = [
    buildPostRecord({ id: 'public', workspaceId: 'ws', slug: 'about', status: 'published' }),
    buildPostRecord({ id: 'draft', workspaceId: 'ws', slug: 'draft', status: 'draft' }),
    buildPostRecord({ id: 'reserved', workspaceId: 'ws', slug: '%61dmin/settings', status: 'published' }),
  ];
  const deps = { postRepo: new InMemoryPostRepo(posts), workspaceId: 'ws', listPublishedPosts, memberAccess: anonymousMemberAccess() };
  assert.equal((await resolveVisitorPageTarget({ deps, input: { page: 'public' } })).path, '/about');
  for (const input of [{ page: 'draft' }, { page: 'reserved' }, { page: '/admin' }, { page: 'public', query: { redirect: '/admin' } }, { page: 'public', entity: { type: 'user', id: 'public' } }]) {
    await assert.rejects(resolveVisitorPageTarget({ deps, input }));
  }
});
