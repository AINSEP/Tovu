import '#src/platform/site-dir/__tests__/helpers/isolated-catalog-home';
import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchJsonRequest } from '#src/server/__tests__/helpers/in-process-http';
import { registerAdminMediaDeleteRoute } from '../delete.js';
import { registerAdminMediaImportUrlRoute } from '../import-url.js';
import { registerAdminMediaListRoute } from '../list.js';
import { registerAdminMediaOriginalRoute, resolveMediaOriginalBlob } from '../original.js';
import { registerAdminMediaPutProvidersRoute } from '../put-providers.js';
import { registerAdminMediaReplaceRoute } from '../replace.js';
import { registerAdminMediaTextRoute } from '../text.js';
import { registerAdminMediaTrashRoute } from '../trash.js';
import { registerAdminMediaUploadRoute } from '../upload.js';
import { registerAdminMediaWhereUsedRoute } from '../where-used.js';
import { EgressRefusedError } from '#src/platform/http/index';
import { MAX_DOCUMENT_BYTES } from '@jini-ai/cms/media';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { WS, BASE, INTERNAL, allowed, fixture, testRouteFailureMatrix, type RouteFailureCase } from '#src/server/__tests__/helpers/admin-route-failures';

const routes: RouteFailureCase[] = [
  { name: 'media delete', register: registerAdminMediaDeleteRoute, method: 'DELETE', path: `${BASE}/media/media` },
  { name: 'media import', register: (app, deps) => registerAdminMediaImportUrlRoute({ app, deps }), method: 'POST', path: `${BASE}/media/import-url` },
  { name: 'media list', register: registerAdminMediaListRoute, method: 'GET', path: `${BASE}/media` },
  { name: 'media original', register: registerAdminMediaOriginalRoute, method: 'GET', path: `${BASE}/media/media/original` },
  { name: 'media providers', register: registerAdminMediaPutProvidersRoute, method: 'PUT', path: `${BASE}/media/providers`, coded: true },
  { name: 'media replace', register: (app, deps) => registerAdminMediaReplaceRoute({ app, deps }), method: 'POST', path: `${BASE}/media/media/replace` },
  { name: 'media text', register: (app, deps) => registerAdminMediaTextRoute({ app, deps }), method: 'GET', path: `${BASE}/media/media/text` },
  { name: 'media trash', register: registerAdminMediaTrashRoute, method: 'POST', path: `${BASE}/media/media/trash` },
  { name: 'media upload', register: registerAdminMediaUploadRoute, method: 'POST', path: `${BASE}/media`, body: { filename: 'a.png', contentType: 'image/png', dataBase64: 'YQ==' } },
  { name: 'media usage', register: (app, deps) => registerAdminMediaWhereUsedRoute({ app, deps }), method: 'GET', path: `${BASE}/media/media/where-used` },
];

testRouteFailureMatrix(routes);

for (const reason of ['not-found', 'version-changed']) {
  test(`media trash: concurrent ${reason} does not report a successful trash`, async () => {
    let input: unknown;
    let reads = 0;
    const { app } = fixture(registerAdminMediaTrashRoute, {
      mediaRepo: { findById: async () => { reads++; return { id: 'media', title: 'Photo', slug: 'photo', version: 7 }; } },
      clock: { nowIso: () => '2026-10-19T00:00:00.000Z' },
      removeMedia: async (value: unknown) => { input = value; return { ok: false, reason }; },
    });
    assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media/media/trash`), {
      status: reason === 'not-found' ? 404 : 409,
      body: { error: reason === 'not-found' ? "media 'media' was not found" : "media 'media' changed while it was being trashed" },
    });
    assert.equal(reads, 1);
    assert.deepEqual(input, { workspaceId: WS, id: 'media', display: { title: 'Photo', subtitle: 'photo' },
      at: '2026-10-19T00:00:00.000Z', expectedVersion: 7, actor: { principalId: 'owner' } });
  });
}

test('media trash: disappearance after successful marker flip is 404', async () => {
  let reads = 0;
  const { app } = fixture(registerAdminMediaTrashRoute, {
    mediaRepo: { findById: async () => ++reads === 1 ? { title: 'Photo', slug: 'photo', version: 1 } : null },
    removeMedia: async () => ({ ok: true }),
  });
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media/media/trash`), { status: 404, body: { error: "media 'media' was not found" } });
  assert.equal(reads, 2);
});

for (const body of [undefined, null, [], 'https://example.com/a.png', {}, { url: ' ' }, { url: 1 }]) {
  test(`media import: malformed input ${JSON.stringify(body)} never reaches outbound HTTP`, async () => {
    let requests = 0;
    const { app } = fixture((app, deps) => registerAdminMediaImportUrlRoute({ app, deps }), {
      mediaImportHttpClient: { send: async () => { requests++; throw new Error('must not fetch'); } },
    });
    assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media/import-url`, body), { status: 400, body: { error: 'url is required' } });
    assert.equal(requests, 0);
  });
}

for (const query of ['?offset=-1', '?offset=1.5', '?offset[]=1', '?offset=NaN']) {
  test(`media text: rejects invalid byte paging ${query}`, async () => {
    let reads = 0;
    const { app } = fixture((app, deps) => registerAdminMediaTextRoute({ app, deps }), { mediaRepo: { findById: async () => { reads++; return null; } } });
    assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/media/media/text${query}`), {
      status: 400, body: { error: 'offset must be a non-negative byte offset' },
    });
    assert.equal(reads, 0);
  });
}

test('media replace: incomplete transactional capability refuses before decoding bytes', async () => {
  const { app } = fixture((app, deps) => registerAdminMediaReplaceRoute({ app, deps }), {
    mediaRepo: { findById: async () => ({ id: 'media', status: 'active' }), replaceFileIfVersion: async () => true },
  });
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media/media/replace`, { filename: 'bad' }), {
    status: 503, body: { error: 'media file replacement is unavailable', code: 'MEDIA_REPLACE_UNAVAILABLE' },
  });
});

for (const thrown of [new Error('private fetch failure'), new EgressRefusedError({ message: 'DNS 10.0.0.1' }, { callerSafeMessage: 'Target is not public' })]) {
  test(`media import: ${thrown.name} keeps transport details out of the response`, async () => {
    const logs: string[] = [];
    const { app, deps } = fixture((app, deps) => registerAdminMediaImportUrlRoute({ app, deps }, { logEgressRefusal: line => logs.push(line) }), {
      mediaImportHttpClient: { send: async () => { throw thrown; } },
    });
    assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media/import-url`, { url: 'https://example.com/photo.png' }), {
      status: thrown instanceof EgressRefusedError ? 400 : 500,
      body: thrown instanceof EgressRefusedError ? { error: 'Target is not public' } : INTERNAL,
    });
    assert.equal(logs.length, thrown instanceof EgressRefusedError ? 1 : 0);
    if (thrown instanceof EgressRefusedError) assert.match(logs[0]!, /DNS 10\.0\.0\.1/);
    assert.deepEqual(await deps.mediaRepo.list({ workspaceId: WS }), []);
  });
}

for (const [label, sizeOf, bytes] of [
  ['no size capability', undefined, Buffer.from('hello')],
  ['unknown size', async () => null, Buffer.from('hello')],
  ['bounded size', async () => 5, Buffer.from('hello')],
  ['oversized size', async () => MAX_DOCUMENT_BYTES + 1, Buffer.from('hello')],
  ['oversized bytes', async () => null, Buffer.alloc(MAX_DOCUMENT_BYTES + 1)],
] as const) {
  test(`document original: ${label} enforces size bounds and safe attachment headers`, async t => {
    let reads = 0;
    const filename = "report'(!)*.txt";
    const media = { id: 'media', slug: 'report', status: 'active', kind: 'document', title: "report'(!)*", originalFilename: filename, source: { sha256: 'hash' } };
    const { app } = fixture(registerAdminMediaOriginalRoute, {
      mediaRepo: { findBySlug: async () => media, findById: async () => media },
      assetBlobRepo: { findByHash: async () => ({ storageKey: 'private-key' }) },
      blobStore: { sizeOf, get: async () => { reads++; return bytes; } },
    });
    const origin = await startTestServer(app, t);
    const response = await fetch(`${origin}${BASE}/media/media/original`);
    if (label.startsWith('oversized')) {
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), INTERNAL);
      assert.equal(reads, label === 'oversized size' ? 0 : 1);
    } else {
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'hello');
      // Express adds UTF-8 when setting the text/plain response header.
      assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('content-disposition'), "attachment; filename=\"document\"; filename*=UTF-8''report%27%28%21%29%2A.txt");
      assert.equal(reads, 1);
    }
  });
}

test('media original: callers can supply their own not-found response without reading a blob', async () => {
  let reads = 0;
  let resolved: unknown = 'not called';
  const { app } = fixture((app, deps) => {
    app.get('/original-missing', async (_req, res) => {
      resolved = await resolveMediaOriginalBlob(deps, res, { workspaceId: WS, mediaId: 'unknown' }, target => {
        target.status(404).json({ error: 'public response' });
      });
    });
  }, { mediaRepo: { findBySlug: async () => null, findById: async () => null }, assetBlobRepo: { findByHash: async () => { reads++; return null; } } });
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', '/original-missing'), { status: 404, body: { error: 'public response' } });
  assert.equal(resolved, null);
  assert.equal(reads, 0);
});

for (const body of [undefined, { filename: 'file', dataBase64: 'YQ==' }, { filename: 'file', contentType: 'image/png' },
  { filename: 'file', contentType: 'image/png', dataBase64: 7 }]) {
  test(`media upload: incomplete payload ${JSON.stringify(body)} is rejected before authorization or storage`, async () => {
    let checks = 0;
    const { app } = fixture(registerAdminMediaUploadRoute, { authorize: async () => { checks++; return { allowed: true }; } });
    assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media`, body), { status: 400, body: { error: 'filename, contentType, and dataBase64 are required' } });
    assert.equal(checks, 0);
  });
}

test('media upload: JSON that cannot be converted to a content-type string returns a private parser failure', async () => {
  let checks = 0;
  const { app } = fixture(registerAdminMediaUploadRoute, { authorize: async () => { checks++; return { allowed: true }; } });
  const body = { filename: 'file.png', contentType: { toString: null, valueOf: null }, dataBase64: 'YQ==' };
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media`, body), { status: 500, body: INTERNAL });
  assert.equal(checks, 0);
});

test('document original: a legacy record without an original filename fails privately', async () => {
  const media = { id: 'media', kind: 'document', status: 'active', title: 'Legacy', source: { sha256: 'hash' } };
  const { app } = fixture(registerAdminMediaOriginalRoute, {
    mediaRepo: { findById: async () => media },
    assetBlobRepo: { findByHash: async () => ({ storageKey: 'original' }) },
    blobStore: { get: async () => Buffer.from('legacy') },
  });
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/media/media/original`), { status: 500, body: INTERNAL });
});

for (const body of [undefined, { filename: 'file', contentType: 'image/png' }, { filename: 'file', contentType: 1, dataBase64: 'YQ==' },
  { filename: 'file', contentType: 'image/png', dataBase64: 1 }, { filename: ' ', contentType: 'image/png', dataBase64: 'YQ==' }]) {
  test(`media replace: malformed replacement ${JSON.stringify(body)} leaves the source unchanged`, async () => {
    let writes = 0;
    const { app } = fixture((app, deps) => registerAdminMediaReplaceRoute({ app, deps }), {
      mediaRepo: { findById: async () => ({ id: 'media', status: 'active' }),
        replaceFileIfVersion: async () => { writes++; }, saveRenditionIfSource: async () => { writes++; } },
    });
    assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media/media/replace`, body), {
      status: 400, body: { error: 'filename, contentType, and dataBase64 are required' },
    });
    assert.equal(writes, 0);
  });
}

test('media providers: omitted provider map clears the whole set', async () => {
  const { app, deps } = fixture(registerAdminMediaPutProvidersRoute);
  const saved = await dispatchJsonRequest(app, 'PUT', `${BASE}/media/providers`, { openai: { apiKey: 'test-key' } });
  assert.equal(saved.status, 200);
  assert.deepEqual(await dispatchJsonRequest(app, 'PUT', `${BASE}/media/providers`), { status: 200, body: {} });
  assert.deepEqual(await deps.mediaProviderCredentialRepo.listByWorkspaceId(WS), []);
});

test('media list: documents include only active records and keep their type tied to filename', async t => {
  const { app, deps } = fixture(registerAdminMediaListRoute);
  const record = { id: 'active-doc', workspaceId: WS, kind: 'document' as const, slug: 'document', title: 'Document',
    originalFilename: 'document.txt', status: 'active' as const, version: 1, source: { sha256: 'same-bytes' },
    alt: '', caption: '', credit: '', width: null, height: null, cssClass: null, htmlAttributes: null,
    createdAt: '2026-10-19T00:00:00.000Z', updatedAt: '2026-10-19T00:00:00.000Z', createdBy: 'owner' };
  await deps.mediaRepo.save(record);
  await deps.mediaRepo.save({ ...record, id: 'trashed-doc', slug: 'trashed', status: 'trashed' });
  const origin = await startTestServer(app, t);
  const response = await fetch(`${origin}${BASE}/media?kind=document`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json() as { media: Array<{ id: string; contentType: string; publicUrl: string | null }> };
  assert.deepEqual(body.media.map(row => ({ id: row.id, contentType: row.contentType, publicUrl: row.publicUrl })), [{ id: 'active-doc', contentType: 'text/plain', publicUrl: null }]);
});

test('media list: an unknown ?kind is a 400 before authorization or any repository read', async () => {
  let authorizations = 0;
  let reads = 0;
  const { app } = fixture(registerAdminMediaListRoute, {
    authorize: async () => { authorizations++; return { allowed: true, reason: 'matched' }; },
    mediaRepo: { list: async () => { reads++; return []; } },
  });
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/media?kind=video`), { status: 400, body: { error: 'invalid media kind' } });
  assert.equal(authorizations, 0);
  assert.equal(reads, 0);
});

test('media import: with no injected logger, an egress refusal\'s full diagnosis goes to the operator console only', async t => {
  const warnings: unknown[][] = [];
  t.mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args); });
  const { app } = fixture((app, deps) => registerAdminMediaImportUrlRoute({ app, deps }), {
    mediaImportHttpClient: { send: async () => { throw new EgressRefusedError({ message: 'DNS 10.0.0.1' }, { callerSafeMessage: 'Target is not public' }); } },
  });
  assert.deepEqual(await dispatchJsonRequest(app, 'POST', `${BASE}/media/import-url`, { url: 'https://example.com/photo.png' }), {
    status: 400, body: { error: 'Target is not public' },
  });
  assert.deepEqual(warnings, [['[media-import] admin URL import refused: DNS 10.0.0.1']]);
});

test('media text: valid paging of an absent document is 404 and repository failure is 500', async () => {
  for (const [findById, status] of [[async () => null, 404], [async () => { throw new Error('private'); }, 500]] as const) {
    const { app } = fixture((app, deps) => registerAdminMediaTextRoute({ app, deps }), { mediaRepo: { findById } });
    const response = await dispatchJsonRequest(app, 'GET', `${BASE}/media/media/text?offset=0`);
    assert.equal(response.status, status);
    assert.deepEqual(response.body, status === 500 ? INTERNAL : { error: 'document was not found' });
  }
});

test('media usage: unknown asset is 404 and no reference information is queried', async () => {
  let queries = 0;
  const { app } = fixture((app, deps) => registerAdminMediaWhereUsedRoute({ app, deps }), {
    mediaRepo: { findById: async () => null },
    entryRefsRepo: { findByTarget: async () => { queries++; return []; } },
    postRepo: { list: async () => { queries++; return []; } },
  });
  assert.deepEqual(await dispatchJsonRequest(app, 'GET', `${BASE}/media/media/where-used`), { status: 404, body: { error: 'media was not found' } });
  assert.equal(queries, 0);
});
