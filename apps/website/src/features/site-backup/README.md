# site-backup

## Wiring

- `SiteShareRefusal` and `archiveRefusalName` are Jini's `@jini-ai/devops/backup/site/share-refusal` (one class per process, so `instanceof` holds); `archive-media.ts` and `static-export-selection.ts` are thin bindings that inject Tovu's share path policy, capped ledger/blob reads, media operations and refusal copy into Jini's `backup/site/archive-media` and `backup/site/static-export-selection`.
- Document archive validation uses `@jini-ai/cms/media/site/document-archive`; this folder binds the
  `yauzl` SDK and agent-plugins' `createYauzlAgentPluginArchiveReader` as `documentArchiveDeps` at the call site.
