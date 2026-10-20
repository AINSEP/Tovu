import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { BASE, INTERNAL, WS } from '#src/server/__tests__/helpers/admin-route-failures';
import type { Deps } from '#src/server/__tests__/helpers/admin-route-failures';
import { registerAdminMediaDeleteRoute } from '../delete.js';
import { registerAdminMediaTrashRoute } from '../trash.js';
import { forbiddenBody, mediaApp, seedPng } from './media-route-harness.js';

const ROUTE = '/api/admin/v1/workspaces/:workspaceId/media/:mediaId';
const register = (app: Parameters<typeof registerAdminMediaDeleteRoute>[0], deps: Deps) => {
  registerAdminMediaTrashRoute(app, deps);
  registerAdminMediaDeleteRoute(app, deps);
};

test('media delete: denial writes the exact 403 body for media.delete.force and names the asset to authorize', async () => {
  const calls: unknown[] = [];
  const { app } = mediaApp(register, { authorize: async (params) => { calls.push(params); return { allowed: false, reason: 'no_grant' }; } });
  assert.deepEqual(await dispatchJsonRequest(app, 'DELETE', `${BASE}/media/asset-1`), { status: 403, body: forbiddenBody('media.delete.force') });
  assert.deepEqual(calls, [{ principalId: 'owner', permission: 'media.delete.force', workspaceId: WS, entityType: 'media', entityId: 'asset-1' }]);
});

test('media delete: a trashed asset is purged and its Trash index row forgotten', async (t) => {
  const { app, deps } = mediaApp(register);
  const id = await seedPng(app);
  assert.equal((await dispatchJsonRequest(app, 'POST', `${BASE}/media/${id}/trash`)).status, 200);
  const forget = t.mock.method(deps, 'forgetRemovedMedia');
  assert.deepEqual(await dispatchJsonRequest(app, 'DELETE', `${BASE}/media/${id}`), { status: 200, body: { purged: true } });
  assert.deepEqual(forget.mock.calls.map((call) => call.arguments), [[{ workspaceId: WS, id }]]);
  assert.equal(await deps.mediaRepo.findById({ workspaceId: WS, id }), null);
});

test('media delete: an active asset is refused with 409 and the referencing list', async () => {
  const { app } = mediaApp(register);
  const id = await seedPng(app);
  assert.deepEqual(await dispatchJsonRequest(app, 'DELETE', `${BASE}/media/${id}`), {
    status: 409, body: { error: `media '${id}' must be trashed before it can be purged`, referencing: [`media '${id}' is still active`] },
  });
});

test('media delete: an unknown asset is 404 with the domain message', async () => {
  const { app } = mediaApp(register);
  assert.deepEqual(await dispatchJsonRequest(app, 'DELETE', `${BASE}/media/missing`), { status: 404, body: { error: "media 'missing' was not found" } });
});

test('media delete: an unexpected repository failure is a private 500', async (t) => {
  const { app, deps } = mediaApp(register);
  t.mock.method(deps.mediaRepo, 'findById', async () => { throw new Error('private store failure'); });
  assert.deepEqual(await dispatchJsonRequest(app, 'DELETE', `${BASE}/media/asset-1`), { status: 500, body: INTERNAL });
});

test('media delete: a hand-built request with no params falls back to an empty workspace id and 404s', async () => {
  const { app } = mediaApp(register);
  const { res, capture } = createCapturingResponse();
  await extractRouteHandler(app, 'delete', ROUTE)({ params: {} }, res);
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: 'workspace was not found' } });
});

test('media delete: a hand-built request with no media id authorizes and purges the empty id', async () => {
  const calls: unknown[] = [];
  const { app } = mediaApp(register, { authorize: async (params) => { calls.push(params); return { allowed: true, reason: 'matched' }; } });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: 'owner' };
  await extractRouteHandler(app, 'delete', ROUTE)({ params: { workspaceId: WS } }, res);
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "media '' was not found" } });
  assert.deepEqual(calls, [{ principalId: 'owner', permission: 'media.delete.force', workspaceId: WS, entityType: 'media', entityId: '' }]);
});
