import { createSite } from "../site-dir.js";
import type { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import type { SiteStore } from "../open-site-store.js";
import type { composeMediaStorage } from "./media-storage.js";
import type { composeStoreBasics } from "./store-basics.js";
import type { composeSitePluginRuntime } from "./plugin-runtime.js";
import type { composeIdentitySettings } from "./identity-settings.js";
import type { startBootData } from "./boot-data.js";
import type { composeEventsOrigin } from "./events-origin.js";
import type { composeTrashStores } from "./trash-stores.js";
import type { composeSiteKeysMembers } from "./site-keys-members.js";
import type { composeProviderConfigSource } from "./provider-config.js";
import type { providerPluginBoot } from "./provider-identity.js";
import type { composeContentStores } from "./content-stores.js";
import type { composePublishingStoresThemes } from "./publishing-stores-themes.js";
import type { publishTrustRevocationStoreFor } from "#src/features/publish-trust/publish-trust-revocations";
import type { compositionProjectKeys } from "./project-keys.js";
import { POST_ENTITY_TYPE } from "#src/features/trash/index";
import { SINGLE_HOP_HTTPS_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import { SqliteBufferSink } from "#src/platform/db/sqlite/analytics-sink.sqlite";
import { SqliteChangeSetRepo } from "#src/platform/db/sqlite/change-set-repo.sqlite";
import { bindForgetRemovedEntity } from "@jini-ai/cms/trash";
import { buildAnalyticsProviders } from "../analytics-providers.js";
import { builtInThemesDir } from "../site-paths.js";
import { createDefaultHttpClient } from "#src/platform/http/client";
import { createPostRevertRegistry } from "#src/features/post/index";
import { createSettingsAnalyticsConfig } from "#src/features/analytics/config.settings";
import { createSiteMailFeedbackRoute } from "#src/features/mail/index";
import { legacyProviderCredentialCheck } from "../provider-plugins.js";
import { listCustomCredentials } from "#src/features/custom-credentials/index";
import { loadMailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import { pluginsInstallDir } from "../site-paths.js";
import { registerMenuReverters } from "#src/features/navigation/reverters";
import { resolveCustomCredentialByLabel } from "#src/features/custom-credentials/index";
import { resolveSiteStoragePaths } from "../site-paths.js";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import type { RouteDeps } from "../../../routes/types.js";
import type { SiteBackupSources } from "#src/features/site-backup/sources";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { resolveProductRoot } from "#src/platform/site-dir/product-root";

interface RouteDepsSiteThemesTelemetryRequired {
  dbPath: string;
  resolvedSiteBinding: ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"];
  agentPluginLayout: ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLayout"];
  agentPluginLifecycle: ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLifecycle"];
  federatedMcpPresetRegistry: ReturnType<typeof composeAgentPluginBootstrap>["federatedMcpPresetRegistry"];
  skillLayout: ReturnType<typeof composeAgentPluginBootstrap>["skillLayout"];
  resolvedThemesDir: ReturnType<typeof composeAgentPluginBootstrap>["resolvedThemesDir"];
  kernel: SiteStore["content"];
  resolvedUploadsDir: ReturnType<typeof composeMediaStorage>["resolvedUploadsDir"];
  isMediaRemote: ReturnType<typeof composeMediaStorage>["isMediaRemote"];
  mediaIsRemoteByEnv: ReturnType<typeof composeMediaStorage>["mediaIsRemoteByEnv"];
  workspaceId: string;
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  idGen: ReturnType<typeof composeStoreBasics>["idGen"];
  pluginRuntime: ReturnType<typeof composeSitePluginRuntime>["pluginRuntime"];
  siteTitlePreservationStore: ReturnType<typeof composeIdentitySettings>["siteTitlePreservationStore"];
  siteDisplayName: ReturnType<typeof composeIdentitySettings>["siteDisplayName"];
  siteTimeZone: ReturnType<typeof composeIdentitySettings>["siteTimeZone"];
  menuRepo: ReturnType<typeof startBootData>["menuRepo"];
  outbox: ReturnType<typeof composeEventsOrigin>["outbox"];
  bus: ReturnType<typeof composeEventsOrigin>["bus"];
  trashRepo: ReturnType<typeof composeTrashStores>["trashRepo"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"];
  providerConfigSource: ReturnType<typeof composeProviderConfigSource>["providerConfigSource"];
  customCredentialSetRepo: ReturnType<typeof composeProviderConfigSource>["customCredentialSetRepo"];
  providerPlugins: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>;
  aiTraceSink: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>["aiTraceSink"];
  observability: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>["observability"];
  tracker: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>["tracker"];
  postRepo: ReturnType<typeof composeContentStores>["postRepo"];
  siteThemes: ReturnType<typeof composePublishingStoresThemes>["siteThemes"];
}

interface RouteDepsProviderAnalyticsRequired {
  agentPluginLifecycle: ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLifecycle"];
  kernel: SiteStore["content"];
  workspaceId: string;
  publishTrustRevocations: Awaited<ReturnType<typeof publishTrustRevocationStoreFor>>;
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  idGen: ReturnType<typeof composeStoreBasics>["idGen"];
  settingsRepo: ReturnType<typeof composeIdentitySettings>["settingsRepo"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"];
  customCredentialSetRepo: ReturnType<typeof composeProviderConfigSource>["customCredentialSetRepo"];
  providerPlugins: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>;
  projectKeys: ReturnType<typeof compositionProjectKeys>;
  observability: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>["observability"];
}

export function routeDepsSiteThemesTelemetry(required: RouteDepsSiteThemesTelemetryRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "mailFeedbackRoute" | "siteTitlePreservationStore" | "siteDisplayName" | "siteTimeZone" | "changeSets" | "revertRegistry" | "themes" | "themesDir" | "packageThemesDir" | "siteBinding" | "createSite" | "federatedMcpPresetRegistry" | "agentPluginLayout" | "agentPluginLifecycle" | "skillLayout" | "siteBackupSources" | "siteStoragePaths" | "outbox" | "bus" | "observability" | "tracker" | "visitorTracker" | "observabilityEnabled" | "flushTelemetry" | "browserAnalytics" | "consentAdapters" | "telemetryStatus" | "sendTelemetryTest" | "aiTraceSink" | "providerConfig" | "reapplyProvider"> {
  const { dbPath, resolvedSiteBinding, agentPluginLayout, agentPluginLifecycle, federatedMcpPresetRegistry, skillLayout, resolvedThemesDir, kernel, resolvedUploadsDir, isMediaRemote, mediaIsRemoteByEnv, workspaceId, clock, idGen, pluginRuntime, siteTitlePreservationStore, siteDisplayName, siteTimeZone, menuRepo, outbox, bus, trashRepo, siteAssistantSecretSealer, providerConfigSource, customCredentialSetRepo, providerPlugins, aiTraceSink, observability, tracker, postRepo, siteThemes } = required;
  return {
    mailFeedbackRoute: createSiteMailFeedbackRoute({ db: kernel, workspaceId, credentials: { repo: customCredentialSetRepo, sealer: siteAssistantSecretSealer },
      loadAdapters: () => loadMailAdapterRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions }) }),
    siteTitlePreservationStore,
    siteDisplayName,
    siteTimeZone,
    // ADR-046 Phase 1 slice 1 (SPEC-023, 2026-07-16): change-set mutation history now survives a
    // restart — the first durable-adapter slice off Phase 1's capability table, per the ADR's own
    // "pull-based per capability, not a uniform sweep" fold-in guidance.
    changeSets: new SqliteChangeSetRepo({ store: kernel }),
    // Pre-loaded with the post-domain reverters, closed over the SAME postRepo/clock/outbox
    // instances this root threads through everything else (ADR-018 C-005/C-006; 2026-08-13
    // features-post-deep-import-trace.md Job 2 — see `features/post/reverters.ts`'s header).
    // R4 (`plan-publish-repoint-menus-2026-09-24.md` §2.4/§3) wraps the SAME registry with the
    // menu-domain `menu/update` reverter, closed over this root's own menuRepo, so a repoint change
    // set is revertible from History exactly like any other publish write.
    revertRegistry: registerMenuReverters(
      { registry: createPostRevertRegistry({
        postRepo,
        clock,
        outbox,
        // `post/delete`'s reverter clears the trash marker; without this the index row it was written
        // with outlives it and the Trash lists a post that is live again.
        forgetRemoved: bindForgetRemovedEntity({
          repo: trashRepo,
          entityType: POST_ENTITY_TYPE
        }),
      }),
      deps: { menuRepo, clock, idGen, outbox } }
    ),
    themes: siteThemes,
    themesDir: resolvedThemesDir,
    // Design C (2026-09-16) — the package's own read-only catalog, threaded through separately from
    // `themesDir` above (which is this SITE's own themes root) so `resolveThemeOriginalSource` can
    // fall back to it for a theme this site has no catalog original of its own for. Already resolved
    // once above (`seedSiteThemes({ stockDir: builtInThemesDir(), ... })`); calling it again here is
    // the same cheap, side-effect-free env/path lookup, not a second filesystem walk.
    packageThemesDir: builtInThemesDir(),
    siteBinding: resolvedSiteBinding,
    createSite,
    federatedMcpPresetRegistry,
    agentPluginLayout,
    agentPluginLifecycle,
    skillLayout,
    siteBackupSources: resolveSiteBackupSources({ siteDir: resolvedSiteBinding.dir, uploadsDir: resolvedUploadsDir, mediaIsRemoteByEnv, isMediaRemote, themesDir: resolvedThemesDir, agentPluginLayout, skillLayout,
      // Jini's discovery with the same active pointer boot runs, over the folder it scans.
      sitePlugins: async () => ({ installDir: pluginsInstallDir({ siteDir: resolvedSiteBinding.dir }), records: await pluginRuntime.discoverActivePlugins() }) }),
    siteStoragePaths: resolveSiteStoragePaths({ contentDbPath: dbPath, siteDir: resolvedSiteBinding.dir, uploadsDir: resolvedUploadsDir }),
    outbox,
    bus,
    // From provider plugins (see `providerPlugins` above for the rule-of-two it follows).
    observability,
    tracker,
    visitorTracker: providerPlugins.visitorTracker,
    observabilityEnabled: providerPlugins.observabilityEnabled,
    flushTelemetry: () => providerPlugins.dispose({}),
    browserAnalytics: providerPlugins.browserAnalytics,
    consentAdapters: providerPlugins.consentAdapters,
    telemetryStatus: providerPlugins.telemetryStatus,
    sendTelemetryTest: () => providerPlugins.sendTelemetryTest({ error: new Error("Tovu test error — safe to ignore") }),
    aiTraceSink,
    providerConfig: providerConfigSource,
    reapplyProvider: input => providerPlugins.reapply(input),
  };
}

export function routeDepsProviderAnalytics(required: RouteDepsProviderAnalyticsRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "providerAppliesAt" | "projectKeys" | "legacyProviderCredential" | "publishTrustRevocations" | "clock" | "idGen" | "analyticsSink" | "analyticsConfig" | "analyticsProviders"> {
  const { agentPluginLifecycle, kernel, workspaceId, publishTrustRevocations, clock, idGen, settingsRepo, siteAssistantSecretSealer, customCredentialSetRepo, providerPlugins, projectKeys, observability } = required;
  return {
    providerAppliesAt: input => providerPlugins.appliesAt(input),
    projectKeys,
    // Wave 2's retired provider-key rows, found by label only (never decrypted): the settings card's re-entry notice.
    legacyProviderCredential: legacyProviderCredentialCheck({ listLabels: () => listCustomCredentials({ repo: customCredentialSetRepo }, { workspaceId }) }),
    // Built and probed in the prelude above, over the same content kernel that carries site content.
    publishTrustRevocations,
    clock,
    idGen,
    // ADR-046 Phase 1 (final capability slice): analytics ingest buffer is durable — survives a
    // restart, closing the `LocalBufferSink.capabilities().durable` misreport the capability
    // inventory flagged.
    analyticsSink: new SqliteBufferSink({ db: kernel, workspaceId: workspaceId }),
    analyticsConfig: createSettingsAnalyticsConfig({ settingsRepo }),
    // Vendor forwarders + `beforeIngest` hooks from Agent Plugins (`.cloud-coord/analytics-DESIGN.md`).
    // The durable sink above stays the primary; `core.analytics.sink` = "local" (default) forwards nowhere.
    // Same egress policy as plugin mail adapters: single-hop HTTPS to a vendor API.
    analyticsProviders: buildAnalyticsProviders({
      workspaceId, loadContributions: agentPluginLifecycle.loadPluginContributions, clock,
      findCredential: (input) => resolveCustomCredentialByLabel({ repo: customCredentialSetRepo, sealer: siteAssistantSecretSealer }, input),
      httpClient: createDefaultHttpClient({ policy: SINGLE_HOP_HTTPS_EGRESS_POLICY }, { observability }),
    }),
  };
}

/**
 * `RouteDeps.siteBackupSources`: the directories `site_backup_plan` reads, taken from the SAME
 * resolved values this root serves the site from, so a backup never walks a different folder than
 * the one in use. Media is `null` under `TOVU_MEDIA_BLOB_STORE=s3`: the bytes then live in object
 * storage, and the backup says so instead of copying an unused local folder. A remote provider
 * chosen by the site setting instead is only known when the backup runs, so `isMediaRemote` (the
 * media store's effective answer) is passed through for the backup to ask then.
 *
 * @complexity O(1) — env reads and one small `package.json` read.
 */
function resolveSiteBackupSources(input: { siteDir: string; uploadsDir: string; mediaIsRemoteByEnv: boolean; isMediaRemote: () => Promise<boolean>; themesDir: string; agentPluginLayout: RouteDeps["agentPluginLayout"]; skillLayout: RouteDeps["skillLayout"]; sitePlugins: NonNullable<SiteBackupSources["sitePlugins"]> }): SiteBackupSources {
  return {
    siteDir: input.siteDir,
    mediaUploadsDir: input.mediaIsRemoteByEnv ? null : input.uploadsDir,
    isMediaRemote: input.isMediaRemote,
    themesDir: input.themesDir,
    agentPlugins: input.agentPluginLayout,
    skillsDir: input.skillLayout.root,
    tovuVersion: readTovuVersion(),
    sitePlugins: input.sitePlugins,
  };
}

/** The product's own `package.json` version, stamped into a site backup's manifest. A missing or
 *  unreadable file costs only the stamp, never the boot. */
function readTovuVersion(): string {
  try {
    const parsed = JSON.parse(readFileSync(join(resolveProductRoot({}), "package.json"), "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}
