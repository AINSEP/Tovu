import type { SiteStore } from "../open-site-store.js";
import type { composeStoreBasics } from "./store-basics.js";
import type { composeIdentitySettings } from "./identity-settings.js";
import type { composeTrashService } from "./trash-service.js";
import type { composeDatabaseJournal } from "./database-journal.js";
import type { composeContentRepos } from "./content-repos.js";
import type { composeContentResolversComments } from "./content-resolvers-comments.js";
import type { providerPluginBoot } from "./provider-identity.js";
import type { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import type { composeSitePluginRuntime } from "./plugin-runtime.js";
import type { startBootData } from "./boot-data.js";
import type { composeMailHttp } from "./mail-http.js";
import type { composePublishingStoresThemes } from "./publishing-stores-themes.js";
import type { composePublishContentApplyPort } from "./publish-apply.js";
import type { composePreAssembly } from "./pre-assembly.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import { AlwaysUnavailableWatermarkSource } from "@jini-ai/db/recovery/lookup-adapters";
import { DOMAIN_DNS_EGRESS_POLICY } from "../domain-dns-adapters.js";
import { InMemorySiteStatusRepo } from "#src/features/database/repo.memory";
import { RECHARTS_DEFAULT_PROVIDER } from "../charts-recharts-source.js";
import { RestorePointDeepLinkLookup } from "@jini-ai/db/recovery/lookup-adapters";
import { SITE_ASSISTANT_PER_IP } from "#src/contracts/core/rate-limit/rate-limit";
import { SqliteTokenStore } from "#src/platform/db/sqlite/gated-mutation-token-repo.sqlite";
import { SqliteToolAttemptAuditSink } from "#src/features/tool-audit/repo.sqlite";
import { bindRemoveEntity } from "@jini-ai/cms/trash";
import { buildGatewayDeps } from "#src/contracts/core/gated-mutations/composition";
import { buildOwnerOnlyInstanceAuthorize } from "#src/contracts/core/gated-mutations/composition";
import { createDefaultHttpClient } from "#src/platform/http/client";
import { createDomainBindingSweep } from "../dns-change-deps.js";
import { createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createToolGapReader } from "#src/features/tool-audit/tool-gaps.repo";
import { readAdminChartProviderSnapshot } from "../chart-providers.js";
import { removeEntityWithoutBlocker } from "#src/features/trash/index";
import { resolveActiveThemeId } from "@jini-ai/cms/presentation/site/active-theme-id";
import { resolveExportOutputRootDir } from "../site-paths.js";
// A plain static import, unlike `createApp`/`exportSite` below: `resolveStorefrontProducts` has no
// eager top-level side effect (`routes/site/products.ts`'s module body only declares functions/a
// route registrar), so there is no load-order hazard to defer — see `routes/types.ts`'s
// `resolveStorefrontProducts` doc for why this field exists at all.
import { resolveStorefrontProducts } from "../../../inbound/public-http/routes/site/products.js";
import { withToolUseEvents } from "../tool-use-events.js";
// Historical cycle context; shared resolvers now live in site-paths.ts.
// Kept LAST on purpose. `app.ts` imports this file back (`builtInThemesDir` and the three
// `resolve*RootDir` functions), so `createApp` below closes the `deps.ts` <-> `app.ts` cycle that
// `.dependency-cruiser.mjs`'s `no-circular` header records. It is safe because neither module's
// top level uses the other's exports: this file's top level declares only functions. Keeping these
// last means a process that loads this file first (every `tovu` CLI command) still evaluates every
// import above in its existing order. Both were call-time `require()`s until 2026-09-16 (t91
// F4.1-A): under tsx, `require()` of a first-party `.ts` module loads a second, CommonJS-compiled
// copy of that module and its whole graph, so the site app built here read empty copies of the
// routing, page-head and event-subscription registries — exports and site inspection served no
// redirects. `src/__tests__/no-first-party-require.boundary.test.ts` now forbids that pattern.
import { exportSite } from "#src/features/site-export/index";
import { createApp } from "../app.js";

interface RouteDepsTaxonomyCommentsRequired {
  kernel: SiteStore["content"];
  workspaceId: string;
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  idGen: ReturnType<typeof composeStoreBasics>["idGen"];
  reportToolAuditError: ReturnType<typeof composeStoreBasics>["reportToolAuditError"];
  identity: ReturnType<typeof composeIdentitySettings>["identity"];
  trash: ReturnType<typeof composeTrashService>["trash"];
  databaseLedgerRepo: ReturnType<typeof composeDatabaseJournal>["databaseLedgerRepo"];
  migrationRunsRepo: ReturnType<typeof composeDatabaseJournal>["migrationRunsRepo"];
  restorePointsRepo: ReturnType<typeof composeDatabaseJournal>["restorePointsRepo"];
  dbOps: ReturnType<typeof composeDatabaseJournal>["dbOps"];
  databaseIntrospection: ReturnType<typeof composeDatabaseJournal>["databaseIntrospection"];
  entryRepo: ReturnType<typeof composeContentRepos>["entryRepo"];
  sqliteEntryTermRepo: ReturnType<typeof composeContentRepos>["sqliteEntryTermRepo"];
  taxonomyRepo: ReturnType<typeof composeContentRepos>["taxonomyRepo"];
  termRepo: ReturnType<typeof composeContentRepos>["termRepo"];
  taxonomyRevisionRepo: ReturnType<typeof composeContentRepos>["taxonomyRevisionRepo"];
  stampWatermark: ReturnType<typeof composeContentRepos>["stampWatermark"];
  contentTypeRepo: ReturnType<typeof composeContentResolversComments>["contentTypeRepo"];
  contentTypeIndexProvisioner: ReturnType<typeof composeContentResolversComments>["contentTypeIndexProvisioner"];
  commentsModule: ReturnType<typeof composeContentResolversComments>["commentsModule"];
  commentsCapability: ReturnType<typeof composeContentResolversComments>["commentsCapability"];
  observability: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>["observability"];
  tracker: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>["tracker"];
}

interface RouteDepsPluginsSiteAppRequired {
  resolvedSiteBinding: ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"];
  workspaceId: string;
  pluginActivationRepo: ReturnType<typeof composeStoreBasics>["pluginActivationRepo"];
  pluginRuntime: ReturnType<typeof composeSitePluginRuntime>["pluginRuntime"];
  settingsRepo: ReturnType<typeof composeIdentitySettings>["settingsRepo"];
  commentsSettingsReady: ReturnType<typeof composeIdentitySettings>["commentsSettingsReady"];
  commentsReady: ReturnType<typeof startBootData>["commentsReady"];
  removePlugin: ReturnType<typeof composeTrashService>["removePlugin"];
  publishContentRunRepo: ReturnType<typeof composeDatabaseJournal>["publishContentRunRepo"];
  widgetBindingRepo: ReturnType<typeof composeContentRepos>["widgetBindingRepo"];
  entryRefsRepo: ReturnType<typeof composeContentRepos>["entryRefsRepo"];
  commentsCapability: ReturnType<typeof composeContentResolversComments>["commentsCapability"];
  providerPlugins: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>;
  publishContentPeerHttpClient: ReturnType<typeof composeMailHttp>["publishContentPeerHttpClient"];
  publishContentBundleRepo: ReturnType<typeof composePublishingStoresThemes>["publishContentBundleRepo"];
  publishContentBaselineRepo: ReturnType<typeof composePublishingStoresThemes>["publishContentBaselineRepo"];
  publishContentFileBlobIndex: ReturnType<typeof composePublishingStoresThemes>["publishContentFileBlobIndex"];
  publishContentPeerRepo: ReturnType<typeof composePublishingStoresThemes>["publishContentPeerRepo"];
  publishContentSeedHash: ReturnType<typeof composePublishingStoresThemes>["publishContentSeedHash"];
  removeTheme: ReturnType<typeof composePublishingStoresThemes>["removeTheme"];
  publishContentApplyPort: ReturnType<typeof composePublishContentApplyPort>["publishContentApplyPort"];
  siteAppBootWork: ReturnType<typeof composePreAssembly>["siteAppBootWork"];
  routeDeps: () => (NewsletterRouteDeps & ByokToolSurfaceDeps);
}

export function routeDepsTaxonomyComments(required: RouteDepsTaxonomyCommentsRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "siteAssistantRateLimiter" | "databaseLedgerRepo" | "contentTypeRepo" | "contentTypeIndexProvisioner" | "entryRepo" | "taxonomyRepo" | "termRepo" | "removeTerm" | "removeTaxonomy" | "entryTermRepo" | "entryTermReadRepo" | "taxonomyRevisionRepo" | "stampWatermark" | "restorePointsRepo" | "dbOps" | "databaseIntrospection" | "toolAttemptAuditSink" | "toolGaps" | "siteStatusRepo" | "migrationRunsRepo" | "contentKernel" | "verifyDueDomainBindings" | "disclosureWatermarkSource" | "deepLinkRestorePointLookup" | "gatedMutations" | "commentRepo" | "commentIngressPolicy" | "commentWriteService"> {
  const { kernel, workspaceId, clock, idGen, reportToolAuditError, identity, trash, databaseLedgerRepo, migrationRunsRepo, restorePointsRepo, dbOps, databaseIntrospection, entryRepo, sqliteEntryTermRepo, taxonomyRepo, termRepo, taxonomyRevisionRepo, stampWatermark, contentTypeRepo, contentTypeIndexProvisioner, commentsModule, commentsCapability, observability, tracker } = required;
  return {
    // SPEC-046 REQ-7 — same one-process-lifetime-counter-store shape as `formsRateLimiter` above,
    // just above it so the two process-lifetime rate limiters stay visually paired.
    siteAssistantRateLimiter: createRateLimiter({ profile: SITE_ASSISTANT_PER_IP, clock }),
    databaseLedgerRepo,
    // SQLite content-model row persistence; see RouteDeps.contentTypeIndexProvisioner
    // for the separate, unimplemented expression-index DDL capability.
    contentTypeRepo,
    contentTypeIndexProvisioner,
    entryRepo,
    taxonomyRepo,
    termRepo,
    // `removeTerm` is WIDE (carries `"blocked"` — the `term` registry entry declares a
    // `TERM_HAS_CHILDREN` blocker); `removeTaxonomy` is narrowed the same way as `removeMenu`/
    // `removeFormSubmission` above (T6, step 3).
    removeTerm: bindRemoveEntity({
      trash: trash,
      entityType: "term"
    }),
    removeTaxonomy: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: "taxonomy"
    }) }),
    // Same instance backs both `entryTermRepo` (the certified write-service port, widened with the
    // Mergeable/AssignmentCount additive capabilities) and `entryTermReadRepo` (the new
    // `EntryTermReadPort` read path, `routes/types.ts`'s own doc explains why these are two
    // separately-typed fields rather than one further-widened intersection).
    entryTermRepo: sqliteEntryTermRepo,
    entryTermReadRepo: sqliteEntryTermRepo,
    taxonomyRevisionRepo,
    stampWatermark,
    restorePointsRepo,
    dbOps,
    databaseIntrospection,
    // Built HERE, over the SAME `db` handle every repo above shares, rather than in the module that
    // consumes it — see `RouteDeps.toolAttemptAuditSink`'s own doc. Deliberately not a second
    // `openContentDb(dbPath)`: that call migrates unconditionally, and this root has already opened
    // (and migrated) the one file both handles would point at.
    // Also the `assistant_tool_used` product event (tool id + outcome only): see `tool-use-events.ts`.
    toolAttemptAuditSink: withToolUseEvents({ tracker, sink: new SqliteToolAttemptAuditSink({ store: kernel }, {
      onError: ({ error }) => { reportToolAuditError({ code: "tool_audit", diagnostic: error }); },
    }) }),
    toolGaps: createToolGapReader({ kernel }, {}),
    siteStatusRepo: new InMemorySiteStatusRepo(),
    migrationRunsRepo,
    contentKernel: kernel,
    // The due-bindings sweep; `createServingApp` owns its timer (only a serving process re-checks DNS).
    verifyDueDomainBindings: createDomainBindingSweep({ httpClient: createDefaultHttpClient({ policy: DOMAIN_DNS_EGRESS_POLICY }, { observability }), workspaceId, contentKernel: kernel }),
    disclosureWatermarkSource: new AlwaysUnavailableWatermarkSource(),
    deepLinkRestorePointLookup: new RestorePointDeepLinkLookup(restorePointsRepo),
    // SPEC-016 (`core/gated-mutations`'s gateway, ADR-041 §5) — composed into a real composition
    // root for the first time this dispatch (Session 5's own disclosure: "a token-store-backed
    // primitive composed into ZERO composition roots in this codebase as of this session"). One
    // process-lifetime `GatewayDeps`. `tokens: new SqliteTokenStore({ store: kernel })` (SPEC-022 durability fix —
    // see `core/gated-mutations/composition.ts`'s file header): this composition root is the real
    // production one, so its `gated-mutations` capability must be durable, unlike `apps/website/src/server/runtime/composition/app.ts`'s
    // hermetic in-memory composition which still gets the default `InMemoryTokenStore`.
    // `authorizeInstance` closes the instance-scope authorization gap
    // (`GatewayDeps.authorizeInstance`'s doc comment): bound to `buildOwnerOnlyInstanceAuthorize`
    // over `identity.ownerPrincipalId`, the seeded owner already treated as this instance's sole
    // never-disable-able principal (SPEC-006 0.6.0).
    gatedMutations: {
      gatewayDeps: buildGatewayDeps({
        clock,
        idGen,
        authorize: identity.authorize,
        authorizeInstance: buildOwnerOnlyInstanceAuthorize({ ownerPrincipalId: identity.ownerPrincipalId }),
        tokens: new SqliteTokenStore({ store: kernel }),
      }),
    },
    commentRepo: commentsModule.commentRepo,
    commentIngressPolicy: commentsModule.ingressPolicy,
    commentWriteService: commentsCapability.writeService,
  };
}

export function routeDepsPluginsSiteApp(required: RouteDepsPluginsSiteAppRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "commentsProviders" | "commentsReady" | "commentsSettingsReady" | "widgetBindingRepo" | "entryRefsRepo" | "pluginActivationRepo" | "discoverPlugins" | "onPluginEnabled" | "onPluginDisabled" | "listPluginConflicts" | "removePlugin" | "removeTheme" | "readPluginPackageFiles" | "previewPluginBeforeSave" | "pluginInstaller" | "pluginSource" | "pluginSourcePolicy" | "pluginLoadedVersion" | "browserProviders" | "chartProviderSnapshot" | "pluginContributions" | "pluginBeforeSaveHook" | "pluginRuntimeReady" | "publishContentBundleRepo" | "fileBlobIndex" | "publishContentBaselineRepo" | "publishContentApplyPort" | "publishContentSeedHash" | "publishContentRunRepo" | "publishContentPeerRepo" | "publishContentPeerHttpClient" | "runExportSite" | "exportOutputRootDir" | "createSiteApp" | "siteAppBootWork" | "resolveStorefrontProducts" | "resolveActiveThemeId"> {
  const { resolvedSiteBinding, workspaceId, pluginActivationRepo, pluginRuntime, settingsRepo, commentsSettingsReady, commentsReady, removePlugin, publishContentRunRepo, widgetBindingRepo, entryRefsRepo, commentsCapability, providerPlugins, publishContentPeerHttpClient, publishContentBundleRepo, publishContentBaselineRepo, publishContentFileBlobIndex, publishContentPeerRepo, publishContentSeedHash, removeTheme, publishContentApplyPort, siteAppBootWork, routeDeps } = required;
  return {
    commentsProviders: commentsCapability.providers,
    commentsReady,
    commentsSettingsReady,
    widgetBindingRepo,
    entryRefsRepo,
    // SPEC-005 BR-01/BR-05 — one process-lifetime runtime instance shared by activation and every
    // content save. The root owns concrete adapters; `plugin-runtime.ts` owns capability-handle
    // composition and the load/setup/attach sequence.
    pluginActivationRepo,
    discoverPlugins: pluginRuntime.discoverPlugins,
    onPluginEnabled: async pluginId => {
      await pluginRuntime.onPluginEnabled(pluginId);
      await providerPlugins.reapply({ pluginId });
    },
    onPluginDisabled: pluginRuntime.onPluginDisabled,
    listPluginConflicts: pluginRuntime.listPluginConflicts,
    removePlugin,
    removeTheme,
    readPluginPackageFiles: pluginRuntime.readPluginPackageFiles,
    previewPluginBeforeSave: pluginRuntime.previewPluginBeforeSave,
    pluginInstaller: pluginRuntime.pluginInstaller,
    pluginSource: pluginRuntime.pluginSource,
    pluginSourcePolicy: pluginRuntime.pluginSourcePolicy,
    pluginLoadedVersion: pluginRuntime.pluginLoadedVersion,
    browserProviders: pluginRuntime.browserProviders,
    chartProviderSnapshot: () => readAdminChartProviderSnapshot({ workspaceId: workspaceId, settingsRepo, browserProviders: pluginRuntime.browserProviders, defaultProvider: RECHARTS_DEFAULT_PROVIDER }),
    pluginContributions: pluginRuntime.pluginContributions,
    pluginBeforeSaveHook: pluginRuntime.beforeSaveHook,
    // Replaced after the host exists, before these dependencies leave composition.
    pluginRuntimeReady: Promise.resolve(),
    // Task 6 of the publish-content (Publish Content) feature — see `routes/types.ts`'s
    // `publishContentBundleRepo` doc. Real, DB-backed (hoisted above so Task 8's
    // `publishContentApplyPort` reads the SAME store); `server/runtime/composition/app.ts`'s
    // hermetic composition uses `InMemoryPublishContentBundleRepo` instead.
    publishContentBundleRepo,
    // `publish-files-plan-2026-09-24.md` §3 — see `routes/types.ts`'s `fileBlobIndex` doc. Same
    // hoisted-singleton instance every real repo above follows.
    fileBlobIndex: publishContentFileBlobIndex,
    // Task 7 — see `routes/types.ts`'s `publishContentBaselineRepo` doc. Real, DB-backed (hoisted
    // above for the same reason); `server/runtime/composition/app.ts`'s hermetic composition uses
    // `InMemoryPublishContentBaselineRepo` instead.
    publishContentBaselineRepo,
    // Task 8 — the real apply loop (`apply-loop.ts`). See `routes/types.ts`'s
    // `publishContentApplyPort` doc.
    publishContentApplyPort,
    publishContentSeedHash,
    // Task 8 — the apply loop's audit trail. See `routes/types.ts`'s `publishContentRunRepo` doc.
    publishContentRunRepo,
    // Task 10 — peers + the guarded outbound client that dials them. See
    // `routes/types.ts`'s `publishContentPeerRepo`/`publishContentPeerHttpClient` docs.
    publishContentPeerRepo,
    publishContentPeerHttpClient,
    // 2026-08-15 — the real export engine, bound here rather than imported inside
    // `features/deployments/export-run.ts`/`export-site.ts` — see `routes/types.ts`'s
    // `runExportSite` doc for why that indirection exists (a real circular-load crash it began as a
    // fix for, now history; it stays to keep `features/deployments` off the export engine's graph).
    runExportSite: (options, _optional = {}) => exportSite(options),
    // Read ONCE here rather than deep in `export-run.ts`/`cli/commands/export.ts` — see
    // `resolveExportOutputRootDir`'s own doc immediately above and `routes/types.ts`'s
    // `exportOutputRootDir` doc.
    exportOutputRootDir: resolveExportOutputRootDir({ siteDir: resolvedSiteBinding.dir }),
    // 2026-08-20 (RouteDeps-narrowing pass 2) — nullary, closed over the `const routeDeps` binding
    // below rather than taking it per call; same self-referencing-closure shape `exportSiteBound`
    // below already uses, same TEST GOTCHA (`routes/types.ts`'s `exportSiteBound` doc, generalized:
    // spread-override is silently inert; mutate the object in place instead).
    createSiteApp: ({ themeId, consentAudit }: { themeId?: string; consentAudit?: true } = {}) =>
      createApp(routeDeps(), {
        ...(themeId === undefined ? {} : { themeIdOverride: themeId }),
        ...(consentAudit ? { consentAudit } : {}),
      }),
    siteAppBootWork,
    // 2026-08-20 (RouteDeps-narrowing pass 2) — same nullary-closure conversion, same reasoning, same
    // TEST GOTCHA.
    resolveStorefrontProducts: () => resolveStorefrontProducts(routeDeps()),
    // 2026-09-03 — see `routes/types.ts`'s `resolveActiveThemeId`/`listPublishedPosts` docs and
    // `apps/website/src/server/runtime/composition/app.ts`'s identical binding. Same nullary-closure-over-`routeDeps` shape as
    // `resolveStorefrontProducts` immediately above.
    resolveActiveThemeId: () => resolveActiveThemeId(routeDeps()),
  };
}
