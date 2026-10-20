import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { BASE, WS } from '#src/server/__tests__/helpers/admin-route-failures';
import type { Deps } from '#src/server/__tests__/helpers/admin-route-failures';
import type { Express } from 'express';
import { registerAdminMediaTextRoute } from '../text.js';
import { mediaApp, seedPng } from './media-route-harness.js';

const register = (app: Express, deps: Deps) => registerAdminMediaTextRoute({ app, deps });
const seedDocument = (app: Express) => seedPng(app, { kind: 'document', filename: 'notes.txt', contentType: undefined, dataBase64: Buffer.from('hello world').toString('base64') });

test('media text: every response, even a foreign workspace 404, is private and nosniff', async (t) => {
  const { app } = mediaApp(register);
  const origin = await startTestServer(app, t);
  const response = await fetch(`${origin}/api/admin/v1/workspaces/other/media/asset-1/text`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'workspace was not found' });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('media text: denial writes its own 403 body and names the asset to authorize', async () => {
  const calls: unknown[] = [];
  const { app } = mediaApp(register, { authorize: async (params) => { calls.push(params); return { allowed: false, reason: 'no_grant' }; } });
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/media/asset-1/text`), { status: 403, body: { error: 'media.read is required', code: 'FORBIDDEN' } });
  assert.deepEqual(calls, [{ principalId: 'owner', permission: 'media.read', workspaceId: WS, entityType: 'media', entityId: 'asset-1' }]);
});

test('media text: without an offset the document is read from byte 0', async () => {
  const { app } = mediaApp(register);
  const id = await seedDocument(app);
  const result = await dispatchJsonRequest(app, 'GET', `${BASE}/media/${id}/text`);
  assert.equal(result.status, 200);
  assert.equal((result.body as { text: string }).text, 'hello world');
});

test('media text: a numeric offset pages from that byte', async () => {
  const { app } = mediaApp(register);
  const id = await seedDocument(app);
  const result = await dispatchJsonRequest(app, 'GET', `${BASE}/media/${id}/text?offset=6`);
  assert.equal(result.status, 200);
  assert.equal((result.body as { text: string }).text, 'world');
});

test('media text: an offset past the document is a 400 with the domain message', async () => {
  const { app } = mediaApp(register);
  const id = await seedDocument(app);
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/media/${id}/text?offset=99`), {
    status: 400, body: { error: 'invalid document size or UTF-8 byte offset' },
  });
});

test('media text: a non-document asset is 404 with the domain message', async () => {
  const { app } = mediaApp(register);
  const id = await seedPng(app);
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/media/${id}/text`), { status: 404, body: { error: 'document was not found' } });
});
