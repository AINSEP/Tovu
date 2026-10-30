import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { buildMediaRegistrations, MAX_DOCUMENT_BYTES } from '@jini-ai/cms/media';
import { buildFilesCopyRegistrations } from '../../asset-transfer/copy-tool.js';
import { createDocumentArchiveReader } from '../../media/document-archive.js';
import { downloadDocuments } from '../../media/__tests__/download-documents.fixture.js';
import { assetToolHarness } from './asset-tool-fixture.js';
import { FS_FILES_READ_PERMISSION } from '../agent-tools.js';
import { buildZipFixture } from '#src/features/agent-plugins/__tests__/fixtures/build-zip';

const destination = { kind: 'library' };
interface Result { applied: boolean; documents: { id: string; filename: string; publicUrl: null; byteSize: number }[] }
const harness = (t: TestContext, options = {}) => assetToolHarness(t, { ...options,
  build: (deps: Parameters<typeof buildFilesCopyRegistrations>[0], surfaces: Parameters<typeof buildFilesCopyRegistrations>[1]) => buildFilesCopyRegistrations({ ...deps, documentArchiveReader: createDocumentArchiveReader({}) }, surfaces), toolId: 'files_copy' });

test('picked, site and theme files copy into the private Library through document ingestion', async t => {
  const h = await harness(t);
  const reader = buildMediaRegistrations(h.deps).find(row => row.descriptor.id === 'library_read')!;
  for (const [root, dir] of [['picked', h.picked], ['site', h.site], ['theme', h.theme]]) {
    const content = `# ${root}\nPrivate brand notes 🌍\n`;
    fs.writeFileSync(path.join(dir!, 'BRAND.md'), content);
    const result = await h.call({ sources: [{ root, path: 'BRAND.md', ...(root === 'theme' ? { themeId: 'match' } : {}) }], destination }, false) as Result;
    assert.equal(result.applied, true); assert.equal(result.documents[0]!.publicUrl, null);
    const row = await h.deps.mediaRepo.findById({ workspaceId: 'ws', id: result.documents[0]!.id });
    assert.equal(row?.kind, 'document'); assert.equal(row?.createdBy, 'owner-1');
    const blob = await h.deps.assetBlobRepo.findByHash({ workspaceId: 'ws', sha256: row!.source.sha256 });
    assert.equal(blob?.documentOwned, true);
    const read = await reader.handler({ input: { documentId: row!.id }, principal: { id: 'owner-1' }, run: { id: 'later-chat' } } as never) as { text: string; untrusted: boolean };
    assert.equal(read.text, content); assert.equal(read.untrusted, true);
  }
  assert.ok(h.permissions.includes('media.upload')); assert.ok(h.permissions.includes(FS_FILES_READ_PERMISSION));
  assert.equal(h.emitted.length, 0, 'private Library saves use the existing direct document approval behavior');
});

test('Library copies retain PDF and Office bytes through the existing archive validator', async t => {
  const h = await harness(t);
  const docx = await buildZipFixture([
    { path: '[Content_Types].xml', content: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { path: '_rels/.rels', content: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { path: 'word/document.xml', content: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>' },
  ]);
  const documents = { ...await downloadDocuments({}), docx, pdf: Buffer.from('%PDF-1.7\n%%EOF') };
  for (const [extension, bytes] of Object.entries(documents)) {
    const name = `brand.${extension}`; fs.writeFileSync(path.join(h.picked, name), bytes);
    const copy = h.call({ sources: [{ root: 'picked', path: name }], destination });
    if (extension === 'key') {
      await assert.rejects(copy, /brand\.key.*denied filename pattern/);
      continue;
    }
    const result = await copy as Result;
    const row = await h.deps.mediaRepo.findById({ workspaceId: 'ws', id: result.documents[0]!.id });
    assert.equal(row?.originalFilename, name); assert.equal(row?.kind, 'document');
    const [rendition] = await h.deps.assetRenditionRepo.listByAsset({ workspaceId: 'ws', assetId: row!.id });
    assert.deepEqual(Buffer.from(await h.deps.blobStore.get({ storageKey: rendition!.storageKey })), bytes);
  }
});

test('Library glob copies flatten folder paths and validate the whole batch before any save', async t => {
  const h = await harness(t);
  fs.mkdirSync(path.join(h.site, 'brand/deep'), { recursive: true });
  fs.writeFileSync(path.join(h.site, 'brand/deep/notes.md'), '# Notes');
  const result = await h.call({ sources: [{ root: 'site', path: 'brand', glob: '**/*.md' }], destination }) as Result;
  assert.equal(result.documents[0]!.filename, 'notes.md');
  fs.writeFileSync(path.join(h.picked, 'valid.md'), '# Brand');
  fs.writeFileSync(path.join(h.picked, 'invalid.pdf'), 'this is not a PDF');
  await assert.rejects(h.call({ sources: ['valid.md', 'invalid.pdf'].map(p => ({ root: 'picked', path: p })), destination }));
  assert.equal((await h.deps.mediaRepo.list({ workspaceId: 'ws' })).length, 1, 'no valid prefix of an invalid batch is saved');
});

test('Library copies refuse denied files, escapes, symlinks, invalid types and destination paths', async t => {
  const h = await harness(t);
  fs.writeFileSync(path.join(h.picked, '.env'), 'never read');
  fs.writeFileSync(path.join(h.picked, 'brand.exe'), 'MZ');
  fs.writeFileSync(path.join(h.picked, 'brand.md'), '# Brand');
  fs.writeFileSync(path.join(h.base, 'outside.md'), '# Must remain outside');
  fs.symlinkSync(path.join(h.picked, 'brand.md'), path.join(h.picked, 'link.md'));
  fs.symlinkSync(h.picked, path.join(h.site, 'linked-folder'));
  for (const p of ['.env', '../outside.md', path.join(h.base, 'outside.md'), 'link.md', 'brand.exe', 'logo.png']) {
    await assert.rejects(h.call({ sources: [{ root: 'picked', path: p }], destination }));
  }
  await assert.rejects(h.call({ sources: [{ root: 'site', path: 'linked-folder/brand.md' }], destination }));
  await assert.rejects(h.call({ sources: [{ root: 'picked', path: 'brand.md' }], destination: { ...destination, path: 'public' } }));
  await assert.rejects(h.call({ sources: [{ root: 'url', url: 'https://example.test/brand.pdf' }], destination }));
  assert.equal(h.requests.length, 0);
  assert.deepEqual(await h.deps.mediaRepo.list({ workspaceId: 'ws' }), []);
});

test('Library copies require the picked-folder grant and destination/source permissions', async t => {
  const missing = await harness(t, { custom: '' });
  fs.writeFileSync(path.join(missing.picked, 'brand.md'), '# Brand');
  await assert.rejects(missing.call({ sources: [{ root: 'picked', path: 'brand.md' }], destination }), /No folder is picked/);
  const inside = await harness(t, { custom: 'site' });
  inside.deps.resolveRoots = () => ({ repo: inside.base, site: inside.site, custom: inside.site });
  fs.writeFileSync(path.join(inside.site, 'brand.md'), '# Brand');
  await assert.rejects(inside.call({ sources: [{ root: 'picked', path: 'brand.md' }], destination }));
  for (const permission of ['media.upload', FS_FILES_READ_PERMISSION]) {
    const h = await harness(t, { allowed: (candidate: string) => candidate !== permission });
    await assert.rejects(h.call({ sources: [{ root: 'picked', path: 'missing.md' }], destination }), /not authorized/);
    assert.deepEqual(await h.deps.mediaRepo.list({ workspaceId: 'ws' }), []);
  }
});

test('Library copies enforce the 10 MiB document cap and combined transfer cap before persistence', async t => {
  const h = await harness(t);
  fs.writeFileSync(path.join(h.site, 'boundary.txt'), Buffer.alloc(MAX_DOCUMENT_BYTES, 65));
  const result = await h.call({ sources: [{ root: 'site', path: 'boundary.txt' }], destination }) as Result;
  assert.equal(result.documents[0]!.byteSize, MAX_DOCUMENT_BYTES);
  fs.appendFileSync(path.join(h.site, 'boundary.txt'), 'x');
  await assert.rejects(h.call({ sources: [{ root: 'site', path: 'boundary.txt' }], destination }));
  fs.writeFileSync(path.join(h.site, 'large.txt'), Buffer.alloc(9 * 1024 * 1024, 65));
  await assert.rejects(h.call({ sources: Array.from({ length: 3 }, () => ({ root: 'site', path: 'large.txt' })), destination }), /caps/);
  assert.equal((await h.deps.mediaRepo.list({ workspaceId: 'ws' })).length, 1);
});
