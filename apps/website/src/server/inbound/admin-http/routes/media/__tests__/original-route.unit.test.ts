import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { createCapturingResponse, extractRouteHandler, startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { BASE, INTERNAL, WS } from '#src/server/__tests__/helpers/admin-route-failures';
import { registerAdminMediaOriginalRoute } from '../original.js';
import { forbiddenBody, mediaApp, PNG_BASE64, seedPng } from './media-route-harness.js';

const ROUTE = '/api/admin/v1/workspaces/:workspaceId/media/:mediaId/original';

test('media original: denial writes the exact 403 body for media.read and names the asset to authorize', async () => {
  const calls: unknown[] = [];
  const { app } = mediaApp(registerAdminMediaOriginalRoute, { authorize: async (params) => { calls.push(params); return { allowed: false, reason: 'no_grant' }; } });
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/media/asset-1/original`), { status: 403, body: forbiddenBody('media.read') });
  assert.deepEqual(calls, [{ principalId: 'owner', permission: 'media.read', workspaceId: WS, entityType: 'media', entityId: 'asset-1' }]);
});

test('media original: an image is served inline with its sniffed type and the exact bytes', async (t) => {
  const { app } = mediaApp(registerAdminMediaOriginalRoute);
  const id = await seedPng(app);
  const origin = await startTestServer(app, t);
  const response = await fetch(`${origin}${BASE}/media/${id}/original`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('content-disposition'), null);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(PNG_BASE64, 'base64'));
});

test('media original: a document title with a lone surrogate is encoded as U+FFFD instead of failing', async (t) => {
  const { app, deps } = mediaApp(registerAdminMediaOriginalRoute);
  const id = await seedPng(app, { kind: 'document', filename: 'notes.txt', contentType: undefined, dataBase64: Buffer.from('hello').toString('base64') });
  const stored = await deps.mediaRepo.findById({ workspaceId: WS, id });
  assert.ok(stored);
  t.mock.method(deps.mediaRepo, 'findBySlug', async () => null);
  t.mock.method(deps.mediaRepo, 'findById', async () => ({ ...stored, title: 'a\uD800b' }));
  const origin = await startTestServer(app, t);
  const response = await fetch(`${origin}${BASE}/media/${id}/original`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-disposition'), "attachment; filename=\"document\"; filename*=UTF-8''a%EF%BF%BDb.txt");
  assert.equal(await response.text(), 'hello');
});

test('media original: a blob store failure is a private 500', async (t) => {
  const { app, deps } = mediaApp(registerAdminMediaOriginalRoute);
  const id = await seedPng(app);
  t.mock.method(deps.blobStore, 'get', async () => { throw new Error('private disk failure'); });
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/media/${id}/original`), { status: 500, body: INTERNAL });
});

test('media original: a media row whose source blob is missing is a data-integrity 500, not a 404', async (t) => {
  const { app, deps } = mediaApp(registerAdminMediaOriginalRoute);
  const id = await seedPng(app);
  t.mock.method(deps.assetBlobRepo, 'findByHash', async () => null);
  const get = t.mock.method(deps.blobStore, 'get');
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/media/${id}/original`), { status: 500, body: INTERNAL });
  assert.equal(get.mock.callCount(), 0);
});

test('media original: a hand-built request with no params falls back to an empty workspace id and 404s', async () => {
  const { app } = mediaApp(registerAdminMediaOriginalRoute);
  const { res, capture } = createCapturingResponse();
  await extractRouteHandler(app, 'get', ROUTE)({ params: {} }, res);
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: 'workspace was not found' } });
});

test('media original: a hand-built request with no media id authorizes and looks up the empty id', async () => {
  const calls: unknown[] = [];
  const { app } = mediaApp(registerAdminMediaOriginalRoute, { authorize: async (params) => { calls.push(params); return { allowed: true, reason: 'matched' }; } });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: 'owner' };
  await extractRouteHandler(app, 'get', ROUTE)({ params: { workspaceId: WS } }, res);
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "media '' was not found" } });
  assert.deepEqual(calls, [{ principalId: 'owner', permission: 'media.read', workspaceId: WS, entityType: 'media', entityId: '' }]);
});
