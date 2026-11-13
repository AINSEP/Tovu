# Split plan: apps/website/src/server/runtime/composition/app.ts

## 1. Header
- Path: `apps/website/src/server/runtime/composition/app.ts` — 1707 counted / 2689 raw, 294 imports (~387 counted import lines).
  Over: file (1707 > 500); `createRouteDeps` L466-1731 (882 > 100, its `trashAdapters` literal alone 216, the `routeDeps` literal 322); `createApp` L2039-2616 (247 > 100).
- Phase: NOW. Survey u042-2 row app.ts = STAY-WIRING ("no home"; only advice: move `startSettingsRegistration` + `siteAppBootWorkByDeps` to their own module). Nothing in this file moves to Jini, so every new module below runs BEFORE the move and stays in Tovu after it. Survey rows that will later touch the moved code (the move agent must look in the NEW file): u076-1 (`InMemorySourceControlCredentialSetRepo`, app.ts:1683 → `memory-deps/credentials.ts`), u032-2 (`wrapMailerWithPurposeGate`, app.ts:1444 → `memory-deps/mail.ts`), u088-1 D2 (`derivedPublicOrigin`, app.ts:1051 → `memory-deps/site.ts`).
- Executor: Fable/Opus. Shared map: deps.md §3 feature names; the real (SQLite) root is split by deps.md, this file is the hermetic root.
- Deviation from CONVENTIONS rule 3 (siblings only): a feature folder `composition/memory-deps/` (one file per §3 feature, same names as deps.md's `composition/deps/`), because 19 `app-<job>.ts` siblings next to deps.ts's own would make the folder unreadable. Deviation from "one commit per file": one commit per step below, so each step can be reverted alone.

## 2. Hard constraints (verified 2026-11-13; tests may not be edited)
1. `createRouteDeps`, `createApp` stay exported from app.ts: ~449 test files plus `development/scripts/{check-admin-api-routes,check-route-tool-parity,lib/tovu-test-server}.ts`, and the URL imports in `cli/__tests__/integration/serve-command-boot-lifecycle.integration.test.ts:296` and `server/runtime/lifecycle/__tests__/agent-daemon-real-spawn.test.ts:128`.
2. `server/__tests__/unit/serving-app-boot-wiring.unit.test.ts:117`: `createTrashModule(` may be called ONLY in app.ts → the Trash mount (L2292-2306) stays in app.ts (as helper `mountTrashRoutes`).
3. `server/runtime/composition/__tests__/wiring-identity.test.ts` row 7: `createTovuAgentPluginLifecycle(` only in baseline files (app.ts is one, new files are not) → stays in app.ts (helper `createMemoryAgentPluginLifecycle`).
4. `server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts:27-43`: app.ts must contain EXACTLY ONE `createTovuOAuthHttpPorts(...)` call, and its text is evaluated with only `createTovuOAuthHttpPorts, resolveApiConnectionRuntime, process, guardedOutboundHttpClient, routeDeps` in scope → statement L1165 stays in app.ts VERBATIM (`createTovuOAuthHttpPorts({ http: guardedOutboundHttpClient }, { allowLoopbackHttp: resolveApiConnectionRuntime({ env: process.env }) === "desktop" })`), with a local named exactly `guardedOutboundHttpClient`.
5. `server/__tests__/integration/production-readiness-boot.integration.test.ts`: checked with the test's own AST logic — app.ts satisfies NO inventory hint that deps.ts does not also satisfy, so moving app.ts code cannot break it (as long as deps.ts keeps its own; deps.md's job). Run it anyway.
6. `server/runtime/composition/modules/__tests__/assistant-tool-exec.integration.test.ts:227` esbuild-bundles app.ts: new modules must not reach `agent-daemon-server.ts` or `createDiskAttachmentStore` (they don't; code only moves).
7. `server/runtime/composition/__tests__/app-module-load-registers-no-phase-handler.test.ts` + `__tests__/no-first-party-require.boundary.test.ts`: no new module-level side effects; `busesWithSiteEventHandlers` / `siteAppBootWorkByDeps` stay single module-level instances (plain ESM imports only, never `require`).
8. No test mocks app.ts by `mock.module`; the only mocked composition module is `serving-app.ts` (serve-command-wiring.unit). `.dependency-cruiser.mjs` exempts `composition/` sub-folders (deps.md §1.8).
9. `development/scripts/check-capability-inventory.ts` text-matches deps.ts|app.ts; deps.ts covers every entry (unchanged by this plan).

## 3. Responsibility map
Top-level declarations (anchor = outline line):
| Declaration | Unit after split | Job |
|---|---|---|
| L423 `CreateRouteDepsOptions` (+ the `@file` header above it stays at top of app.ts) | `composition/app-types.ts` | options of the hermetic root |
| L440 `createLazyProxy` | `memory-deps/stores.ts` (exported) | lazy in-memory DB proxy |
| L458 `inMemoryPluginRuntimeOptions` | `memory-deps/plugins.ts` (private) | optional plugin-runtime overrides |
| L466 `createRouteDeps` | app.ts (orchestrator, ≤60 lines) | hermetic RouteDeps root |
| L1776 `runExportSite` (+ its doc) | `memory-deps/publish.ts` (private) | static export engine binding |
| L1787 `mountRoutes`, L1793 `startModule` (+ docs) | `composition/server-module-mount.ts` | ServerModuleHandle mount/start |
| L1798 `busesWithSiteEventHandlers`, L1819 `subscribeSiteEventHandlersOnce` | `composition/site-event-handlers.ts` | once-per-bus site outbox handlers |
| L1801 `siteAppBootWorkByDeps` | `composition/site-app-boot-work.ts` | boot-work collector per deps bag |
| L1911 `CreateAppOptions` | `composition/app-types.ts` | createApp hooks |
| L1943 `trackByokBootWork` | `composition/app-api-routes.ts` (private) | BYOK pass boot-work tracking |
| L1956 `applyPublicMiddleware`, L2029 `registerSiteIdlePark` | `composition/app-preamble.ts` (private) | guards before any route |
| L2008 `registerAdminSpa`, L2019 `registerSiteChatBundle` | `composition/app-public-routes.ts` (private) | static SPA / bundle mounts |
| L2039 `createApp` | app.ts (orchestrator) | ordered app assembly |
| L2623 `startSettingsRegistration` | `composition/settings-registration.ts` | shared settings boot order |

`createRouteDeps` statements (anchor → unit). "pure" = constructor with no I/O and no async start; pure statements may move earlier (built before first use, deps.md §2 precedent); every other statement keeps its relative order (§6).
| Anchor(s) | Unit |
|---|---|
| L468 toolAttemptAuditSink (+comment L467) | `memory-deps/database.ts` `memoryDatabaseRouteDeps` local |
| L469-472 workspaceRepo, postRepo, presentationRepo, settingsRepo | `memory-deps/stores.ts` `composeMemoryStores` |
| L474-475 clock (+comment L473), idGen | `memory-deps/core.ts` `composeMemoryCoreDeps` |
| L479-480 pluginActivationRepo (+comment L476-478), L481-499 pluginRuntime | `memory-deps/plugins.ts` `composeMemoryPluginRuntime` |
| L501 identity, L503-508 settingsPrincipals (+comments) | `memory-deps/identity.ts` `composeMemoryIdentityDeps` |
| L513 settingsReady, L516-521, L527-551, L975 siteTimeZone (+comments) | `memory-deps/settings.ts` `composeMemorySettingsDeps` |
| L555 newsletterListRepoInMemory, L1024-1027 memberRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks | `memory-deps/members.ts` `composeMemoryMembersDeps` |
| L561-578 originRegistry | `memory-deps/redirects.ts` `composeMemoryRedirectsDeps` |
| L579-580 redirectRepo, redirectHitSink; L591 commentRepo; L596-597 assetRenditionRepo, mediaRepo; L600 formSubmissionRepo; L605 entryRepo; L607-608 taxonomyDb, sqliteTrashDb; L621-624 taxonomyRepo, termRepo, entryTermRepo, taxonomyRevisionRepo; L959-963 widgetBindingRepo, entryRefsRepo, menuRepo, navLocationBindingRepo, formDefinitionRepo; L969-970 contentTypeRepo, contentTypeIndexProvisioner; L1060-1061 changeSets, assetBlobRepo; L1063-1064 mediaContentTypeStore, blobStore; L1166 transformDefinitionRepo | `memory-deps/stores.ts` `composeMemoryStores` (all pure; comments move with each) |
| L581-582 outbox, bus; L606 workspaceId | `memory-deps/core.ts` |
| L586 restorePointsRepo (+comment) | `memory-deps/database.ts` builder local |
| L612-617 trashRegistry, trashRepo; L625-633; L904-920 trash, removePlugin | `memory-deps/trash.ts` `composeMemoryTrashDeps` |
| L618-620 taxonomyFollowUp*; L634-875 trashAdapters; L876-903 form follow-up loop | `memory-deps/trash-adapters.ts` |
| L922-954 redirectsWriteDeps + 3 registrations | `memory-deps/redirects.ts` |
| L976-992 wireCoreResolvers | `memory-deps/content.ts` `wireMemoryCoreResolvers` |
| L993-1015 commentsModule, commentsCapability | `memory-deps/comments.ts` `composeMemoryCommentsDeps` |
| L1035-1037 siteAssistant keyring/sealer/repo; L1041 externalMcpServerRepo; L1044 externalMcpOAuthDevices; L1187 customCredentialSetRepo; L1196 agentPluginMcp | `memory-deps/credentials.ts` `composeMemoryCredentialsDeps` |
| L1050-1051 REPO_ROOT_FOR_ORIGIN, derivedPublicOrigin; L1169-1170 siteBinding, agentPluginLayout; L1183 skillLayout | `memory-deps/site.ts` `composeMemorySiteLayout` |
| L1065-1067, L1072, L1075-1076 publish repos/fileBlobIndex/peer/seed hash; L1087-1150 publishContentApplyPort | `memory-deps/publish.ts` `composeMemoryPublishDeps` |
| L1079 siteThemes, L1083-1084 theme adapter + `trashAdapters.set`, L1086 removeTheme | `memory-deps/themes.ts` `composeMemoryThemes` |
| L1153 inMemoryChatHistory | `memory-deps/assistant.ts` builder local |
| L1155-1163 guardedOutboundHttpClient | `memory-deps/media.ts` `composeMemoryMediaHttp` |
| L1165 externalMcpOAuthHttpPorts (+comment L1164) | app.ts orchestrator, verbatim (constraint 4) |
| L1167-1168 seoDeps, sitemapService | `memory-deps/content.ts` builder locals |
| L1171-1181 agentPluginLifecycle | app.ts helper `createMemoryAgentPluginLifecycle` (constraint 3) |
| L1182 federatedMcpPresetRegistry | `memory-deps/plugins.ts` builder (inline property value) |
| L1190-1193 siteConsentReady | `memory-deps/observability.ts` `composeMemoryConsentReadiness` |
| L1194 pluginExports | `memory-deps/plugins.ts` `createMemoryPluginExports` |
| L1197-1726 routeDeps literal | app.ts: spread of the group builders (§4.3) + `createSiteApp` (L1626-1633 with its comment) stays inline |
| L1727-1730 tail | app.ts, unchanged |

routeDeps literal properties (app-props.txt anchors) → group builder:
- core: L1201 workspaceId, L1418-1419 outbox/bus, L1426-1427 clock/idGen, L1507 executeCommand.
- identity: L1430-1431 `...identity, principalRepo` (that order), L1357 passkeyOrigin.
- trash: L1202-1266 (trash … isTrashableEntityType, incl. L1203/L1206-1207 comments), L1503 removeFormSubmission, L1570 removePlugin.
- themes: L1401-1402 themes/themesDir, L1571 removeTheme, L1647 resolveActiveThemeId.
- plugins: L1199 pluginExports, L1330-1333 bundledSourceRoot/mcp/preferences/providerFaces, L1358-1366 `...composeAgentPluginConnections`, L1405-1408 federatedMcpPresetRegistry/agentPluginLayout/agentPluginLifecycle/skillLayout, L1563-1583 pluginActivationRepo … pluginRuntimeReady except removePlugin/removeTheme.
- content: L1270-1271, L1272-1276 postSearch, L1280-1289 docBodyAsPageHtml/pagesHtmlStore (its `options` is the lambda's own parameter, not createRouteDeps' options), L1319-1320 seoDeps/sitemapService, L1377-1400 changeSets/revertRegistry, L1449-1450 menuRepo/navLocationBindingRepo (§3 "navigation", 2 keys, kept here), L1517-1527 contentTypeRepo … stampWatermark, L1561-1562 widgetBindingRepo/entryRefsRepo, L1648 listPublishedPosts.
- assistant: L1200 assistantAgentInventory, L1290-1305 chatHistory … approvalIdentityForRun spreads, L1321-1323 assistantSettingsReady/visitorToolsManagement, L1509-1511 siteAssistantRateLimiter, L1618-1621 adminAssistantEnabled.
- settings: L1306-1318 presentationRepo … seoReady (incl. set/getEffective/instructionsNamespace/settingsReady), L1367-1370 executionSettingsReady … siteTitleReady, L1373-1376 siteTitlePreservationStore … siteTimeZone.
- credentials: L1324-1329, L1334-1355 (notifyRosterChanged … externalMcpOAuthDevices; `routeDeps.mcp.applyAccess` in L1353 → `routeDepsOf().mcp.applyAccess`), L1676-1700 publishCredentialVerificationCache, sourceControlCredentialSetRepo, vendorCredentialSetRepo, customCredentialSetRepo, customCredentialsHttpClient (NOT sourceControlExportRootDir → publish).
- site: L1198 siteBackupSanitize, L1356 derivedPublicOrigin, L1403-1404 siteBinding/createSite, L1409-1417 siteStoragePaths, L1634-1641 resolveStorefrontProducts (commerce, 1 key, kept with site).
- observability: L1371-1372 siteConsentReady/consentStore, L1420-1429 observability/tracker/analyticsSink/analyticsConfig.
- redirects: L1279 slugChangeCapture, L1432-1435.
- members (members+newsletter): L1436-1440, L1476-1495 newsletterReady … newsletterHooks (incl. membersConsentCapability).
- mail: L1441-1448 mailer.
- webhooks: L1451-1457.
- media: L1458-1475 mediaRepo … imageCodec, L1702-1710 mediaImportHttpClient/mediaGenerationHttpClient/mediaProviderRegistry.
- forms: L1496-1502 formDefinitionRepo/formSubmissionRepo/formSubmissionAttempts, L1508 formsRateLimiter.
- database: L1512-1516, L1528-1552 restorePointsRepo … gatedMutations.
- comments: L1553-1560.
- publish: L1269 publishTrustRevocations, L1584-1617 publishContent* … exportOutputRootDir, L1649-1675 publishHistoryStore … loadAuthSchemes, L1687 sourceControlExportRootDir, L1701 deployOpsHttpClient, L1711-1725 exportSiteBound/staticSiteContext.
- app.ts inline: L1622-1633 createSiteApp.
Every property's leading comment block moves with it. In builders, `routeDeps.X` inside closures becomes `routeDepsOf().X` (same call-time read).

`createApp` statements → helper (all helpers keep statements contiguous and in order, so Express mount order is unchanged):
| Anchors | Helper |
|---|---|
| L2040 `const app = express()` | createApp |
| L2042-2057 hasBackgroundWork … subscribeSiteEventHandlersOnce | `installAppPreamble` (app-preamble.ts), returns `internalRouter` |
| L2064-2077 core module, theme preview refresh, content module, content post GET, publish-content module | `mountCoreContentRoutes` (app-api-routes.ts), returns `isAuthenticatedPreviewRevision` |
| L2084-2155 magic-link limiters, members + newsletter modules | `mountMemberRoutes` (app-api-routes.ts) |
| L2159-2246 analytics … fs-files folder picker | `mountAdminOperationRoutes` (app-api-routes.ts) |
| L2252-2279 comments-moderation … media module | `mountAdminFeatureModules` (app-api-routes.ts) |
| L2292-2306 Trash mount (+comment L2280-2291) | `mountTrashRoutes` (app.ts) |
| L2307-2342 external-mcp … database-recovery | `mountAdminSettingsModules` (app-api-routes.ts) |
| L2354-2415 BYOK module, boot work, assistant modules | `mountAssistantRoutes` (app-api-routes.ts) |
| L2425-2448 content-types, taxonomy, merge/migrate/restore, seo, site search | `mountContentModelRoutes` (app-api-routes.ts) |
| L2450-2509 admin SPA, agent icons, MCP-UI proxy, site-chat bundle + comparison, theme preview/assets/page preview | `mountPublicAssetRoutes` (app-public-routes.ts) |
| L2517-2608 commerce, comments submit, analytics ingest, forms submit, member pages, site routes | `mountPublicSubmitRoutes` (app-public-routes.ts) |
| L2611-2615 oversized body, captureRouteError, return | createApp |

## 4. Target layout
All paths under `apps/website/src/server/runtime/composition/`. Imports: each moved statement takes the import bindings it uses; app.ts drops bindings that become unused. Import-line "why" comments (e.g. app.ts L121-122, L126-128) move with their import line (copied if the import is needed in two files). No module below imports `app.ts`; memory-deps modules import only `../app-types.js`, `./stores.js`/`./core.js`/other memory-deps modules listed, and the same feature imports app.ts uses today → no cycle (app.ts → memory-deps/* → app-types.ts; app.ts → app-*.ts → server-module-mount/site-event-handlers/site-app-boot-work/app-types).

### 4.1 Composition siblings
- `app-types.ts` — exports `CreateRouteDepsOptions` (L423-438), `CreateAppOptions` (L1911-1940, with doc comments), `type AppRouteDeps = NewsletterRouteDeps & ByokToolSurfaceDeps`. Type-only imports.
- `settings-registration.ts` — exports `startSettingsRegistration` (L2617-2688 verbatim incl. doc). Importers: app.ts (none after step 5), `deps.ts:406`.
- `site-app-boot-work.ts` — exports `siteAppBootWorkByDeps` (L1796-1801 with doc). Importers: `deps.ts:406`, `app-api-routes.ts`.
- `server-module-mount.ts` — exports `mountRoutes`, `startModule` (L1777-1795 with both doc blocks).
- `site-event-handlers.ts` — exports `subscribeSiteEventHandlersOnce`; private `busesWithSiteEventHandlers` (L1797-1908). Imports `startModule`.
- `app-preamble.ts` — exports `installAppPreamble({ app, routeDeps }: InstallAppPreambleInput, options: CreateAppOptions = {}): express.Router` (L2042-2057; `const internalRouter = express.Router()` stays at L2052's position inside, returned at end); private `applyPublicMiddleware` (L1954-2006), `registerSiteIdlePark` (L2024-2037) unchanged.
- `app-api-routes.ts` — exports `mountCoreContentRoutes({ app, routeDeps }, options: CreateAppOptions = {}): { isAuthenticatedPreviewRevision }` (returns the L2065 value as an object), `mountMemberRoutes({ app, routeDeps })`, `mountAdminOperationRoutes({ app, routeDeps })`, `mountAdminFeatureModules({ app, routeDeps })`, `mountAdminSettingsModules({ app, routeDeps })`, `mountAssistantRoutes({ app, routeDeps, internalRouter }, options: CreateAppOptions = {})`, `mountContentModelRoutes({ app, routeDeps })`; private `trackByokBootWork` (L1941-1953). Input type for all: `AppMountInput = { app: Express; routeDeps: AppRouteDeps }` (exported from app-api-routes.ts; app-public-routes.ts imports it).
- `app-public-routes.ts` — exports `mountPublicAssetRoutes({ app, routeDeps, isAuthenticatedPreviewRevision })`, `mountPublicSubmitRoutes({ app, routeDeps })`; private `registerAdminSpa`, `registerSiteChatBundle` (L2007-2023 with docs).

### 4.2 memory-deps/ (hermetic root, one file per §3 feature)
Each composer is synchronous; result types are exported as `export type MemoryX = ReturnType<typeof composeMemoryX>`. Each group builder returns its object literal written `{ ... } satisfies Partial<AppRouteDeps>` (keeps contextual typing for untyped lambda params such as `set: (required, optional) =>`, `toolGaps.list`, `exportSiteBound: (opts) =>`; no casts). `routeDepsOf: () => AppRouteDeps` is the TDZ-identical thunk from the orchestrator.
| File | Exports (signature → returns) | Takes |
|---|---|---|
| core.ts | `composeMemoryCoreDeps(_required: Record<string, never> = {}, _options: Record<string, never> = {})` → `{ clock, idGen, outbox, bus, workspaceId }`; `memoryCoreRouteDeps({ core })` | L473-475, L581-582, L606; group core |
| stores.ts | `createLazyProxy`; `composeMemoryStores({ core })` → every store in §3 stores row | L440-454, stores rows |
| site.ts | `composeMemorySiteLayout(_required: Record<string, never> = {}, _options: Record<string, never> = {})` → `{ siteBinding, agentPluginLayout, skillLayout, derivedPublicOrigin }`; `memorySiteRouteDeps({ site, routeDepsOf })` | L1046-1051, L1169-1170, L1183 (pure path/env reads, moved before the plugin runtime); group site |
| plugins.ts | `composeMemoryPluginRuntime({ core, stores, site, routeDepsOf }, { options }: { options?: CreateRouteDepsOptions } = {})` → `{ pluginActivationRepo, pluginRuntime }`; `createMemoryPluginExports({ core, agentPluginLifecycle, routeDepsOf })` → pluginExports (L1194); `memoryPluginRouteDeps({ core, stores, site, identity, credentials, plugins, agentPluginLifecycle, pluginExports, guardedOutboundHttpClient, routeDepsOf })` (`routeDepsOf` added after review-d4 finding 4: the moved `preferences.write` closure calls `routeDepsOf().set(...)`) | L458-463, L476-499, L1194; group plugins (`getPluginHost: () => routeDepsOf().pluginHost`, `workspaceRoot: () => site.agentPluginLayout.forWorkspace(...)`) |
| identity.ts | `composeMemoryIdentityDeps({ core })` → `{ identity, settingsPrincipals }`; `memoryIdentityRouteDeps({ identity })` | L500-508; group identity |
| settings.ts | `composeMemorySettingsDeps({ core, stores, identity })` → `{ settingsReady, seoReady, commentsSettingsReady, assistantSettingsReady, executionSettingsReady, settingsUiTabsReady, analyticsSettingsReady, siteTitlePreservationStore, siteTitleSettingsDeps, siteSettingsReady, siteTitleReady, siteTimeZone }`; `memorySettingsRouteDeps({ core, stores, identity, settings, themes, credentials })` | L509-551, L971-975; group settings. Imports `startSettingsRegistration` from `../settings-registration.js` |
| trash-adapters.ts | `createMemoryTrashAdapters({ core, stores, trashRepo, pluginTrashAdapter, termEntry, taxonomyEntry })` → `Map<string, TrashAdapter>` (same insertion order: plugin, post, redirect, comment, media, form, form_submission, widget, menu, term, taxonomy); private factories `postTrashAdapter({ postRepo })` L637-662, `redirectTrashAdapter({ redirectRepo })` L665-687, `commentTrashAdapter({ commentRepo })` L690-716, `mediaTrashAdapter({ mediaRepo })` L719-740, `formTrashAdapter({ formDefinitionRepo, formSubmissionRepo, trashRepo })` L743-763, `formSubmissionTrashAdapter({ formSubmissionRepo })` L766-785, `widgetTrashAdapter({ entryRepo, entryRefsRepo })` L788-811, `menuTrashAdapter({ menuRepo, navLocationBindingRepo })` L814-843, `termTrashAdapter({ entry, db, followUp })` L846-858, `taxonomyTrashAdapter({ entry, db, followUp })` L861-873 (followUp = `{ termRepo, trash, revisions, outbox, clock }` built once from L618-620); exported `addFormAttachmentPurges({ trashAdapters, core, stores, routeDepsOf })` L876-903 (`routeDeps.` → `routeDepsOf().`) | each factory returns the exact expression that was the tuple's second element |
| trash.ts | `composeMemoryTrashDeps({ core, stores, plugins, routeDepsOf })` → `{ trashRegistry, trashRepo, formTrashEntry, trashAdapters, trash, removePlugin }` (L609-633, calls createMemoryTrashAdapters + addFormAttachmentPurges, L904-920); `memoryTrashRouteDeps({ core, stores, trash })` | group trash |
| redirects.ts | `composeMemoryRedirectsDeps({ core, stores, trash })` → `{ originRegistry, redirectsWriteDeps }` (L556-578, L921-954); `memoryRedirectsRouteDeps({ stores, redirects })` | group redirects |
| content.ts | `wireMemoryCoreResolvers({ stores, settings })` → void (L976-992; was a forward ref to transformDefinitionRepo/mediaContentTypeStore, now built in stores); `memoryContentRouteDeps({ core, stores, trash, redirects, pluginExports, routeDepsOf })` (L1167-1168 as locals) | group content |
| comments.ts | `composeMemoryCommentsDeps({ core, stores, identity, settings, trash })` → `{ commentsModule, commentsCapability }` (L993-1015); `memoryCommentsRouteDeps({ comments, settings })` | group comments |
| members.ts | `composeMemoryMembersDeps()` → `{ newsletterListRepoInMemory, memberRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks }` (L552-555, L1016-1027); `memoryMembersRouteDeps({ core, members })` | group members |
| mail.ts | `memoryMailRouteDeps()` | group mail |
| webhooks.ts | `memoryWebhooksRouteDeps({ members })` | group webhooks |
| credentials.ts | `composeMemoryCredentialsDeps({ core })` → `{ siteAssistantSecretKeyring, siteAssistantSecretSealer, siteAssistantCredentialRepo, externalMcpServerRepo, externalMcpOAuthDevices, customCredentialSetRepo, agentPluginMcp }` (L1028-1044, L1184-1187, L1195-1196); `memoryCredentialsRouteDeps({ core, site, credentials, externalMcpOAuthHttpPorts, routeDepsOf })` | group credentials |
| media.ts | `composeMemoryMediaHttp()` → `{ guardedOutboundHttpClient }` (L1154-1163); `memoryMediaRouteDeps({ stores, guardedOutboundHttpClient })` | group media |
| themes.ts | `composeMemoryThemes({ trash })` → `{ siteThemes, removeTheme }` (L1077-1086; does `trash.trashAdapters.set(THEME_ENTITY_TYPE, …)`); `memoryThemesRouteDeps({ themes, trash, routeDepsOf })` | group themes |
| publish.ts | `composeMemoryPublishDeps({ core, stores, identity, trash, redirects, themes }, { options }: { options?: CreateRouteDepsOptions } = {})` → `{ publishContentBundleRepo, publishContentBaselineRepo, publishContentRunRepo, fileBlobIndex, publishContentPeerRepo, publishContentSeedHash, publishContentApplyPort }` (L1065-1076, L1087-1150 — the apply-port statement is 58 lines, so the composer stays < 100); `memoryPublishRouteDeps({ site, publish, routeDepsOf }, { options })`; private `runExportSite` | group publish |
| observability.ts | `composeMemoryConsentReadiness({ identity, settings })` → siteConsentReady (L1188-1193); `memoryObservabilityRouteDeps({ core, stores, siteConsentReady })` | group observability |
| assistant.ts | `memoryAssistantRouteDeps({ core, stores, identity, settings }, { options })` (L1151-1153 as local) | group assistant |
| database.ts | `memoryDatabaseRouteDeps({ core, identity })` (L467-468, L583-586 as locals) | group database |
| forms.ts | `memoryFormsRouteDeps({ core, stores })` | group forms |
Inputs follow CONVENTIONS rule 8 (one destructured required object, optional second object); input type names `<Function>Input` / `<Function>Options`.

### 4.3 app.ts after
- Header doc (the `@file` block) unchanged.
- `createMemoryAgentPluginLifecycle({ site, routeDepsOf }: CreateMemoryAgentPluginLifecycleInput)` → lifecycle (L1171-1181 verbatim; `routeDeps.pluginHost` → `routeDepsOf().pluginHost`, `resolveDeps: () => routeDeps` → `resolveDeps: routeDepsOf`; comments L1177-1179 move).
- `createRouteDeps(options: CreateRouteDepsOptions = {}): AppRouteDeps` body, in this order:
  `const routeDepsOf = (): AppRouteDeps => routeDeps;` (comment: closures read the finished bag at call time, exactly as the inline `routeDeps` references did) · core · stores · site · plugins · identity · settings · trash · redirects · `wireMemoryCoreResolvers` · comments · members · credentials · themes · publish · `const { guardedOutboundHttpClient } = composeMemoryMediaHttp();` · L1164-1165 verbatim · lifecycle helper · consent · pluginExports · literal · tail L1727-1730.
  Literal spread order (must be exactly this: `core` before `identity` so identity's own `workspaceId` still wins, as `...identity` at L1430 did over L1201; no other group sets an IdentityDeps key — checked against routes/types.ts L190-250):
  `{ ...memoryCoreRouteDeps(…), ...memoryIdentityRouteDeps(…), ...memorySiteRouteDeps(…), ...memoryPluginRouteDeps(…), ...memoryTrashRouteDeps(…), ...memoryContentRouteDeps(…), ...memoryAssistantRouteDeps(…), ...memorySettingsRouteDeps(…), ...memoryCredentialsRouteDeps(…), ...memoryObservabilityRouteDeps(…), ...memoryThemesRouteDeps(…), ...memoryRedirectsRouteDeps(…), ...memoryMembersRouteDeps(…), ...memoryMailRouteDeps(), ...memoryWebhooksRouteDeps(…), ...memoryMediaRouteDeps(…), ...memoryFormsRouteDeps(…), ...memoryDatabaseRouteDeps(…), ...memoryCommentsRouteDeps(…), ...memoryPublishRouteDeps(…), createSiteApp: … }`. Keys are otherwise disjoint (each key listed once in §3).
- `mountTrashRoutes({ app, routeDeps }: AppMountInput)` (L2280-2306).
- `createApp(routeDeps: AppRouteDeps = createRouteDeps(), options: CreateAppOptions = {})`: L2040 · `const internalRouter = installAppPreamble({ app, routeDeps }, options);` · `const { isAuthenticatedPreviewRevision } = mountCoreContentRoutes({ app, routeDeps }, options);` · mountMemberRoutes · mountAdminOperationRoutes · mountAdminFeatureModules · mountTrashRoutes · mountAdminSettingsModules · `mountAssistantRoutes({ app, routeDeps, internalRouter }, options)` · mountContentModelRoutes · `mountPublicAssetRoutes({ app, routeDeps, isAuthenticatedPreviewRevision })` · mountPublicSubmitRoutes · L2611-2615. Every "why" comment above a moved mount moves into its helper; a comment explaining the ORDER between two helpers (e.g. L2516 "must precede the /:slug catch-all") moves with the statement it sits on.
- app.ts re-exports nothing (not a package entry; `apps/website/src/index.ts` imports only createApp/createRouteDeps — re-check with rg in step 1).

## 5. Steps (each: edit → `npx eslint <changed files>` → listed tests one at a time with the CONVENTIONS website command → commit by explicit paths)
Always-run set "A": `apps/website/src/server/__tests__/unit/serving-app-boot-wiring.unit.test.ts`, `apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts`, `apps/website/src/server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts`, `apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts`, `apps/website/src/server/runtime/composition/__tests__/app-module-load-registers-no-phase-handler.test.ts`, `apps/website/src/__tests__/no-first-party-require.boundary.test.ts`.
1. **app-types.ts**: move CreateRouteDepsOptions, CreateAppOptions; add AppRouteDeps; replace `NewsletterRouteDeps & ByokToolSurfaceDeps` spellings in app.ts with AppRouteDeps. Importer: `apps/website/src/server/runtime/composition/serving-app.ts:9` → `import { createApp } from "./app.js"; import type { CreateAppOptions } from "./app-types.js";`. Tests: A + `apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts`, `apps/website/src/server/runtime/composition/__tests__/create-app-boot-work.test.ts`. app.ts ≈ 1690.
2. **settings-registration.ts + site-app-boot-work.ts**. Importer `deps.ts:406` → `import { createApp } from "./app.js"; import { siteAppBootWorkByDeps } from "./site-app-boot-work.js"; import { startSettingsRegistration } from "./settings-registration.js";` (coordinate: deps.md's executor edits the same file — do this step first or rebase that one line). Tests: A + `apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts`, `apps/website/src/server/runtime/composition/__tests__/boot-settings-rejection.integration.test.ts`, `…/create-app-boot-work.test.ts`. app.ts ≈ 1640.
3. **server-module-mount.ts + site-event-handlers.ts**. Tests: A + `apps/website/src/server/runtime/composition/__tests__/form-file-cleanup-wiring.test.ts`, `…/serving-app-webhook-delivery.test.ts`. app.ts ≈ 1570.
4. **createApp split**: app-preamble.ts, app-api-routes.ts, app-public-routes.ts, mountTrashRoutes. Diff check before commit: the sequence of `mountRoutes(`/`register*(`/`app.use(` calls reached from createApp, read top to bottom through the helpers, equals the old L2040-2615 sequence. Tests: A + `apps/website/src/server/__tests__/admin-trash-routes.test.ts`, `…/composition/__tests__/create-app-comments-rate-limit.test.ts`, `…/create-app-page-head-registry.test.ts`, `…/app.consent-capture.test.ts`, `…/site-theme-override.integration.test.ts`, `apps/website/src/server/runtime/composition/modules/__tests__/assistant-tool-exec.integration.test.ts`. app.ts ≈ 1280; createApp ≈ 18.
5. **core.ts, stores.ts, site.ts** (+createLazyProxy). In createRouteDeps replace the moved statements by `const core = composeMemoryCoreDeps(); const { clock, idGen, outbox, bus, workspaceId } = core;` and the same destructuring shim for stores/site, so the rest of the body is untouched. Tests: A + `apps/website/src/server/__tests__/integration/tool-attempt-audit-sink-composition.integration.test.ts`, `…/composition/__tests__/agent-daemon-deps.memory-route-deps.unit.test.ts`.
6. **trash-adapters.ts + trash.ts** (composer only; destructure shim `const { trashRegistry, trashRepo, formTrashEntry, trashAdapters, trash, removePlugin } = …`). Also plugins.ts composer (trash needs it). Tests: A + `apps/website/src/server/__tests__/admin-trash-routes.test.ts`, `apps/website/src/features/trash/__tests__/tool-registrations.purge-ban.test.ts`, `…/composition/__tests__/form-file-cleanup-wiring.test.ts`, `…/declared-content-types-wiring.integration.test.ts`. createRouteDeps ≈ 560.
7. **identity, settings, redirects, content (resolvers), comments, members, credentials, themes, publish, media, observability composers** (destructure shims again). Tests: A + `apps/website/src/server/runtime/composition/__tests__/app.title-rejection.unit.test.ts`, `…/app.consent-capture.test.ts`, `…/publish-content-http.test.ts`, `apps/website/src/server/inbound/admin-http/routes/presentation/__tests__/rescan-themes.test.ts`, `apps/website/src/server/inbound/admin-http/routes/newsletter/__tests__/create-list.test.ts`. createRouteDeps ≈ 380 (literal still inline).
8. **group builders + final literal + createMemoryAgentPluginLifecycle**; delete all shims. Tests: A + every test of steps 5-7 + `…/composition/__tests__/visitor-tools-management.unit.test.ts`, `…/create-app-boot-work.test.ts`. createRouteDeps ≈ 55; app.ts ≈ 250.
9. Done check: `node development/refactor-patterns/size-splits/outline.mjs --check <app.ts and every new file>`.

## 6. After (expected counted lines; all functions ≤ 100)
app.ts ≈ 250 (createRouteDeps ≈ 55, createApp ≈ 18, mountTrashRoutes ≈ 16, createMemoryAgentPluginLifecycle ≈ 12) · app-types ≈ 30 · settings-registration ≈ 45 · site-app-boot-work ≈ 3 · server-module-mount ≈ 8 · site-event-handlers ≈ 70 · app-preamble ≈ 90 · app-api-routes ≈ 270 (mountMemberRoutes ≈ 55 the largest) · app-public-routes ≈ 140 (mountPublicSubmitRoutes ≈ 72) · memory-deps: trash-adapters ≈ 260 (largest factory menu ≈ 30) · publish ≈ 150 (composer ≈ 75) · plugins ≈ 120 · content ≈ 110 · settings ≈ 90 · credentials ≈ 80 · trash ≈ 110 (builder ≈ 65) · stores ≈ 70 · others ≤ 50 each. No owner-exception candidates.

## 7. Risks
- Side-effect order (keep exactly): composePluginRuntime (plugins) → identity (async identityReady) → startSettingsRegistration → siteSettings/siteTitle chains + `void siteTitleReady.catch` → redirect registrations L947-954 → wireCoreResolvers → comments → discoverAllBuiltInThemes + `trashAdapters.set(THEME…)` → agent lifecycle → consent readiness → pluginExports → literal (newsletterReady starts here, as before) → L1727-1729. The orchestrator order in §4.3 keeps this; only pure constructors moved earlier (stores, site layout, credentials, media http).
- Closures over later locals (TDZ): `routeDeps` (L482, L896-898, L1174, L1180, L1194, L1353, L1641-1649, L1719-1721), `agentPluginLayout` (L480), `contentTypeRepo`/`outbox` (L496), `transformDefinitionRepo`/`mediaContentTypeStore` (L980), `formDefinitionRepo`/`entryRefsRepo`/`menuRepo`/`navLocationBindingRepo` (trash adapters). All resolved by building stores/site first and by `routeDepsOf`; never call `routeDepsOf()` at composer time (only inside the same closures that read `routeDeps` today).
- `trashAdapters` is a mutable Map shared by `createTrashService`, `sweepTrash`, `isTrashableEntityType` and `composeMemoryThemes` (`.set` after construction): pass the same Map object; never copy it.
- `satisfies Partial<AppRouteDeps>` needs TS ≥ 4.9 (repo uses TS 5); if a key does not type-check, export the existing type — no casts (rule 10).
- `createSiteApp` must stay in app.ts (it calls `createApp`; a memory-deps module importing app.ts would be a cycle).
- deps.ts L406 import is edited by both this plan (step 2) and deps.md's executor.
- Not a bug, noted: `derivedPublicOrigin` duplicates deps.ts/site-listener-origin.ts logic (survey u088-1 D2) — moves unchanged.
