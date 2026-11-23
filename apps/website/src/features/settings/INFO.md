# settings Overview

Owns Tovu's host side of the settings ledger: the SQLite repository, the settings write chokepoint
(`site-title-write.ts`), typed writes and the host's tool wiring. The ledger itself
(`ensureSettingDefinitions`, `getEffective`, `set`) lives in `@jini-ai/core/settings`; the site
settings helpers live in `@jini-ai/cms/settings/site/*` and `@jini-ai/search/site/settings`.

## Wiring

The Jini site settings helpers never import the ledger functions; Tovu binds them:

- `ensureSettingDefinitions` rides on the shared definition deps (`siteTitleSettingsDeps`, built once
  in `server/runtime/composition/site-deps/identity-settings.ts` and
  `memory-deps/slices/site-title-settings.ts`), so every `ensure*` registrar
  (admin interface, chart provider, form delivery/destination, mail sender, search provider, site
  timezone) gets it as `deps.ensureSettingDefinitions`.
- `getEffective` is passed on each reader's required args at its call site
  (`readFormsAutoPull`, `readFormDeliveryBindings`, `readFormDestinationSetting`,
  `readMailSenderSetting`, `readSearchProviderSetting`, and `resolveSiteTimeZone` /
  `createSiteTimeZonePort` through `ResolveSiteTimeZoneDeps`).
- `site-timezone-fallback.ts` binds the `reportFallback` sink for `resolveSiteTimeZone`: fixed text plus
  `workspaceId` and `errorClass`, never the error's message.
