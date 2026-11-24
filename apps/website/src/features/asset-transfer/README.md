# asset-transfer

## Wiring

- Document archive validation uses `@jini-ai/cms/media/site/document-archive`; this folder binds the
  `yauzl` SDK and agent-plugins' `createYauzlAgentPluginArchiveReader` as `documentArchiveDeps` at the call site.
