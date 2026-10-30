import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMediaRegistrations, MAX_DOCUMENT_BYTES } from '@jini-ai/cms/media';
import { buildLibrarySaveAttachmentTool } from '../library-save-attachment.js';
import { createDocumentArchiveReader } from '../document-archive.js';
import { libraryContext, libraryFixture } from './library.fixture.js';
import { buildToolCatalogQuery } from '#src/assistant/tool-catalog-query';
import { filesCopyAgentToolCatalog } from '../../asset-transfer/copy-tool.js';

/** Generated documents must never consult attachments, even before the attachment store is ready. */
function harness() {
  const fixture = libraryFixture();
  const unexpected = () => { throw new Error('generated text must not access attachments'); };
  const tool = buildLibrarySaveAttachmentTool({ deps: fixture.deps, getStore: unexpected,
    getMessageAttachmentRefs: unexpected, readFile: unexpected, archiveReader: createDocumentArchiveReader({}) });
  return { ...fixture, save: (input: Record<string, unknown>) => tool.handler(libraryContext(input)), tool };
}

test('Library saves generated Markdown and plain text as private documents readable in a later chat', async () => {
  const h = harness();
  const read = buildMediaRegistrations(h.deps).find(row => row.descriptor.id === 'library_read')!;
  for (const name of ['BRAND.md', 'notes.txt']) {
    const content = '# Brand\n\nKeep the exact text, including 🌍.\n';
    const result = await h.save({ name, content }) as { document: { id: string; publicUrl: null; byteSize: number; filename: string } };
    assert.equal(result.document.publicUrl, null);
    assert.equal(result.document.byteSize, Buffer.byteLength(content));
    assert.equal(result.document.filename, name);
    const row = await h.deps.mediaRepo.findById({ workspaceId: h.deps.workspaceId, id: result.document.id });
    assert.equal(row?.kind, 'document'); assert.equal(row?.createdBy, 'owner');
    const blob = await h.deps.assetBlobRepo.findByHash({ workspaceId: h.deps.workspaceId, sha256: row!.source.sha256 });
    assert.equal(blob?.documentOwned, true, 'the ingestion owner keeps document bytes private');
    const page = await read.handler(libraryContext({ documentId: result.document.id }, 'later-chat')) as { text: string; untrusted: boolean };
    assert.equal(page.text, content); assert.equal(page.untrusted, true);
  }
});

test('save-to-Library search discovers the existing copy and save tools with guidance for both input modes', () => {
  const h = harness();
  const catalog = buildToolCatalogQuery({ list: () => [h.tool.descriptor,
    ...filesCopyAgentToolCatalog.map(tool => ({ id: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
    { id: 'library_read', description: 'Read a saved document.' },
  ] });
  const ids = catalog.search({ query: 'save library' }, { limit: 10 }).map(hit => hit.id);
  assert.ok(ids.includes('library_save_attachment')); assert.ok(ids.includes('files_copy'));
  assert.match(catalog.describe({ id: 'library_save_attachment' })!.description, /name plus content/);
  assert.match(catalog.describe({ id: 'files_copy' })!.description, /kind:'library'/);
});

test('generated text rejects ambiguous input, paths, other formats, empty bodies and binary text before persistence', async () => {
  const h = harness();
  for (const input of [
    {}, { name: 'BRAND.md' }, { content: '# Brand' }, { name: 'BRAND.md', content: 42 },
    { attachmentRef: 'attachment:current', name: 'BRAND.md', content: '# Brand' },
    { attachmentRef: 'attachment:current', content: '# Brand' },
    { name: '../BRAND.md', content: '# Brand' }, { name: 'nested/BRAND.md', content: '# Brand' },
    { name: 'nested\\BRAND.md', content: '# Brand' }, { name: 'brand.pdf', content: '%PDF-1.7' },
    { name: 'brand.json', content: '{}' }, { name: 'brand.md', content: '' },
    { name: 'brand.txt', content: '\u0000binary' }, { name: 'brand.md', content: 'text', public: true },
  ]) await assert.rejects(h.save(input), { name: 'ToolInputError' });
  assert.deepEqual(await h.deps.mediaRepo.list({ workspaceId: h.deps.workspaceId }), []);
});

test('generated text enforces the 10 MiB UTF-8 byte cap at the boundary', async () => {
  const h = harness();
  const content = '🌍'.repeat(MAX_DOCUMENT_BYTES / 4);
  const result = await h.save({ name: 'boundary.txt', content }) as { document: { byteSize: number } };
  assert.equal(result.document.byteSize, MAX_DOCUMENT_BYTES);
  await assert.rejects(h.save({ name: 'too-big.md', content: content + 'x' }), /10 MiB/);
  assert.equal((await h.deps.mediaRepo.list({ workspaceId: h.deps.workspaceId })).length, 1);
});

test('generated text still requires media.upload and propagates storage faults', async () => {
  const h = harness(); const fault = new Error('blob storage offline');
  h.deps.blobStore.put = async () => { throw fault; };
  await assert.rejects(h.save({ name: 'brand.md', content: '# Brand' }), error => error === fault);
  h.deny();
  await assert.rejects(h.save({ name: 'brand.md', content: '# Brand' }), /not authorized/);
  assert.deepEqual(await h.deps.mediaRepo.list({ workspaceId: h.deps.workspaceId }), []);
});
