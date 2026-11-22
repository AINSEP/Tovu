import type { CreateSiteRouteDepsOverrides } from "./overrides.js";
import type { StoreCloseRegistration } from "./open-store.js";
import type { createFormCollectionRegistry } from "@jini-ai/cms/forms";
import type { composeStoragePhase } from "./boot-phases.js";
import type { resolveWorkspaceIdOverride } from "./overrides.js";
import type { publishTrustRevocationStoreFor } from "#src/features/publish-trust/publish-trust-revocations";
import type { SiteStore } from "../open-site-store.js";
import type { loadMediaProviderRegistry } from "#src/features/media-generation/media-provider-registry";
import type { composeSiteServicesPhase } from "./boot-phases.js";
import type { composeAssistantCredentials } from "./assistant-credentials.js";
import type { composeProviderConfig } from "./provider-identity.js";
import type { composeProviderConfigSource } from "./provider-config.js";
import type { providerPluginBoot } from "./provider-identity.js";
import type { composeProviderLifecyclePhase } from "./boot-phases.js";
import type { composeInstrumentedContentPhase } from "./boot-phases.js";
import type { composePublishingPhase } from "./boot-phases.js";
import type { createConsoleLogger } from "@jini-ai/core/primitives";
import { composePreAssembly } from "./pre-assembly.js";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import { routeDepsContentTrash } from "./route-deps-content-chat.js";
import { routeDepsChatAgents } from "./route-deps-content-chat.js";
import { routeDepsAssistantSettings } from "./route-deps-assistant-mcp.js";
import { routeDepsExternalMcpOAuth } from "./route-deps-assistant-mcp.js";
import { routeDepsExecutionPlugins } from "./route-deps-assistant-mcp.js";
import { routeDepsSiteThemesTelemetry } from "./route-deps-site-providers.js";
import { routeDepsProviderAnalytics } from "./route-deps-site-providers.js";
import { routeDepsMembersMail } from "./route-deps-members-mail.js";
import { routeDepsMailFormsNewsletter } from "./route-deps-members-mail.js";
import { routeDepsTaxonomyComments } from "./route-deps-comments-plugins.js";
import { routeDepsPluginsSiteApp } from "./route-deps-comments-plugins.js";
import { routeDepsPublishCredentials } from "./route-deps-publish-credentials.js";
import { createStaticSitePackager } from "#src/features/site-backup/static-site-packager";
import { bindCredentialsHostPorts } from "../credentials-host-ports.js";
import { bindStaticSiteContext } from "../static-site-context.js";
import { wireFormsAndSearch } from "./after-assembly-forms-search.js";
import { compositionCommerce } from "./shared-oauth-commerce.js";
import { createTovuPluginHost } from "../plugin-host.js";
import { composePublishCredentialSource } from "#src/features/deployments/static-publish/credentials";
import { composeSiteSavedKeys } from "#src/server/runtime/composition/site-portability";
import { configureSiteSharing } from "./site-sharing.js";
import { configureSiteImports } from "./site-imports.js";
import { bindSiteConsentService } from "../site-consent.js";
import { createSiteCookieConsentDeps } from "../site-cookie-consent.js";
import type { RouteDeps } from "../../../routes/types.js";
import { findExclusionReason } from "@jini-ai/analytics";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { bindCookieConsentAnalyticsGate } from "../site-cookie-consent.js";

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
import { siteAppBootWorkByDeps } from "../site-app-boot-work.js";

interface AssembleRouteDepsPhaseRequired {
  dbPath: string;
  overrides: Partial<CreateSiteRouteDepsOverrides>;
  onStoreClose: (required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void;
  formCollectionProviders: () => ReturnType<typeof createFormCollectionRegistry>;
  agentPluginLayout: ReturnType<typeof composeStoragePhase>["agentPluginLayout"];
  agentPluginLifecycle: ReturnType<typeof composeStoragePhase>["agentPluginLifecycle"];
  assistantAgentInventory: ReturnType<typeof composeStoragePhase>["assistantAgentInventory"];
  federatedMcpPresetRegistry: ReturnType<typeof composeStoragePhase>["federatedMcpPresetRegistry"];
  resolvedSiteBinding: ReturnType<typeof composeStoragePhase>["resolvedSiteBinding"];
  resolvedThemesDir: ReturnType<typeof composeStoragePhase>["resolvedThemesDir"];
  skillLayout: ReturnType<typeof composeStoragePhase>["skillLayout"];
  kernel: ReturnType<typeof composeStoragePhase>["kernel"];
  blobStore: ReturnType<typeof composeStoragePhase>["blobStore"];
  isMediaRemote: ReturnType<typeof composeStoragePhase>["isMediaRemote"];
  mediaIsRemoteByEnv: ReturnType<typeof composeStoragePhase>["mediaIsRemoteByEnv"];
  resolvedUploadsDir: ReturnType<typeof composeStoragePhase>["resolvedUploadsDir"];
  workspaceId: Awaited<ReturnType<typeof resolveWorkspaceIdOverride>>;
  publishTrustRevocations: Awaited<ReturnType<typeof publishTrustRevocationStoreFor>>;
  chat: SiteStore["chat"];
  mediaProviders: Awaited<ReturnType<typeof loadMediaProviderRegistry>>;
  clock: ReturnType<typeof composeSiteServicesPhase>["clock"];
  idGen: ReturnType<typeof composeSiteServicesPhase>["idGen"];
  pluginActivationRepo: ReturnType<typeof composeSiteServicesPhase>["pluginActivationRepo"];
  postSearchBackfillReady: ReturnType<typeof composeSiteServicesPhase>["postSearchBackfillReady"];
  reportToolAuditError: ReturnType<typeof composeSiteServicesPhase>["reportToolAuditError"];
  pluginRuntime: ReturnType<typeof composeSiteServicesPhase>["pluginRuntime"];
  adminPasswordResetReady: ReturnType<typeof composeSiteServicesPhase>["adminPasswordResetReady"];
  analyticsSettingsReady: ReturnType<typeof composeSiteServicesPhase>["analyticsSettingsReady"];
  assistantSettingsReady: ReturnType<typeof composeSiteServicesPhase>["assistantSettingsReady"];
  commentsSettingsReady: ReturnType<typeof composeSiteServicesPhase>["commentsSettingsReady"];
  executionSettingsReady: ReturnType<typeof composeSiteServicesPhase>["executionSettingsReady"];
  identity: ReturnType<typeof composeSiteServicesPhase>["identity"];
  presentationRepo: ReturnType<typeof composeSiteServicesPhase>["presentationRepo"];
  seoReady: ReturnType<typeof composeSiteServicesPhase>["seoReady"];
  settingsPrincipals: ReturnType<typeof composeSiteServicesPhase>["settingsPrincipals"];
  settingsReady: ReturnType<typeof composeSiteServicesPhase>["settingsReady"];
  settingsRepo: ReturnType<typeof composeSiteServicesPhase>["settingsRepo"];
  settingsUiTabsReady: ReturnType<typeof composeSiteServicesPhase>["settingsUiTabsReady"];
  siteDisplayName: ReturnType<typeof composeSiteServicesPhase>["siteDisplayName"];
  siteSettingsReady: ReturnType<typeof composeSiteServicesPhase>["siteSettingsReady"];
  siteTimeZone: ReturnType<typeof composeSiteServicesPhase>["siteTimeZone"];
  siteTitlePreservationStore: ReturnType<typeof composeSiteServicesPhase>["siteTitlePreservationStore"];
  siteTitleReady: ReturnType<typeof composeSiteServicesPhase>["siteTitleReady"];
  siteTitleSettingsDeps: ReturnType<typeof composeSiteServicesPhase>["siteTitleSettingsDeps"];
  blobHydrationReady: ReturnType<typeof composeSiteServicesPhase>["blobHydrationReady"];
  commentsReady: ReturnType<typeof composeSiteServicesPhase>["commentsReady"];
  mediaTransformReady: ReturnType<typeof composeSiteServicesPhase>["mediaTransformReady"];
  menuBindingsReady: ReturnType<typeof composeSiteServicesPhase>["menuBindingsReady"];
  menuRepo: ReturnType<typeof composeSiteServicesPhase>["menuRepo"];
  navLocationBindingRepo: ReturnType<typeof composeSiteServicesPhase>["navLocationBindingRepo"];
  newsletterListRepo: ReturnType<typeof composeSiteServicesPhase>["newsletterListRepo"];
  newsletterReady: ReturnType<typeof composeSiteServicesPhase>["newsletterReady"];
  transformDefinitionRepo: ReturnType<typeof composeSiteServicesPhase>["transformDefinitionRepo"];
  assetRenditionRepo: ReturnType<typeof composeSiteServicesPhase>["assetRenditionRepo"];
  bus: ReturnType<typeof composeSiteServicesPhase>["bus"];
  originRegistry: ReturnType<typeof composeSiteServicesPhase>["originRegistry"];
  outbox: ReturnType<typeof composeSiteServicesPhase>["outbox"];
  redirectHitSink: ReturnType<typeof composeSiteServicesPhase>["redirectHitSink"];
  redirectRepo: ReturnType<typeof composeSiteServicesPhase>["redirectRepo"];
  formDeliveryRepo: ReturnType<typeof composeSiteServicesPhase>["formDeliveryRepo"];
  sqliteTrashDb: ReturnType<typeof composeSiteServicesPhase>["sqliteTrashDb"];
  trashRegistry: ReturnType<typeof composeSiteServicesPhase>["trashRegistry"];
  trashRepo: ReturnType<typeof composeSiteServicesPhase>["trashRepo"];
  trashAdapters: ReturnType<typeof composeSiteServicesPhase>["trashAdapters"];
  isInTrash: ReturnType<typeof composeSiteServicesPhase>["isInTrash"];
  removePlugin: ReturnType<typeof composeSiteServicesPhase>["removePlugin"];
  removeUser: ReturnType<typeof composeSiteServicesPhase>["removeUser"];
  trash: ReturnType<typeof composeSiteServicesPhase>["trash"];
  trashTransaction: ReturnType<typeof composeSiteServicesPhase>["trashTransaction"];
  redirectsWriteDeps: ReturnType<typeof composeSiteServicesPhase>["redirectsWriteDeps"];
  databaseIntrospection: ReturnType<typeof composeSiteServicesPhase>["databaseIntrospection"];
  databaseLedgerRepo: ReturnType<typeof composeSiteServicesPhase>["databaseLedgerRepo"];
  dbOps: ReturnType<typeof composeSiteServicesPhase>["dbOps"];
  migrationRunsRepo: ReturnType<typeof composeSiteServicesPhase>["migrationRunsRepo"];
  publishContentRunRepo: ReturnType<typeof composeSiteServicesPhase>["publishContentRunRepo"];
  restorePointsRepo: ReturnType<typeof composeSiteServicesPhase>["restorePointsRepo"];
  entryRefsRepo: ReturnType<typeof composeSiteServicesPhase>["entryRefsRepo"];
  entryRepo: ReturnType<typeof composeSiteServicesPhase>["entryRepo"];
  formDefinitionRepo: ReturnType<typeof composeSiteServicesPhase>["formDefinitionRepo"];
  sqliteEntryTermRepo: ReturnType<typeof composeSiteServicesPhase>["sqliteEntryTermRepo"];
  stampWatermark: ReturnType<typeof composeSiteServicesPhase>["stampWatermark"];
  taxonomyRepo: ReturnType<typeof composeSiteServicesPhase>["taxonomyRepo"];
  taxonomyRevisionRepo: ReturnType<typeof composeSiteServicesPhase>["taxonomyRevisionRepo"];
  termRepo: ReturnType<typeof composeSiteServicesPhase>["termRepo"];
  widgetBindingRepo: ReturnType<typeof composeSiteServicesPhase>["widgetBindingRepo"];
  commentsCapability: ReturnType<typeof composeSiteServicesPhase>["commentsCapability"];
  commentsModule: ReturnType<typeof composeSiteServicesPhase>["commentsModule"];
  contentTypeIndexProvisioner: ReturnType<typeof composeSiteServicesPhase>["contentTypeIndexProvisioner"];
  contentTypeRepo: ReturnType<typeof composeSiteServicesPhase>["contentTypeRepo"];
  formSubmissionRepo: ReturnType<typeof composeSiteServicesPhase>["formSubmissionRepo"];
  memberRepo: ReturnType<typeof composeSiteServicesPhase>["memberRepo"];
  newsletterHooks: ReturnType<typeof composeSiteServicesPhase>["newsletterHooks"];
  newsletterKeyring: ReturnType<typeof composeSiteServicesPhase>["newsletterKeyring"];
  newsletterSubscriberDirectory: ReturnType<typeof composeSiteServicesPhase>["newsletterSubscriberDirectory"];
  runtimeMode: ReturnType<typeof composeSiteServicesPhase>["runtimeMode"];
  siteAssistantSecretKeyring: ReturnType<typeof composeSiteServicesPhase>["siteAssistantSecretKeyring"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteServicesPhase>["siteAssistantSecretSealer"];
  externalMcpOAuthDevices: ReturnType<typeof composeAssistantCredentials>["externalMcpOAuthDevices"];
  externalMcpServerRepo: ReturnType<typeof composeAssistantCredentials>["externalMcpServerRepo"];
  siteAssistantCredentialRepo: ReturnType<typeof composeAssistantCredentials>["siteAssistantCredentialRepo"];
  siteReferenceRepo: ReturnType<typeof composeAssistantCredentials>["siteReferenceRepo"];
  projectSiteId: Awaited<ReturnType<typeof composeProviderConfig>>["siteId"];
  projectStore: Awaited<ReturnType<typeof composeProviderConfig>>["projectStore"];
  projectVault: Awaited<ReturnType<typeof composeProviderConfig>>["projectVault"];
  customCredentialSetRepo: ReturnType<typeof composeProviderConfigSource>["customCredentialSetRepo"];
  providerConfigSource: ReturnType<typeof composeProviderConfigSource>["providerConfigSource"];
  providerPlugins: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>;
  projectKeys: ReturnType<typeof composeProviderLifecyclePhase>["projectKeys"];
  aiTraceSink: ReturnType<typeof composeProviderLifecyclePhase>["aiTraceSink"];
  observability: ReturnType<typeof composeProviderLifecyclePhase>["observability"];
  tracker: ReturnType<typeof composeProviderLifecyclePhase>["tracker"];
  customCredentialsHttpClient: ReturnType<typeof composeInstrumentedContentPhase>["customCredentialsHttpClient"];
  mailDurableOutboxReady: ReturnType<typeof composeInstrumentedContentPhase>["mailDurableOutboxReady"];
  mediaImportHttpClient: ReturnType<typeof composeInstrumentedContentPhase>["mediaImportHttpClient"];
  outboundTestOrigins: ReturnType<typeof composeInstrumentedContentPhase>["outboundTestOrigins"];
  publishContentPeerHttpClient: ReturnType<typeof composeInstrumentedContentPhase>["publishContentPeerHttpClient"];
  resolvedMailer: ReturnType<typeof composeInstrumentedContentPhase>["resolvedMailer"];
  siteBackupHttpClient: ReturnType<typeof composeInstrumentedContentPhase>["siteBackupHttpClient"];
  assetBlobRepo: ReturnType<typeof composeInstrumentedContentPhase>["assetBlobRepo"];
  mediaRepo: ReturnType<typeof composeInstrumentedContentPhase>["mediaRepo"];
  postRepo: ReturnType<typeof composeInstrumentedContentPhase>["postRepo"];
  mediaContentTypeStore: ReturnType<typeof composePublishingPhase>["mediaContentTypeStore"];
  publishContentBaselineRepo: ReturnType<typeof composePublishingPhase>["publishContentBaselineRepo"];
  publishContentBundleRepo: ReturnType<typeof composePublishingPhase>["publishContentBundleRepo"];
  publishContentFileBlobIndex: ReturnType<typeof composePublishingPhase>["publishContentFileBlobIndex"];
  publishContentPeerRepo: ReturnType<typeof composePublishingPhase>["publishContentPeerRepo"];
  publishContentSeedHash: ReturnType<typeof composePublishingPhase>["publishContentSeedHash"];
  removeTheme: ReturnType<typeof composePublishingPhase>["removeTheme"];
  siteThemes: ReturnType<typeof composePublishingPhase>["siteThemes"];
  publishContentApplyPort: ReturnType<typeof composePublishingPhase>["publishContentApplyPort"];
  agentPluginConnections: ReturnType<typeof composePublishingPhase>["agentPluginConnections"];
  derivedPublicOrigin: ReturnType<typeof composePublishingPhase>["derivedPublicOrigin"];
  externalMcpOAuthHttpPorts: ReturnType<typeof composePublishingPhase>["externalMcpOAuthHttpPorts"];
  guardedOutboundHttpClient: ReturnType<typeof composePublishingPhase>["guardedOutboundHttpClient"];
  consoleLogger: ReturnType<typeof createConsoleLogger>;
}

export function assembleRouteDepsPhase(required: AssembleRouteDepsPhaseRequired, _optional = {}) {
  const { dbPath, overrides, onStoreClose, formCollectionProviders, agentPluginLayout, agentPluginLifecycle, assistantAgentInventory, federatedMcpPresetRegistry, resolvedSiteBinding, resolvedThemesDir, skillLayout, kernel, blobStore, isMediaRemote, mediaIsRemoteByEnv, resolvedUploadsDir, workspaceId, publishTrustRevocations, chat, mediaProviders, clock, idGen, pluginActivationRepo, postSearchBackfillReady, reportToolAuditError, pluginRuntime, adminPasswordResetReady, analyticsSettingsReady, assistantSettingsReady, commentsSettingsReady, executionSettingsReady, identity, presentationRepo, seoReady, settingsPrincipals, settingsReady, settingsRepo, settingsUiTabsReady, siteDisplayName, siteSettingsReady, siteTimeZone, siteTitlePreservationStore, siteTitleReady, siteTitleSettingsDeps, blobHydrationReady, commentsReady, mediaTransformReady, menuBindingsReady, menuRepo, navLocationBindingRepo, newsletterListRepo, newsletterReady, transformDefinitionRepo, assetRenditionRepo, bus, originRegistry, outbox, redirectHitSink, redirectRepo, formDeliveryRepo, sqliteTrashDb, trashRegistry, trashRepo, trashAdapters, isInTrash, removePlugin, removeUser, trash, trashTransaction, redirectsWriteDeps, databaseIntrospection, databaseLedgerRepo, dbOps, migrationRunsRepo, publishContentRunRepo, restorePointsRepo, entryRefsRepo, entryRepo, formDefinitionRepo, sqliteEntryTermRepo, stampWatermark, taxonomyRepo, taxonomyRevisionRepo, termRepo, widgetBindingRepo, commentsCapability, commentsModule, contentTypeIndexProvisioner, contentTypeRepo, formSubmissionRepo, memberRepo, newsletterHooks, newsletterKeyring, newsletterSubscriberDirectory, runtimeMode, siteAssistantSecretKeyring, siteAssistantSecretSealer, externalMcpOAuthDevices, externalMcpServerRepo, siteAssistantCredentialRepo, siteReferenceRepo, projectSiteId, projectStore, projectVault, customCredentialSetRepo, providerConfigSource, providerPlugins, projectKeys, aiTraceSink, observability, tracker, customCredentialsHttpClient, mailDurableOutboxReady, mediaImportHttpClient, outboundTestOrigins, publishContentPeerHttpClient, resolvedMailer, siteBackupHttpClient, assetBlobRepo, mediaRepo, postRepo, mediaContentTypeStore, publishContentBaselineRepo, publishContentBundleRepo, publishContentFileBlobIndex, publishContentPeerRepo, publishContentSeedHash, removeTheme, siteThemes, publishContentApplyPort, agentPluginConnections, derivedPublicOrigin, externalMcpOAuthHttpPorts, guardedOutboundHttpClient, consoleLogger } = required;
  const { adminSurfaceHandlersReady, siteAppBootWork, seoDeps, sitemapService, resolveRouteDeps, siteConsentReady, pluginExports, agentPluginMcp } = composePreAssembly({ agentPluginConnections, postRepo, settingsRepo, mediaRepo, mediaContentTypeStore, transformDefinitionRepo, originRegistry, clock, siteTitleSettingsDeps, siteSettingsReady, identity, workspaceId, routeDeps: () => routeDeps, agentPluginLifecycle, customCredentialSetRepo, siteAssistantSecretSealer, externalMcpServerRepo, siteAssistantSecretKeyring });
  const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {
    ...routeDepsContentTrash({ assistantAgentInventory, resolvedSiteBinding, kernel, workspaceId, postSearchBackfillReady, trashRegistry, sqliteTrashDb, trashRepo, trashAdapters, trashTransaction, trash, postRepo, pluginExports }),
    ...routeDepsChatAgents({ kernel, chat, clock, outbox, entryRefsRepo, tracker, postRepo, pluginExports }),
    ...compositionApprovalOverrides({ overrides }),
    ...routeDepsAssistantSettings({ agentPluginLayout, kernel, workspaceId, chat, clock, idGen, identity, settingsPrincipals, presentationRepo, settingsRepo, settingsReady, assistantSettingsReady, seoReady, siteAssistantSecretKeyring, siteAssistantSecretSealer, siteAssistantCredentialRepo, externalMcpServerRepo, siteThemes, seoDeps, sitemapService, agentPluginMcp, routeDeps: () => routeDeps }),
    ...routeDepsExternalMcpOAuth({ resolvedSiteBinding, agentPluginLayout, workspaceId, clock, identity, siteAssistantSecretKeyring, siteAssistantSecretSealer, externalMcpServerRepo, externalMcpOAuthDevices, siteReferenceRepo, projectSiteId, projectStore, externalMcpOAuthHttpPorts, derivedPublicOrigin, agentPluginMcp, routeDeps: () => routeDeps }),
    ...agentPluginConnections,
    ...routeDepsExecutionPlugins({ kernel, workspaceId, analyticsSettingsReady, executionSettingsReady, settingsUiTabsReady, siteTitleReady, formCollectionProviders, siteConsentReady, pluginExports }),
    ...compositionConsentOptions({ workspaceId, loadContributions: agentPluginLifecycle.loadPluginContributions }, { env: process.env }),
    ...routeDepsSiteThemesTelemetry({ dbPath, resolvedSiteBinding, agentPluginLayout, agentPluginLifecycle, federatedMcpPresetRegistry, skillLayout, resolvedThemesDir, kernel, resolvedUploadsDir, isMediaRemote, mediaIsRemoteByEnv, workspaceId, clock, idGen, pluginRuntime, siteTitlePreservationStore, siteDisplayName, siteTimeZone, menuRepo, outbox, bus, trashRepo, siteAssistantSecretSealer, providerConfigSource, customCredentialSetRepo, providerPlugins, aiTraceSink, observability, tracker, postRepo, siteThemes }),
    ...routeDepsProviderAnalytics({ agentPluginLifecycle, kernel, workspaceId, publishTrustRevocations, clock, idGen, settingsRepo, siteAssistantSecretSealer, customCredentialSetRepo, providerPlugins, projectKeys, observability }),
    ...identity,
    ...routeDepsMembersMail({ kernel, settingsPrincipals, originRegistry, redirectRepo, redirectHitSink, trash, removeUser, isInTrash, redirectsWriteDeps, runtimeMode, memberRepo, resolvedMailer, mailDurableOutboxReady }),
    // The From for members/newsletter/forms system mail (`platform/mail/sender-identity.ts`): the
    // site's `core.mail.*` setting, read fresh per send, checked against the settled mailer.
    ...resolvedMailer.operations,
    ...routeDepsMailFormsNewsletter({ kernel, blobStore, clock, adminPasswordResetReady, menuRepo, navLocationBindingRepo, newsletterListRepo, newsletterReady, transformDefinitionRepo, blobHydrationReady, assetRenditionRepo, trash, formDefinitionRepo, formCollectionProviders, formSubmissionRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks, mediaRepo, assetBlobRepo, mediaContentTypeStore }),
    ...routeDepsTaxonomyComments({ kernel, workspaceId, clock, idGen, reportToolAuditError, identity, trash, databaseLedgerRepo, migrationRunsRepo, restorePointsRepo, dbOps, databaseIntrospection, entryRepo, sqliteEntryTermRepo, taxonomyRepo, termRepo, taxonomyRevisionRepo, stampWatermark, contentTypeRepo, contentTypeIndexProvisioner, commentsModule, commentsCapability, observability, tracker }),
    ...routeDepsPluginsSiteApp({ resolvedSiteBinding, workspaceId, pluginActivationRepo, pluginRuntime, settingsRepo, commentsSettingsReady, commentsReady, removePlugin, publishContentRunRepo, widgetBindingRepo, entryRefsRepo, commentsCapability, providerPlugins, publishContentPeerHttpClient, publishContentBundleRepo, publishContentBaselineRepo, publishContentFileBlobIndex, publishContentPeerRepo, publishContentSeedHash, removeTheme, publishContentApplyPort, siteAppBootWork, routeDeps: () => routeDeps }),
    ...routeDepsPublishCredentials({ resolvedSiteBinding, agentPluginLayout, agentPluginLifecycle, kernel, clock, idGen, siteAssistantSecretKeyring, siteAssistantSecretSealer, projectVault, customCredentialSetRepo, observability, customCredentialsHttpClient, siteBackupHttpClient, mediaImportHttpClient, routeDeps: () => routeDeps }),
    ...(outboundTestOrigins.length > 0 ? { outboundTestOrigins } : {}),
    mediaGenerationHttpClient: guardedOutboundHttpClient,
    mediaProviderRegistry: mediaProviders.registry,
    // 2026-08-20 (RouteDeps-narrowing fix) — see `routes/types.ts`'s `exportSiteBound` doc and
    // `apps/website/src/server/runtime/composition/app.ts`'s matching field for the identical closure-ordering reasoning (`routeDeps`
    // spread LAST, so it always wins over anything a caller's `opts` might also carry).
    exportSiteBound: (opts) => exportSite({ ...opts, routeDeps }),
    staticSitePackager: createStaticSitePackager(),
    ...bindCredentialsHostPorts({ readDeps: () => routeDeps }),
    staticSiteContext: bindStaticSiteContext({ readDeps: () => routeDeps, siteName: resolvedSiteBinding.name }),
  };
  resolveRouteDeps(routeDeps);
  const { widgetAdoptionReady } = wireFormsAndSearch({ siteTitleReady, menuBindingsReady, mediaTransformReady, routeDeps, workspaceId, kernel, outbox, bus, clock, idGen, customCredentialSetRepo, siteAssistantSecretSealer, siteAssistantSecretKeyring, agentPluginLifecycle, settingsRepo, observability, formDeliveryRepo, agentPluginConnections, identity, settingsPrincipals, agentPluginLayout, consoleLogger });


  const commerceBinding = compositionCommerce({ dbPath, overrides, resolvedSiteBinding, agentPluginLayout, kernel, workspaceId, clock, idGen, settingsRepo, siteSettingsReady, projectSiteId, providerConfigSource, providerPlugins, observability });

  routeDeps.commerce = commerceBinding.commerce;
  routeDeps.commerceCatalog = commerceBinding.commerceCatalog;
  onStoreClose({ registration: () => commerceBinding.close() });

  siteAppBootWorkByDeps.set(routeDeps, siteAppBootWork);
  routeDeps.pluginHost = createTovuPluginHost({ deps: routeDeps });
  return { adminSurfaceHandlersReady, siteAppBootWork, routeDeps, widgetAdoptionReady };
}

interface FinishRouteDepsPhaseRequired {
  dbPath: string;
  opened: { store: SiteStore; onStoreClose: (required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void; beforeStoreClose: (required: { drain: () => Promise<void> }, optional?: Record<string, never>) => void };
  agentPluginLayout: ReturnType<typeof composeStoragePhase>["agentPluginLayout"];
  resolvedSiteBinding: ReturnType<typeof composeStoragePhase>["resolvedSiteBinding"];
  resolvedThemesDir: ReturnType<typeof composeStoragePhase>["resolvedThemesDir"];
  skillLayout: ReturnType<typeof composeStoragePhase>["skillLayout"];
  blobStore: ReturnType<typeof composeStoragePhase>["blobStore"];
  mediaStorePorts: ReturnType<typeof composeStoragePhase>["mediaStorePorts"];
  provideMediaCredentials: ReturnType<typeof composeStoragePhase>["provideMediaCredentials"];
  resolvedUploadsDir: ReturnType<typeof composeStoragePhase>["resolvedUploadsDir"];
  workspaceId: Awaited<ReturnType<typeof resolveWorkspaceIdOverride>>;
  postSearchBackfillReady: ReturnType<typeof composeSiteServicesPhase>["postSearchBackfillReady"];
  pluginRuntime: ReturnType<typeof composeSiteServicesPhase>["pluginRuntime"];
  adminPasswordResetReady: ReturnType<typeof composeSiteServicesPhase>["adminPasswordResetReady"];
  identity: ReturnType<typeof composeSiteServicesPhase>["identity"];
  settingsRepo: ReturnType<typeof composeSiteServicesPhase>["settingsRepo"];
  blobHydrationReady: ReturnType<typeof composeSiteServicesPhase>["blobHydrationReady"];
  originReady: ReturnType<typeof composeSiteServicesPhase>["originReady"];
  siteAssistantSecretKeyring: ReturnType<typeof composeSiteServicesPhase>["siteAssistantSecretKeyring"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteServicesPhase>["siteAssistantSecretSealer"];
  observability: ReturnType<typeof composeProviderLifecyclePhase>["observability"];
  tracker: ReturnType<typeof composeProviderLifecyclePhase>["tracker"];
  publishContentPeerHttpClient: ReturnType<typeof composeInstrumentedContentPhase>["publishContentPeerHttpClient"];
  guardedOutboundHttpClient: ReturnType<typeof composePublishingPhase>["guardedOutboundHttpClient"];
  adminSurfaceHandlersReady: ReturnType<typeof assembleRouteDepsPhase>["adminSurfaceHandlersReady"];
  siteAppBootWork: ReturnType<typeof assembleRouteDepsPhase>["siteAppBootWork"];
  routeDeps: ReturnType<typeof assembleRouteDepsPhase>["routeDeps"];
  widgetAdoptionReady: ReturnType<typeof assembleRouteDepsPhase>["widgetAdoptionReady"];
}

export function finishRouteDepsPhase(required: FinishRouteDepsPhaseRequired, _optional = {}) {
  const { dbPath, opened, agentPluginLayout, resolvedSiteBinding, resolvedThemesDir, skillLayout, blobStore, mediaStorePorts, provideMediaCredentials, resolvedUploadsDir, workspaceId, postSearchBackfillReady, pluginRuntime, adminPasswordResetReady, identity, settingsRepo, blobHydrationReady, originReady, siteAssistantSecretKeyring, siteAssistantSecretSealer, observability, tracker, publishContentPeerHttpClient, guardedOutboundHttpClient, adminSurfaceHandlersReady, siteAppBootWork, routeDeps, widgetAdoptionReady } = required;
  routeDeps.pluginRuntimeReady = pluginRuntime.attachEnabledPluginsAtBoot();
  opened.beforeStoreClose({ drain: async () => {
    await Promise.allSettled([
      routeDeps.pluginRuntimeReady, widgetAdoptionReady, blobHydrationReady,
      adminPasswordResetReady, postSearchBackfillReady, originReady, adminSurfaceHandlersReady,
    ]);
    // A boot pass can start another app (for example during export); drain until none remain.
    while (siteAppBootWork.size > 0) await Promise.allSettled([...siteAppBootWork]);
  } });
  provideMediaCredentials(composePublishCredentialSource({ workspaceId, executionMode: routeDeps.publishExecutionMode,
    dbDeps: { repo: routeDeps.vendorCredentialSetRepo, sealer: siteAssistantSecretSealer, loadDeployTargets: routeDeps.loadDeployTargets } }));
  // Shared by share capture/reveal and import restore; both nested configurators read this one port.
  const savedKeys = composeSiteSavedKeys({ workspaceId, sealer: siteAssistantSecretSealer });
  configureSiteSharing({ dbPath, resolvedSiteBinding, agentPluginLayout, skillLayout, resolvedThemesDir, resolvedUploadsDir, mediaStorePorts, blobStore, workspaceId, identity, settingsRepo, siteAssistantSecretKeyring, siteAssistantSecretSealer, publishContentPeerHttpClient, guardedOutboundHttpClient, routeDeps, savedKeys });

  configureSiteImports({ resolvedSiteBinding, workspaceId, observability, tracker, routeDeps, savedKeys });

  routeDeps.siteConsent = bindSiteConsentService({ deps: routeDeps });
  configureVisitorConsentAnalytics({ routeDeps, workspaceId });
}

function compositionApprovalOverrides({ overrides }: { overrides: Partial<CreateSiteRouteDepsOverrides> }, _options = {}) {
  return {
    ...(overrides.nativeApprovalMemory ? { nativeApprovalMemory: overrides.nativeApprovalMemory } : {}),
    ...(overrides.approvalIdentityForRun ? { approvalIdentityForRun: overrides.approvalIdentityForRun } : {}),
  };
}

function compositionConsentOptions(
  { workspaceId, loadContributions }: Parameters<typeof createSiteCookieConsentDeps>[0],
  { env }: { env: NodeJS.ProcessEnv },
) {
  return {
    consentTrustedRegionHeader: env.TOVU_CONSENT_REGION_HEADER?.trim() || undefined,
    cookieConsent: createSiteCookieConsentDeps({ workspaceId, loadContributions }),
  };
}

function configureVisitorConsentAnalytics({ routeDeps, workspaceId }: { routeDeps: RouteDeps; workspaceId: string }, _optional = {}): void {
  // Site analytics off, or this visitor excluded (DNT/GPC/IP/host rules), means no visitor capture.
  const analyticsExcluded = async (request: import('express').Request) => {
    const config = await routeDeps.analyticsConfig.get({ workspaceId });
    const beacon = { host: request.hostname, path: request.path, kind: 'pageview' as const, referrer: null,
      dnt: request.get('dnt') === '1', gpc: request.get('sec-gpc') === '1' };
    return !config.enabled || Boolean(findExclusionReason({ beacon, ip: resolveClientIp(request), config }));
  };
  bindCookieConsentAnalyticsGate({ deps: routeDeps }, { isExcluded: ({ request }) => analyticsExcluded(request) });
}
