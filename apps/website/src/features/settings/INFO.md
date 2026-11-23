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
- `site-title-legacy.ts` owns `LEGACY_SITE_TITLE` ("Tovu Demo Site"), the product copy the engine's
  `@jini-ai/cms/settings/site/site-title` takes as `legacySiteTitle`: on the registrar's and the
  pin's input in both composition roots (`site-deps/identity-settings.ts`,
  `memory-deps/slices/site-title-settings.ts`, which also bind `set` and `resolveDefinitionRaw` on
  `preserveLegacySiteTitles`' deps), and through `siteTitleHostBindings` (the legacy title plus
  `getEffective`) on every `resolveSiteTitle` call site (render context, `llms.ts`, `feed.ts`, the
  templated preview, site consent).
