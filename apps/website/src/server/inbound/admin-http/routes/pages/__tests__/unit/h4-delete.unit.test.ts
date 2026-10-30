import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createPost } from '#src/features/post/index';
import { createRouteDeps } from '#src/server/runtime/composition/app';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { registerAdminPageDeleteRoute } from '../../delete.js';

test('page delete losing its version compare-and-set is 409 and leaves the page intact', async () => {
  const deps = { ...createRouteDeps(), authorize: async () => ({ allowed: true, reason: 'owner' }) };
  const { post } = await createPost({ deps: { repo: deps.postRepo, clock: deps.clock },
    input: { workspaceId: deps.workspaceId, id: 'page', kind: 'page', title: 'Keep this page' } });
  deps.removePost = async () => ({ ok: false, reason: 'version-changed' });
  const app = express(); registerAdminPageDeleteRoute(app, deps);
  const { res, capture } = createCapturingResponse(); res.locals.principal = { id: 'owner' };
  await extractRouteHandler(app, 'delete', '/api/admin/v1/workspaces/:workspaceId/pages/:pageId')({
    params: { workspaceId: deps.workspaceId, pageId: post.id }, get: () => undefined,
  }, res);
  assert.deepEqual(capture, { statusCode: 409, jsonBody: { error: "post 'page' changed while it was being deleted", code: 'ENTRY_CONFLICT' } });
  assert.deepEqual(await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: post.id }), post);
});

test('page delete compensates a failed audit write using its captured page', async t => {
  const deps = { ...createRouteDeps(), authorize: async () => ({ allowed: true, reason: 'owner' }) };
  const { post } = await createPost({ deps: { repo: deps.postRepo, clock: deps.clock },
    input: { workspaceId: deps.workspaceId, id: 'page', kind: 'page', title: 'Keep after audit failure' } });
  t.mock.method(deps.changeSets, 'insert', async () => { throw new Error('private audit failure'); });
  const app = express(); registerAdminPageDeleteRoute(app, deps);
  const { res, capture } = createCapturingResponse(); res.locals.principal = { id: 'owner' };
  await extractRouteHandler(app, 'delete', '/api/admin/v1/workspaces/:workspaceId/pages/:pageId')({
    params: { workspaceId: deps.workspaceId, pageId: post.id }, get: () => undefined,
  }, res);
  assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: 'internal error' } });
  const restored = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: post.id });
  assert.ok(restored);
  assert.equal(restored.title, 'Keep after audit failure');
  assert.deepEqual(restored, { ...post, version: post.version + 2, updatedAt: restored.updatedAt });
  assert.equal(restored.version, post.version + 2);
  const trash = await deps.trash.list({ workspaceId: deps.workspaceId, now: deps.clock.nowIso(), limit: 100 });
  assert.deepEqual(trash.items, []);
});
