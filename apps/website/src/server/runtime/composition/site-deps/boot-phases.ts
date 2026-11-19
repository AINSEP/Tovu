import type { CreateSiteRouteDepsOverrides } from "./overrides.js";
import type { StoreCloseRegistration } from "./open-store.js";
import type { SiteStore } from "../open-site-store.js";
import type { RouteDeps } from "../../../routes/types.js";
import type { resolveWorkspaceIdOverride } from "./overrides.js";
import type { assembleRouteDepsPhase } from "./assembly-phases.js";
import { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import { composeMediaStorage } from "./media-storage.js";
import type { createFormCollectionRegistry } from "@jini-ai/cms/forms";
import type { loadMediaProviderRegistry } from "#src/features/media-generation/media-provider-registry";
import type { createConsoleLogger } from "@jini-ai/core/primitives";
import { composeStoreBasics } from "./store-basics.js";
import { composeSitePluginRuntime } from "./plugin-runtime.js";
import { composeIdentitySettings } from "./identity-settings.js";
import { startBootData } from "./boot-data.js";
import { composeEventsOrigin } from "./events-origin.js";
import { composeTrashStores } from "./trash-stores.js";
import { composeTrashFollowUpHooks } from "./trash-follow-up-hooks.js";
import { composeTrashAdapters } from "./trash-adapters.js";
import { composeTrashService } from "./trash-service.js";
import { composeRedirects } from "./redirects.js";
import { composeDatabaseJournal } from "./database-journal.js";
import { composeContentRepos } from "./content-repos.js";
import { composeContentResolversComments } from "./content-resolvers-comments.js";
import { composeSiteKeysMembers } from "./site-keys-members.js";
import type { composeAssistantCredentials } from "./assistant-credentials.js";
import type { composeProviderConfig } from "./provider-identity.js";
import type { composeProviderConfigSource } from "./provider-config.js";
import type { providerPluginBoot } from "./provider-identity.js";
import { compositionProjectKeys } from "./project-keys.js";
import { watchProviderRevisions } from "@jini-ai/plugins/host";
import { providerPluginOf } from "#src/features/project-keys/service";
import { siteProviderRevisions } from "../provider-revision-watch.js";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import { instrumentStorageKernel } from "@jini-ai/diagnostics/observability";
import { composeMailHttp } from "./mail-http.js";
import { composeContentStores } from "./content-stores.js";
import { composePublishingStoresThemes } from "./publishing-stores-themes.js";
import { composePublishContentApplyPort } from "./publish-apply.js";
import { composeOutboundConnections } from "./outbound-connections.js";

interface ComposeStoragePhaseRequired {
  dbPath: string;
  overrides: Partial<CreateSiteRouteDepsOverrides>;
  onStoreClose: (required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void;
  store: SiteStore;
  lifecycleTracker: () => Pick<RouteDeps['tracker'], 'capture'>;
  workspaceId: () => Awaited<ReturnType<typeof resolveWorkspaceIdOverride>>;
  settingsRepo: () => ReturnType<typeof composeSiteServicesPhase>["settingsRepo"];
  observability: () => ReturnType<typeof composeProviderLifecyclePhase>["observability"];
  routeDeps: () => ReturnType<typeof assembleRouteDepsPhase>["routeDeps"];
}

export function composeStoragePhase(required: ComposeStoragePhaseRequired, _optional = {}) {
  const { dbPath, overrides, onStoreClose, store, lifecycleTracker, workspaceId, settingsRepo, observability, routeDeps } = required;
  const { assistantAgentInventory, resolvedSiteBinding, agentPluginLayout, agentPluginLifecycle, federatedMcpPresetRegistry, skillLayout, resolvedThemesDir } = composeAgentPluginBootstrap({ onStoreClose, overrides, lifecycleTracker: () => lifecycleTracker(), routeDeps: () => routeDeps() });
  // The one content kernel (SQLite: over `content.db`, one per connection; Postgres: the site's
  // database), read by the prelude below and handed to boot modules as `deps.contentKernel`.
  const kernel = store.content;
  const { resolvedUploadsDir, provideMediaCredentials, mediaStorePorts, blobStore, mediaIsRemoteByEnv, isMediaRemote, storeBound } = composeMediaStorage({ overrides, resolvedSiteBinding, observability: () => observability(), workspaceId: () => workspaceId(), agentPluginLifecycle, settingsRepo: () => settingsRepo(), store, dbPath });
  return { assistantAgentInventory, resolvedSiteBinding, agentPluginLayout, agentPluginLifecycle, federatedMcpPresetRegistry, skillLayout, resolvedThemesDir, kernel, resolvedUploadsDir, provideMediaCredentials, mediaStorePorts, blobStore, mediaIsRemoteByEnv, isMediaRemote, storeBound };
}

interface ComposeSiteServicesPhaseRequired {
  dbPath: string;
  overrides: Partial<CreateSiteRouteDepsOverrides>;
  onStoreClose: (required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void;
  lifecycleTracker: () => Pick<RouteDeps['tracker'], 'capture'>;
  routeDepsBuiltForPluginHost: () => { readonly pluginHost?: RouteDeps["pluginHost"] } | undefined;
  formCollectionProviders: () => () => ReturnType<typeof createFormCollectionRegistry>;
  agentPluginLayout: ReturnType<typeof composeStoragePhase>["agentPluginLayout"];
  resolvedSiteBinding: ReturnType<typeof composeStoragePhase>["resolvedSiteBinding"];
  kernel: ReturnType<typeof composeStoragePhase>["kernel"];
  blobStore: ReturnType<typeof composeStoragePhase>["blobStore"];
  storeBound: ReturnType<typeof composeStoragePhase>["storeBound"];
  workspaceId: Awaited<ReturnType<typeof resolveWorkspaceIdOverride>>;
  mediaProviders: Awaited<ReturnType<typeof loadMediaProviderRegistry>>;
  assetBlobRepo: () => ReturnType<typeof composeInstrumentedContentPhase>["assetBlobRepo"];
  mediaRepo: () => ReturnType<typeof composeInstrumentedContentPhase>["mediaRepo"];
  postRepo: () => ReturnType<typeof composeInstrumentedContentPhase>["postRepo"];
  mediaContentTypeStore: () => ReturnType<typeof composePublishingPhase>["mediaContentTypeStore"];
  routeDeps: () => ReturnType<typeof assembleRouteDepsPhase>["routeDeps"];
  consoleLogger: ReturnType<typeof createConsoleLogger>;
}

export function composeSiteServicesPhase(required: ComposeSiteServicesPhaseRequired, _optional = {}) {
  const { dbPath, overrides, onStoreClose, lifecycleTracker, routeDepsBuiltForPluginHost, formCollectionProviders, agentPluginLayout, resolvedSiteBinding, kernel, blobStore, storeBound, workspaceId, mediaProviders, assetBlobRepo, mediaRepo, postRepo, mediaContentTypeStore, routeDeps, consoleLogger } = required;
  logMediaProviderRefusals({ refusals: mediaProviders.refusals });
  const { postSearchBackfillReady, clock, idGen, reportToolAuditError, pluginActivationRepo } = composeStoreBasics({ kernel, workspaceId, agentPluginLayout });
  const { pluginRuntime } = composeSitePluginRuntime({ lifecycleTracker: () => lifecycleTracker(), routeDepsBuiltForPluginHost: () => routeDepsBuiltForPluginHost(), workspaceId, clock, pluginActivationRepo, resolvedSiteBinding, contentTypeRepo: () => contentTypeRepo, idGen, outbox: () => outbox, overrides });
  const { identity, settingsPrincipals, adminPasswordResetReady, presentationRepo, settingsRepo, settingsReady, seoReady, commentsSettingsReady, assistantSettingsReady, executionSettingsReady, settingsUiTabsReady, analyticsSettingsReady, siteTitlePreservationStore, siteDisplayName, siteTimeZone, siteTitleSettingsDeps, siteSettingsReady, siteTitleReady } = composeIdentitySettings({ kernel, workspaceId, clock, idGen, storeBound, overrides, dbPath });
  const { menuRepo, navLocationBindingRepo, menuBindingsReady, newsletterListRepo, newsletterReady, commentsReady, transformDefinitionRepo, mediaTransformReady, blobHydrationReady } = startBootData({ kernel, clock, workspaceId, dbPath, idGen, resolvedSiteBinding, blobStore, consoleLogger });
  const { outbox, bus, devCapabilityScheme, originReady, originRegistry, redirectRepo, redirectHitSink, assetRenditionRepo } = composeEventsOrigin({ kernel, clock, workspaceId });
  const { trashRegistry, sqliteTrashDb, trashRepo, taxonomyFollowUpTermRepo, taxonomyFollowUpRevisions, taxonomyFollowUpOutbox, formDeliveryRepo } = composeTrashStores({ kernel, workspaceId, outbox, clock, idGen });
  const { trashFollowUpHooks } = composeTrashFollowUpHooks({ kernel, mediaRepo: () => mediaRepo(), workspaceId, postRepo: () => postRepo(), clock, assetBlobRepo: () => assetBlobRepo(), assetRenditionRepo, blobStore, entryRefsRepo: () => entryRefsRepo, outbox, formDeliveryRepo, routeDeps: () => routeDeps(), menuRepo, idGen, taxonomyFollowUpTermRepo, trashRepo, taxonomyFollowUpRevisions, taxonomyFollowUpOutbox });
  const { pluginTrashAdapter, trashAdapters } = composeTrashAdapters({ pluginRuntime, pluginActivationRepo, kernel, mediaRepo: () => mediaRepo(), entryRefsRepo: () => entryRefsRepo, postRepo: () => postRepo(), assetBlobRepo: () => assetBlobRepo(), assetRenditionRepo, blobStore, clock, identity, idGen, trashRegistry, sqliteTrashDb, trashFollowUpHooks });
  const { trashTransaction, trash, removePlugin, removeUser, isInTrash } = composeTrashService({ kernel, trashRepo, trashAdapters, postRepo: () => postRepo(), pluginTrashAdapter, workspaceId });
  const { redirectsWriteDeps } = composeRedirects({ redirectRepo, trash, trashRepo, originRegistry, clock, idGen, outbox, onStoreClose, bus, redirectHitSink });
  const { databaseLedgerRepo, migrationRunsRepo, publishContentRunRepo, restorePointsRepo, dbOps, databaseIntrospection } = composeDatabaseJournal({ dbPath, onStoreClose, workspaceId, kernel, storeBound });
  const { entryRepo, sqliteEntryTermRepo, taxonomyRepo, termRepo, taxonomyRevisionRepo, stampWatermark, widgetBindingRepo, entryRefsRepo, formDefinitionRepo } = composeContentRepos({ kernel, workspaceId, storeBound });
  const { formSubmissionRepo, contentTypeRepo, contentTypeIndexProvisioner, commentsModule, commentsCapability } = composeContentResolversComments({ kernel, siteTimeZone, entryRepo, mediaRepo: () => mediaRepo(), transformDefinitionRepo, mediaContentTypeStore: () => mediaContentTypeStore(), postRepo: () => postRepo(), menuRepo, navLocationBindingRepo, formDefinitionRepo, formCollectionProviders: () => formCollectionProviders(), routeDeps: () => routeDeps(), outbox, clock, idGen, settingsRepo, workspaceId, trash, trashRepo, trashTransaction, commentsReady, commentsSettingsReady, identity, settingsPrincipals });
  const { runtimeMode, siteDirForKeyring, memberRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks, siteAssistantSecretKeyring, siteAssistantSecretSealer } = composeSiteKeysMembers({ dbPath, overrides, kernel });
  return { postSearchBackfillReady, clock, idGen, reportToolAuditError, pluginActivationRepo, pluginRuntime, identity, settingsPrincipals, adminPasswordResetReady, presentationRepo, settingsRepo, settingsReady, seoReady, commentsSettingsReady, assistantSettingsReady, executionSettingsReady, settingsUiTabsReady, analyticsSettingsReady, siteTitlePreservationStore, siteDisplayName, siteTimeZone, siteTitleSettingsDeps, siteSettingsReady, siteTitleReady, menuRepo, navLocationBindingRepo, menuBindingsReady, newsletterListRepo, newsletterReady, commentsReady, transformDefinitionRepo, mediaTransformReady, blobHydrationReady, outbox, bus, devCapabilityScheme, originReady, originRegistry, redirectRepo, redirectHitSink, assetRenditionRepo, trashRegistry, sqliteTrashDb, trashRepo, formDeliveryRepo, trashAdapters, trashTransaction, trash, removePlugin, removeUser, isInTrash, redirectsWriteDeps, databaseLedgerRepo, migrationRunsRepo, publishContentRunRepo, restorePointsRepo, dbOps, databaseIntrospection, entryRepo, sqliteEntryTermRepo, taxonomyRepo, termRepo, taxonomyRevisionRepo, stampWatermark, widgetBindingRepo, entryRefsRepo, formDefinitionRepo, formSubmissionRepo, contentTypeRepo, contentTypeIndexProvisioner, commentsModule, commentsCapability, runtimeMode, siteDirForKeyring, memberRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks, siteAssistantSecretKeyring, siteAssistantSecretSealer };
}

interface ComposeProviderLifecyclePhaseRequired {
  onStoreClose: (required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void;
  bindSharedApiOAuth: () => ((input: { keyId: string; use: boolean }) => Promise<void>) | undefined;
  resolvedSiteBinding: ReturnType<typeof composeStoragePhase>["resolvedSiteBinding"];
  kernel: ReturnType<typeof composeStoragePhase>["kernel"];
  workspaceId: Awaited<ReturnType<typeof resolveWorkspaceIdOverride>>;
  clock: ReturnType<typeof composeSiteServicesPhase>["clock"];
  pluginRuntime: ReturnType<typeof composeSiteServicesPhase>["pluginRuntime"];
  projectKeyReferences: ReturnType<typeof composeAssistantCredentials>["projectKeyReferences"];
  projectSiteId: Awaited<ReturnType<typeof composeProviderConfig>>["siteId"];
  projectStore: Awaited<ReturnType<typeof composeProviderConfig>>["projectStore"];
  providerConfigSource: ReturnType<typeof composeProviderConfigSource>["providerConfigSource"];
  providerPlugins: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>;
}

export function composeProviderLifecyclePhase(required: ComposeProviderLifecyclePhaseRequired, _optional = {}) {
  const { onStoreClose, bindSharedApiOAuth, resolvedSiteBinding, kernel, workspaceId, clock, pluginRuntime, projectKeyReferences, projectSiteId, projectStore, providerConfigSource, providerPlugins } = required;
  onStoreClose({ registration: async () => {
    // Provider disposal may perform late imports from its retained graph. Release copies only
    // after those users have stopped; a failed teardown leaves them for a later dead-owner reap.
    await providerPlugins.dispose({});
    await pluginRuntime.dispose({});
  } });
  const projectKeys = compositionProjectKeys({ resolvedSiteBinding, kernel, clock, projectKeyReferences, projectSiteId, projectStore, providerConfigSource, providerPlugins, bindSharedApiOAuth: () => bindSharedApiOAuth() });

  onStoreClose({ registration: watchProviderRevisions({ read: () => projectStore?.providerRevisions({ siteId: projectSiteId }) ?? Promise.resolve([]),
    pluginIdOf: providerPluginOf,
    reapply: input => providerPlugins.reapply(input) }, {
    readSite: () => siteProviderRevisions({ kernel: kernel as unknown as KyselyKernel<unknown>, workspaceId }),
  }) });
  const { observability, tracker, aiTraceSink } = providerPlugins;
  return { projectKeys, observability, tracker, aiTraceSink };
}

interface ComposeInstrumentedContentPhaseRequired {
  overrides: Partial<CreateSiteRouteDepsOverrides>;
  pendingLifecycleEvents: Array<Parameters<RouteDeps['tracker']['capture']>>;
  agentPluginLifecycle: ReturnType<typeof composeStoragePhase>["agentPluginLifecycle"];
  kernel: ReturnType<typeof composeStoragePhase>["kernel"];
  workspaceId: Awaited<ReturnType<typeof resolveWorkspaceIdOverride>>;
  chat: SiteStore["chat"];
  clock: ReturnType<typeof composeSiteServicesPhase>["clock"];
  idGen: ReturnType<typeof composeSiteServicesPhase>["idGen"];
  identity: ReturnType<typeof composeSiteServicesPhase>["identity"];
  settingsPrincipals: ReturnType<typeof composeSiteServicesPhase>["settingsPrincipals"];
  settingsRepo: ReturnType<typeof composeSiteServicesPhase>["settingsRepo"];
  siteTitleReady: ReturnType<typeof composeSiteServicesPhase>["siteTitleReady"];
  originRegistry: ReturnType<typeof composeSiteServicesPhase>["originRegistry"];
  runtimeMode: ReturnType<typeof composeSiteServicesPhase>["runtimeMode"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteServicesPhase>["siteAssistantSecretSealer"];
  externalMcpServerRepo: ReturnType<typeof composeAssistantCredentials>["externalMcpServerRepo"];
  customCredentialSetRepo: ReturnType<typeof composeProviderConfigSource>["customCredentialSetRepo"];
  observability: ReturnType<typeof composeProviderLifecyclePhase>["observability"];
  tracker: ReturnType<typeof composeProviderLifecyclePhase>["tracker"];
}

export function composeInstrumentedContentPhase(required: ComposeInstrumentedContentPhaseRequired, _optional = {}) {
  const { overrides, pendingLifecycleEvents, agentPluginLifecycle, kernel, workspaceId, chat, clock, idGen, identity, settingsPrincipals, settingsRepo, siteTitleReady, originRegistry, runtimeMode, siteAssistantSecretSealer, externalMcpServerRepo, customCredentialSetRepo, observability, tracker } = required;
  flushLifecycleEvents({ pending: pendingLifecycleEvents, tracker });
  instrumentStorageKernel({ kernel, observability });
  instrumentStorageKernel({ kernel: chat, observability });
  const { resolvedMailer, mailDurableOutboxReady, customCredentialsHttpClient, siteBackupHttpClient, outboundTestOrigins, mediaImportHttpClient, publishContentPeerHttpClient } = composeMailHttp({ workspaceId, customCredentialSetRepo, siteAssistantSecretSealer, observability, agentPluginLifecycle, externalMcpServerRepo, runtimeMode, settingsRepo, clock, idGen, settingsPrincipals, identity, siteTitleReady, kernel, originRegistry, overrides });
  const { postRepo, changeSets, mediaRepo, assetBlobRepo } = composeContentStores({ kernel });
  return { resolvedMailer, mailDurableOutboxReady, customCredentialsHttpClient, siteBackupHttpClient, outboundTestOrigins, mediaImportHttpClient, publishContentPeerHttpClient, postRepo, changeSets, mediaRepo, assetBlobRepo };
}

interface ComposePublishingPhaseRequired {
  agentPluginLifecycle: ReturnType<typeof composeStoragePhase>["agentPluginLifecycle"];
  resolvedSiteBinding: ReturnType<typeof composeStoragePhase>["resolvedSiteBinding"];
  resolvedThemesDir: ReturnType<typeof composeStoragePhase>["resolvedThemesDir"];
  kernel: ReturnType<typeof composeStoragePhase>["kernel"];
  blobStore: ReturnType<typeof composeStoragePhase>["blobStore"];
  workspaceId: Awaited<ReturnType<typeof resolveWorkspaceIdOverride>>;
  clock: ReturnType<typeof composeSiteServicesPhase>["clock"];
  idGen: ReturnType<typeof composeSiteServicesPhase>["idGen"];
  identity: ReturnType<typeof composeSiteServicesPhase>["identity"];
  presentationRepo: ReturnType<typeof composeSiteServicesPhase>["presentationRepo"];
  settingsPrincipals: ReturnType<typeof composeSiteServicesPhase>["settingsPrincipals"];
  settingsRepo: ReturnType<typeof composeSiteServicesPhase>["settingsRepo"];
  menuRepo: ReturnType<typeof composeSiteServicesPhase>["menuRepo"];
  navLocationBindingRepo: ReturnType<typeof composeSiteServicesPhase>["navLocationBindingRepo"];
  devCapabilityScheme: ReturnType<typeof composeSiteServicesPhase>["devCapabilityScheme"];
  outbox: ReturnType<typeof composeSiteServicesPhase>["outbox"];
  trashRepo: ReturnType<typeof composeSiteServicesPhase>["trashRepo"];
  trashAdapters: ReturnType<typeof composeSiteServicesPhase>["trashAdapters"];
  trash: ReturnType<typeof composeSiteServicesPhase>["trash"];
  redirectsWriteDeps: ReturnType<typeof composeSiteServicesPhase>["redirectsWriteDeps"];
  publishContentRunRepo: ReturnType<typeof composeSiteServicesPhase>["publishContentRunRepo"];
  entryRefsRepo: ReturnType<typeof composeSiteServicesPhase>["entryRefsRepo"];
  entryRepo: ReturnType<typeof composeSiteServicesPhase>["entryRepo"];
  formDefinitionRepo: ReturnType<typeof composeSiteServicesPhase>["formDefinitionRepo"];
  sqliteEntryTermRepo: ReturnType<typeof composeSiteServicesPhase>["sqliteEntryTermRepo"];
  stampWatermark: ReturnType<typeof composeSiteServicesPhase>["stampWatermark"];
  taxonomyRepo: ReturnType<typeof composeSiteServicesPhase>["taxonomyRepo"];
  taxonomyRevisionRepo: ReturnType<typeof composeSiteServicesPhase>["taxonomyRevisionRepo"];
  termRepo: ReturnType<typeof composeSiteServicesPhase>["termRepo"];
  widgetBindingRepo: ReturnType<typeof composeSiteServicesPhase>["widgetBindingRepo"];
  contentTypeIndexProvisioner: ReturnType<typeof composeSiteServicesPhase>["contentTypeIndexProvisioner"];
  contentTypeRepo: ReturnType<typeof composeSiteServicesPhase>["contentTypeRepo"];
  siteAssistantSecretKeyring: ReturnType<typeof composeSiteServicesPhase>["siteAssistantSecretKeyring"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteServicesPhase>["siteAssistantSecretSealer"];
  siteReferenceRepo: ReturnType<typeof composeAssistantCredentials>["siteReferenceRepo"];
  projectSiteId: Awaited<ReturnType<typeof composeProviderConfig>>["siteId"];
  projectStore: Awaited<ReturnType<typeof composeProviderConfig>>["projectStore"];
  customCredentialSetRepo: ReturnType<typeof composeProviderConfigSource>["customCredentialSetRepo"];
  assetBlobRepo: ReturnType<typeof composeInstrumentedContentPhase>["assetBlobRepo"];
  changeSets: ReturnType<typeof composeInstrumentedContentPhase>["changeSets"];
  mediaRepo: ReturnType<typeof composeInstrumentedContentPhase>["mediaRepo"];
  postRepo: ReturnType<typeof composeInstrumentedContentPhase>["postRepo"];
}

export function composePublishingPhase(required: ComposePublishingPhaseRequired, _optional = {}) {
  const { agentPluginLifecycle, resolvedSiteBinding, resolvedThemesDir, kernel, blobStore, workspaceId, clock, idGen, identity, presentationRepo, settingsPrincipals, settingsRepo, menuRepo, navLocationBindingRepo, devCapabilityScheme, outbox, trashRepo, trashAdapters, trash, redirectsWriteDeps, publishContentRunRepo, entryRefsRepo, entryRepo, formDefinitionRepo, sqliteEntryTermRepo, stampWatermark, taxonomyRepo, taxonomyRevisionRepo, termRepo, widgetBindingRepo, contentTypeIndexProvisioner, contentTypeRepo, siteAssistantSecretKeyring, siteAssistantSecretSealer, siteReferenceRepo, projectSiteId, projectStore, customCredentialSetRepo, assetBlobRepo, changeSets, mediaRepo, postRepo } = required;
  const { mediaContentTypeStore, publishContentBundleRepo, publishContentBaselineRepo, publishContentFileBlobIndex, publishContentPeerRepo, publishContentSeedHash, siteThemes, removeTheme } = composePublishingStoresThemes({ kernel, resolvedSiteBinding, workspaceId, clock, idGen, redirectsWriteDeps, resolvedThemesDir, trashAdapters, trash });
  const { publishContentApplyPort } = composePublishContentApplyPort({ workspaceId, publishContentBundleRepo, publishContentBaselineRepo, publishContentRunRepo, clock, idGen, outbox, changeSets, identity, postRepo, trashRepo, trash, mediaRepo, assetBlobRepo, blobStore, mediaContentTypeStore, redirectsWriteDeps, menuRepo, navLocationBindingRepo, formDefinitionRepo, contentTypeRepo, contentTypeIndexProvisioner, taxonomyRepo, termRepo, sqliteEntryTermRepo, taxonomyRevisionRepo, stampWatermark, entryRepo, entryRefsRepo, widgetBindingRepo, settingsRepo, settingsPrincipals, presentationRepo, siteThemes, resolvedThemesDir, publishContentSeedHash });
  const { guardedOutboundHttpClient, externalMcpOAuthHttpPorts, derivedPublicOrigin, agentPluginConnections } = composeOutboundConnections({ devCapabilityScheme, workspaceId, agentPluginLifecycle, kernel, siteAssistantSecretKeyring, siteAssistantSecretSealer, customCredentialSetRepo, clock, projectStore, projectSiteId, resolvedSiteBinding, identity, siteReferenceRepo, settingsRepo, idGen, settingsPrincipals, formDefinitionRepo });
  return { mediaContentTypeStore, publishContentBundleRepo, publishContentBaselineRepo, publishContentFileBlobIndex, publishContentPeerRepo, publishContentSeedHash, siteThemes, removeTheme, publishContentApplyPort, guardedOutboundHttpClient, externalMcpOAuthHttpPorts, derivedPublicOrigin, agentPluginConnections };
}

/**
 * Logs each media-generation vendor the registry refused; a refusal is never fatal to boot.
 * @complexity O(refusals).
 */
function logMediaProviderRefusals({ refusals }: { refusals: readonly string[] }, _optional = {}): void {
  for (const refusal of refusals) console.error(`[media-providers] ${refusal}`);
}

function flushLifecycleEvents(
  { pending, tracker }: { pending: Array<Parameters<RouteDeps['tracker']['capture']>>; tracker: RouteDeps['tracker'] },
  _optional = {},
): void {
  for (const [input, options] of pending.splice(0)) void tracker.capture(input, options);
}
