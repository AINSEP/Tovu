/** L1 step 3: RED on old code (documents rejected, no text route, no kind isolation). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { DocumentTextExtractionError } from '@jini-ai/cms/media';
import { buildZipFixture } from '#src/features/agent-plugins/__tests__/fixtures/build-zip';
import { startTestServer } from '#src/server/__tests__/helpers/http-test-server';
import { downloadDocuments } from '#src/features/media/__tests__/download-documents.fixture';
import { libraryFixture } from '#src/features/media/__tests__/library.fixture';
import { registerMediaRenditionRoute, registerMediaOriginalVideoRoute } from '#src/server/inbound/public-http/routes/site/media-rendition';
import type { MediaRenditionRouteDeps } from '../deps.js';
import { registerAdminMediaUploadRoute } from '../upload.js';
import { registerAdminMediaListRoute } from '../list.js';
import { registerAdminMediaUpdateRoute } from '../update.js';
import { registerAdminMediaOriginalRoute } from '../original.js';
import { registerAdminMediaTrashRoute } from '../trash.js';
import { registerAdminMediaTextRoute } from '../text.js';
import { resolveMediaPublicUrls } from '#src/features/media/tool-registrations';

function appFixture() {
  const { deps, deny } = libraryFixture(); const app = express();
  app.use(express.json({ limit: '16mb' }));
  app.use((_req, res, next) => { res.locals.principal = { id: 'owner' }; next(); });
  for (const register of [registerAdminMediaUploadRoute, registerAdminMediaListRoute, registerAdminMediaUpdateRoute, registerAdminMediaOriginalRoute, registerAdminMediaTrashRoute]) register(app, deps);
  registerAdminMediaTextRoute({ app, deps });
  // Private documents must short-circuit before unrelated post/member lookups.
  registerMediaRenditionRoute(app, deps as MediaRenditionRouteDeps);
  registerMediaOriginalVideoRoute(app, deps as MediaRenditionRouteDeps);
  return { app, deps, deny };
}
const root = '/api/admin/v1/workspaces/site-a/media';
async function post(base: string, suffix: string, body: unknown, method = 'POST') {
  return fetch(base + suffix, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function docx() {
  return buildZipFixture([
    { path: '[Content_Types].xml', content: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { path: '_rels/.rels', content: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { path: 'word/document.xml', content: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>' },
  ]);
}

test('Library HTTP: allowed formats ignore MIME labels, list/download/rename/text preserve bytes and metadata', async t => {
  const { app, deps } = appFixture(); const base = await startTestServer(app, t);
  for (const [filename, bytes] of [['guide.md', Buffer.from('# Guide')], ['notes.txt', Buffer.from('notes')],
    ['table.csv', Buffer.from('a,b\n1,2')], ['data.json', Buffer.from('{"ok":true}')],
    ['manual.pdf', Buffer.from('%PDF-1.7\n%%EOF')], ['word.docx', await docx()], ...Object.entries(await downloadDocuments({})).map(([ext, bytes]) => [`download.${ext}`, bytes] as const)] as const) {
    const response = await post(base, root, { kind: 'document', filename, contentType: 'image/png', dataBase64: bytes.toString('base64') });
    assert.equal(response.status, 201, await response.clone().text());
    const { media } = await response.json();
    assert.equal(media.kind, 'document'); assert.equal(media.originalFilename, filename);
    assert.equal(media.publicUrl, null); assert.equal(media.byteSize, bytes.length); assert.equal(media.createdBy, 'owner');
    const renamed = await post(base, `${root}/${media.id}`, { title: 'New name' }, 'PATCH'); assert.equal(renamed.status, 200);
    assert.equal((await renamed.json()).media.sha256, media.sha256);
    const download = await fetch(`${base}${root}/${media.id}/original`);
    assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    assert.equal(download.headers.get('cache-control'), 'private, no-store');
    assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
    assert.match(download.headers.get('content-disposition')!, /attachment;.*filename\*=UTF-8''New%20name\./);
    const text = await fetch(`${base}${root}/${media.id}/text`);
    if (/\.(doc|xls|rtf|xlsx|pptx|pages|key)$/.test(filename)) assert.match((await text.clone().json()).error, /download only; text extraction is unavailable/);
    assert.equal(text.status, /\.(pdf|docx|doc|xls|rtf|xlsx|pptx|pages|key)$/.test(filename) ? 400 : 200, `${filename}: ${await text.clone().text()}`);
    if (/\.(pdf|docx)$/.test(filename)) assert.deepEqual(await text.json(), {
      code: 'DOCUMENT_TEXT_UNAVAILABLE', error: 'extraction unavailable — configure a document-text adapter for this format',
    });
  }
  assert.equal((await (await fetch(base + root)).json()).media.length, 0, 'both media pickers use this default list');
  const listed = (await (await fetch(base + root + '?kind=document')).json()).media;
  assert.equal(listed.length, 13);
  const rows = await deps.mediaRepo.list({ workspaceId: deps.workspaceId });
  assert.ok([...(await resolveMediaPublicUrls(deps, rows)).values()].every(url => url === null));
  for (const row of rows) for (const key of [row.id, row.slug]) for (const suffix of [
    '/original', '/public.v1/private.png',
    `/original?v=${row.source.sha256.slice(0, 12)}`, `/public.v1/private.png?v=${row.source.sha256.slice(0, 12)}`,
  ]) {
    const result = await fetch(`${base}/m/${key}${suffix}`); assert.equal(result.status, 404);
    assert.match(result.headers.get('cache-control')!, /no-store/);
  }
});

test('Library HTTP: configured text extraction returns its page; typed failures are 400 and unexpected failures stay private', async t => {
  const { app, deps } = appFixture(); const base = await startTestServer(app, t);
  const bytes = Buffer.from('%PDF-1.7\n%%EOF');
  const text = 'Extracted PDF text';
  const extractor = { contentType: 'application/pdf', async extract(input: { bytes: Uint8Array; limits: { maxPages: number; maxCharacters: number } }, _optional = {}) {
    assert.deepEqual(Buffer.from(input.bytes), bytes);
    assert.deepEqual(input.limits, { maxPages: 100, maxCharacters: 1_000_000 });
    return { text, truncated: false, pagesRead: 1, totalPages: 1 };
  } };
  deps.documentTextExtractors = [extractor];
  const uploaded = await post(base, root, { kind: 'document', filename: 'guide.pdf', dataBase64: bytes.toString('base64') });
  assert.equal(uploaded.status, 201);
  const { media } = await uploaded.json();
  const page = await fetch(`${base}${root}/${media.id}/text`);
  assert.equal(page.status, 200);
  assert.deepEqual(await page.json(), { id: media.id, text, offset: 0, nextOffset: null,
    totalBytes: Buffer.byteLength(text), truncated: false, untrusted: true, extractionTruncated: false, pagesRead: 1, totalPages: 1 });
  extractor.extract = async () => { throw new DocumentTextExtractionError({ code: 'DOCUMENT_TEXT_FAILED', message: 'PDF text extraction failed' }); };
  const failed = await fetch(`${base}${root}/${media.id}/text`);
  assert.equal(failed.status, 400);
  assert.deepEqual(await failed.json(), { code: 'DOCUMENT_TEXT_FAILED', error: 'PDF text extraction failed' });
  extractor.extract = async () => { throw new Error('private parser details'); };
  const unexpected = await fetch(`${base}${root}/${media.id}/text`);
  assert.equal(unexpected.status, 500);
  assert.deepEqual(await unexpected.json(), { error: 'internal error' });
});

test('Library HTTP: 64 KiB pages, Trash exclusion, wrong workspace and denied principals fail before blob I/O', async t => {
  const { app, deps, deny } = appFixture(); const base = await startTestServer(app, t);
  const source = 'a'.repeat(65535) + '🌍' + 'tail';
  const response = await post(base, root, { kind: 'document', filename: 'large.md', dataBase64: Buffer.from(source).toString('base64') });
  assert.equal(response.status, 201); const { media } = await response.json();
  const first = await (await fetch(`${base}${root}/${media.id}/text`)).json();
  assert.equal(Buffer.byteLength(first.text), 65535); assert.equal(first.nextOffset, 65535); assert.equal(first.truncated, true);
  const last = await (await fetch(`${base}${root}/${media.id}/text?offset=${first.nextOffset}`)).json();
  assert.equal(first.text + last.text, source); assert.equal(last.nextOffset, null);
  assert.equal((await fetch(`${base}${root}/${media.id}/text?offset=65536`)).status, 400);
  assert.equal((await post(base, `${root}/${media.id}/trash`, {})).status, 200);
  assert.deepEqual((await (await fetch(base + root + '?kind=document')).json()).media, []);
  assert.equal((await fetch(`${base}${root}/${media.id}/text`)).status, 404);
  let loads = 0; deps.blobStore.get = async () => { loads++; throw new Error('must not read'); };
  for (const suffix of ['', `/${media.id}/text`, `/${media.id}/original`]) assert.equal((await fetch(base + root.replace('site-a', 'site-b') + suffix)).status, 404);
  deny();
  for (const suffix of ['', `/${media.id}/text`, `/${media.id}/original`]) assert.equal((await fetch(base + root + suffix)).status, 403);
  assert.equal((await post(base, root, { kind: 'document', filename: 'a.txt', dataBase64: 'dGV4dA==' })).status, 403);
  assert.equal((await post(base, `${root}/${media.id}`, { title: 'Denied' }, 'PATCH')).status, 403);
  assert.equal((await post(base, `${root}/${media.id}/trash`, {})).status, 403); assert.equal(loads, 0);
});

test('Library HTTP: fake PDF/DOCX rejected without durable rows; media uploads retain their old policy', async t => {
  const { app, deps } = appFixture(); const base = await startTestServer(app, t);
  for (const filename of ['fake.pdf', 'fake.docx', 'bad.exe']) {
    const response = await post(base, root, { kind: 'document', filename, contentType: 'application/pdf', dataBase64: Buffer.from('not a document').toString('base64') });
    assert.equal(response.status, 400);
    // Jini da7d68ca deliberately replaced ZIP jargon with the application's name.
    assert.match((await response.json()).error, filename === 'fake.pdf' ? /PDF signature/ : filename === 'fake.docx' ? /^This file isn't a valid Word file \(or it's password-protected\)\.$/ : /document type/);
  }
  assert.equal((await post(base, root, { filename: 'notes.txt', contentType: 'text/plain', dataBase64: Buffer.from('ordinary text').toString('base64') })).status, 400);
  assert.deepEqual(await deps.mediaRepo.list({ workspaceId: deps.workspaceId }), []);
  assert.deepEqual(await deps.assetBlobRepo.list({ workspaceId: deps.workspaceId }), []);
});
