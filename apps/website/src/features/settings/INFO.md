# settings Overview

Owns Tovu's host side of the settings ledger: the SQLite repository, the host write policy bound
into the settings write chokepoint (`settings-write-policies.ts`; the chokepoint itself is
`@jini-ai/cms/settings/site/site-title-write`), and the host's tool wiring. The ledger itself
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
- `@jini-ai/cms/settings/site/site-timezone-fallback` builds the `reportFallback` sink for
  `resolveSiteTimeZone`: fixed text plus `workspaceId` and `errorClass`, never the error's message. The
  host binds it at each call site with `{ logger: createConsoleLogger({ prefix: "" }) }`.
- `site-title-legacy.ts` owns `LEGACY_SITE_TITLE` ("Tovu Demo Site"), the product copy the engine's
  `@jini-ai/cms/settings/site/site-title` takes as `legacySiteTitle`: on the registrar's and the
  pin's input in both composition roots (`site-deps/identity-settings.ts`,
  `memory-deps/slices/site-title-settings.ts`, which also bind `set` and `resolveDefinitionRaw` on
  `preserveLegacySiteTitles`' deps), and through `siteTitleHostBindings` (the legacy title plus
  `getEffective`, plus the `reportSiteTitleFailure` sink) on every `resolveSiteTitle` call site (render
  context, `llms.ts`, `feed.ts`, the templated preview, site consent). Both composition roots also spread
  `siteTitlePreservationHostBindings` (`reportSiteTitleFailure`, `reportPreservationSummary`) into
  `preserveLegacySiteTitles`' deps.
- `@jini-ai/cms/settings/site/site-title-reporter` builds those two sinks (`site-title-legacy.ts` binds
  them with the host's console logger): a failed pin or render read logs the engine's fixed text plus
  `workspaceId` and `errorClass`, never the error's message (the same rule as
  `@jini-ai/cms/settings/site/site-timezone-fallback`); a preservation run logs its pinned/skipped/failed
  counts.
- `settings-write-policies.ts` owns the visitor-tools dedicated writer (`VISITOR_TOOLS_*` and
  `parseVisitorToolPolicy` from `contracts/site-assistant/visitor-tools.ts`) and binds it once as
  `SETTINGS_WRITE_POLICIES` into the package chokepoint. The barrel's `set`/`clear`/`resetNamespace`/
  `refuseDedicatedSetting*` are those bound functions, so every existing caller (admin settings route,
  `RouteDeps.set`, comments, SEO, visitor tools) keeps its call shape. The typed writers that wrap the
  chokepoint (`writeFormDeliveryBindings`, `writeMailProviderSetting`, from `@jini-ai/cms/settings/site/*`)
  take `writePolicies: SETTINGS_WRITE_POLICIES` at their call sites (`composition/site-mailer.ts`,
  `composition/agent-plugin-connections.ts`).
- `tool-registrations.ts` is a host binding file: it keeps Tovu's rule tables
  (`TOVU_CONFIRMATION_SETTINGS`, `MAIL_SETTINGS_WRITE_DENIALS`, form-routing rules, the subagent /
  permanent-delete / consent denials), the settings card copy (`SETTINGS_CONFIRM_COPY`) and
  `toolMetadata`, and builds `confirmWrite` with `settingsConfirmWrite`
  (`@jini-ai/cms/settings/site/settings-confirm-write`), passing `surfaces`, `routeDeps`,
  `approvalToolHandler` (`contracts/core/human-confirm`), `validateRuntimeSelection`
  (`@jini-ai/agent-runtime`) and the copy. It narrows `SettingsToolDeps` to Tovu's `AssistantAgentInventory`.
- Visitor-tools management lives in `@jini-ai/cms/settings/site/visitor-tools-*`.
  `settings-write-policies.ts` binds Tovu's policy contract once as `VISITOR_TOOLS_HOST` (setting,
  permission, limits, `VisitorToolPolicyValidationError`, `parseVisitorToolPolicy`, ...), passed as
  `visitorTools` by `server/runtime/composition/visitor-tools-management.ts`.
  `visitor-tools-agent-tools.ts` keeps the model-facing catalog copy and binds
  `VISITOR_TOOLS_TOOL_HOST_POLICY` (catalog, tool metadata, approval-card engine, `VISITOR_TOOLS_HOST`)
  for `contributeVisitorTools` at `tool-catalog-manifest.ts`. `visitor-tools-permissions.ts` stays: it
  only registers Tovu's permission and owner/admin grants on the identity `PermissionGrantRegistry`.
- Site-setting publishing lives in `@jini-ai/cms/settings/site/publish-content`;
  `server/runtime/composition/publish-content-manifest.ts` binds `createRepoPublishHandler`,
  `gatewayDeps`, `PUBLISHABLE_SETTINGS`, `SETTINGS_WRITE_POLICIES` and `createSettingsPrincipalLookup`.
