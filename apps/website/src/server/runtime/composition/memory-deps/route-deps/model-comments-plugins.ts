import { noopStampWatermark } from "#src/features/taxonomy/index";
import { InMemoryDbOpsAdapter, InMemoryDatabaseIntrospectionAdapter, InMemorySiteStatusRepo } from "#src/features/database/repo.memory";
import { toolGapsFromAuditEvents } from "@jini-ai/daemon/tool-audit";
import { AlwaysUnavailableWatermarkSource, RestorePointDeepLinkLookup } from "@jini-ai/db/recovery/lookup-adapters";
import { buildGatewayDeps, buildOwnerOnlyInstanceAuthorize } from "#src/contracts/core/gated-mutations/composition";
import { readAdminChartProviderSnapshot } from "../../chart-providers.js";
import { seededWorkspace } from "../../../configuration/seed.js";
import { RECHARTS_DEFAULT_PROVIDER } from "../../charts-recharts-source.js";
import type { MemoryRootContext, MemoryRouteDeps } from "./context.js";

/** Content types, entries, taxonomy, restore points, tool audit and the gated-mutations gateway. */
export function memoryContentModelDeps(required: MemoryRootContext, _optional = {}) {
  const {
    clock,
    contentTypeIndexProvisioner,
    contentTypeRepo,
    entryRepo,
    entryTermRepo,
    idGen,
    identity,
    restorePointsRepo,
    taxonomyRepo,
    taxonomyRevisionRepo,
    termRepo,
    toolAttemptAuditSink,
  } = required;
  return {
    // Admin-UI backend-gap closure (design-spec.md §0.4, this dispatch): in-memory adapters for
    // content-types/entries plus the restore-points/dbOps/site-status/recovery seams the
    // Database/Recovery screens' remaining read routes need.
    contentTypeRepo,
    contentTypeIndexProvisioner,
    entryRepo,
    taxonomyRepo,
    termRepo,
    entryTermRepo,
    taxonomyRevisionRepo,
    stampWatermark: noopStampWatermark,
    restorePointsRepo,
    dbOps: new InMemoryDbOpsAdapter(),
    databaseIntrospection: new InMemoryDatabaseIntrospectionAdapter(),
    // This hermetic root has no real `content.db` of its own (see file header: "in-memory adapters
    // seeded from `./seed`"), so its tool-attempt audit sink is the in-memory half of the same
    // rule-of-two split every adapter above follows — see `RouteDeps.toolAttemptAuditSink`'s own doc
    // for why the root constructs this rather than handing a module a path to open for itself.
    toolAttemptAuditSink,
    toolGaps: { list: async (required, optional = {}) => toolGapsFromAuditEvents({ ...required, events: toolAttemptAuditSink.events }, optional) },
    siteStatusRepo: new InMemorySiteStatusRepo(),
    disclosureWatermarkSource: new AlwaysUnavailableWatermarkSource(),
    deepLinkRestorePointLookup: new RestorePointDeepLinkLookup(restorePointsRepo),
    // SPEC-016 (`core/gated-mutations`'s gateway, ADR-041 §5) — same composition `apps/website/src/server/runtime/composition/deps.ts`
    // wires for the real server, mirrored here for the hermetic test/dev composition (its own
    // `InMemoryTokenStore` instance — see `core/gated-mutations/composition.ts`'s file header for
    // the disclosed `TokenStorePort` decision). `authorizeInstance` mirrors `apps/website/src/server/runtime/composition/deps.ts`'s own
    // owner-only instance-scope binding (`GatewayDeps.authorizeInstance`'s doc comment).
    gatedMutations: {
      gatewayDeps: buildGatewayDeps({
        clock,
        idGen,
        authorize: identity.authorize,
        authorizeInstance: buildOwnerOnlyInstanceAuthorize({ ownerPrincipalId: identity.ownerPrincipalId }),
      }),
    },
  } satisfies Partial<MemoryRouteDeps>;
}

/** The comments module and the plugin runtime. */
export function memoryCommentsPluginDeps(required: MemoryRootContext, _optional = {}) {
  const {
    commentsCapability,
    commentsModule,
    commentsSettingsReady,
    entryRefsRepo,
    pluginActivationRepo,
    pluginRuntime,
    removePlugin,
    removeTheme,
    settingsRepo,
    widgetBindingRepo,
  } = required;
  return {
    commentRepo: commentsModule.commentRepo,
    commentIngressPolicy: commentsModule.ingressPolicy,
    commentWriteService: commentsCapability.writeService,
    commentsProviders: commentsCapability.providers,
    // In-memory repo needs no dataModule declare — resolves immediately, unlike `deps.ts`'s real
    // fire-and-forget install (mirrors `newsletterReady`'s identical hermetic-vs-real split).
    commentsReady: Promise.resolve(),
    commentsSettingsReady,
    widgetBindingRepo,
    entryRefsRepo,
    // SPEC-005 BR-01/BR-05 — the same in-memory runtime instance backs the enable route and every
    // content save in this hermetic composition.
    pluginActivationRepo,
    discoverPlugins: pluginRuntime.discoverPlugins,
    onPluginEnabled: pluginRuntime.onPluginEnabled,
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
    chartProviderSnapshot: () => readAdminChartProviderSnapshot({ workspaceId: seededWorkspace.id, settingsRepo, browserProviders: pluginRuntime.browserProviders, defaultProvider: RECHARTS_DEFAULT_PROVIDER }),
    pluginContributions: pluginRuntime.pluginContributions,
    pluginBeforeSaveHook: pluginRuntime.beforeSaveHook,
    // Assigned after pluginHost exists: first-boot chart defaults use the same activation loader.
    pluginRuntimeReady: Promise.resolve(),
  } satisfies Partial<MemoryRouteDeps>;
}
