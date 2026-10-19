import { buildZipFixture } from '#src/features/agent-plugins/__tests__/fixtures/build-zip';

/** Real ZIP fixtures exercise the injected yauzl reader, not a parallel validation fake. */
export async function downloadDocuments(_required: Record<string, never>, _optional: Record<string, never> = {}): Promise<Record<string, Buffer>> {
  const result: Record<string, Buffer> = {
    doc: Buffer.from('d0cf11e0a1b11ae1', 'hex'), xls: Buffer.from('d0cf11e0a1b11ae1', 'hex'),
    rtf: Buffer.from('{\\rtf1 Download only}'),
    pages: await buildZipFixture([{ path: 'Index/Document.iwa', content: Buffer.from([0, 1, 2]) }]),
    key: await buildZipFixture([{ path: 'Index.zip', content: await buildZipFixture([{ path: 'Document.iwa', content: 'index' }]) }]),
  };
  for (const [ext, part, root, family, mainType] of [
    ['xlsx', 'xl/workbook.xml', 'workbook', 'spreadsheetml', 'spreadsheetml.sheet'],
    ['pptx', 'ppt/presentation.xml', 'presentation', 'presentationml', 'presentationml.presentation'],
  ]) result[ext!] = await buildZipFixture([
    { path: '[Content_Types].xml', content: `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.${mainType}.main+xml"/></Types>` },
    { path: '_rels/.rels', content: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${part}"/></Relationships>` },
    // Excel printer settings and embedded media can contain ordinary non-macro binary parts.
    { path: 'Data/settings.bin', content: Buffer.from([0, 1, 2]) },
    { path: part!, content: `<${root} xmlns="http://schemas.openxmlformats.org/${family}/2006/main"/>` },
  ]);
  return result;
}
