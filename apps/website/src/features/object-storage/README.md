# object-storage

Tovu's binding of the media blob store and the object-store provider registry to Jini
(`@jini-ai/cms/media`, `@jini-ai/platform/object-store`, `@jini-ai/core/object-store`).

## Wiring

There is no feature barrel; composition imports each owner directly.

- `media-store.ts` binds Tovu's operator env name `TOVU_MEDIA_BLOB_STORE` and the site setting
  `core.storage.mediaObjectStore` to Jini's `selectMediaBlobStore` / `readMediaStoreEnvChoice`.
  Bound in `server/runtime/composition/site-deps/media-storage.ts` (type-only users:
  `boot-data.ts`, `trash-adapters.ts`, `trash-follow-up-hooks.ts`).
- The object-store provider registry loaders live in Jini
  (`@jini-ai/platform/object-store/site/registry`). `site-deps/media-storage.ts` injects Tovu's
  Agent Plugin loaders (`../agent-plugins/lifecycle.ts` `loadPluginContributionsFromSource` /
  `loadPluginContributions`, `bundled-contribution-sources.ts`) and the agent-plugins seam
  (`defineProviderContribution` / `contributeProviders`, pinned to `TovuObjectStoreProvider`).
- `media-store.ts` also owns Tovu's provider host type `ObjectStoreHost` (SigV4 signing + optional
  request tracing) and `TovuObjectStoreProvider`.
- Artifact provider selection comes from `@jini-ai/platform/object-store/site/artifact-provider` and is bound in `site-deps/site-sharing.ts`.
- The setting keys come from `@jini-ai/platform/object-store/site/setting`.
