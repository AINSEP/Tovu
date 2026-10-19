/** Source-based RED expectations: the previous ingress rejected every new extension.
 * Authored without execution: the dispatch prohibits tests/builds/typechecks. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateDocumentIngress } from '@jini-ai/cms/media';
import { buildZipFixture } from '#src/features/agent-plugins/__tests__/fixtures/build-zip';
import { createDocumentArchiveReader } from '../document-archive.js';
import { downloadDocuments } from './download-documents.fixture.js';

const archiveReader = createDocumentArchiveReader({});
test('download-only: all seven formats accept valid bytes and reject wrong/renamed bytes', async () => {
  const documents = await downloadDocuments({});
  for (const [extension, bytes] of Object.entries(documents)) {
    const result = await validateDocumentIngress({ filename: `valid.${extension}`, bytes }, { archiveReader });
    assert.match(result.contentType, /^application\//);
    await assert.rejects(validateDocumentIngress({ filename: `fake.${extension}`, bytes: Buffer.from('ordinary text') }, { archiveReader }));
    await assert.rejects(validateDocumentIngress({ filename: `renamed.${extension}`, bytes: documents[extension === 'rtf' ? 'xlsx' : 'rtf']! }, { archiveReader }));
    await assert.rejects(validateDocumentIngress({ filename: `large.${extension}`, bytes: Buffer.alloc(10 * 1024 * 1024 + 1) }, { archiveReader }), /10 MiB/);
  }
  await assert.rejects(validateDocumentIngress({ filename: 'renamed.pptx', bytes: documents.xlsx! }, { archiveReader }), /package XML|required PowerPoint/);
  await assert.rejects(validateDocumentIngress({ filename: 'renamed.xlsx', bytes: documents.pptx! }, { archiveReader }), /package XML|required Excel/);
  for (const ext of ['docm', 'xlsm', 'pptm']) await assert.rejects(validateDocumentIngress({ filename: `macro.${ext}`, bytes: documents.xlsx! }, { archiveReader }), /document type/);
});

test('download-only archives: macro names/types, symlinks, encryption and aggregate expansion are refused', async () => {
  const documents = await downloadDocuments({});
  for (const ext of ['xlsx', 'pptx', 'pages', 'key'] as const) {
    await validateDocumentIngress({ filename: `baseline.${ext}`, bytes: documents[ext]! }, { archiveReader });
    const base = await archiveMembers({ bytes: documents[ext]! });
    // Jini da7d68ca names the application rather than exposing archive-reader jargon.
    const application = { xlsx: 'Excel', pptx: 'PowerPoint', pages: 'Pages', key: 'Keynote' }[ext]!;
    const invalidArchive = { message: `This file isn't a valid ${application} file (or it's password-protected).` };
    // All archive classes share these bounds, including a combined total over otherwise valid entries.
    for (const [extra, reason] of [
      [[{ path: 'vbaProject.bin', content: 'macro' }], /macro/],
      [[{ path: 'link', content: '../outside', mode: 0o120777 }], invalidArchive],
      [[{ path: 'large-a', content: Buffer.alloc(21 * 1024 * 1024, 65) }, { path: 'large-b', content: Buffer.alloc(21 * 1024 * 1024, 65) }], /expanded size|compression ratio/],
      [Array.from({ length: 2049 }, (_, i) => ({ path: `entry-${i}`, content: 'x' })), /too many archive entries/],
    ] as const) await assert.rejects(validateDocumentIngress({ filename: `bad.${ext}`, bytes: await buildZipFixture([...base, ...extra]) }, { archiveReader }), reason);
    const encrypted = Buffer.from(documents[ext]!);
    const central = encrypted.readUInt32LE(encrypted.length - 22 + 16);
    encrypted.writeUInt16LE(encrypted.readUInt16LE(central + 8) | 1, central + 8);
    await assert.rejects(validateDocumentIngress({ filename: `encrypted.${ext}`, bytes: encrypted }, { archiveReader }), invalidArchive);
  }
  for (const ext of ['xlsx', 'pptx']) {
    // Establish acceptance first so a broken package cannot masquerade as macro protection.
    await validateDocumentIngress({ filename: `baseline.${ext}`, bytes: documents[ext]! }, { archiveReader });
    const base = await archiveMembers({ bytes: documents[ext]! });
    for (const contentType of [
      'application/vnd.ms-excel.sheet.macroEnabled.main+xml',
      'application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml',
      'application/vnd.ms-word.document.macroEnabled.main+xml',
      'application/vnd.ms-office.vbaProject', 'application/vnd.ms-word.vbaData+xml',
      'application/vnd.ms-excel.macrosheet+xml', 'application/vnd.ms-excel.intlmacrosheet+xml',
      'application/vnd.ms-excel.&#109;acrosheet+xml', 'application/vnd.ms-excel.intl&#109;acrosheet+xml',
      'macro&#69;nabled',
    ]) {
      const entries = base.map(entry => entry.path === '[Content_Types].xml'
        ? { ...entry, content: entry.content.toString().replace('</Types>', `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="${contentType}"/></Types>`) }
        : entry);
      const bytes = await buildZipFixture([...entries, { path: 'xl/worksheets/sheet2.xml', content: '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>' }]);
      await assert.rejects(validateDocumentIngress({ filename: `macro.${ext}`, bytes }, { archiveReader }), /macros/);
    }
  }
});

/** Read real baseline packages through the same streaming adapter used by ingress. */
async function archiveMembers(required: { bytes: Buffer }, _optional: Record<string, never> = {}) {
  const members: { path: string; content: Buffer }[] = [];
  for await (const entry of archiveReader.entries({ archive: required.bytes })) {
    if (entry.kind !== 'file' || !entry.openReadStream) continue;
    const chunks: Uint8Array[] = [];
    for await (const chunk of entry.openReadStream({})) chunks.push(chunk);
    members.push({ path: entry.entryPath, content: Buffer.concat(chunks) });
  }
  return members;
}

test('download-only archives: compression bombs below the expanded cap are refused', async () => {
  const documents = await downloadDocuments({});
  const base = await archiveMembers({ bytes: documents.xlsx! });
  const payload = Buffer.alloc(1024 * 1024, 65);
  assert.ok(base.reduce((sum, entry) => sum + entry.content.length, payload.length) < 40 * 1024 * 1024);
  const bytes = await buildZipFixture([...base, { path: 'xl/data.xml', content: payload }]);
  assert.ok(bytes.length < payload.length / 100, 'fixture exceeds the overall 100:1 ratio');
  await assert.rejects(validateDocumentIngress({ filename: 'bomb.xlsx', bytes }, { archiveReader }), /compression ratio/);
  // Incompressible padding defeats an overall-only guard; the offending entry must still fail.
  const { randomBytes } = await import('node:crypto');
  const padded = await buildZipFixture([...base, { path: 'padding.bin', content: randomBytes(32 * 1024) }, { path: 'xl/data.xml', content: payload }]);
  assert.ok(padded.length > (payload.length + 32 * 1024) / 100);
  await assert.rejects(validateDocumentIngress({ filename: 'padded.xlsx', bytes: padded }, { archiveReader }), /compression ratio/);
});

for (const extension of ['xltm', 'potm', 'ppsm', 'dotm']) {
  test(`download-only: .${extension} is refused even with valid Office bytes`, async () => {
    const documents = await downloadDocuments({});
    await assert.rejects(validateDocumentIngress({ filename: `macro.${extension}`, bytes: documents.xlsx! }, { archiveReader }), /document type/);
  });
}
for (const kind of ['EXE', 'HTML', 'SVG', 'plain-ZIP']) {
  test(`download-only: renamed ${kind} is refused for every new extension`, async () => {
    const payloads = {
      EXE: Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]),
      HTML: Buffer.from('<!DOCTYPE html><html><script>alert(1)</script></html>'),
      SVG: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      'plain-ZIP': await buildZipFixture([{ path: 'hello.txt', content: 'ordinary ZIP' }]),
    };
    for (const extension of ['doc', 'xls', 'rtf', 'xlsx', 'pptx', 'pages', 'key']) {
      await assert.rejects(validateDocumentIngress({ filename: `renamed.${extension}`, bytes: payloads[kind as keyof typeof payloads] }, { archiveReader }));
    }
  });
}
