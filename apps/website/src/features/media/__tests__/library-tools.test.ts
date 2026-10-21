/** L1 step 4. RED originally: library tools absent; staged files had no private document promotion. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDiskAttachmentStore } from '@jini-ai/daemon/http';
import { buildMediaRegistrations, uploadMedia } from '@jini-ai/cms/media';
import { buildLibrarySaveAttachmentTool } from '../library-save-attachment.js';
import { createDocumentArchiveReader } from '../document-archive.js';
import { libraryFixture, libraryContext } from './library.fixture.js';

test('Library save survives cleanupRun; ordinary attachments remain temporary; later chat list/read sees saved bytes', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'library-save-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const { deps } = libraryFixture();
  const store = await createDiskAttachmentStore({ uploadDirectory: dir });
  t.after(() => store.dispose());
  const batch = await store.createBatchDirectory({ batchId: 'batch-aaa' });
  const savedPath = join(batch, 'saved.md'); const tempPath = join(batch, 'temporary.txt');
  await writeFile(savedPath, '# Keep me'); await writeFile(tempPath, 'Temporary');
  const saved = await store.register({ input: { batchId: 'batch-aaa', path: savedPath, name: 'saved.md', kind: 'file', size: 9, ownerId: 'owner' } });
  const temp = await store.register({ input: { batchId: 'batch-aaa', path: tempPath, name: 'temporary.txt', kind: 'file', size: 9, ownerId: 'owner' } });
  await store.claim({ runId: 'run-a', attachments: [saved, temp] });
  const tool = buildLibrarySaveAttachmentTool({ deps, getStore: () => store, readFile,
    getMessageAttachmentRefs: () => [saved.path, temp.path], archiveReader: createDocumentArchiveReader({}) });
  const result = await tool.handler(libraryContext({ attachmentRef: saved.path })) as { document: { id: string } };
  await store.cleanupRun({ runId: 'run-a' });
  await assert.rejects(access(savedPath)); await assert.rejects(access(tempPath));
  const registrations = buildMediaRegistrations(deps);
  const listed = await registrations.find(row => row.descriptor.id === 'library_list')!.handler(libraryContext({}, 'later-chat')) as { documents: { id: string; byteSize: number; createdBy: string; contentType: string }[] };
  assert.equal(listed.documents.length, 1); assert.equal(listed.documents[0]!.id, result.document.id);
  assert.equal(listed.documents[0]!.byteSize, 9); assert.equal(listed.documents[0]!.createdBy, 'owner');
  assert.equal(listed.documents[0]!.contentType, 'text/markdown');
  const page = await registrations.find(row => row.descriptor.id === 'library_read')!.handler(libraryContext({ documentId: result.document.id }, 'later-chat')) as { text: string; nextOffset: null; untrusted: boolean };
  assert.equal(page.text, '# Keep me'); assert.equal(page.nextOffset, null); assert.equal(page.untrusted, true);
});

test('Library save refuses foreign/stale/current-message-missing refs before resolving or reading bytes', async () => {
  const { deps, deny } = libraryFixture(); let reads = 0; let resolves = 0;
  const tool = buildLibrarySaveAttachmentTool({ deps, getStore: () => ({ resolveForRun: async () => { resolves++; return undefined; } }),
    readFile: async () => { reads++; return Buffer.from('secret'); }, getMessageAttachmentRefs: () => ['attachment:current'], archiveReader: createDocumentArchiveReader({}) });
  for (const ref of ['attachment:foreign', 'attachment:old-message', '/tmp/known-path']) await assert.rejects(tool.handler(libraryContext({ attachmentRef: ref })));
  assert.equal(resolves, 0); assert.equal(reads, 0);
  await assert.rejects(tool.handler(libraryContext({ attachmentRef: 'attachment:current' })));
  assert.equal(resolves, 1); assert.equal(reads, 0);
  deny(); await assert.rejects(tool.handler(libraryContext({ attachmentRef: 'attachment:current' })));
  assert.equal(resolves, 1); assert.equal(reads, 0);
  assert.deepEqual(await deps.mediaRepo.list({ workspaceId: deps.workspaceId }), []);
});

test('Library read/list enforce site binding and permissions without a blob read on refusal', async () => {
  const { deps, deny } = libraryFixture();
  const { media } = await uploadMedia({ deps: { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo },
    input: { workspaceId: 'other-site', kind: 'document', filename: 'foreign.md', contentType: 'text/plain', bytes: Buffer.from('private'), createdByPrincipal: 'other' } });
  let reads = 0; deps.blobStore.get = async () => { reads++; throw new Error('must not load denied bytes'); };
  const tools = buildMediaRegistrations(deps);
  const list = tools.find(row => row.descriptor.id === 'library_list')!;
  const read = tools.find(row => row.descriptor.id === 'library_read')!;
  assert.deepEqual(await list.handler(libraryContext()), { documents: [] });
  await assert.rejects(read.handler(libraryContext({ documentId: media.id })));
  const { media: local } = await uploadMedia({ deps: { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo },
    input: { workspaceId: deps.workspaceId, kind: 'document', filename: 'local.md', contentType: 'text/markdown', bytes: Buffer.from('same-site private'), createdByPrincipal: 'owner' } });
  let sizeReads = 0; deps.blobStore.sizeOf = async () => { sizeReads++; throw new Error('must not inspect denied bytes'); };
  deny();
  await assert.rejects(list.handler(libraryContext()), /not authorized for 'media.read'/);
  // A valid same-site document makes denial depend on authorization, not a not-found lookup.
  await assert.rejects(read.handler(libraryContext({ documentId: local.id })), /not authorized for 'media.read'/);
  assert.equal(reads, 0); assert.equal(sizeReads, 0);
});

test('library_read returns at most 64 KiB, explicit continuation, and lossless untrusted source', async () => {
  const { deps } = libraryFixture();
  const source = 'x'.repeat(65535) + '🌍'.repeat(20000);
  const { media } = await uploadMedia({ deps: { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo },
    input: { workspaceId: deps.workspaceId, kind: 'document', filename: 'paged.md', contentType: 'text/markdown', bytes: Buffer.from(source), createdByPrincipal: 'owner' } });
  const read = buildMediaRegistrations(deps).find(row => row.descriptor.id === 'library_read')!;
  let offset = 0; let reconstructed = '';
  do {
    const page = await read.handler(libraryContext({ documentId: media.id, offset })) as { text: string; nextOffset: number | null; truncated: boolean; untrusted: boolean };
    assert.ok(Buffer.byteLength(page.text) <= 65536); assert.equal(page.untrusted, true);
    reconstructed += page.text; assert.equal(page.truncated, page.nextOffset !== null);
    if (page.nextOffset === null) break;
    assert.ok(page.nextOffset > offset); offset = page.nextOffset;
  } while (true);
  assert.equal(reconstructed, source);
});

test('Library save retains the existing resolver\'s run and integrity rejection even for an allowlisted ref', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'library-isolation-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await createDiskAttachmentStore({ uploadDirectory: dir }); t.after(() => store.dispose());
  const batch = await store.createBatchDirectory({ batchId: 'isolated' });
  const path = join(batch, 'guide.md'); await writeFile(path, '# Original', { mode: 0o600 });
  const ref = await store.register({ input: { batchId: 'isolated', path, name: 'guide.md', size: 10, kind: 'file', ownerId: 'owner' } });
  await store.claim({ runId: 'run-a', attachments: [ref] });
  const { deps } = libraryFixture(); let reads = 0;
  const tool = buildLibrarySaveAttachmentTool({ deps, getStore: () => store, getMessageAttachmentRefs: () => [ref.path], archiveReader: createDocumentArchiveReader({}),
    readFile: async path => { reads++; return readFile(path); } });
  await assert.rejects(tool.handler(libraryContext({ attachmentRef: ref.path }, 'foreign-run')));
  // The resolver's integrity check compares dev/inode/size/path, so the tamper must change size.
  await writeFile(path, '# Tampered and grown', { mode: 0o600 });
  await assert.rejects(tool.handler(libraryContext({ attachmentRef: ref.path }, 'run-a')));
  assert.equal(reads, 0); assert.deepEqual(await deps.mediaRepo.list({ workspaceId: deps.workspaceId }), []);
});

// RED before this change: upload refused all seven extensions before the read tool could run.
test('library_read explains download-only formats without loading their blob bytes', async () => {
  const { downloadDocuments } = await import('./download-documents.fixture.js');
  const { deps } = libraryFixture();
  const ids: string[] = [];
  for (const [extension, bytes] of Object.entries(await downloadDocuments({}))) {
    const { media } = await uploadMedia({ deps: { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo, documentArchiveReader: createDocumentArchiveReader({}) },
      input: { workspaceId: deps.workspaceId, kind: 'document', filename: `download.${extension}`, contentType: 'text/plain', bytes, createdByPrincipal: 'owner' } });
    ids.push(media.id);
  }
  let reads = 0;
  deps.blobStore.get = async () => { reads++; throw new Error('download-only bytes must not be loaded'); };
  const read = buildMediaRegistrations(deps).find(row => row.descriptor.id === 'library_read')!;
  for (const id of ids) await assert.rejects(read.handler(libraryContext({ documentId: id })), /download only; text extraction is unavailable/);
  assert.equal(reads, 0);
});

test('Library save allows by policy, refuses before the store is ready, reports upload-policy refusals as input errors and rethrows storage faults', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'library-save-refusals-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await createDiskAttachmentStore({ uploadDirectory: dir });
  t.after(() => store.dispose());
  const batch = await store.createBatchDirectory({ batchId: 'batch-bbb' });
  const exePath = join(batch, 'tool.exe'); const mdPath = join(batch, 'notes.md');
  await writeFile(exePath, 'MZ binary'); await writeFile(mdPath, '# Notes');
  const exe = await store.register({ input: { batchId: 'batch-bbb', path: exePath, name: 'tool.exe', kind: 'file', size: 9, ownerId: 'owner' } });
  const md = await store.register({ input: { batchId: 'batch-bbb', path: mdPath, name: 'notes.md', kind: 'file', size: 7, ownerId: 'owner' } });
  await store.claim({ runId: 'run-a', attachments: [exe, md] });
  const { deps } = libraryFixture();
  const build = (getStore: () => typeof store | undefined) => buildLibrarySaveAttachmentTool({ deps, getStore, readFile,
    getMessageAttachmentRefs: () => [exe.path, md.path], archiveReader: createDocumentArchiveReader({}) });
  const tool = build(() => store);
  assert.equal(tool.policy?.authorize?.({} as never), 'allow');
  await assert.rejects(build(() => undefined).handler(libraryContext({ attachmentRef: md.path })), { message: 'attachment store is not ready' });
  await assert.rejects(tool.handler(libraryContext({ attachmentRef: exe.path })), { name: 'ToolInputError', message: 'document type must be .md, .txt, .csv, .json, .doc, .xls, .rtf, .xlsx, .pptx, .pages, .key, .pdf, .docx' });
  const fault = new Error('blob store offline');
  deps.blobStore.put = async () => { throw fault; };
  await assert.rejects(tool.handler(libraryContext({ attachmentRef: md.path })), (error: unknown) => error === fault);
  assert.deepEqual(await deps.mediaRepo.list({ workspaceId: deps.workspaceId }), []);
});
