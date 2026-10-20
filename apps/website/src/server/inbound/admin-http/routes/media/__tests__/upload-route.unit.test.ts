import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_DOCUMENT_BYTES } from '@jini-ai/cms/media';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { createCapturingResponse, extractRouteHandler } from '#src/server/__tests__/helpers/http-test-server';
import { BASE, fixture, WS, type Deps } from '#src/server/__tests__/helpers/admin-route-failures';
import { registerAdminMediaUploadRoute } from '../upload.js';
import { forbiddenBody, PNG_BASE64 } from './media-route-harness.js';

const ROUTE = '/api/admin/v1/workspaces/:workspaceId/media';
const png = { filename: 'pixel.png', contentType: 'image/png', dataBase64: PNG_BASE64 };
const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0h10v10z"/></svg>';
type Uploaded = { media: { id: string; kind: string; contentType: string; byteSize: number | null; sha256: string } };

test('media upload: denial writes the exact 403 body for media.upload without naming an entity', async () => {
  const calls: unknown[] = [];
  const authorize: Deps['authorize'] = async (params) => { calls.push(params); return { allowed: false, reason: 'no_grant' }; };
  const { app } = fixture(registerAdminMediaUploadRoute, { authorize });
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media`, png), { status: 403, body: forbiddenBody('media.upload') });
  assert.deepEqual(calls, [{ principalId: 'owner', permission: 'media.upload', workspaceId: WS, entityType: 'media' }]);
});

test('media upload: an unknown kind is refused with 400 before authorization', async () => {
  let checks = 0;
  const { app } = fixture(registerAdminMediaUploadRoute, { authorize: async () => { checks++; return { allowed: true, reason: 'matched' }; } });
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media`, { ...png, kind: 'video' }), { status: 400, body: { error: 'invalid media kind' } });
  assert.equal(checks, 0);
});

test('media upload: an empty filename is refused as a missing required field', async () => {
  const { app } = fixture(registerAdminMediaUploadRoute);
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media`, { ...png, filename: '' }), {
    status: 400, body: { error: 'filename, contentType, and dataBase64 are required' },
  });
});

test('media upload: a document whose base64 could only inflate past the limit is refused before decoding', async (t) => {
  const { app, deps } = fixture(registerAdminMediaUploadRoute);
  const put = t.mock.method(deps.blobStore, 'put');
  const dataBase64 = 'A'.repeat(4 * Math.ceil(MAX_DOCUMENT_BYTES / 3) + 4);
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media`, { kind: 'document', filename: 'big.txt', dataBase64 }), {
    status: 400, body: { error: 'document exceeds the 10 MiB limit' },
  });
  assert.equal(put.mock.callCount(), 0);
});

test('media upload: a document needs no declared type, takes its type from the filename and skips the sniff cache', async (t) => {
  const { app, deps } = fixture(registerAdminMediaUploadRoute);
  const set = t.mock.method(deps.mediaContentTypeStore, 'set');
  const text = Buffer.from('hello');
  const result = await dispatchJsonRequest(app, 'POST', `${BASE}/media`, { kind: 'document', filename: 'notes.txt', dataBase64: text.toString('base64') });
  assert.equal(result.status, 201);
  const { media } = result.body as Uploaded;
  assert.deepEqual({ kind: media.kind, contentType: media.contentType, byteSize: media.byteSize }, { kind: 'document', contentType: 'text/plain', byteSize: text.byteLength });
  assert.equal(set.mock.callCount(), 0);
});

test('media upload: an image records its sniffed type and reports the uploaded byte length', async (t) => {
  const { app, deps } = fixture(registerAdminMediaUploadRoute);
  const set = t.mock.method(deps.mediaContentTypeStore, 'set');
  const result = await dispatchJsonRequest(app, 'POST', `${BASE}/media`, { ...png, contentType: 'image/jpeg' });
  assert.equal(result.status, 201);
  const { media } = result.body as Uploaded;
  assert.deepEqual({ contentType: media.contentType, byteSize: media.byteSize }, { contentType: 'image/png', byteSize: Buffer.from(PNG_BASE64, 'base64').byteLength });
  assert.deepEqual(set.mock.calls.map((call) => call.arguments), [[{ workspaceId: WS, sha256: media.sha256, contentType: 'image/png' }]]);
});

test('media upload: an SVG reports its stored (sanitized) size, and null when that size is unknown', async (t) => {
  const { app, deps } = fixture(registerAdminMediaUploadRoute);
  const stored = await dispatchJsonRequest(app, 'POST', `${BASE}/media`, { ...png, filename: 'logo.svg', dataBase64: Buffer.from(svg).toString('base64') });
  assert.equal(stored.status, 201);
  const { media } = stored.body as Uploaded;
  const blob = await deps.assetBlobRepo.findByHash({ workspaceId: WS, sha256: media.sha256 });
  assert.ok(blob);
  assert.equal(media.byteSize, (await deps.blobStore.get({ storageKey: blob.storageKey })).byteLength);
  assert.notEqual(media.byteSize, Buffer.byteLength(svg));
  t.mock.method(deps.assetBlobRepo, 'findByHash', async () => null);
  const unknown = await dispatchJsonRequest(app, 'POST', `${BASE}/media`, { ...png, filename: 'other.svg', dataBase64: Buffer.from(svg.replace('10', '20')).toString('base64') });
  assert.equal(unknown.status, 201);
  assert.equal((unknown.body as Uploaded).media.byteSize, null);
});

test('media upload: a hand-built request with no params falls back to an empty workspace id and 404s', async () => {
  const { app } = fixture(registerAdminMediaUploadRoute);
  const { res, capture } = createCapturingResponse();
  await extractRouteHandler(app, 'post', ROUTE)({ params: {} }, res);
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: 'workspace was not found' } });
});

test('media upload: a hand-built request with no body is refused as missing required fields', async () => {
  const { app } = fixture(registerAdminMediaUploadRoute);
  const { res, capture } = createCapturingResponse();
  await extractRouteHandler(app, 'post', ROUTE)({ params: { workspaceId: WS } }, res);
  assert.deepEqual(capture, { statusCode: 400, jsonBody: { error: 'filename, contentType, and dataBase64 are required' } });
});
