# `seo`

Tovu wiring for SPEC-008 (ADR-PIPE-008; CMS design Rev 3). The SEO domain lives in
Jini `packages/cms/src/seo/`, consumed through `@jini-ai/cms/seo`. The `site.seo.*`
settings mapping and the agent-tool binding moved to `@jini-ai/cms/seo/site/*`;
Tovu imports those owners directly.

## Retained product wiring

- `index.ts` keeps the host bindings: `createSeoPostPort` (post repo),
  `createSeoFeaturedImagePort` (media and post owners), `createSeoDeps` (routing,
  scheduled-publish liveness, member access, runtime mode, the site title and the
  outbox), and `seoSettingsHostBindings`, this host's settings ledger for every
  `@jini-ai/cms/seo/site/settings` call: the package registrar and reader, the
  host's policy-wrapped chokepoint `set` (`features/settings/site-title-write.ts`)
  and its active-principal policy (`createSettingsPrincipalLookup`). Its former
  re-exports of `settings.ts` were removed; callers import the Jini owner.
- `settings.ts` moved to `@jini-ai/cms/seo/site/settings`. Call sites spread
  `seoSettingsHostBindings` into the existing deps: boot registration
  (`server/runtime/composition/settings-registration.ts`) and the admin
  settings routes (`server/inbound/admin-http/routes/seo/{get,put}-settings.ts`).
- `tool-registrations.ts` moved to `@jini-ai/cms/seo/site/tool-registrations`.
  `server/runtime/composition/tool-catalog-manifest.ts` binds it with the tool
  metadata (`@jini-ai/core/tool-metadata/seo`), the read vocabulary
  (`@jini-ai/core/tool-metadata/content-read`) and `seoSettingsHostBindings`.
- `__tests__/`: the retained product suites run the Jini modules against Tovu's
  real ledger, metadata and composition. The modules' own unit tests live in Jini
  `packages/cms/src/seo/site/__tests__/`. Package boundary rules: Jini
  `docs/decisions/DR-005-portable-package-boundaries.md`.
