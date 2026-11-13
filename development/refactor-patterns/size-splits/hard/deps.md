# deps.ts / app.ts / routes/types.ts split: findings + PARTIAL plan (stopped at context cap)

Path: apps/website/src/server/runtime/composition/deps.ts (1930 counted; composeSiteRouteDeps 1202).
Siblings in scope: composition/app.ts (1707; createRouteDeps 882, createApp 247), server/routes/types.ts (519).
Phase: NOW. Survey (u042-2.md row app.ts, u087-1 row types.ts): STAY-WIRING, nothing moves to Jini, so the
split does not wait for the move. Executor: Fable/Opus. STATUS (2nd agent, 2026-11-13): §1-§3 verified (kept);
§4-§9 below are the design (module map, orchestrator, composers, steps). Gaps that still need a pass are listed
in REMAINING at the end. app.md / types.md are another agent's job.

## 1. Hard constraints found (tests may not be edited; these pin what must stay in deps.ts/app.ts)
1. apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts reads deps.ts SOURCE:
   - `functionBody(deps, "export async function createSiteRouteDeps(")`, `"async function openCompositionStore("`,
     `"function prepareCompositionStorage("`, `"async function composeSiteRouteDeps("` must exist in deps.ts
     with their anchors (`await openCompositionStore(dbPath, overrides)`, `await composeSiteRouteDeps(dbPath, { store: opened.store, onStoreClose: opened.onClose, beforeStoreClose: opened.beforeClose }, overrides)`, `await opened.release()`, storage/hydrate/openSiteStore/sweep anchors).
   - composeSiteRouteDeps BODY must contain, in order: `const kernel = store.content`,
     `await resolveWorkspaceIdOverride(kernel, overrides)`, `await publishTrustRevocationStoreFor(kernel)`,
     `await warnOnOrphanedChatRows(` (so nested `warnCompositionChatOrphans` stays nested in the body),
     `preparePostSearchIndex(`; then `const siteAssistantSecretKeyring = new EnvOrFileKeyring(` <
     `await normalizeSiteVaultAtBoot(` < `const siteAssistantCredentialRepo = new SqliteSiteAssistantCredentialRepo(`.
   - After `preparePostSearchIndex(` the ONLY two-space-indented top-level awaits allowed are exactly these 4 lines,
     verbatim: `  await normalizeSiteVaultAtBoot({ kernel, workspaceId, siteDir: siteDirForKeyring, clock }, {`,
     `  const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ overrides, runtimeMode, onStoreClose, binding: resolvedSiteBinding, references: projectKeyReferences,`,
     `  const providerPlugins = await providerPluginBoot({ overrides })({`,
     `  await registerContentAnalytics({ deps: { bus, tracker, workspaceId } });`.
     => every feature composer must be SYNCHRONOUS; no `const x = await composeX()` may be added. The
     `if (...) await protectExistingFormFiles(...)` line (L2080) stays in the orchestrator as is.
   - Body must contain `const storeBound = storeBoundServicesFor(store, dbPath);`, no value use of `db`, no `sqliteDb`.
2. server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts transpiles
   `createSiteRouteDepsForWorkspace` from deps.ts source and runs it with ONLY these globals: assertContentDbFileName,
   defaultContentDbPath, isInMemoryDbPath, basename, dirname, resolveSiteStorage, resolveWorkspace, contentKernel,
   closeSqliteConnection, resolveSiteDirForDatabase, openSiteContentDb, createSiteRouteDeps. Keep it in deps.ts unchanged.
3. platform/db/sqlite/__tests__/chat-orphan-check.integration.test.ts: deps.ts text must contain
   `openCompositionStore(`, `await openCompositionStore(dbPath, overrides)` and, after it, `warnOnOrphanedChatRows(`.
4. server/__tests__/integration/production-readiness-boot.integration.test.ts: every CAPABILITY_INVENTORY entry
   (runtime/configuration/capability-inventory.ts sourceHints) must be matched by an identifier / code string /
   used import in deps.ts or app.ts. Class-name-only hints: SqliteWorkspaceRepo, SqlitePostRepo,
   SqlitePresentationSettingsRepo, SqliteSettingsRepo, createSqliteIdentityRouteDeps. Others accept a local name
   (menuRepo, databaseLedgerRepo, contentTypeRepo, entryRepo, taxonomyRepo, changeSets, gatedMutations,
   webhookSubscriptionRepo, originRegistry, mediaRepo, analyticsSink, commentRepo, composeFormDelivery ...).
   => deps.ts keeps a same-file helper (proposed `createSiteKernelRepos({ kernel, workspaceId })`) that constructs
   the durable `new Sqlite*Repo(kernel)` adapters the inventory names, OR the orchestrator destructures those names.
   Run this test after every step.
5. server/runtime/composition/__tests__/wiring-identity.test.ts row 7: only baseline files may call
   createTovuAgentPluginLifecycle( (deps.ts and app.ts are in the baseline; new files are NOT). Keep the lifecycle
   construction in deps.ts / app.ts (a same-file helper is fine).
6. server/__tests__/unit/serving-app-boot-wiring.unit.test.ts: `.formSubmissionsAutoPull` must appear (as a member
   access) in deps.ts → keep `routeDeps.formSubmissionsAutoPull = formSubmissions.autoPull;` in deps.ts;
   `createTrashModule(` may be called only in app.ts → the trash mount in createApp (L2292-2306) stays in app.ts.
7. Module mocks: none of deps.ts/app.ts by tests except cli/__tests__/unit/serve-command-wiring.unit.test.ts
   (mock.module of deps.ts exports; createSiteRouteDeps stays there) and app.ts URL mocks in
   serve-command-boot-lifecycle / agent-daemon-real-spawn (createApp/createRouteDeps stay in app.ts). Mocks of
   `../vault-boot.js` etc. resolve by module, unaffected by the move.
8. .dependency-cruiser.mjs exempts `^apps/website/src/server/runtime/composition/` (sub-folders included), and
   accepts the deps.ts <-> app.ts cycle; new `composition/deps/*.ts` that import `../app.js` (createApp for
   `createSiteApp`) add no new cycle because app.ts does not import deps.ts or deps/*.

## 2. Ordering / closure hazards in composeSiteRouteDeps (must survive the split)
- Late-binding `let` cells stay in the orchestrator; composers get thunks: lifecycleTracker (L1060, reassigned
  L1988), routeDepsBuiltForPluginHost (L1192 → L2921), formCollectionProviders (L1738 → L1985),
  bindSharedApiOAuth (L1961 → L2214), provideMediaCredentials (L1105), resolveRouteDeps (L2223).
- Forward references through closures (pass `() => x` thunks created in the orchestrator):
  agentPluginLifecycle → routeDeps (L1079, L1085); mediaStorePorts → workspaceId, settingsRepo, observability;
  pluginRuntime.declaredContentTypes → contentTypeRepo, outbox; trashFollowUpHooks/trashAdapters/trash →
  mediaRepo, postRepo, assetBlobRepo, entryRefsRepo, routeDeps; wireCoreResolvers → mediaRepo,
  mediaContentTypeStore, postRepo, routeDeps; commentsModule → postRepo; resolvedMailer → mailDurableOutboxReady;
  pluginExports → routeDeps; many routeDeps literal entries → routeDeps (set/preferences/mcp/createSiteApp/...).
- Side-effecting statements keep relative order (boot promises, onStoreClose registrations, seedSiteThemes,
  mkdirSync/openDatabaseJournalDb, wireCoreResolvers, setServerLogTraceReader, instrumentStorageKernel,
  syncThemeRoster, trashAdapters.set(THEME...), registerRedirects*); pure `new Sqlite*Repo(kernel)` may move
  into their feature composer as long as they are built before first use.
- routeDeps literal: the only key overrides are `...identity` then principalRepo/removeUser/isInTrash (keep in the
  identity group, in that order). Spread groups (agentPluginConnections, compositionApprovalOverrides,
  compositionConsentOptions, resolvedMailer.operations, outboundTestOrigins) have keys disjoint from explicit ones
  (checked: agent-plugin-connections.ts:185 returns apiConnections/agentPluginTools/adminSurfaceHost/
  snapshotAgentPluginSettings; site-mailer.ts:38 operations = mailTest*/mailSenderIdentity). No production code
  iterates routeDeps keys (rg Object.keys/entries/values(routeDeps|deps) outside tests: none), so group order
  in the final spread is free except the identity override above.
- Post-build tail (L2819-3035) mutates routeDeps in place (legacyPublishCredentialsReady, formDestination,
  formSubmissionsPull, formSubmissionsAutoPull, formDeliveryStatus, formDelivery, siteSearch, commerce,
  commerceCatalog, pluginHost, pluginRuntimeReady, siteShareBackend, siteImportBackend, siteConsent) — keep the
  in-place mutation (routes/types.ts exportSiteBound doc: spread-override is inert for self-closures).

## 3. Proposed feature map (shared by deps.ts, app.ts, routes/types.ts) — design direction, not final
Folder `composition/deps/<feature>.ts` (real root) and `composition/memory-deps/<feature>.ts` (app.ts hermetic
root), each exporting sync `compose<Feature>Deps(required, optional = {})` returning that RouteDeps group;
types in `server/routes/route-deps/<feature>.ts` (folder justified: one file per feature, same map).
Features → RouteDeps groups: identity (IdentityDeps + admin password reset), settings (SettingsDeps,
PresentationDeps, site title/display/time zone, seo readiness), navigation (NavigationDeps), content (PostDeps,
ContentTaxonomyDeps, ChangeSetDeps, WidgetsDeps, pagesHtmlStore, revertRegistry), comments (CommentsDeps),
members+newsletter (MembersDeps + NewsletterRouteDeps fields), mail, media (MediaDeps + media http clients,
blob store), redirects (RedirectsDeps + origin boot), trash (TrashDeps, adapters, follow-up hooks),
database (DatabaseRecoveryDeps, DatabaseOpsDeps, journal db, gatedMutations, tool audit), credentials
(CredentialsDeps, keyrings, external MCP), plugins (PluginRuntimeDeps, agent plugin connections/MCP/exports),
observability+analytics (ObservabilityDeps, AnalyticsDeps, provider plugin outputs, consent), forms (FormsDeps +
post-build submissions/delivery), publish+deploy (publishContent*, export/publish/deploy loaders, source control
— today inline RouteDeps fields), site (binding, backup sources, share, import), webhooks, assistant/chat,
search, commerce, events/clock (core). Group-interface importers outside types.ts are few (rg: IdentityDeps 2,
CredentialsDeps 4, ClockDeps 3, others 0-2; RouteRegistrar 47 stays in types.ts), so importer churn is small.
Survey note to fold in: move startSettingsRegistration + siteAppBootWorkByDeps out of app.ts into their own
module (removes deps.ts → app.ts value imports except createApp).

## Notes (not bugs)
- deps.ts builds two SqliteChangeSetRepo instances (L2073 `changeSets` for publish apply, and the literal's
  `changeSets: new SqliteChangeSetRepo(...)` L2402) despite the L2066 "reuse one instance" comment; the class is
  stateless (platform/db/sqlite/change-set-repo.sqlite.ts), so behaviour is identical. Leave as is (no behaviour change).

## 4. Design decisions (why this shape)
- Folder `composition/deps/` (deviation from sibling `deps-<job>.ts`, justified: ~25 feature modules; the
  composition folder already holds ~100 files; dependency-cruiser exempts sub-folders; §3 map). No module in
  `deps/` imports `../deps.js` (no cycle). `deps/*` may import `../app.js` (createApp, startSettingsRegistration;
  app.ts imports neither deps.ts nor deps/*). If app.md moves `startSettingsRegistration`/`siteAppBootWorkByDeps`
  out of app.ts, import them from their new module instead.
- deps.ts keeps exactly what tests pin or what must not leave it: (a) the anchors/awaits of §1.1 (orchestrator);
  (b) DURABLE-ADAPTER SELECTION (`createSiteDurableAdapters`, `createSiteCredentialStores`,
  `openSiteDatabaseJournal`) — the capability inventory (§1.4) checks deps.ts for these class names; (c) the
  lifecycle owner build (`composeSiteRuntime`, §1.5); (d) statements carrying `as unknown as` / `let x!:`
  (moving them would ADD banned patterns to new files): siteReferenceRepo/agent-plugin vault repo,
  provider-revision watch, commerce, the two deferred-promise cells; (e) `.formSubmissionsAutoPull` (§1.6).
- Late binding: all `let` cells + forward thunks become ONE object `late: LateSiteBindings` built by
  `createLateSiteBindings` (deps.ts, keeps the `!:` cells there). Closures that read a cell read `late.x` at call
  time (same timing as the old `let`). Forward thunks are created in the orchestrator:
  `routeDeps: () => routeDeps, workspaceId: () => workspaceId, settingsRepo: () => repos.settingsRepo,
  observability: () => observability` (TDZ semantics identical: the thunk reads the same const).
- Every moved `routeDeps` self-reference becomes `late.routeDeps()` (L1079, L1085, L1533, L1770, L2232, L2377,
  L2734-2747, L2811-2816).
- Pure `new Sqlite*` adapters are built once, early, in `createSiteDurableAdapters` (after workspaceId) — §2
  allows moving pure constructors earlier. Credential-vault repos (externalMcpServerRepo L1906, siteReferenceRepo
  L1922, agent-plugin vault repo L2204, publishContentPeerRepo L2090) are built AFTER normalizeSiteVaultAtBoot in
  `createSiteCredentialStores` (vault-normalization fence, §1.1).
- Inventory hints are met in deps.ts by: the class names inside the two adapter helpers + journal helper
  (Workspace, Post, PresentationSettings, Settings, Menu, NewsletterCampaign, Redirect, FormDefinition,
  SqlFormDeliveryRepo, DatabaseLedger, ContentType, Entry, Taxonomy, AlwaysUnavailableWatermarkSource,
  SqliteTokenStore, SqliteOutboxAdapter, SqliteChangeSetRepo, SqliteMemberRepo, webhookSubscriptionRepo,
  SqliteMediaRepo, SqliteBufferSink, SqliteCommentRepo), `createSqliteIdentityRouteDeps` (orchestrator),
  `composeFormDelivery` (attachFormRuntime), local `seo` (orchestrator), `redirects.originRegistry`. Origin:
  `originRegistry` identifier. Run production-readiness-boot after every step.
- Literal split: each feature module exports `<feature>RouteDeps(required)` returning
  `{ ... } satisfies Partial<SiteRouteDeps>` (contextual typing for callback params kept, no key lists);
  `deps/route-deps.ts` `assembleSiteRouteDeps` spreads them, return type `SiteRouteDeps` (TS proves completeness).
  Group order in the spread = order of first key in the old literal; `...identity, principalRepo, removeUser,
  isInTrash` stays one block at its old relative place (after analytics, before redirects).
- Feature composers are SYNC (§1.1). Each takes ONE object of bags: `base: SiteBase` {dbPath, overrides, kernel,
  chat, workspaceId, clock, idGen, onStoreClose, storeBound}, `site: SiteRuntime`, `repos: SiteKernelRepos`,
  `late`, plus earlier composer results by name. Names `<Composer>Input` per CONVENTIONS rule 8.
- Each new module that logged via `consoleLogger` declares its own `const consoleLogger = createConsoleLogger({ prefix: "" })`.

## 5. Responsibility map — top-level declarations
| decl (line) | goes to |
|---|---|
| re-export L392, consoleLogger L408 | stay deps.ts |
| siteThemesDir L421, builtInContentSeedDbPath L448, builtInSeedUploadsDir L464, pluginsInstallDir L486, defaultDatabaseJournalDbPath L498, defaultChatDbPath L508 | `site-paths.ts` (existing; its job = path resolvers). Do NOT add them to deps.ts's re-export (rule 4); importers change (§8 S2) |
| resolveShareDirectory L528, isInsideAny L543 | `deps/site-share.ts` |
| CreateSiteRouteDepsOverrides L554, StoreCloseRegistration L796 | `deps/overrides.ts` (types) |
| assertOverridesPairedOrAbsent L642, hydrateContentDbIfNeeded L675, resolveThemesDirOverride L688, resolveSiteBindingOverride L698, startOwnerChatExpirySweep L860, resolveWorkspaceIdOverride L874 | `deps/overrides.ts` (override readers + store-open steps). Call texts in openCompositionStore/body stay verbatim (test anchors) |
| pluginFailureThresholdOverride L659 | `deps/plugins.ts` |
| resolveSiteBackupSources L712, readTovuVersion L727 | `deps/site.ts` |
| createSiteDisplayNameSource L744, compositionSiteDisplaySources L3038 | `deps/settings.ts` |
| compositionSiteKeySources L752 | `deps/credentials.ts` |
| compositionApprovalOverrides L775 | `deps/assistant.ts` |
| prepareCompositionStorage L782, openCompositionStore L816, createSiteRouteDeps L937, createSiteRouteDepsForWorkspace L3106 | stay deps.ts (pinned) |
| applyAdminPasswordResetFromEnvIfConfigured L901 | `deps/identity.ts` |
| providerPluginBoot L953, composeProviderConfig L962, credentialProject L987, acceptedSiteId L994, siteIdentityFor L1010 [export], projectStoreFor L1023, flushLifecycleEvents L3051 | `deps/providers.ts` (siteIdentityFor importer: runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts) |
| logMediaProviderRefusals L1041 | `deps/media.ts` |
| compositionConsentOptions L3058, configureVisitorConsentAnalytics L3068 | `deps/analytics.ts` |
| composeSiteRouteDeps L1050 | stays (orchestrator, §6) |

## 6. composeSiteRouteDeps statements -> units (anchor line = outline line)
deps.ts helpers (same file, above composeSiteRouteDeps, in run order):
- `createLateSiteBindings(thunks: LateSiteThunks): LateSiteBindings` <- L1059-1060, L1105-1106, L1192, L1738, L1961, L2223-2224.
- `composeSiteRuntime({ overrides, onStoreClose, late }: ComposeSiteRuntimeInput): SiteRuntime` <- L1061-1062,
  L1073-1090 -> {assistantAgentInventory, resolvedSiteBinding, agentPluginLayout, agentPluginLifecycle,
  federatedMcpPresetRegistry, skillLayout, resolvedThemesDir}.
- `createSiteDurableAdapters({ kernel, workspaceId }): SiteKernelRepos` <- L1232-1233, L1293-1294, L1313, L1351,
  L1394, L1457, L1466, L1480, L1491, L1708, L1722, L1726, L1728-1730, L1735-1737, L1739, L1744-1745, L1848,
  L2065, L2073, L2078-2079, L2082-2084, plus literal ctor expressions: workspaceRepo L2241, analyticsSink L2467,
  newsletterCampaignRepo L2571, webhookSubscriptionRepo/webhookDeliveryRepo L2531-2532, commentRepo (the
  `new SqliteCommentRepo({ store: kernel }, {})` arg of L1774), gatedMutationTokens (L2662 ctor),
  disclosureWatermarkSource (L2643). Field names = the old local / literal key names.
- `createSiteCredentialStores({ kernel }): SiteCredentialStores` <- L1906, L1922, L2090, and the L2204 vault-repo ctor as `agentPluginVaultRepo`.
- `openSiteDatabaseJournal({ base, repos }): SiteDatabaseJournal` <- L1690-1715 (keeps mkdir/open/close order).
- `bindProviderPlugins(required): SiteProviderPorts` <- L1955-1960, L1962 (calls providers.ts composeProjectKeys),
  L1981-1991 (`lifecycleTracker = tracker` -> `late.lifecycleTracker = tracker`; L1985 -> `late.formCollectionProviders = ...`)
  -> {projectKeys, observability, tracker, aiTraceSink}.
- `attachFormRuntime(required): void` <- L2844-2869 (writes routeDeps.formDestination/Pull/AutoPull/DeliveryStatus/Delivery).
- `attachCommerce(required): void` <- L2903-2917 (compositionCommerce body inlined as the helper; cast stays here).
Orchestrator keeps: L1055, L1093, L1123, L1133, L1136, L1141-1160 (nested warn fn unchanged), L1165-1166,
L1177-1182, L1220, L1395 (bus), L1804, L1806, L1889-1902, L1923-1929, L1937 (-> composeCustomCredentialSetRepo call),
L1947-1954, L2080, L2219-2222 (seo call), L2235 (`const routeDeps: SiteRouteDeps = assembleSiteRouteDeps(...)`),
L2819 (`late.resolveRouteDeps(routeDeps)`), L3034-3035.
Feature modules (statement -> exported function):
- deps/media.ts: `composeMediaBlobStore` L1102, L1107-1120; `startMediaTransformBoot` L1352-1361;
  `startBlobHydration` L1379-1385; `mediaRouteDeps` keys mediaRepo..imageCodec, mediaImportHttpClient,
  mediaGenerationHttpClient, mediaProviderRegistry, mediaProviderCredentialRepo.
- deps/plugins.ts: `composePluginRuntimeDeps` L1187-1188, L1193-1216; `composePluginConnections` L2202-2218 +
  L2232 (pluginExports); `pluginsRouteDeps` keys pluginExports, pluginActivationRepo..pluginBeforeSaveHook,
  pluginRuntimeReady, pluginExportHosts, ...agentPluginConnections, providerFaces, bundledSourceRoot,
  federatedMcpPresetRegistry, agentPluginLayout, agentPluginLifecycle, skillLayout, preferences, chartProviderSnapshot.
- deps/boot-writers.ts: `startSiteBootWriters({ base, site, media, repos, identity })` -> calls, in this order,
  identity.ts `composeIdentityDeps` (L1222-1231), settings.ts `composeSettingsDeps` (L1238-1285, L1251-1253),
  navigation.ts `startNavigationBoot` (L1295-1304), members.ts `startNewsletterBoot` (L1317-1322),
  comments.ts `startCommentsBoot` (L1334-1338), media.ts `startMediaTransformBoot`, `startBlobHydration`.
- deps/trash.ts: `composeTrashDeps` L1470-1471, L1486-1488, L1560-1564, L1620-1647 with same-file helpers
  `createFormPurgeFollowUps` (L1493-1527), `createTrashFollowUpHooks` (rest of L1492-1559),
  `createTrashAdapters` (L1565-1616); `trashRouteDeps` keys trash, remove*/forget*, sweepTrash,
  isTrashableEntityType, registry, db, removeMember, removeMenu, removeFormSubmission, removeTerm, removeTaxonomy, removePlugin.
- deps/redirects.ts: `composeRedirectsDeps` L1424-1456 (nested registerBootOrigin -> module fn
  `registerBootOrigin({ originBoot, kernel, workspaceId, devCapabilityScheme, clock })`), L1458, L1649-1685,
  L2191-2199 (`resolveCompositionPublicOrigin({ devCapabilityScheme })`); called AFTER composeTrashDeps (origin
  I/O start moves after pure trash construction: harmless); `redirectsRouteDeps` keys redirectRepo..redirectsWriteDeps.
- deps/content.ts: `wireSiteWidgetResolvers` L1753-1772; `startLegacyWidgetAdoption` L2826-2839; `contentRouteDeps`
  keys workspaceId, workspaceRepo, postRepo, postGoLiveCandidates, postSearch, slugChangeCapture, docBodyAsPageHtml,
  pagesHtmlStore, changeSets (literal L2402 keeps its own second instance), revertRegistry, contentType*, entry*,
  taxonomy*, term*, widgetBindingRepo, entryRefsRepo, stampWatermark, outbox, bus, clock, idGen, contentKernel, publishTrustRevocations.
- deps/comments.ts: `startCommentsBoot`, `composeCommentsDeps` L1773-1796, `commentsRouteDeps` L2665-2670 keys.
- deps/members.ts: `startNewsletterBoot`, `composeMembersDeps` L1853-1858, `membersRouteDeps` member*/magicLink/newsletter* keys.
- deps/credentials.ts: `compositionSiteKeySources`, `composeCustomCredentialSetRepo` (nested L1941-1946),
  `composeSharedOAuth` (L2892-2901), `composeExternalMcpDeps` (L1909, L2190, L2234), `credentialsRouteDeps`
  (siteAssistant*, adminExecutionCredentialRepo, externalMcp*, mcp, notifyRosterChanged, builtInExternalMcpServerIds,
  derivedPublicOrigin, passkeyOrigin, customCredentialSetRepo, customCredentialsHttpClient, projectKeys, legacyProviderCredential).
- deps/providers.ts: moved provider helpers + `composeProjectKeys` (nested L1966-1980; `bindSharedApiOAuth` -> `late.bindSharedApiOAuth`).
- deps/mail.ts: `composeMailDeps` L2002-2023; `mailRouteDeps` mailer..mailSuppressionAdmin, mailFeedbackRoute.
- deps/http-clients.ts: `composeOutboundHttpClients` L2031-2058, L2180-2188.
- deps/site.ts: `composeSiteThemes` L2102-2113; `siteRouteDeps` themes, themesDir, packageThemesDir, siteBinding,
  createSite, siteBackupSources, siteStoragePaths, siteBackupSanitize, siteBackupHttpClient, peerSiteReads, verifyDueDomainBindings.
- deps/publish.ts: `composePublishContentDeps` L2087, L2093-2099, L2114-2177, L2220; `publishRouteDeps` L2702-2817 keys (createSiteApp imports createApp from ../app.js).
- deps/settings.ts: `composeSettingsDeps`, `composeSeoDeps` (L2221-2222), `settingsRouteDeps` (presentationRepo, settingsRepo,
  getEffective, set, instructionsNamespace, seo*, settings ready flags, siteTitle*, siteDisplayName, siteTimeZone).
- deps/analytics.ts: `composeSiteConsentReadiness` L2226-2231 (`routeDepsBuilt` -> late.routeDepsBuilt);
  `analyticsRouteDeps` observability..analyticsProviders, consentStore, siteConsentReady, publicPageSecurityHeaders,
  ...compositionConsentOptions(...).
- deps/database.ts: `databaseRouteDeps` (databaseLedgerRepo, restorePointsRepo, dbOps, databaseIntrospection,
  migrationRunsRepo, disclosureWatermarkSource, deepLinkRestorePointLookup, gatedMutations, toolAttemptAuditSink
  (+ reportToolAuditError L1183-1184), toolGaps, siteStatusRepo, databaseTransfer*).
- deps/assistant.ts: `assistantRouteDeps` (chat*, agentSessions, conversationToolApprovals, ...compositionApprovalOverrides,
  assistantAgentInventory, assistantSettingsReady, visitorToolsManagement, adminAssistantEnabled, siteAssistantRateLimiter).
- deps/forms.ts: `formsRouteDeps` (formDefinitionRepo..formsRateLimiter, executeCommand).
- deps/webhooks.ts: `webhooksRouteDeps` (webhookSubscriptionRepo, webhookDeliveryRepo, webhookSigner).
- deps/navigation.ts: `startNavigationBoot`, `navigationRouteDeps` (menuRepo, navLocationBindingRepo).
- deps/search.ts: `attachSiteSearch` L2876-2888.
- deps/site-share.ts: `configureSiteSharing` L2937-3014 (+ resolveShareDirectory, isInsideAny).
- deps/site-import.ts: `configureSiteImports` L3015-3031.
- deps/post-build.ts: `finishSiteRouteDeps` L2919-2936, then calls configureSiteSharing, configureSiteImports, L3032-3033.
- deps/route-deps.ts: `assembleSiteRouteDeps(parts: SiteRouteDepsParts): SiteRouteDeps` (spread of all *RouteDeps).
- deps/context.ts: types SiteRouteDeps, SiteBase, SiteRuntime, SiteKernelRepos, SiteCredentialStores,
  SiteDatabaseJournal, LateSiteBindings, LateSiteThunks (import type only).

## 7. Orchestrator target (counted ~91; one call per line)
store/onStoreClose; late; site; `const { resolvedSiteBinding } = site`; kernel (anchor); media; storeBound (anchor);
workspaceId await; trust await; chatDbPath; chat; await warn + nested fn (unchanged); mediaProviders await; log;
postSearchBackfillReady (3); clock; idGen; repos; base; plugins; identity (L1220 verbatim); boot; bus; trash;
redirects; database; wireSiteWidgetResolvers; comments; runtimeMode; siteKeySources; members; keyring (3, anchor);
sealer; normalize await (4, verbatim first line); credentialRepo (anchor); vaults = createSiteCredentialStores;
projectKeyReferences (2); composeProviderConfig await (3, verbatim first line); providerConfigSource (2);
customCredentialSetRepo; providerPlugins await (8, verbatim first line); `const { projectKeys, observability,
tracker, aiTraceSink } = bindProviderPlugins(...)`; credentials bag; mail; http; `if (...) await protectExistingFormFiles`
(verbatim); themes; publish; connections; externalMcp; `const seo = composeSeoDeps({ repos, originRegistry: redirects.originRegistry, clock })`;
consent; routeDeps (2); late.resolveRouteDeps; startLegacyWidgetAdoption; attachFormRuntime; attachSiteSearch;
attachCommerce; finishSiteRouteDeps; `await registerContentAnalytics({ deps: { bus, tracker, workspaceId } });`; return.

## 8. Steps (each compiles + listed tests green; P = pinned set below)
P = server/__tests__/unit/composition-boot-order.unit.test.ts, server/__tests__/integration/production-readiness-boot.integration.test.ts,
server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts, platform/db/sqlite/__tests__/chat-orphan-check.integration.test.ts,
server/runtime/composition/__tests__/wiring-identity.test.ts, server/__tests__/unit/serving-app-boot-wiring.unit.test.ts,
server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts, server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts
(all under apps/website/src/).
- S1 overrides.ts + context.ts (types + override readers); importer: runtime/composition/__tests__/deps-observability-wiring.integration.test.ts. Tests: P.
- S2 path helpers -> site-paths.ts; importers: cli/__tests__/unit/serve-site-dir-pin.unit.test.ts, server/__tests__/integration/database-migration-reconciliation-boot.integration.test.ts,
  server/runtime/lifecycle/__tests__/agent-daemon-spawn-env.test.ts, runtime/composition/__tests__/site-path-resolvers.unit.test.ts. Tests: those + P.
- S3 deps.ts helpers createLateSiteBindings, composeSiteRuntime, createSiteDurableAdapters, createSiteCredentialStores, openSiteDatabaseJournal (body edits only). Tests: P + vault-boot.integration, database-migration-reconciliation-boot.
- S4 providers.ts + bindProviderPlugins; importer deps-provider-plugin-boot.integration.test.ts. Tests: P + deps-provider-plugin-boot, deps-project-credentials, observability-wiring.
- S5 media, plugins, boot-writers (+identity, settings, navigation, members/comments boot). Tests: P + hydrate-blob-store-boot, boot-settings-rejection, site-title-write-composition-roots, declared-content-types-wiring.
- S6 trash, redirects, content (resolvers), comments, members composers. Tests: P + serving-app-trash-sweep, slug-change-redirect-real-composition, dev-capability-origin-scheme, form-file-cleanup-wiring, pages-html-revisions-wiring.
- S7 mail, http-clients, credentials, site themes, publish, plugin connections, analytics consent. Tests: P + mail-sender-identity-wiring, external-mcp-oauth-loopback-wiring.unit, publish-content-seed-hash.load-deps.unit, site-backup-wiring.
- S8 all *RouteDeps parts + route-deps.ts assembly. Tests: P + all composition/__tests__/*wiring* listed in S4-S7.
- S9 post-build: content.startLegacyWidgetAdoption, attachFormRuntime, search.ts, attachCommerce, post-build.ts, site-share.ts, site-import.ts. Tests: P + site-search-wiring, site-share-wiring, create-site-route-deps-failure-release.
After each step: `outline.mjs --check` on deps.ts + new files; `npx eslint` on changed files.

## 9. After (estimates) and Risks
- deps.ts ~450-480 counted (kept pinned decls ~85, new deps.ts helpers ~190, orchestrator ~91, imports ~100). Fallback
  if >500: move `bindProviderPlugins` minus its 3-line provider-revision watch to providers.ts and call the watch
  from the orchestrator. Every module <300; every function <=100 (trash.ts helpers ~40-62; publish applyPort ~60).
- Risks: serve-command-wiring mock.module of deps.ts only stubs createSiteRouteDeps (unchanged). Construction order of
  pure ctors changes (allowed by §2). `satisfies` parts: if a part's inferred type is too narrow for a later in-place
  mutation (routeDeps.x = ...), SiteRouteDeps on the assembled const governs (mutations type-check against it).
  app.md may relocate startSettingsRegistration/siteAppBootWorkByDeps: import from wherever they live.

## REMAINING (for the next agent)
1. Write exact `<Composer>Input` field lists per composer (derive from stmts: outline `uses:` minus names produced
   in the same composer; tool: scratchpad size/hard/depsplan/stmts.json) and the SiteKernelRepos/LateSiteBindings
   interface bodies.
2. Verify every routeDeps literal key in tools/deps-props.txt is listed in exactly one *RouteDeps part in §6
   (unlisted today: none known, but not machine-checked), and confirm counted-line estimates with a dry-run outline.
3. Check side effects of ctors hoisted into createSiteDurableAdapters (none expected; spot-check SqliteOutboxAdapter,
   SqliteRedirectRepo factory, SqliteTokenStore).
