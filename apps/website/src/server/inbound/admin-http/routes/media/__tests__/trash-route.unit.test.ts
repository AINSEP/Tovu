import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { BASE, INTERNAL, WS } from '#src/server/__tests__/helpers/admin-route-failures';
import { registerAdminMediaTrashRoute } from '../trash.js';
import { forbiddenBody, mediaApp, PNG_BASE64, seedPng } from './media-route-harness.js';

const ROUTE = '/api/admin/v1/workspaces/:workspaceId/media/:mediaId/trash';
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64').byteLength;

test('media trash: denial writes the exact 403 body for media.delete and names the asset to authorize', async () => {
  const calls: unknown[] = [];
  const { app } = mediaApp(registerAdminMediaTrashRoute, { authorize: async (params) => { calls.push(params); return { allowed: false, reason: 'no_grant' }; } });
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media/asset-1/trash`), { status: 403, body: forbiddenBody('media.delete') });
  assert.deepEqual(calls, [{ principalId: 'owner', permission: 'media.delete', workspaceId: WS, entityType: 'media', entityId: 'asset-1' }]);
});

test('media trash: an unknown asset is 404 before any removal', async (t) => {
  const { app, deps } = mediaApp(registerAdminMediaTrashRoute);
  const remove = t.mock.method(deps, 'removeMedia');
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media/missing/trash`), { status: 404, body: { error: "media 'missing' was not found" } });
  assert.equal(remove.mock.callCount(), 0);
});

test('media trash: success returns the re-read trashed asset with its recorded type, public URL and size', async () => {
  const { app } = mediaApp(registerAdminMediaTrashRoute);
  const id = await seedPng(app);
  const result = await dispatchJsonRequest(app, 'POST', `${BASE}/media/${id}/trash`);
  assert.equal(result.status, 200);
  const media = (result.body as { media: { id: string; status: string; contentType: string; publicUrl: string | null; byteSize: number | null } }).media;
  assert.deepEqual({ id: media.id, status: media.status, contentType: media.contentType, publicUrl: media.publicUrl, byteSize: media.byteSize },
    { id, status: 'trashed', contentType: 'image/png', publicUrl: null, byteSize: PNG_BYTES });
});

test('media trash: an unknown stored size and public URL are reported as null', async (t) => {
  const { app, deps } = mediaApp(registerAdminMediaTrashRoute);
  const id = await seedPng(app);
  t.mock.method(deps.assetBlobRepo, 'findByHash', async () => null);
  const result = await dispatchJsonRequest(app, 'POST', `${BASE}/media/${id}/trash`);
  const media = (result.body as { media: { publicUrl: string | null; byteSize: number | null } }).media;
  assert.deepEqual({ status: result.status, publicUrl: media.publicUrl, byteSize: media.byteSize }, { status: 200, publicUrl: null, byteSize: null });
});

test('media trash: an unexpected repository failure is a private 500', async (t) => {
  const { app, deps } = mediaApp(registerAdminMediaTrashRoute);
  t.mock.method(deps.mediaRepo, 'findById', async () => { throw new Error('private store failure'); });
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media/asset-1/trash`), { status: 500, body: INTERNAL });
});

test('media trash: a hand-built request with no params falls back to an empty workspace id and 404s', async () => {
  const { app } = mediaApp(registerAdminMediaTrashRoute);
  const { res, capture } = createCapturingResponse();
  await extractRouteHandler(app, 'post', ROUTE)({ params: {} }, res);
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: 'workspace was not found' } });
});

test('media trash: a hand-built request with no media id authorizes and looks up the empty id', async () => {
  const calls: unknown[] = [];
  const { app } = mediaApp(registerAdminMediaTrashRoute, { authorize: async (params) => { calls.push(params); return { allowed: true, reason: 'matched' }; } });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: 'owner' };
  await extractRouteHandler(app, 'post', ROUTE)({ params: { workspaceId: WS } }, res);
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "media '' was not found" } });
  assert.deepEqual(calls, [{ principalId: 'owner', permission: 'media.delete', workspaceId: WS, entityType: 'media', entityId: '' }]);
});
