/** Library ingress uses the installed ZIP reader, with bounded expansion and package checks. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildZipFixture } from '#src/features/agent-plugins/__tests__/fixtures/build-zip';
import { validateDocumentIngress, type DocumentArchiveReaderPort } from '@jini-ai/cms/media';
import { createDocumentArchiveReader } from '../document-archive.js';

function archive(files: Record<string, string>) {
  return buildZipFixture(Object.entries(files).map(([path, content]) => ({ path, content })));
}
const members = {
  '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>',
};
test('Library DOCX: real package accepted; ordinary ZIP and macro package refused', async () => {
  const archiveReader = createDocumentArchiveReader({});
  assert.equal((await validateDocumentIngress({ filename: 'valid.docx', bytes: await archive(members) }, { archiveReader })).contentType,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  await assert.rejects(validateDocumentIngress({ filename: 'fake.docx', bytes: await archive({ 'hello.txt': 'plain ZIP' }) }, { archiveReader }));
  await assert.rejects(validateDocumentIngress({ filename: 'macro.docx', bytes: await archive({ ...members, 'word/vbaProject.bin': 'macro' }) }, { archiveReader }));
});

test('Library DOCX: wrong roots/namespaces and nested marker decoys are refused', async () => {
  const archiveReader = createDocumentArchiveReader({});
  for (const [member, root, child] of [
    ['[Content_Types].xml', 'Types', 'Override'], ['_rels/.rels', 'Relationships', 'Relationship'],
  ] as const) {
    const source = members[member];
    const variants = [
      source.replace(`<${root} `, '<Fake ').replace(`</${root}>`, '</Fake>'),
      source.replace(`<${root} xmlns=`, `<${root} xmlns:real=`).replace(`<${child} `, `<real:${child} `),
      source.replace(`<${root} xmlns=`, `<${root} xmlns="urn:fake" xmlns:real=`).replace(`<${child} `, `<real:${child} `),
      source.replace(`<${child} `, `<Wrapper><${child} `).replace('/>', '/></Wrapper>'),
    ];
    for (const xml of variants) await assert.rejects(validateDocumentIngress({ filename: 'decoy.docx',
      bytes: await archive({ ...members, [member]: xml }) }, { archiveReader }), /package roots|required Word package members/);
  }
});

test('Library DOCX F2.6: real yauzl rejects encrypted, symlink, oversized and understated-size ZIPs', async () => {
  const archiveReader = createDocumentArchiveReader({});
  const valid = await archive(members);
  // yazl emits an uncommented EOCD. Patch real ZIP header fields; no scripted entry reader.
  const central = valid.readUInt32LE(valid.length - 22 + 16);
  assert.equal(valid.readUInt32LE(central), 0x02014b50);
  const local = valid.readUInt32LE(central + 42);
  // Real ZipCrypto payload, generated once with zip -X -P fixture-only over the three members.
  const encrypted = await readFile(new URL('./fixtures/encrypted.docx', import.meta.url));
  const understated = Buffer.from(valid);
  const actualSize = valid.readUInt32LE(central + 24);
  understated.writeUInt32LE(actualSize - 1, central + 24);
  understated.writeUInt32LE(actualSize - 1, local + 22);
  const symlink = await buildZipFixture([
    ...Object.entries(members).map(([path, content]) => ({ path, content })),
    { path: 'word/link.xml', content: '../../outside', mode: 0o120777 },
  ]);
  const oversized = await buildZipFixture([
    ...Object.entries(members).map(([path, content]) => ({ path, content })),
    { path: 'word/large.xml', content: Buffer.alloc(40 * 1024 * 1024 + 1, 65) },
  ]);
  for (const [name, bytes] of Object.entries({ encrypted, symlink, oversized, understated })) {
    assert.ok(bytes.length <= 10 * 1024 * 1024, `${name} must reach ZIP validation, not the ingress size guard`);
    await assert.rejects(validateDocumentIngress({ filename: `${name}.docx`, bytes }, { archiveReader }),
      /unencrypted ZIP package|link or special entry|expanded size|entry size/);
  }
});
test('Library DOCX: aggregate expansion, duplicate/traversal paths and links fail with bounded stream reads', async () => {
  let streams = 0;
  for (const variant of ['overflow', 'duplicate', 'traversal', 'link'] as const) {
    const reader: DocumentArchiveReaderPort = { async *entries() {
      if (variant === 'link') { yield { kind: 'symlink', entryPath: 'word/document.xml' }; return; }
      for (let i = 0; i < 3; i++) yield { kind: 'file', entryPath: variant === 'duplicate' ? 'same.xml' : variant === 'traversal' ? '../outside.xml' : `part-${i}.xml`,
        compressedSize: 1024 * 1024, declaredSize: variant === 'overflow' ? 21 * 1024 * 1024 : 1,
        openReadStream: async function* () { streams++; yield variant === 'overflow' ? Buffer.alloc(21 * 1024 * 1024, 65) : Buffer.from('a'); } };
    } };
    await assert.rejects(validateDocumentIngress({ filename: 'hostile.docx', bytes: Buffer.alloc(1024 * 1024) }, { archiveReader: reader }));
  }
  assert.equal(streams, 2, 'only first entries of overflow and duplicate variants may open streams');
});


test('Library ZIP ratio: observed bytes stop streaming before the expanded cap', async () => {
  let chunksRead = 0;
  let closed = false;
  const reader: DocumentArchiveReaderPort = { async *entries() {
    yield { kind: 'file', entryPath: 'xl/data.xml', declaredSize: 1024 * 1024, compressedSize: 10,
      openReadStream: async function* () {
        try {
          for (let i = 0; i < 1024; i++) { chunksRead++; yield Buffer.alloc(1024); }
        } finally { closed = true; }
      } };
  } };
  await assert.rejects(validateDocumentIngress({ filename: 'bomb.xlsx', bytes: Buffer.alloc(1024) }, { archiveReader: reader }), /compression ratio/);
  assert.equal(chunksRead, 1, 'stop at the first chunk crossing 100:1 rather than draining the entry');
  assert.equal(closed, true, 'early refusal closes the active stream');
});
