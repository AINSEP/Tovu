# media

## Wiring

- `public-urls.ts` binds the host's content-type store and transform repo to Jini's `@jini-ai/cms/media/site/public-urls` (rendition selection, batched lookups); `tool-registrations.ts`, `server/runtime/composition/modules/media.ts` and the admin media routes
  (`list.ts`, `import-url.ts`, `stored-media-response.ts`).
- `SqlMediaProviderCredentialRepo` (`media-provider-credential-repo.ts`) binds the composed
  content kernel to Jini's `SqlSecretsVaultRepo`; it is constructed directly
  (`new SqlMediaProviderCredentialRepo(kernel)`) in
  `server/runtime/composition/site-deps/route-deps-assistant-mcp.ts`. There is no `Sqlite*` alias.

## Wiring

- `createDocumentArchiveReader` now lives in `@jini-ai/cms/media/site/document-archive`. The host injects the
  installed `yauzl` SDK (`yauzl` field) and agent-plugins' `createYauzlAgentPluginArchiveReader`
  (`createArchiveReader` field). Bound at each call site as a local `documentArchiveDeps` constant:
  `server/runtime/composition/modules/assistant-tool-exec.ts`, `server/inbound/admin-http/routes/media/upload.ts`,
  `features/site-backup/import-verifier-projection.ts`, `features/asset-transfer/copy-tool.ts` (and the tests).
