# R — root phases (deps-split v4, last sheet)

Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here. Runs after M1-M3, B01-B25, H1-H4, L1-L6.

## Owner rule this sheet satisfies (no exception)
`composeSiteRouteDeps` must end at **≤ 50 code lines and complexity ≤ 10**. After every other sheet the root is 129 code lines (measured by ESLint's own `max-lines-per-function` on the synthesized post-sheet text, `evidence/deps.after-sheets-2d82735a.ts.txt`). This sheet splits it into **7 ordered phase functions** (each ≤ 50 lines) between the root's fixed points. Measured on the synthesized result (`evidence/deps.after-R-2d82735a.ts.txt`) with the repo's size config: **root 49 lines, complexity 7**; phases 7, 19, 15, 9, 7, 39, 19 lines, complexity 2 each (3 for `assembleRouteDepsPhase`).

What stays in the root, and why (each is a line the phases cannot own without changing behaviour):
- the 9 `await`s, verbatim (no phase contains an `await`: a phase is synchronous, so no async turn is added; v4's no-await rule extends to phases);
- the 4 `let` cells and their 4 writes (`formCollectionProviders =`, `lifecycleTracker =`, `bindSharedApiOAuth =`, `routeDepsBuiltForPluginHost =`); phases read the cells through getters;
- `const { store, onStoreClose } = opened;`, `const pendingLifecycleEvents …`, `const chatDbPath …`, `const chat …`, `setServerLogTraceReader(…)` (single lines between fixed points), the 2 one-line slice calls that sit alone between awaits (B17, B18) and `return routeDeps;`.

Phase boundaries are exactly the fixed points above, so statement order is unchanged by construction: every phase is a contiguous run of root statements, called at the run's place.

## Steps of the edit
**a. Hoist three `let` declarations** (with the comment lines directly above them, which move with them) to directly after `let lifecycleTracker …`, in this order:
```ts
  let routeDepsBuiltForPluginHost: { readonly pluginHost?: RouteDeps["pluginHost"] } | undefined;
  let formCollectionProviders = () => createFormCollectionRegistry({});
  let bindSharedApiOAuth: ((input: { keyId: string; use: boolean }) => Promise<void>) | undefined;
```
They have no initializer or a side-effect-free one (a closure), and no statement reads them before their tip position except through a getter, so declaring them earlier changes nothing observable; it removes three phase boundaries.

**b. Create the phase files.** `site-deps/boot-phases.ts` holds phases 1-5, `site-deps/assembly-phases.ts` holds 6-7 (one file would pass 500 lines with the `Required` types). Each phase is `export function <name>(required: <Name>Required, _optional = {})` whose body is: `const { <every field> } = required;`, the statements listed below **verbatim, comments included, getter fields read as `name()`**, then `return { <outputs> };` (omitted when there are none). No phase contains `await`.

### 1. `composeStoragePhase` → `site-deps/boot-phases.ts` (3 root statements, 3 code lines; function 7 lines)
Takes the root statements from `const { assistantAgentInventory, resolvedSiteBinding, agentPluginLayout, agentPluginLifecy` through `const { resolvedUploadsDir, provideMediaCredentials, mediaStorePorts, blobStore, mediaIsRe`, **verbatim, with the comments between them**. Root call (replaces them, same place):
```ts
  const { assistantAgentInventory, resolvedSiteBinding, agentPluginLayout, agentPluginLifecycle, federatedMcpPresetRegistry, skillLayout, resolvedThemesDir, kernel, resolvedUploadsDir, provideMediaCredentials, mediaStorePorts, blobStore, mediaIsRemoteByEnv, isMediaRemote, storeBound } = composeStoragePhase({ dbPath, overrides, onStoreClose, store, lifecycleTracker: () => lifecycleTracker, workspaceId: () => workspaceId, settingsRepo: () => settingsRepo, observability: () => observability, routeDeps: () => routeDeps });
```
Outputs (15): `assistantAgentInventory`, `resolvedSiteBinding`, `agentPluginLayout`, `agentPluginLifecycle`, `federatedMcpPresetRegistry`, `skillLayout`, `resolvedThemesDir`, `kernel`, `resolvedUploadsDir`, `provideMediaCredentials`, `mediaStorePorts`, `blobStore`, `mediaIsRemoteByEnv`, `isMediaRemote`, `storeBound`.

<details><summary>ComposeStoragePhaseRequired — 9 fields (5 getters)</summary>

| field | how passed | type |
|---|---|---|
| `dbPath` | value | root parameter (rule) |
| `overrides` | value | root parameter (rule) |
| `onStoreClose` | value | `const { store, onStoreClose } = opened;` |
| `store` | value | `const { store, onStoreClose } = opened;` |
| `lifecycleTracker` | **getter** `() => lifecycleTracker` | `let lifecycleTracker: Pick<RouteDeps['tracker'], 'capture'> = { capture: (input, options = {}) => { pendingLifecycleEvents.push([input, options]); } }` |
| `workspaceId` | **getter** `() => workspaceId` | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `settingsRepo` | **getter** `() => settingsRepo` | `ReturnType<typeof composeSiteServicesPhase>["settingsRepo"]` |
| `observability` | **getter** `() => observability` | `ReturnType<typeof composeProviderLifecyclePhase>["observability"]` |
| `routeDeps` | **getter** `() => routeDeps` | `ReturnType<typeof assembleRouteDepsPhase>["routeDeps"]` |
</details>

### 2. `composeSiteServicesPhase` → `site-deps/boot-phases.ts` (15 root statements, 15 code lines; function 19 lines)
Takes the root statements from `logMediaProviderRefusals({ refusals: mediaProviders.refusals });` through `const { runtimeMode, siteDirForKeyring, memberRepo, newsletterKeyring, newsletterSubscribe`, **verbatim, with the comments between them**. Root call (replaces them, same place):
```ts
  const { postSearchBackfillReady, clock, idGen, reportToolAuditError, pluginActivationRepo, pluginRuntime, identity, settingsPrincipals, adminPasswordResetReady, presentationRepo, settingsRepo, settingsReady, seoReady, commentsSettingsReady, assistantSettingsReady, executionSettingsReady, settingsUiTabsReady, analyticsSettingsReady, siteTitlePreservationStore, siteDisplayName, siteTimeZone, siteTitleSettingsDeps, siteSettingsReady, siteTitleReady, menuRepo, navLocationBindingRepo, menuBindingsReady, newsletterListRepo, newsletterReady, commentsReady, transformDefinitionRepo, mediaTransformReady, blobHydrationReady, outbox, bus, devCapabilityScheme, originReady, originRegistry, redirectRepo, redirectHitSink, assetRenditionRepo, trashRegistry, sqliteTrashDb, trashRepo, formDeliveryRepo, trashAdapters, trashTransaction, trash, removePlugin, removeUser, isInTrash, redirectsWriteDeps, databaseLedgerRepo, migrationRunsRepo, publishContentRunRepo, restorePointsRepo, dbOps, databaseIntrospection, entryRepo, sqliteEntryTermRepo, taxonomyRepo, termRepo, taxonomyRevisionRepo, stampWatermark, widgetBindingRepo, entryRefsRepo, formDefinitionRepo, formSubmissionRepo, contentTypeRepo, contentTypeIndexProvisioner, commentsModule, commentsCapability, runtimeMode, siteDirForKeyring, memberRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks, siteAssistantSecretKeyring, siteAssistantSecretSealer } = composeSiteServicesPhase({ dbPath, overrides, onStoreClose, lifecycleTracker: () => lifecycleTracker, routeDepsBuiltForPluginHost: () => routeDepsBuiltForPluginHost, formCollectionProviders: () => formCollectionProviders, agentPluginLayout, resolvedSiteBinding, kernel, blobStore, storeBound, workspaceId, mediaProviders, assetBlobRepo: () => assetBlobRepo, mediaRepo: () => mediaRepo, postRepo: () => postRepo, mediaContentTypeStore: () => mediaContentTypeStore, routeDeps: () => routeDeps });
```
Outputs (80): `postSearchBackfillReady`, `clock`, `idGen`, `reportToolAuditError`, `pluginActivationRepo`, `pluginRuntime`, `identity`, `settingsPrincipals`, `adminPasswordResetReady`, `presentationRepo`, `settingsRepo`, `settingsReady`, `seoReady`, `commentsSettingsReady`, `assistantSettingsReady`, `executionSettingsReady`, `settingsUiTabsReady`, `analyticsSettingsReady`, `siteTitlePreservationStore`, `siteDisplayName`, `siteTimeZone`, `siteTitleSettingsDeps`, `siteSettingsReady`, `siteTitleReady`, `menuRepo`, `navLocationBindingRepo`, `menuBindingsReady`, `newsletterListRepo`, `newsletterReady`, `commentsReady`, `transformDefinitionRepo`, `mediaTransformReady`, `blobHydrationReady`, `outbox`, `bus`, `devCapabilityScheme`, `originReady`, `originRegistry`, `redirectRepo`, `redirectHitSink`, `assetRenditionRepo`, `trashRegistry`, `sqliteTrashDb`, `trashRepo`, `formDeliveryRepo`, `trashAdapters`, `trashTransaction`, `trash`, `removePlugin`, `removeUser`, `isInTrash`, `redirectsWriteDeps`, `databaseLedgerRepo`, `migrationRunsRepo`, `publishContentRunRepo`, `restorePointsRepo`, `dbOps`, `databaseIntrospection`, `entryRepo`, `sqliteEntryTermRepo`, `taxonomyRepo`, `termRepo`, `taxonomyRevisionRepo`, `stampWatermark`, `widgetBindingRepo`, `entryRefsRepo`, `formDefinitionRepo`, `formSubmissionRepo`, `contentTypeRepo`, `contentTypeIndexProvisioner`, `commentsModule`, `commentsCapability`, `runtimeMode`, `siteDirForKeyring`, `memberRepo`, `newsletterKeyring`, `newsletterSubscriberDirectory`, `newsletterHooks`, `siteAssistantSecretKeyring`, `siteAssistantSecretSealer`.

<details><summary>ComposeSiteServicesPhaseRequired — 18 fields (8 getters)</summary>

| field | how passed | type |
|---|---|---|
| `dbPath` | value | root parameter (rule) |
| `overrides` | value | root parameter (rule) |
| `onStoreClose` | value | `const { store, onStoreClose } = opened;` |
| `lifecycleTracker` | **getter** `() => lifecycleTracker` | `let lifecycleTracker: Pick<RouteDeps['tracker'], 'capture'> = { capture: (input, options = {}) => { pendingLifecycleEvents.push([input, options]); } }` |
| `routeDepsBuiltForPluginHost` | **getter** `() => routeDepsBuiltForPluginHost` | `let routeDepsBuiltForPluginHost: { readonly pluginHost?: RouteDeps["pluginHost"] } \| undefined;` |
| `formCollectionProviders` | **getter** `() => formCollectionProviders` | `let formCollectionProviders = () => createFormCollectionRegistry({});` |
| `agentPluginLayout` | value | `ReturnType<typeof composeStoragePhase>["agentPluginLayout"]` |
| `resolvedSiteBinding` | value | `ReturnType<typeof composeStoragePhase>["resolvedSiteBinding"]` |
| `kernel` | value | `ReturnType<typeof composeStoragePhase>["kernel"]` |
| `blobStore` | value | `ReturnType<typeof composeStoragePhase>["blobStore"]` |
| `storeBound` | value | `ReturnType<typeof composeStoragePhase>["storeBound"]` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `mediaProviders` | value | `const mediaProviders = await loadMediaProviderRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions });` |
| `assetBlobRepo` | **getter** `() => assetBlobRepo` | `ReturnType<typeof composeInstrumentedContentPhase>["assetBlobRepo"]` |
| `mediaRepo` | **getter** `() => mediaRepo` | `ReturnType<typeof composeInstrumentedContentPhase>["mediaRepo"]` |
| `postRepo` | **getter** `() => postRepo` | `ReturnType<typeof composeInstrumentedContentPhase>["postRepo"]` |
| `mediaContentTypeStore` | **getter** `() => mediaContentTypeStore` | `ReturnType<typeof composePublishingPhase>["mediaContentTypeStore"]` |
| `routeDeps` | **getter** `() => routeDeps` | `ReturnType<typeof assembleRouteDepsPhase>["routeDeps"]` |
</details>

### 3. `composeProviderLifecyclePhase` → `site-deps/boot-phases.ts` (4 root statements, 11 code lines; function 15 lines)
Takes the root statements from `onStoreClose({ registration: async () => {` through `const { observability, tracker, aiTraceSink } = providerPlugins;`, **verbatim, with the comments between them**. Root call (replaces them, same place):
```ts
  const { projectKeys, observability, tracker, aiTraceSink } = composeProviderLifecyclePhase({ onStoreClose, bindSharedApiOAuth: () => bindSharedApiOAuth, resolvedSiteBinding, kernel, workspaceId, clock, pluginRuntime, projectKeyReferences, projectSiteId, projectStore, providerConfigSource, providerPlugins });
```
Outputs (4): `projectKeys`, `observability`, `tracker`, `aiTraceSink`.

<details><summary>ComposeProviderLifecyclePhaseRequired — 12 fields (1 getters)</summary>

| field | how passed | type |
|---|---|---|
| `onStoreClose` | value | `const { store, onStoreClose } = opened;` |
| `bindSharedApiOAuth` | **getter** `() => bindSharedApiOAuth` | `let bindSharedApiOAuth: ((input: { keyId: string; use: boolean }) => Promise<void>) \| undefined;` |
| `resolvedSiteBinding` | value | `ReturnType<typeof composeStoragePhase>["resolvedSiteBinding"]` |
| `kernel` | value | `ReturnType<typeof composeStoragePhase>["kernel"]` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `clock` | value | `ReturnType<typeof composeSiteServicesPhase>["clock"]` |
| `pluginRuntime` | value | `ReturnType<typeof composeSiteServicesPhase>["pluginRuntime"]` |
| `projectKeyReferences` | value | `ReturnType<typeof composeAssistantCredentials>["projectKeyReferences"]` |
| `projectSiteId` | value | `const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ over` |
| `projectStore` | value | `const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ over` |
| `providerConfigSource` | value | `ReturnType<typeof composeProviderConfigSource>["providerConfigSource"]` |
| `providerPlugins` | value | `const providerPlugins = await providerPluginBoot({ overrides })({` |
</details>

### 4. `composeInstrumentedContentPhase` → `site-deps/boot-phases.ts` (5 root statements, 5 code lines; function 9 lines)
Takes the root statements from `flushLifecycleEvents({ pending: pendingLifecycleEvents, tracker });` through `const { postRepo, changeSets, mediaRepo, assetBlobRepo } = composeContentStores({ kernel }`, **verbatim, with the comments between them**. Root call (replaces them, same place):
```ts
  const { resolvedMailer, mailDurableOutboxReady, customCredentialsHttpClient, siteBackupHttpClient, outboundTestOrigins, mediaImportHttpClient, publishContentPeerHttpClient, postRepo, changeSets, mediaRepo, assetBlobRepo } = composeInstrumentedContentPhase({ overrides, pendingLifecycleEvents, agentPluginLifecycle, kernel, workspaceId, chat, clock, idGen, identity, settingsPrincipals, settingsRepo, siteTitleReady, originRegistry, runtimeMode, siteAssistantSecretSealer, externalMcpServerRepo, customCredentialSetRepo, observability, tracker });
```
Outputs (11): `resolvedMailer`, `mailDurableOutboxReady`, `customCredentialsHttpClient`, `siteBackupHttpClient`, `outboundTestOrigins`, `mediaImportHttpClient`, `publishContentPeerHttpClient`, `postRepo`, `changeSets`, `mediaRepo`, `assetBlobRepo`.

<details><summary>ComposeInstrumentedContentPhaseRequired — 19 fields (0 getters)</summary>

| field | how passed | type |
|---|---|---|
| `overrides` | value | root parameter (rule) |
| `pendingLifecycleEvents` | value | `const pendingLifecycleEvents: Array<Parameters<RouteDeps['tracker']['capture']>> = [];` |
| `agentPluginLifecycle` | value | `ReturnType<typeof composeStoragePhase>["agentPluginLifecycle"]` |
| `kernel` | value | `ReturnType<typeof composeStoragePhase>["kernel"]` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `chat` | value | `const chat = store.chat;` |
| `clock` | value | `ReturnType<typeof composeSiteServicesPhase>["clock"]` |
| `idGen` | value | `ReturnType<typeof composeSiteServicesPhase>["idGen"]` |
| `identity` | value | `ReturnType<typeof composeSiteServicesPhase>["identity"]` |
| `settingsPrincipals` | value | `ReturnType<typeof composeSiteServicesPhase>["settingsPrincipals"]` |
| `settingsRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["settingsRepo"]` |
| `siteTitleReady` | value | `ReturnType<typeof composeSiteServicesPhase>["siteTitleReady"]` |
| `originRegistry` | value | `ReturnType<typeof composeSiteServicesPhase>["originRegistry"]` |
| `runtimeMode` | value | `ReturnType<typeof composeSiteServicesPhase>["runtimeMode"]` |
| `siteAssistantSecretSealer` | value | `ReturnType<typeof composeSiteServicesPhase>["siteAssistantSecretSealer"]` |
| `externalMcpServerRepo` | value | `ReturnType<typeof composeAssistantCredentials>["externalMcpServerRepo"]` |
| `customCredentialSetRepo` | value | `ReturnType<typeof composeProviderConfigSource>["customCredentialSetRepo"]` |
| `observability` | value | `ReturnType<typeof composeProviderLifecyclePhase>["observability"]` |
| `tracker` | value | `ReturnType<typeof composeProviderLifecyclePhase>["tracker"]` |
</details>

### 5. `composePublishingPhase` → `site-deps/boot-phases.ts` (3 root statements, 3 code lines; function 7 lines)
Takes the root statements from `const { mediaContentTypeStore, publishContentBundleRepo, publishContentBaselineRepo, publi` through `const { guardedOutboundHttpClient, externalMcpOAuthHttpPorts, derivedPublicOrigin, agentPl`, **verbatim, with the comments between them**. Root call (replaces them, same place):
```ts
  const { mediaContentTypeStore, publishContentBundleRepo, publishContentBaselineRepo, publishContentFileBlobIndex, publishContentPeerRepo, publishContentSeedHash, siteThemes, removeTheme, publishContentApplyPort, guardedOutboundHttpClient, externalMcpOAuthHttpPorts, derivedPublicOrigin, agentPluginConnections } = composePublishingPhase({ agentPluginLifecycle, resolvedSiteBinding, resolvedThemesDir, kernel, blobStore, workspaceId, clock, idGen, identity, presentationRepo, settingsPrincipals, settingsRepo, menuRepo, navLocationBindingRepo, devCapabilityScheme, outbox, trashRepo, trashAdapters, trash, redirectsWriteDeps, publishContentRunRepo, entryRefsRepo, entryRepo, formDefinitionRepo, sqliteEntryTermRepo, stampWatermark, taxonomyRepo, taxonomyRevisionRepo, termRepo, widgetBindingRepo, contentTypeIndexProvisioner, contentTypeRepo, siteAssistantSecretKeyring, siteAssistantSecretSealer, siteReferenceRepo, projectSiteId, projectStore, customCredentialSetRepo, assetBlobRepo, changeSets, mediaRepo, postRepo });
```
Outputs (13): `mediaContentTypeStore`, `publishContentBundleRepo`, `publishContentBaselineRepo`, `publishContentFileBlobIndex`, `publishContentPeerRepo`, `publishContentSeedHash`, `siteThemes`, `removeTheme`, `publishContentApplyPort`, `guardedOutboundHttpClient`, `externalMcpOAuthHttpPorts`, `derivedPublicOrigin`, `agentPluginConnections`.

<details><summary>ComposePublishingPhaseRequired — 42 fields (0 getters)</summary>

| field | how passed | type |
|---|---|---|
| `agentPluginLifecycle` | value | `ReturnType<typeof composeStoragePhase>["agentPluginLifecycle"]` |
| `resolvedSiteBinding` | value | `ReturnType<typeof composeStoragePhase>["resolvedSiteBinding"]` |
| `resolvedThemesDir` | value | `ReturnType<typeof composeStoragePhase>["resolvedThemesDir"]` |
| `kernel` | value | `ReturnType<typeof composeStoragePhase>["kernel"]` |
| `blobStore` | value | `ReturnType<typeof composeStoragePhase>["blobStore"]` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `clock` | value | `ReturnType<typeof composeSiteServicesPhase>["clock"]` |
| `idGen` | value | `ReturnType<typeof composeSiteServicesPhase>["idGen"]` |
| `identity` | value | `ReturnType<typeof composeSiteServicesPhase>["identity"]` |
| `presentationRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["presentationRepo"]` |
| `settingsPrincipals` | value | `ReturnType<typeof composeSiteServicesPhase>["settingsPrincipals"]` |
| `settingsRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["settingsRepo"]` |
| `menuRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["menuRepo"]` |
| `navLocationBindingRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["navLocationBindingRepo"]` |
| `devCapabilityScheme` | value | `ReturnType<typeof composeSiteServicesPhase>["devCapabilityScheme"]` |
| `outbox` | value | `ReturnType<typeof composeSiteServicesPhase>["outbox"]` |
| `trashRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["trashRepo"]` |
| `trashAdapters` | value | `ReturnType<typeof composeSiteServicesPhase>["trashAdapters"]` |
| `trash` | value | `ReturnType<typeof composeSiteServicesPhase>["trash"]` |
| `redirectsWriteDeps` | value | `ReturnType<typeof composeSiteServicesPhase>["redirectsWriteDeps"]` |
| `publishContentRunRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["publishContentRunRepo"]` |
| `entryRefsRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["entryRefsRepo"]` |
| `entryRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["entryRepo"]` |
| `formDefinitionRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["formDefinitionRepo"]` |
| `sqliteEntryTermRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["sqliteEntryTermRepo"]` |
| `stampWatermark` | value | `ReturnType<typeof composeSiteServicesPhase>["stampWatermark"]` |
| `taxonomyRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["taxonomyRepo"]` |
| `taxonomyRevisionRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["taxonomyRevisionRepo"]` |
| `termRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["termRepo"]` |
| `widgetBindingRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["widgetBindingRepo"]` |
| `contentTypeIndexProvisioner` | value | `ReturnType<typeof composeSiteServicesPhase>["contentTypeIndexProvisioner"]` |
| `contentTypeRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["contentTypeRepo"]` |
| `siteAssistantSecretKeyring` | value | `ReturnType<typeof composeSiteServicesPhase>["siteAssistantSecretKeyring"]` |
| `siteAssistantSecretSealer` | value | `ReturnType<typeof composeSiteServicesPhase>["siteAssistantSecretSealer"]` |
| `siteReferenceRepo` | value | `ReturnType<typeof composeAssistantCredentials>["siteReferenceRepo"]` |
| `projectSiteId` | value | `const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ over` |
| `projectStore` | value | `const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ over` |
| `customCredentialSetRepo` | value | `ReturnType<typeof composeProviderConfigSource>["customCredentialSetRepo"]` |
| `assetBlobRepo` | value | `ReturnType<typeof composeInstrumentedContentPhase>["assetBlobRepo"]` |
| `changeSets` | value | `ReturnType<typeof composeInstrumentedContentPhase>["changeSets"]` |
| `mediaRepo` | value | `ReturnType<typeof composeInstrumentedContentPhase>["mediaRepo"]` |
| `postRepo` | value | `ReturnType<typeof composeInstrumentedContentPhase>["postRepo"]` |
</details>

### 6. `assembleRouteDepsPhase` → `site-deps/assembly-phases.ts` (10 root statements, 35 code lines; function 39 lines)
Takes the root statements from `const { adminSurfaceHandlersReady, siteAppBootWork, seoDeps, sitemapService, resolveRouteD` through `routeDeps.pluginHost = createTovuPluginHost({ deps: routeDeps });`, **verbatim, with the comments between them**. Root call (replaces them, same place):
```ts
  const { adminSurfaceHandlersReady, siteAppBootWork, routeDeps, widgetAdoptionReady } = assembleRouteDepsPhase({ dbPath, overrides, onStoreClose, formCollectionProviders, agentPluginLayout, agentPluginLifecycle, assistantAgentInventory, federatedMcpPresetRegistry, resolvedSiteBinding, resolvedThemesDir, skillLayout, kernel, blobStore, isMediaRemote, mediaIsRemoteByEnv, resolvedUploadsDir, workspaceId, publishTrustRevocations, chat, mediaProviders, clock, idGen, pluginActivationRepo, postSearchBackfillReady, reportToolAuditError, pluginRuntime, adminPasswordResetReady, analyticsSettingsReady, assistantSettingsReady, commentsSettingsReady, executionSettingsReady, identity, presentationRepo, seoReady, settingsPrincipals, settingsReady, settingsRepo, settingsUiTabsReady, siteDisplayName, siteSettingsReady, siteTimeZone, siteTitlePreservationStore, siteTitleReady, siteTitleSettingsDeps, blobHydrationReady, commentsReady, mediaTransformReady, menuBindingsReady, menuRepo, navLocationBindingRepo, newsletterListRepo, newsletterReady, transformDefinitionRepo, assetRenditionRepo, bus, originRegistry, outbox, redirectHitSink, redirectRepo, formDeliveryRepo, sqliteTrashDb, trashRegistry, trashRepo, trashAdapters, isInTrash, removePlugin, removeUser, trash, trashTransaction, redirectsWriteDeps, databaseIntrospection, databaseLedgerRepo, dbOps, migrationRunsRepo, publishContentRunRepo, restorePointsRepo, entryRefsRepo, entryRepo, formDefinitionRepo, sqliteEntryTermRepo, stampWatermark, taxonomyRepo, taxonomyRevisionRepo, termRepo, widgetBindingRepo, commentsCapability, commentsModule, contentTypeIndexProvisioner, contentTypeRepo, formSubmissionRepo, memberRepo, newsletterHooks, newsletterKeyring, newsletterSubscriberDirectory, runtimeMode, siteAssistantSecretKeyring, siteAssistantSecretSealer, externalMcpOAuthDevices, externalMcpServerRepo, siteAssistantCredentialRepo, siteReferenceRepo, projectSiteId, projectStore, projectVault, customCredentialSetRepo, providerConfigSource, providerPlugins, projectKeys, aiTraceSink, observability, tracker, customCredentialsHttpClient, mailDurableOutboxReady, mediaImportHttpClient, outboundTestOrigins, publishContentPeerHttpClient, resolvedMailer, siteBackupHttpClient, assetBlobRepo, mediaRepo, postRepo, mediaContentTypeStore, publishContentBaselineRepo, publishContentBundleRepo, publishContentFileBlobIndex, publishContentPeerRepo, publishContentSeedHash, removeTheme, siteThemes, publishContentApplyPort, agentPluginConnections, derivedPublicOrigin, externalMcpOAuthHttpPorts, guardedOutboundHttpClient });
```
Outputs (4): `adminSurfaceHandlersReady`, `siteAppBootWork`, `routeDeps`, `widgetAdoptionReady`.

<details><summary>AssembleRouteDepsPhaseRequired — 134 fields (0 getters)</summary>

| field | how passed | type |
|---|---|---|
| `dbPath` | value | root parameter (rule) |
| `overrides` | value | root parameter (rule) |
| `onStoreClose` | value | `const { store, onStoreClose } = opened;` |
| `formCollectionProviders` | value | `let formCollectionProviders = () => createFormCollectionRegistry({});` |
| `agentPluginLayout` | value | `ReturnType<typeof composeStoragePhase>["agentPluginLayout"]` |
| `agentPluginLifecycle` | value | `ReturnType<typeof composeStoragePhase>["agentPluginLifecycle"]` |
| `assistantAgentInventory` | value | `ReturnType<typeof composeStoragePhase>["assistantAgentInventory"]` |
| `federatedMcpPresetRegistry` | value | `ReturnType<typeof composeStoragePhase>["federatedMcpPresetRegistry"]` |
| `resolvedSiteBinding` | value | `ReturnType<typeof composeStoragePhase>["resolvedSiteBinding"]` |
| `resolvedThemesDir` | value | `ReturnType<typeof composeStoragePhase>["resolvedThemesDir"]` |
| `skillLayout` | value | `ReturnType<typeof composeStoragePhase>["skillLayout"]` |
| `kernel` | value | `ReturnType<typeof composeStoragePhase>["kernel"]` |
| `blobStore` | value | `ReturnType<typeof composeStoragePhase>["blobStore"]` |
| `isMediaRemote` | value | `ReturnType<typeof composeStoragePhase>["isMediaRemote"]` |
| `mediaIsRemoteByEnv` | value | `ReturnType<typeof composeStoragePhase>["mediaIsRemoteByEnv"]` |
| `resolvedUploadsDir` | value | `ReturnType<typeof composeStoragePhase>["resolvedUploadsDir"]` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `publishTrustRevocations` | value | `const publishTrustRevocations = await publishTrustRevocationStoreFor({ kernel });` |
| `chat` | value | `const chat = store.chat;` |
| `mediaProviders` | value | `const mediaProviders = await loadMediaProviderRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions });` |
| `clock` | value | `ReturnType<typeof composeSiteServicesPhase>["clock"]` |
| `idGen` | value | `ReturnType<typeof composeSiteServicesPhase>["idGen"]` |
| `pluginActivationRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["pluginActivationRepo"]` |
| `postSearchBackfillReady` | value | `ReturnType<typeof composeSiteServicesPhase>["postSearchBackfillReady"]` |
| `reportToolAuditError` | value | `ReturnType<typeof composeSiteServicesPhase>["reportToolAuditError"]` |
| `pluginRuntime` | value | `ReturnType<typeof composeSiteServicesPhase>["pluginRuntime"]` |
| `adminPasswordResetReady` | value | `ReturnType<typeof composeSiteServicesPhase>["adminPasswordResetReady"]` |
| `analyticsSettingsReady` | value | `ReturnType<typeof composeSiteServicesPhase>["analyticsSettingsReady"]` |
| `assistantSettingsReady` | value | `ReturnType<typeof composeSiteServicesPhase>["assistantSettingsReady"]` |
| `commentsSettingsReady` | value | `ReturnType<typeof composeSiteServicesPhase>["commentsSettingsReady"]` |
| `executionSettingsReady` | value | `ReturnType<typeof composeSiteServicesPhase>["executionSettingsReady"]` |
| `identity` | value | `ReturnType<typeof composeSiteServicesPhase>["identity"]` |
| `presentationRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["presentationRepo"]` |
| `seoReady` | value | `ReturnType<typeof composeSiteServicesPhase>["seoReady"]` |
| `settingsPrincipals` | value | `ReturnType<typeof composeSiteServicesPhase>["settingsPrincipals"]` |
| `settingsReady` | value | `ReturnType<typeof composeSiteServicesPhase>["settingsReady"]` |
| `settingsRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["settingsRepo"]` |
| `settingsUiTabsReady` | value | `ReturnType<typeof composeSiteServicesPhase>["settingsUiTabsReady"]` |
| `siteDisplayName` | value | `ReturnType<typeof composeSiteServicesPhase>["siteDisplayName"]` |
| `siteSettingsReady` | value | `ReturnType<typeof composeSiteServicesPhase>["siteSettingsReady"]` |
| `siteTimeZone` | value | `ReturnType<typeof composeSiteServicesPhase>["siteTimeZone"]` |
| `siteTitlePreservationStore` | value | `ReturnType<typeof composeSiteServicesPhase>["siteTitlePreservationStore"]` |
| `siteTitleReady` | value | `ReturnType<typeof composeSiteServicesPhase>["siteTitleReady"]` |
| `siteTitleSettingsDeps` | value | `ReturnType<typeof composeSiteServicesPhase>["siteTitleSettingsDeps"]` |
| `blobHydrationReady` | value | `ReturnType<typeof composeSiteServicesPhase>["blobHydrationReady"]` |
| `commentsReady` | value | `ReturnType<typeof composeSiteServicesPhase>["commentsReady"]` |
| `mediaTransformReady` | value | `ReturnType<typeof composeSiteServicesPhase>["mediaTransformReady"]` |
| `menuBindingsReady` | value | `ReturnType<typeof composeSiteServicesPhase>["menuBindingsReady"]` |
| `menuRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["menuRepo"]` |
| `navLocationBindingRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["navLocationBindingRepo"]` |
| `newsletterListRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["newsletterListRepo"]` |
| `newsletterReady` | value | `ReturnType<typeof composeSiteServicesPhase>["newsletterReady"]` |
| `transformDefinitionRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["transformDefinitionRepo"]` |
| `assetRenditionRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["assetRenditionRepo"]` |
| `bus` | value | `ReturnType<typeof composeSiteServicesPhase>["bus"]` |
| `originRegistry` | value | `ReturnType<typeof composeSiteServicesPhase>["originRegistry"]` |
| `outbox` | value | `ReturnType<typeof composeSiteServicesPhase>["outbox"]` |
| `redirectHitSink` | value | `ReturnType<typeof composeSiteServicesPhase>["redirectHitSink"]` |
| `redirectRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["redirectRepo"]` |
| `formDeliveryRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["formDeliveryRepo"]` |
| `sqliteTrashDb` | value | `ReturnType<typeof composeSiteServicesPhase>["sqliteTrashDb"]` |
| `trashRegistry` | value | `ReturnType<typeof composeSiteServicesPhase>["trashRegistry"]` |
| `trashRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["trashRepo"]` |
| `trashAdapters` | value | `ReturnType<typeof composeSiteServicesPhase>["trashAdapters"]` |
| `isInTrash` | value | `ReturnType<typeof composeSiteServicesPhase>["isInTrash"]` |
| `removePlugin` | value | `ReturnType<typeof composeSiteServicesPhase>["removePlugin"]` |
| `removeUser` | value | `ReturnType<typeof composeSiteServicesPhase>["removeUser"]` |
| `trash` | value | `ReturnType<typeof composeSiteServicesPhase>["trash"]` |
| `trashTransaction` | value | `ReturnType<typeof composeSiteServicesPhase>["trashTransaction"]` |
| `redirectsWriteDeps` | value | `ReturnType<typeof composeSiteServicesPhase>["redirectsWriteDeps"]` |
| `databaseIntrospection` | value | `ReturnType<typeof composeSiteServicesPhase>["databaseIntrospection"]` |
| `databaseLedgerRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["databaseLedgerRepo"]` |
| `dbOps` | value | `ReturnType<typeof composeSiteServicesPhase>["dbOps"]` |
| `migrationRunsRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["migrationRunsRepo"]` |
| `publishContentRunRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["publishContentRunRepo"]` |
| `restorePointsRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["restorePointsRepo"]` |
| `entryRefsRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["entryRefsRepo"]` |
| `entryRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["entryRepo"]` |
| `formDefinitionRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["formDefinitionRepo"]` |
| `sqliteEntryTermRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["sqliteEntryTermRepo"]` |
| `stampWatermark` | value | `ReturnType<typeof composeSiteServicesPhase>["stampWatermark"]` |
| `taxonomyRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["taxonomyRepo"]` |
| `taxonomyRevisionRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["taxonomyRevisionRepo"]` |
| `termRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["termRepo"]` |
| `widgetBindingRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["widgetBindingRepo"]` |
| `commentsCapability` | value | `ReturnType<typeof composeSiteServicesPhase>["commentsCapability"]` |
| `commentsModule` | value | `ReturnType<typeof composeSiteServicesPhase>["commentsModule"]` |
| `contentTypeIndexProvisioner` | value | `ReturnType<typeof composeSiteServicesPhase>["contentTypeIndexProvisioner"]` |
| `contentTypeRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["contentTypeRepo"]` |
| `formSubmissionRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["formSubmissionRepo"]` |
| `memberRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["memberRepo"]` |
| `newsletterHooks` | value | `ReturnType<typeof composeSiteServicesPhase>["newsletterHooks"]` |
| `newsletterKeyring` | value | `ReturnType<typeof composeSiteServicesPhase>["newsletterKeyring"]` |
| `newsletterSubscriberDirectory` | value | `ReturnType<typeof composeSiteServicesPhase>["newsletterSubscriberDirectory"]` |
| `runtimeMode` | value | `ReturnType<typeof composeSiteServicesPhase>["runtimeMode"]` |
| `siteAssistantSecretKeyring` | value | `ReturnType<typeof composeSiteServicesPhase>["siteAssistantSecretKeyring"]` |
| `siteAssistantSecretSealer` | value | `ReturnType<typeof composeSiteServicesPhase>["siteAssistantSecretSealer"]` |
| `externalMcpOAuthDevices` | value | `ReturnType<typeof composeAssistantCredentials>["externalMcpOAuthDevices"]` |
| `externalMcpServerRepo` | value | `ReturnType<typeof composeAssistantCredentials>["externalMcpServerRepo"]` |
| `siteAssistantCredentialRepo` | value | `ReturnType<typeof composeAssistantCredentials>["siteAssistantCredentialRepo"]` |
| `siteReferenceRepo` | value | `ReturnType<typeof composeAssistantCredentials>["siteReferenceRepo"]` |
| `projectSiteId` | value | `const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ over` |
| `projectStore` | value | `const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ over` |
| `projectVault` | value | `const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ over` |
| `customCredentialSetRepo` | value | `ReturnType<typeof composeProviderConfigSource>["customCredentialSetRepo"]` |
| `providerConfigSource` | value | `ReturnType<typeof composeProviderConfigSource>["providerConfigSource"]` |
| `providerPlugins` | value | `const providerPlugins = await providerPluginBoot({ overrides })({` |
| `projectKeys` | value | `ReturnType<typeof composeProviderLifecyclePhase>["projectKeys"]` |
| `aiTraceSink` | value | `ReturnType<typeof composeProviderLifecyclePhase>["aiTraceSink"]` |
| `observability` | value | `ReturnType<typeof composeProviderLifecyclePhase>["observability"]` |
| `tracker` | value | `ReturnType<typeof composeProviderLifecyclePhase>["tracker"]` |
| `customCredentialsHttpClient` | value | `ReturnType<typeof composeInstrumentedContentPhase>["customCredentialsHttpClient"]` |
| `mailDurableOutboxReady` | value | `ReturnType<typeof composeInstrumentedContentPhase>["mailDurableOutboxReady"]` |
| `mediaImportHttpClient` | value | `ReturnType<typeof composeInstrumentedContentPhase>["mediaImportHttpClient"]` |
| `outboundTestOrigins` | value | `ReturnType<typeof composeInstrumentedContentPhase>["outboundTestOrigins"]` |
| `publishContentPeerHttpClient` | value | `ReturnType<typeof composeInstrumentedContentPhase>["publishContentPeerHttpClient"]` |
| `resolvedMailer` | value | `ReturnType<typeof composeInstrumentedContentPhase>["resolvedMailer"]` |
| `siteBackupHttpClient` | value | `ReturnType<typeof composeInstrumentedContentPhase>["siteBackupHttpClient"]` |
| `assetBlobRepo` | value | `ReturnType<typeof composeInstrumentedContentPhase>["assetBlobRepo"]` |
| `mediaRepo` | value | `ReturnType<typeof composeInstrumentedContentPhase>["mediaRepo"]` |
| `postRepo` | value | `ReturnType<typeof composeInstrumentedContentPhase>["postRepo"]` |
| `mediaContentTypeStore` | value | `ReturnType<typeof composePublishingPhase>["mediaContentTypeStore"]` |
| `publishContentBaselineRepo` | value | `ReturnType<typeof composePublishingPhase>["publishContentBaselineRepo"]` |
| `publishContentBundleRepo` | value | `ReturnType<typeof composePublishingPhase>["publishContentBundleRepo"]` |
| `publishContentFileBlobIndex` | value | `ReturnType<typeof composePublishingPhase>["publishContentFileBlobIndex"]` |
| `publishContentPeerRepo` | value | `ReturnType<typeof composePublishingPhase>["publishContentPeerRepo"]` |
| `publishContentSeedHash` | value | `ReturnType<typeof composePublishingPhase>["publishContentSeedHash"]` |
| `removeTheme` | value | `ReturnType<typeof composePublishingPhase>["removeTheme"]` |
| `siteThemes` | value | `ReturnType<typeof composePublishingPhase>["siteThemes"]` |
| `publishContentApplyPort` | value | `ReturnType<typeof composePublishingPhase>["publishContentApplyPort"]` |
| `agentPluginConnections` | value | `ReturnType<typeof composePublishingPhase>["agentPluginConnections"]` |
| `derivedPublicOrigin` | value | `ReturnType<typeof composePublishingPhase>["derivedPublicOrigin"]` |
| `externalMcpOAuthHttpPorts` | value | `ReturnType<typeof composePublishingPhase>["externalMcpOAuthHttpPorts"]` |
| `guardedOutboundHttpClient` | value | `ReturnType<typeof composePublishingPhase>["guardedOutboundHttpClient"]` |
</details>

### 7. `finishRouteDepsPhase` → `site-deps/assembly-phases.ts` (8 root statements, 15 code lines; function 19 lines)
Takes the root statements from `routeDeps.pluginRuntimeReady = pluginRuntime.attachEnabledPluginsAtBoot();` through `configureVisitorConsentAnalytics({ routeDeps, workspaceId });`, **verbatim, with the comments between them**. Root call (replaces them, same place):
```ts
  finishRouteDepsPhase({ dbPath, opened, agentPluginLayout, resolvedSiteBinding, resolvedThemesDir, skillLayout, blobStore, mediaStorePorts, provideMediaCredentials, resolvedUploadsDir, workspaceId, postSearchBackfillReady, pluginRuntime, adminPasswordResetReady, identity, settingsRepo, blobHydrationReady, originReady, siteAssistantSecretKeyring, siteAssistantSecretSealer, observability, tracker, publishContentPeerHttpClient, guardedOutboundHttpClient, adminSurfaceHandlersReady, siteAppBootWork, routeDeps, widgetAdoptionReady });
```
Outputs (0): none (statements only).

<details><summary>FinishRouteDepsPhaseRequired — 28 fields (0 getters)</summary>

| field | how passed | type |
|---|---|---|
| `dbPath` | value | root parameter (rule) |
| `opened` | value | root parameter (rule) |
| `agentPluginLayout` | value | `ReturnType<typeof composeStoragePhase>["agentPluginLayout"]` |
| `resolvedSiteBinding` | value | `ReturnType<typeof composeStoragePhase>["resolvedSiteBinding"]` |
| `resolvedThemesDir` | value | `ReturnType<typeof composeStoragePhase>["resolvedThemesDir"]` |
| `skillLayout` | value | `ReturnType<typeof composeStoragePhase>["skillLayout"]` |
| `blobStore` | value | `ReturnType<typeof composeStoragePhase>["blobStore"]` |
| `mediaStorePorts` | value | `ReturnType<typeof composeStoragePhase>["mediaStorePorts"]` |
| `provideMediaCredentials` | value | `ReturnType<typeof composeStoragePhase>["provideMediaCredentials"]` |
| `resolvedUploadsDir` | value | `ReturnType<typeof composeStoragePhase>["resolvedUploadsDir"]` |
| `workspaceId` | value | `const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);` |
| `postSearchBackfillReady` | value | `ReturnType<typeof composeSiteServicesPhase>["postSearchBackfillReady"]` |
| `pluginRuntime` | value | `ReturnType<typeof composeSiteServicesPhase>["pluginRuntime"]` |
| `adminPasswordResetReady` | value | `ReturnType<typeof composeSiteServicesPhase>["adminPasswordResetReady"]` |
| `identity` | value | `ReturnType<typeof composeSiteServicesPhase>["identity"]` |
| `settingsRepo` | value | `ReturnType<typeof composeSiteServicesPhase>["settingsRepo"]` |
| `blobHydrationReady` | value | `ReturnType<typeof composeSiteServicesPhase>["blobHydrationReady"]` |
| `originReady` | value | `ReturnType<typeof composeSiteServicesPhase>["originReady"]` |
| `siteAssistantSecretKeyring` | value | `ReturnType<typeof composeSiteServicesPhase>["siteAssistantSecretKeyring"]` |
| `siteAssistantSecretSealer` | value | `ReturnType<typeof composeSiteServicesPhase>["siteAssistantSecretSealer"]` |
| `observability` | value | `ReturnType<typeof composeProviderLifecyclePhase>["observability"]` |
| `tracker` | value | `ReturnType<typeof composeProviderLifecyclePhase>["tracker"]` |
| `publishContentPeerHttpClient` | value | `ReturnType<typeof composeInstrumentedContentPhase>["publishContentPeerHttpClient"]` |
| `guardedOutboundHttpClient` | value | `ReturnType<typeof composePublishingPhase>["guardedOutboundHttpClient"]` |
| `adminSurfaceHandlersReady` | value | `ReturnType<typeof assembleRouteDepsPhase>["adminSurfaceHandlersReady"]` |
| `siteAppBootWork` | value | `ReturnType<typeof assembleRouteDepsPhase>["siteAppBootWork"]` |
| `routeDeps` | value | `ReturnType<typeof assembleRouteDepsPhase>["routeDeps"]` |
| `widgetAdoptionReady` | value | `ReturnType<typeof assembleRouteDepsPhase>["widgetAdoptionReady"]` |
</details>

Type each field as the table says: a phase output → `ReturnType<typeof phase>["name"]`; a B-sheet output → `ReturnType<typeof composeX>["name"]`; otherwise the declaration rule (`const x = f(…)` → `ReturnType<typeof f>`, `const { a: x } = await f(…)` → `Awaited<ReturnType<typeof f>>["a"]`, `const x = await g(…)(…)` → `Awaited<ReturnType<ReturnType<typeof g>>>`, `new C(…)` → `C`, annotated → the annotation; `dbPath` → `string`, `overrides` → `Partial<CreateSiteRouteDepsOverrides>`, `store` → `SiteStore`, `onStoreClose` → its `opened` field type with `StoreCloseRegistration` from `./open-store.js`, `opened` → the root parameter's `opened` type). A getter field is `() => T`. If typecheck rejects one field's type, replace that field's type with the type TypeScript names in the error and nothing else; any other typecheck error is STOP-TYPE.

**c. Module helpers that only the phases read move with them** (verbatim, with their doc comments, unexported; leaving them in deps.ts would make the phase files import deps.ts — a cycle step 5 rejects): `logMediaProviderRefusals` (tip 935) → `boot-phases.ts`, `flushLifecycleEvents` (tip 2950) → `boot-phases.ts`, `compositionApprovalOverrides` (tip 646) → `assembly-phases.ts`, `compositionConsentOptions` (tip 2957) → `assembly-phases.ts`, `configureVisitorConsentAnalytics` (tip 2967) → `assembly-phases.ts`.

**d. Imports.** `boot-phases.ts` imports `KyselyKernel` (type) from `@jini-ai/db/kernel` (copy), `instrumentStorageKernel` from `@jini-ai/diagnostics/observability` (move), `providerPluginOf` from `#src/features/project-keys/service` (move), `siteProviderRevisions` from `./provider-revision-watch.js` (move), `watchProviderRevisions` from `@jini-ai/plugins/host` (move); and the slice functions `composeAgentPluginBootstrap` (`./agent-plugin-bootstrap.js`), `composeContentRepos` (`./content-repos.js`), `composeContentResolversComments` (`./content-resolvers-comments.js`), `composeContentStores` (`./content-stores.js`), `composeDatabaseJournal` (`./database-journal.js`), `composeEventsOrigin` (`./events-origin.js`), `composeIdentitySettings` (`./identity-settings.js`), `composeMailHttp` (`./mail-http.js`), `composeMediaStorage` (`./media-storage.js`), `composeOutboundConnections` (`./outbound-connections.js`), `composePublishContentApplyPort` (`./publish-apply.js`), `composePublishingStoresThemes` (`./publishing-stores-themes.js`), `composeRedirects` (`./redirects.js`), `composeSiteKeysMembers` (`./site-keys-members.js`), `composeSitePluginRuntime` (`./plugin-runtime.js`), `composeStoreBasics` (`./store-basics.js`), `composeTrashAdapters` (`./trash-adapters.js`), `composeTrashFollowUpHooks` (`./trash-follow-up-hooks.js`), `composeTrashService` (`./trash-service.js`), `composeTrashStores` (`./trash-stores.js`), `compositionProjectKeys` (`./project-keys.js`), `startBootData` (`./boot-data.js`). `assembly-phases.ts` imports `ByokToolSurfaceDeps` (type) from `#src/assistant/index` (copy), `NewsletterRouteDeps` (type) from `../../inbound/admin-http/routes/newsletter/deps.js` (copy), `bindCredentialsHostPorts` from `./credentials-host-ports.js` (move), `bindSiteConsentService` from `./site-consent.js` (move), `bindStaticSiteContext` from `./static-site-context.js` (move), `composePublishCredentialSource` from `#src/features/deployments/static-publish/credentials` (move), `composeSiteSavedKeys` from `#src/server/runtime/composition/site-portability` (move), `createStaticSitePackager` from `#src/features/site-backup/static-site-packager` (move), `createTovuPluginHost` from `./plugin-host.js` (move), `exportSite` from `#src/features/site-export/index` (move), `siteAppBootWorkByDeps` from `./site-app-boot-work.js` (move); and `composePreAssembly` (`./pre-assembly.js`), `compositionCommerce` (`./shared-oauth-commerce.js`), `configureSiteImports` (`./site-imports.js`), `configureSiteSharing` (`./site-sharing.js`), `routeDepsAssistantSettings` (`./route-deps-assistant-mcp.js`), `routeDepsChatAgents` (`./route-deps-content-chat.js`), `routeDepsContentTrash` (`./route-deps-content-chat.js`), `routeDepsExecutionPlugins` (`./route-deps-assistant-mcp.js`), `routeDepsExternalMcpOAuth` (`./route-deps-assistant-mcp.js`), `routeDepsMailFormsNewsletter` (`./route-deps-members-mail.js`), `routeDepsMembersMail` (`./route-deps-members-mail.js`), `routeDepsPluginsSiteApp` (`./route-deps-comments-plugins.js`), `routeDepsProviderAnalytics` (`./route-deps-site-providers.js`), `routeDepsPublishCredentials` (`./route-deps-publish-credentials.js`), `routeDepsSiteThemesTelemetry` (`./route-deps-site-providers.js`), `routeDepsTaxonomyComments` (`./route-deps-comments-plugins.js`), `wireFormsAndSearch` (`./after-assembly-forms-search.js`). (Relative specifiers gain one `../`; slice files are siblings, `./x.js`.) deps.ts imports the 7 phase functions from the two files and deletes its imports of every slice function above.

**e. Delete the deps.ts imports that no line uses any more** (112 specifiers; left over because the B-sheets' copy/move column was measured on the tip, where another range still used them — see REVISION-4b-REPORT). TypeScript rejects the deletion of any import that is still used, so this step fails closed: `createSiteOAuthBindings`, `TOVU_ERROR_REDACTION_OPTIONS`, `notifyExternalMcpRosterChanged`, `setAgentPluginEnabled`, `createSitesWorkspace`, `sanitizeShareDatabase`, `toDeployTargetCredential`, `createDeployHostKit`, `loadSiteVaultKinds`, `resolveSiteDatabasePaths`, `executeCommand`, `randomUUID`, `mkdirSync`, `homedir`, `tmpdir`, `basename`, `dirname`, `join`, `resolve`, `bootProviderPlugins`, `openProjectStore`, `ProjectStore`, `resolveStorefrontProducts`, `preparePostSearchIndex`, `SqlitePostRepo`, `createTovuAgentPluginLifecycle`, `createDefaultHttpClient`, `CUSTOM_CREDENTIALS_EGRESS_POLICY`, `SITE_BACKUP_EGRESS_POLICY`, `MEDIA_IMPORT_EGRESS_POLICY`, `SINGLE_HOP_HTTPS_EGRESS_POLICY`, `loadMailAdapterRegistry`, `formatErrorForLog`, `discoverAllBuiltInThemes`, `rescanThemes`, `ContentDb`, `createSite`, `startChatExpirySweep`, `hydrateBlobStoreFromSeed`, `createSiteCreationTimeZone`, `seedSiteThemes`, `SqliteChangeSetRepo`, `SqliteNewsletterListRepo`, `resolveCustomCredentialByLabel`, `SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID`, `SqliteMemberRepo`, `EnvOrFileKeyring`, `resolveSiteKeyId`, `siteKeySources`, `DEFAULT_GC_GRACE_MS`, `LocalFsBlobStore`, `purgeMedia`, `readMediaObjectStoreSetting`, `IdentityRepos`, `createVerifiedOrigin`, `OriginRegistry`, `resolveDevTls`, `SqliteAssetBlobRepo`, `SqliteAssetRenditionRepo`, `SqliteMediaContentTypeStore`, `SqliteMediaRepo`, `SqliteTransformDefinitionRepo`, `registerSlugChangeCapture`, `buildWidgetsDeps`, `composePluginRuntime`, `isAdminAssistantEnabled`, `set`, `ensureSiteTitleSettingDefinition`, `preserveLegacySiteTitles`, `COMMENT_ENTITY_TYPE`, `buildTrashRegistry`, `createCommentTrashAdapter`, `createContentDbTransactionRunner`, `createDirectoryTrashAdapter`, `unhideIfRemoveThrows`, `createMediaTrashAdapter`, `createPostTrashAdapter`, `createRedirectTrashAdapter`, `MEDIA_ENTITY_TYPE`, `PLUGIN_ENTITY_TYPE`, `THEME_ENTITY_TYPE`, `POST_ENTITY_TYPE`, `REDIRECT_ENTITY_TYPE`, `SqliteTrashRepo`, `USER_ENTITY_TYPE`, `createUserTrashAdapter`, `removeEntityWithoutBlocker`, `bindRemoveEntity`, `bindForgetRemovedEntity`, `createTrashService`, `TrashAdapter`, `TrashFollowUpHooks`, `withFollowUps`, `SqliteEntryTermRepo`, `SqliteTaxonomyRepo`, `SqliteTaxonomyRevisionRepo`, `SqliteTermRepo`, `resolveRuntimeMode`, `resolveSitesHome`, `builtInContentSeedDbPath`, `pluginsInstallDir`, `siteThemesDir`, `bundledAgentPluginsDir`, `builtInThemesDir`, `mediaUploadsDir`, `resolveExportOutputRootDir`, `resolvePublishOutputRootDir`, `resolveSiteStoragePaths`, `resolveSourceControlExportRootDir`, `siteDir`, `SitePathResolverOptional`, `createApp`.

**f. Size debt.** `composeSiteRouteDeps` is no longer over the 80-line error limit, so `check:size` reports its row as stale. In `development/scripts/size-debt.json` delete exactly the object `{ "file": "apps/website/src/server/runtime/composition/deps.ts", "function": "composeSiteRouteDeps#1", "line": 1049, "rule": "max-lines-per-function", "value": 1199 }` (its `line`/`value` may have shrunk; match on `file` + `function` + `rule`). Nothing else in that file changes; the `<file>` row stays (deps.ts is still over 500 lines and shrank).

## Source readers of deps.ts
The 9 readers run in step 6. `composition-boot-order.unit.test.ts` and `chat-orphan-check.integration.test.ts` read the order of await lines and the store open, which stay in the root verbatim; `serving-app-boot-wiring.unit.test.ts`/`external-mcp-oauth-loopback-wiring.unit.test.ts` read literals that may now be in a phase file. If step 6 fails in a reader, point that assertion at the phase file that now holds the line (read both files where the test reads deps.ts); no other change to it.

## Characterization test (add `apps/website/src/server/runtime/composition/site-deps/__tests__/root-phases.characterization.unit.test.ts`)
```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins what this sheet must not change: the root's statement sequence (fixed points + phase calls), the
// statements each phase took in their root order, and that getter inputs are only read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const BOOT = new URL("../boot-phases.ts", import.meta.url);
const ASSEMBLY = new URL("../assembly-phases.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const firstLine = (node: ts.Node): string => node.getText().split("\n")[0].trim();
function bodyOf(file: ts.SourceFile, name: string): readonly ts.Statement[] {
  const found = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(found?.body, `${name} not found`);
  return found.body.statements;
}
function eagerReads(statements: readonly ts.Node[], getters: readonly string[]): string[] {
  const eager: string[] = [];
  const visit = (node: ts.Node, nested: boolean): void => {
    const parent = node.parent;
    if (ts.isIdentifier(node) && getters.includes(node.text) && !nested && !(ts.isPropertyAccessExpression(parent) && parent.name === node) && !ts.isBindingElement(parent) && !ts.isPropertyAssignment(parent)) eager.push(node.text);
    ts.forEachChild(node, (child) => visit(child, nested || ts.isFunctionLike(child)));
  };
  for (const statement of statements) visit(statement, false);
  return eager;
}
const fileOf = (name: string): URL => (["assembleRouteDepsPhase","finishRouteDepsPhase"].includes(name) ? ASSEMBLY : BOOT);

test("R: the root is its fixed points and the phase calls, in order", () => {
  const expected: readonly string[] = [
    "const { store, onStoreClose } = opened;",
    "const pendingLifecycleEvents: Array<Parameters<RouteDeps['tracker']['capture']>> = [];",
    "let lifecycleTracker: Pick<RouteDeps['tracker'], 'capture'> = { capture: (input, options =",
    "let routeDepsBuiltForPluginHost: { readonly pluginHost?: RouteDeps[\"pluginHost\"] } | undef",
    "let formCollectionProviders = () => createFormCollectionRegistry({});",
    "let bindSharedApiOAuth: ((input: { keyId: string; use: boolean }) => Promise<void>) | unde",
    "const { assistantAgentInventory, resolvedSiteBinding, agentPluginLayout, agentPluginLifecy",
    "const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);",
    "const publishTrustRevocations = await publishTrustRevocationStoreFor({ kernel });",
    "const chatDbPath = resolveChatDbPath({ dbPath }, { overrides });",
    "const chat = store.chat;",
    "await warnCompositionChatOrphans({ dbPath, store, kernel, chatDbPath });",
    "const mediaProviders = await loadMediaProviderRegistry({ workspaceId }, { loadContribution",
    "const { postSearchBackfillReady, clock, idGen, reportToolAuditError, pluginActivationRepo,",
    "await normalizeSiteVaultAtBoot({ kernel, workspaceId, siteDir: siteDirForKeyring, clock },",
    "const { siteAssistantCredentialRepo, externalMcpServerRepo, externalMcpOAuthDevices, siteR",
    "const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, ",
    "const { providerConfigSource, customCredentialSetRepo } = composeProviderConfigSource({ sa",
    "const providerPlugins = await providerPluginBoot({ overrides })({",
    "const { projectKeys, observability, tracker, aiTraceSink } = composeProviderLifecyclePhase",
    "formCollectionProviders = () => providerPlugins.formCollectionProviders?.() ?? createFormC",
    "setServerLogTraceReader({ traceIds: () => observability.activeTraceIds?.() });",
    "lifecycleTracker = tracker;",
    "const { resolvedMailer, mailDurableOutboxReady, customCredentialsHttpClient, siteBackupHtt",
    "if ((overrides.storeRole ?? \"owner\") === \"owner\") await protectExistingFormFiles({ kernel,",
    "const { mediaContentTypeStore, publishContentBundleRepo, publishContentBaselineRepo, publi",
    "bindSharedApiOAuth = agentPluginConnections.apiConnections.host.sharedOAuth?.bind;",
    "const { adminSurfaceHandlersReady, siteAppBootWork, routeDeps, widgetAdoptionReady } = ass",
    "routeDepsBuiltForPluginHost = routeDeps;",
    "finishRouteDepsPhase({ dbPath, opened, agentPluginLayout, resolvedSiteBinding, resolvedThe",
    "await registerContentAnalytics({ deps: { bus, tracker, workspaceId } });",
    "return routeDeps;"
  ];
  const actual = bodyOf(parse(DEPS), "composeSiteRouteDeps").map((s) => firstLine(s));
  assert.equal(actual.length, expected.length);
  expected.forEach((prefix, i) => assert.ok(actual[i].startsWith(prefix), `statement ${i}: ${actual[i]}`));
});

test("R: each phase holds its root statements in root order", () => {
  const expected: Record<string, readonly string[]> = {
    "composeStoragePhase": [
      "const { assistantAgentInventory, resolvedSiteBinding, agentPluginLayout, agentPluginLifecycle, feder",
      "const kernel = store.content;",
      "const { resolvedUploadsDir, provideMediaCredentials, mediaStorePorts, blobStore, mediaIsRemoteByEnv,"
    ],
    "composeSiteServicesPhase": [
      "logMediaProviderRefusals({ refusals: mediaProviders.refusals });",
      "const { postSearchBackfillReady, clock, idGen, reportToolAuditError, pluginActivationRepo } = compos",
      "const { pluginRuntime } = composeSitePluginRuntime({ lifecycleTracker: () => lifecycleTracker, route",
      "const { identity, settingsPrincipals, adminPasswordResetReady, presentationRepo, settingsRepo, setti",
      "const { menuRepo, navLocationBindingRepo, menuBindingsReady, newsletterListRepo, newsletterReady, co",
      "const { outbox, bus, devCapabilityScheme, originReady, originRegistry, redirectRepo, redirectHitSink",
      "const { trashRegistry, sqliteTrashDb, trashRepo, taxonomyFollowUpTermRepo, taxonomyFollowUpRevisions",
      "const { trashFollowUpHooks } = composeTrashFollowUpHooks({ kernel, mediaRepo: () => mediaRepo, works",
      "const { pluginTrashAdapter, trashAdapters } = composeTrashAdapters({ pluginRuntime, pluginActivation",
      "const { trashTransaction, trash, removePlugin, removeUser, isInTrash } = composeTrashService({ kerne",
      "const { redirectsWriteDeps } = composeRedirects({ redirectRepo, trash, trashRepo, originRegistry, cl",
      "const { databaseLedgerRepo, migrationRunsRepo, publishContentRunRepo, restorePointsRepo, dbOps, data",
      "const { entryRepo, sqliteEntryTermRepo, taxonomyRepo, termRepo, taxonomyRevisionRepo, stampWatermark",
      "const { formSubmissionRepo, contentTypeRepo, contentTypeIndexProvisioner, commentsModule, commentsCa",
      "const { runtimeMode, siteDirForKeyring, memberRepo, newsletterKeyring, newsletterSubscriberDirectory"
    ],
    "composeProviderLifecyclePhase": [
      "onStoreClose({ registration: async () => {",
      "const projectKeys = compositionProjectKeys({ resolvedSiteBinding, kernel, clock, projectKeyReference",
      "onStoreClose({ registration: watchProviderRevisions({ read: () => projectStore?.providerRevisions({ ",
      "const { observability, tracker, aiTraceSink } = providerPlugins;"
    ],
    "composeInstrumentedContentPhase": [
      "flushLifecycleEvents({ pending: pendingLifecycleEvents, tracker });",
      "instrumentStorageKernel({ kernel, observability });",
      "instrumentStorageKernel({ kernel: chat, observability });",
      "const { resolvedMailer, mailDurableOutboxReady, customCredentialsHttpClient, siteBackupHttpClient, o",
      "const { postRepo, changeSets, mediaRepo, assetBlobRepo } = composeContentStores({ kernel });"
    ],
    "composePublishingPhase": [
      "const { mediaContentTypeStore, publishContentBundleRepo, publishContentBaselineRepo, publishContentF",
      "const { publishContentApplyPort } = composePublishContentApplyPort({ workspaceId, publishContentBund",
      "const { guardedOutboundHttpClient, externalMcpOAuthHttpPorts, derivedPublicOrigin, agentPluginConnec"
    ],
    "assembleRouteDepsPhase": [
      "const { adminSurfaceHandlersReady, siteAppBootWork, seoDeps, sitemapService, resolveRouteDeps, siteC",
      "const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {",
      "resolveRouteDeps(routeDeps);",
      "const { widgetAdoptionReady } = wireFormsAndSearch({ siteTitleReady, menuBindingsReady, mediaTransfo",
      "const commerceBinding = compositionCommerce({ dbPath, overrides, resolvedSiteBinding, agentPluginLay",
      "routeDeps.commerce = commerceBinding.commerce;",
      "routeDeps.commerceCatalog = commerceBinding.commerceCatalog;",
      "onStoreClose({ registration: () => commerceBinding.close() });",
      "siteAppBootWorkByDeps.set(routeDeps, siteAppBootWork);",
      "routeDeps.pluginHost = createTovuPluginHost({ deps: routeDeps });"
    ],
    "finishRouteDepsPhase": [
      "routeDeps.pluginRuntimeReady = pluginRuntime.attachEnabledPluginsAtBoot();",
      "opened.beforeStoreClose({ drain: async () => {",
      "provideMediaCredentials(composePublishCredentialSource({ workspaceId, executionMode: routeDeps.publi",
      "const savedKeys = composeSiteSavedKeys({ workspaceId, sealer: siteAssistantSecretSealer });",
      "configureSiteSharing({ dbPath, resolvedSiteBinding, agentPluginLayout, skillLayout, resolvedThemesDi",
      "configureSiteImports({ resolvedSiteBinding, workspaceId, observability, tracker, routeDeps, savedKey",
      "routeDeps.siteConsent = bindSiteConsentService({ deps: routeDeps });",
      "configureVisitorConsentAnalytics({ routeDeps, workspaceId });"
    ]
  };
  for (const [name, statements] of Object.entries(expected)) {
    const body = bodyOf(parse(fileOf(name)), name).slice(1).map((s) => firstLine(s)).filter((t) => !t.startsWith("return {"));
    assert.equal(body.length, statements.length, name);
    statements.forEach((prefix, i) => assert.ok(body[i].replace(/\(\)/g, "").startsWith(prefix.replace(/\(\)/g, "")), `${name} statement ${i}: ${body[i]}`));
  }
});

test("R: getter inputs are only read lazily", () => {
  const getters: Record<string, readonly string[]> = {"composeStoragePhase":["lifecycleTracker","workspaceId","settingsRepo","observability","routeDeps"],"composeSiteServicesPhase":["lifecycleTracker","routeDepsBuiltForPluginHost","formCollectionProviders","assetBlobRepo","mediaRepo","postRepo","mediaContentTypeStore","routeDeps"],"composeProviderLifecyclePhase":["bindSharedApiOAuth"],"composeInstrumentedContentPhase":[],"composePublishingPhase":[],"assembleRouteDepsPhase":[],"finishRouteDepsPhase":[]};
  for (const [name, list] of Object.entries(getters)) assert.deepEqual(eagerReads(bodyOf(parse(fileOf(name)), name), list), [], name);
});
```
(Test 2 compares prefixes with `()` removed, because a getter-read statement's first line gains `()` after a getter name.) Red first (prove the pins bite, then revert each): swap two adjacent statements inside `composeSiteServicesPhase` → test 2 fails; move `setServerLogTraceReader(…)` below `lifecycleTracker = tracker;` → test 1 fails; add `void lifecycleTracker();` as the second statement of `composeStoragePhase` → test 3 fails. Record the three failing outputs in the commit message body.

## Steps (fail-closed; every block starts with `set -euo pipefail`; any non-zero exit = STOP with the step number)
**1. Start (clean tree, on the branch's last green commit).**
```bash
set -euo pipefail
git diff --quiet && git diff --cached --quiet
F=apps/website/src/server/runtime/composition/deps.ts
T=$(mktemp -d)
git rev-parse HEAD > "$T/parent"
test "$(grep -cxF -- 'async function composeSiteRouteDeps(' "$F")" -eq 1
s=$(grep -nxF -- 'async function composeSiteRouteDeps(' "$F" | cut -d: -f1)
e=$(awk -v s="$s" 'NR > s && $0 == "}" { print NR; exit }' "$F")
test "$(sed -n "${s},${e}p" "$F" | grep -Ev '^[[:space:]]*($|//|/[*]|[*])' | sha256sum | cut -d' ' -f1)" = 545630fa481a543d429bf04feb62350bbeab70c05caef03429524c857a59138d
npm run check:architecture -- --update
npx depcruise --config .dependency-cruiser.mjs apps/website/src --output-type baseline --output-to "$T/known.json"
echo "T=$T"
```
The hash covers the whole root's **code lines** (blank and comment lines dropped, so the placement of moved comments by earlier sheets cannot matter) and proves every earlier sheet left exactly the root replacement line its sheet specifies. A mismatch is STOP-STALE: regenerate this sheet with `designs/deps-split/v4/evidence/{synth,phases,r-imports,r-sheet}.cjs` on the then-current deps.ts (the census needs no tip).

**2. Edit** a-f above. **3. Add the characterization test.** **4. Readers**: change only the assertions step 6 shows failing, as listed above.

**5. Gate (repo commands only).**
```bash
set -euo pipefail
npm run typecheck
npm run typecheck:tests
SIZE_BASE_REF=$(cat "$T/parent") npm run check:size
npm run check:complexity
npm run check:errors -- --strict
npm run check:hooks
npm run check:architecture
node development/scripts/check-feature-ranks.mjs . development/boundaries/feature-ranks.json
npx depcruise --config .dependency-cruiser.mjs apps/website/src --ignore-known "$T/known.json"
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' apps/website/src/server/runtime/composition/site-deps/boot-phases.ts apps/website/src/server/runtime/composition/site-deps/assembly-phases.ts
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":"off","complexity":["error",10]}' apps/website/src/server/runtime/composition/deps.ts
npm run build:server
```
The second eslint line is the owner rule's proof: every function in deps.ts, the root included, is ≤ 50 lines and complexity ≤ 10 (on the tip only `composeSiteRouteDeps` and `configureSiteSharing` fail it; H3 fixed the second). `check:complexity` adds the repo's cognitive-complexity ceiling.

**6. Tests** (the repo's own runner line from `package.json` "test", with explicit files).
```bash
set -euo pipefail
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2 \
  apps/website/src/__tests__/index-boot.characterization.test.ts \
  apps/website/src/cli/__tests__/integration/export-command-plugin-sdk-resolver.integration.test.ts \
  apps/website/src/cli/__tests__/integration/export-command.integration.test.ts \
  apps/website/src/cli/__tests__/unit/export-base-path-notice.unit.test.ts \
  apps/website/src/cli/__tests__/unit/export-command-boot-work.unit.test.ts \
  apps/website/src/cli/__tests__/unit/export-l149.unit.test.ts \
  apps/website/src/cli/__tests__/unit/export-public-url.unit.test.ts \
  apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts \
  apps/website/src/features/publish-content/__tests__/no-dead-apply-stub.boundary.test.ts \
  apps/website/src/features/redirects/__tests__/phase-handler.multi-site-lifecycle.test.ts \
  apps/website/src/features/trash/__tests__/post-trash-media-evidence.integration.test.ts \
  apps/website/src/features/trash/__tests__/tool-registrations.purge-ban.test.ts \
  apps/website/src/platform/db/sqlite/__tests__/chat-orphan-check.integration.test.ts \
  apps/website/src/platform/site-dir/__tests__/unit/read-template.unit.test.ts \
  apps/website/src/platform/site-dir/__tests__/unit/resolve-workspace.unit.test.ts \
  apps/website/src/server/__tests__/integration/agent-daemon-outbox-event-loss.integration.test.ts \
  apps/website/src/server/__tests__/integration/boot-lifecycle-real-deps.integration.test.ts \
  apps/website/src/server/__tests__/integration/composition-served-site-dir.integration.test.ts \
  apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts \
  apps/website/src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts \
  apps/website/src/server/__tests__/integration/database-migration-reconciliation-boot.integration.test.ts \
  apps/website/src/server/__tests__/integration/design-c-package-themes-dir-wiring.integration.test.ts \
  apps/website/src/server/__tests__/integration/dev-capability-origin-scheme.integration.test.ts \
  apps/website/src/server/__tests__/integration/hydrate-blob-store-boot.integration.test.ts \
  apps/website/src/server/__tests__/integration/hydrate-content-db-boot.integration.test.ts \
  apps/website/src/server/__tests__/integration/observability-wiring.integration.test.ts \
  apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts \
  apps/website/src/server/__tests__/integration/publish-content-export-no-leak.integration.test.ts \
  apps/website/src/server/__tests__/integration/tool-attempt-audit-sink-composition.integration.test.ts \
  apps/website/src/server/__tests__/routes/newsletter-routes.test.ts \
  apps/website/src/server/__tests__/routes/publish-trust-revocation-gate.test.ts \
  apps/website/src/server/__tests__/routes/settings-principal-check.test.ts \
  apps/website/src/server/__tests__/routes/settings-read-scoping.test.ts \
  apps/website/src/server/__tests__/routes/settings-register-definitions-op-validation.test.ts \
  apps/website/src/server/__tests__/routes/taxonomy-trash-routes.test.ts \
  apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts \
  apps/website/src/server/__tests__/unit/serving-app-boot-wiring.unit.test.ts \
  apps/website/src/server/__tests__/unit/stock-content-dirs.unit.test.ts \
  apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-set-enabled.integration.test.ts \
  apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts \
  apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.outbox-enqueue-only-wiring.unit.test.ts \
  apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/site-title-preservation.integration.test.ts \
  apps/website/src/server/runtime/boot/__tests__/index-bind-host-wiring.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/boot-settings-rejection.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/commerce-data-retention.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-failure-release.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/create-site-route-deps.pglite.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/declared-content-types-wiring.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/deps-observability-wiring.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/deps-project-credentials.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts \
  apps/website/src/server/runtime/composition/__tests__/mail-sender-identity-wiring.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/open-site-content-db.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/open-site-store.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/pages-html-revisions-wiring.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/provider-face-sync-compositions.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/provider-live-enable.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/redirects-phase-disposed-on-store-close.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/registrations-disposed-on-store-close.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-backup-wiring.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-key-l005.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-search-wiring.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-share-wiring.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-theme-override.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/sqlite-create-site-app-module-identity.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/static-export-none.integration.test.ts \
  apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts \
  apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts \
  apps/website/src/server/runtime/composition/site-deps/__tests__/root-phases.characterization.unit.test.ts
```
Base status: INDEX-v4 records the 8 tests red on the tip; a test red on the parent stays red only with the same failing test names. Delete runtime files a test run creates (`chat.db`, `sites/*/agent-plugins`) before step 7.

**7. Commit and push.**
```bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add apps/website/src/server/runtime/composition/site-deps/boot-phases.ts apps/website/src/server/runtime/composition/site-deps/assembly-phases.ts apps/website/src/server/runtime/composition/site-deps/__tests__/root-phases.characterization.unit.test.ts apps/website/src/server/runtime/composition/deps.ts development/scripts/size-debt.json
git status --short
git commit -m "refactor(composition): R composeSiteRouteDeps becomes ordered phases, root 49 lines (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
```
`git status --short` must show only these files and the readers step 4 changed — add those explicitly. If `check:why-comments` fails: `git reset --soft HEAD~1`, restore the comment, re-run 5-7. If `git pull --rebase` brings commits that touch deps.ts, re-run steps 5-6 before `git push`.
