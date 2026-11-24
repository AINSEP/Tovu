# media

## Wiring

- `resolveMediaPublicUrls` is imported from `tool-registrations.ts` (its owner) by
  `server/runtime/composition/modules/media.ts` and the admin media routes
  (`list.ts`, `import-url.ts`, `stored-media-response.ts`).
- `SqlMediaProviderCredentialRepo` (`media-provider-credential-repo.ts`) binds the composed
  content kernel to Jini's `SqlSecretsVaultRepo`; it is constructed directly
  (`new SqlMediaProviderCredentialRepo(kernel)`) in
  `server/runtime/composition/site-deps/route-deps-assistant-mcp.ts`. There is no `Sqlite*` alias.
