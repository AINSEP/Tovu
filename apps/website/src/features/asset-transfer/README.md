# asset-transfer

## Wiring

- Document archive validation uses `@jini-ai/cms/media/site/document-archive`; this folder binds the
  `yauzl` SDK and agent-plugins' `createYauzlAgentPluginArchiveReader` as `documentArchiveDeps` at the call site.

## Wiring (write-files)

- `asset-destinations.ts` and `asset-sources.ts` call `@jini-ai/cms/fs-files/write-files` and pass
  `fs-files/fs-files.ts`'s `resolveFsFilePath` as its REQUIRED `resolveFsFilePath` field.
- `asset-sources.ts` stays host composition: it only selects Tovu's source roots (site, picked folder,
  theme, media) and the `fs_files.read`/`media.read` permissions over the Jini guarded reader.
