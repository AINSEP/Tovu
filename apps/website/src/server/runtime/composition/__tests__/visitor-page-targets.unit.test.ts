import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRouteDeps } from '../app.js';
import { createVisitorPageTargets } from '../visitor-page-targets.js';
import { buildPostRecord } from '#src/features/post/__tests__/post-record.fixture';

test('one publication read serves anonymous membership filtering and occupied theme slugs', async () => {
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  await deps.postRepo.save(buildPostRecord({ id: 'public', workspaceId: deps.workspaceId, slug: 'public-page', status: 'published' }));
  await deps.postRepo.save(buildPostRecord({ id: 'private', workspaceId: deps.workspaceId, slug: 'member-page', status: 'published', memberAccessJson: '{"visibility":"members"}' }));
  let reads = 0;
  const list = deps.postRepo.list.bind(deps.postRepo);
  deps.postRepo.list = async (...args) => { reads++; return list(...args); };
  const pages = await createVisitorPageTargets({ deps }).list({});
  assert.equal(reads, 1);
  assert.ok(pages.some(page => page.id === 'public'));
  assert.ok(pages.every(page => page.id !== 'private'));
});
