import { configureSiteSharing } from "./site-deps/site-sharing.js";
import { configureSiteImports } from "./site-deps/site-imports.js";
import { routeDepsPublishCredentials } from "./site-deps/route-deps-publish-credentials.js";
import { routeDepsTaxonomyComments, routeDepsPluginsSiteApp } from "./site-deps/route-deps-comments-plugins.js";
import { routeDepsMembersMail, routeDepsMailFormsNewsletter } from "./site-deps/route-deps-members-mail.js";
import { routeDepsSiteThemesTelemetry, routeDepsProviderAnalytics } from "./site-deps/route-deps-site-providers.js";
import { routeDepsAssistantSettings, routeDepsExternalMcpOAuth, routeDepsExecutionPlugins } from "./site-deps/route-deps-assistant-mcp.js";
import { routeDepsContentTrash, routeDepsChatAgents } from "./site-deps/route-deps-content-chat.js";
import { compositionCommerce } from "./site-deps/shared-oauth-commerce.js";
import { compositionProjectKeys } from "./site-deps/project-keys.js";
import { wireFormsAndSearch } from "./site-deps/after-assembly-forms-search.js";
import { composePreAssembly } from "./site-deps/pre-assembly.js";
import { composeOutboundConnections } from "./site-deps/outbound-connections.js";
import { composePublishContentApplyPort } from "./site-deps/publish-apply.js";
import { composePublishingStoresThemes } from "./site-deps/publishing-stores-themes.js";
import { composeContentStores } from "./site-deps/content-stores.js";
import { composeMailHttp } from "./site-deps/mail-http.js";
import { composeProviderConfigSource } from "./site-deps/provider-config.js";
import { composeAssistantCredentials } from "./site-deps/assistant-credentials.js";
import { composeSiteKeysMembers } from "./site-deps/site-keys-members.js";
import { composeContentResolversComments } from "./site-deps/content-resolvers-comments.js";
import { composeContentRepos } from "./site-deps/content-repos.js";
import { composeDatabaseJournal } from "./site-deps/database-journal.js";
import { composeRedirects } from "./site-deps/redirects.js";
import { composeTrashService } from "./site-deps/trash-service.js";
import { composeTrashAdapters } from "./site-deps/trash-adapters.js";
import { composeTrashFollowUpHooks } from "./site-deps/trash-follow-up-hooks.js";
import { composeTrashStores } from "./site-deps/trash-stores.js";
import { composeEventsOrigin } from "./site-deps/events-origin.js";
import { startBootData } from "./site-deps/boot-data.js";
import { composeIdentitySettings } from "./site-deps/identity-settings.js";
import { composeSitePluginRuntime } from "./site-deps/plugin-runtime.js";
import { composeStoreBasics } from "./site-deps/store-basics.js";
import { composeMediaStorage } from "./site-deps/media-storage.js";
import { composeAgentPluginBootstrap } from "./site-deps/agent-plugin-bootstrap.js";
import { createConsoleLogger } from "@jini-ai/core/primitives";
import { createFormCollectionRegistry } from "@jini-ai/cms/forms";
import { protectExistingFormFiles } from "#src/features/forms/protect-existing-files";
import { TOVU_ERROR_REDACTION_OPTIONS } from '@tovu/contracts/secret-redaction';
import { providerPluginOf } from "#src/features/project-keys/service";
import { siteProviderRevisions } from "./provider-revision-watch.js";

import { setAgentPluginEnabled } from "#src/features/agent-plugins/set-enabled";
import { bindSiteConsentService } from './site-consent.js';
import { bindCookieConsentAnalyticsGate, createSiteCookieConsentDeps } from './site-cookie-consent.js';
import { findExclusionReason } from '@jini-ai/analytics';
import { resolveClientIp } from '#src/contracts/core/rate-limit/rate-limit';
import { registerContentAnalytics } from './content-events.js';
import { createStaticSitePackager } from "#src/features/site-backup/static-site-packager";
import { bindCredentialsHostPorts } from "./credentials-host-ports.js";
import { bindStaticSiteContext } from "./static-site-context.js";
import { composeSiteSavedKeys } from "#src/server/runtime/composition/site-portability";
import { composePublishCredentialSource } from "#src/features/deployments/static-publish/credentials";
import { loadSiteVaultKinds, normalizeSiteVaultAtBoot } from "./vault-boot.js";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { KyselyKernel } from "@jini-ai/db/kernel";

import { resolveSiteDatabasePaths, resolveSiteDirForDatabase } from "#src/platform/site-dir/site-databases";
import { createTovuPluginHost } from "./plugin-host.js";
import { identityServiceDepsFrom } from "#src/server/inbound/admin-http/routes/users/deps";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import { executeCommand } from "@jini-ai/cms/core";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";

import { instrumentStorageKernel } from "@jini-ai/diagnostics/observability";
import { setServerLogTraceReader } from '../../../platform/server-logs/index.js';
import { createVaultProviderConfigSource } from "./provider-config-source.js";
import { createAgentPluginStateStore } from "#src/features/api-connections/plugin-state";
import { createApiConnectionVault } from "#src/features/api-connections/vault-stores";
import { createTelemetryConsent } from "./telemetry-consent.js";
import {
  preparePostSearchIndex,
  SqlitePostRepo,
} from "#src/features/post/index";
import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { publishTrustRevocationStoreFor } from "#src/features/publish-trust/publish-trust-revocations";
import { contentKernel } from "#src/platform/db/content-kernel";
import {
  CUSTOM_CREDENTIALS_EGRESS_POLICY,
  SITE_BACKUP_EGRESS_POLICY,
  MEDIA_IMPORT_EGRESS_POLICY,
} from "#src/platform/http/egress-policies";
import { loadMediaProviderRegistry } from "#src/features/media-generation/media-provider-registry";
import { formatErrorForLog } from "@jini-ai/core";
import { discoverAllBuiltInThemes, rescanThemes } from "#src/features/theme/index";
import { closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";
import { openSiteContentDb } from "./open-site-content-db.js";
import { type SiteStore, type SiteStoreRole } from "./open-site-store.js";
import { createSite } from "./site-dir.js";
import { isInMemoryDbPath } from "@jini-ai/db/data-modules";
import { resolveSiteStorage } from "#src/platform/site-dir/site-storage";
import { hydrateBlobStoreFromSeed } from "#src/features/media/hydrate-blob-store-from-seed";
import { resolveWorkspace } from "#src/platform/site-dir/resolve-workspace";
import { seedSiteThemes } from "#src/platform/site-dir/seed-site-themes";
import { warnOnOrphanedChatRows } from "#src/platform/db/sqlite/chat-orphan-check";
import {
  SqliteNewsletterListRepo,
} from "#src/features/newsletter/repo.sqlite";
import {
  SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID,
} from "../configuration/seed.js";
import {
  SqliteMemberRepo,
} from "#src/features/members/index";
import { EnvOrFileKeyring } from "#src/features/webhooks/keyring.env";
import { resolveSiteKeyId, siteKeySources } from "#src/features/webhooks/site-key-sources";
import {
  DEFAULT_GC_GRACE_MS,
  LocalFsBlobStore,
  purgeMedia,
} from "#src/features/media/index";
import type { IdentityRepos } from "@jini-ai/user-management";
import type { RouteDeps } from "../../routes/types.js";
import type { NewsletterRouteDeps } from "../../inbound/admin-http/routes/newsletter/deps.js";
import {
  createVerifiedOrigin,
  OriginRegistry,
} from "@jini-ai/core/contracts/server/verified-origin";
import { resolveDevTls } from "../../../platform/dev-host/dev-tls.js";
import {
  SqliteAssetBlobRepo,
  SqliteAssetRenditionRepo,
  SqliteMediaContentTypeStore,
  SqliteMediaRepo,
  SqliteTransformDefinitionRepo,
} from "#src/platform/db/sqlite/media-repo.sqlite";
import { registerSlugChangeCapture } from "#src/platform/routing/adapter";
import { buildWidgetsDeps } from "#src/features/widgets/deps";
import { watchProviderRevisions } from "@jini-ai/plugins/host";
import { composePluginRuntime } from "./plugin-runtime.js";
import {
  set,
} from "#src/features/settings/index";
import { ensureSiteTitleSettingDefinition, preserveLegacySiteTitles } from "#src/features/settings/site-title";
import {
  buildTrashRegistry,
  createCommentTrashAdapter,
  createContentDbTransactionRunner,
  createDirectoryTrashAdapter,
  unhideIfRemoveThrows,
  createMediaTrashAdapter,
  createPostTrashAdapter,
  createRedirectTrashAdapter,
  PLUGIN_ENTITY_TYPE,
  THEME_ENTITY_TYPE,
  SqliteTrashRepo,
  USER_ENTITY_TYPE,
  createUserTrashAdapter,
} from "#src/features/trash/index";
import {
  createTrashService,
  type TrashAdapter,
  type TrashFollowUpHooks,
  withFollowUps,
} from "@jini-ai/cms/trash";
import {
  SqliteEntryTermRepo,
  SqliteTaxonomyRepo,
  SqliteTaxonomyRevisionRepo,
  SqliteTermRepo,
} from "#src/features/taxonomy/repo.sqlite";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { resolveSitesHome } from "#src/platform/site-dir/sites-home";

import { builtInContentSeedDbPath } from "./site-paths.js";
import { assertContentDbFileName, builtInThemesDir, defaultContentDbPath, mediaUploadsDir, resolveExportOutputRootDir, resolvePublishOutputRootDir, resolveSiteStoragePaths, resolveSourceControlExportRootDir, siteDir, type SitePathResolverOptional } from "./site-paths.js";
export { builtInThemesDir, defaultContentDbPath, mediaUploadsDir, resolveExportOutputRootDir, resolvePublishOutputRootDir, resolveSiteStoragePaths, resolveSourceControlExportRootDir, siteDir, type SitePathResolverOptional } from "./site-paths.js";

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
import { siteAppBootWorkByDeps } from "./site-app-boot-work.js";
import { type CreateSiteRouteDepsOverrides, assertOverridesPairedOrAbsent, pluginFailureThresholdOverride, resolveThemesDirOverride, resolveSiteBindingOverride, resolveWorkspaceIdOverride } from "./site-deps/overrides.js";
import { type StoreCloseRegistration, openCompositionStore, resolveChatDbPath } from "./site-deps/open-store.js";
import { providerPluginBoot, composeProviderConfig, siteIdentityFor } from "./site-deps/provider-identity.js";

const consoleLogger = createConsoleLogger({ prefix: "" });





function compositionApprovalOverrides({ overrides }: { overrides: Partial<CreateSiteRouteDepsOverrides> }, _options = {}) {
  return {
    ...(overrides.nativeApprovalMemory ? { nativeApprovalMemory: overrides.nativeApprovalMemory } : {}),
    ...(overrides.approvalIdentityForRun ? { approvalIdentityForRun: overrides.approvalIdentityForRun } : {}),
  };
}


/**
 * The site composition root: opens the site's store ({@link openCompositionStore}), then builds every
 * `RouteDeps` service over it ({@link composeSiteRouteDeps}). Async so storage opening can await (R1
 * plan). Bad overrides reject rather than throw. When anything after the open fails, the store this
 * call opened is closed (and the chat sweep stopped) before the rejection propagates, so a failed
 * boot never leaves a PGlite owner lock/socket or a Postgres pool behind.
 */
export async function createSiteRouteDeps(
  _required: Record<string, never> = {},
  { dbPath = defaultContentDbPath(), overrides }: { dbPath?: string; overrides?: Partial<CreateSiteRouteDepsOverrides> } = {}
): Promise<NewsletterRouteDeps & ByokToolSurfaceDeps> {
  assertOverridesPairedOrAbsent(overrides);
  assertContentDbFileName({ dbPath });
  const opened = await openCompositionStore({ dbPath }, { overrides });
  try {
    return await composeSiteRouteDeps({ dbPath, opened: { store: opened.store, onStoreClose: opened.onClose, beforeStoreClose: opened.beforeClose } }, { overrides });
  } catch (err) {
    await opened.release();
    throw err;
  }
}

/**
 * Logs each media-generation vendor the registry refused; a refusal is never fatal to boot.
 * @complexity O(refusals).
 */
function logMediaProviderRefusals({ refusals }: { refusals: readonly string[] }, _optional = {}): void {
  for (const refusal of refusals) console.error(`[media-providers] ${refusal}`);
}


/**
 * {@link createSiteRouteDeps}'s body, over the store it opened. Every `await` sits in the prelude
 * (workspace → deny store → orphaned-chat check), before the body starts any fire-and-forget boot
 * promise, so the body still runs to its return synchronously.
 */
async function composeSiteRouteDeps(
  { dbPath, opened }: { dbPath: string; opened: { store: SiteStore; onStoreClose: (required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void; beforeStoreClose: (required: { drain: () => Promise<void> }, optional?: Record<string, never>) => void } },
  { overrides = {} }: { overrides?: Partial<CreateSiteRouteDepsOverrides> } = {}
): Promise<NewsletterRouteDeps & ByokToolSurfaceDeps> {
  const { store, onStoreClose } = opened;
  // Plugin recovery may commit a quarantine while providers are still booting. Keep these small
  // lifecycle summaries until the consenting facade exists, rather than reading an uninitialized
  // tracker or sending around its guards. The queue is drained once after provider composition.
  const pendingLifecycleEvents: Array<Parameters<RouteDeps['tracker']['capture']>> = [];
  let lifecycleTracker: Pick<RouteDeps['tracker'], 'capture'> = { capture: (input, options = {}) => { pendingLifecycleEvents.push([input, options]); } };
  const { assistantAgentInventory, resolvedSiteBinding, agentPluginLayout, agentPluginLifecycle, federatedMcpPresetRegistry, skillLayout, resolvedThemesDir } = composeAgentPluginBootstrap({ onStoreClose, overrides, lifecycleTracker: () => lifecycleTracker, routeDeps: () => routeDeps });
  // The one content kernel (SQLite: over `content.db`, one per connection; Postgres: the site's
  // database), read by the prelude below and handed to boot modules as `deps.contentKernel`.
  const kernel = store.content;
  const { resolvedUploadsDir, provideMediaCredentials, mediaStorePorts, blobStore, mediaIsRemoteByEnv, isMediaRemote, storeBound } = composeMediaStorage({ overrides, resolvedSiteBinding, observability: () => observability, workspaceId: () => workspaceId, agentPluginLifecycle, settingsRepo: () => settingsRepo, store, dbPath });
  // CIC U-001 (Workspace-id single-source-of-truth): ONE resolved variable, reused by every
  // internal construction below that used to read the old seeded-workspace literal directly —
  // this is the sole `resolveWorkspace` call site in this function's call graph
  // (U-001-B1's grep-checkable invariant: zero remaining literal references outside this line;
  // {@link resolveWorkspaceIdOverride} is the one place that calls it). The legacy default path
  // (no overrides) resolves it dynamically too (rather than keeping the literal for that branch
  // only), so both paths share one mechanism instead of two that could drift (REQ-06/REQ-10;
  // every existing seeded fixture has exactly one workspace row, so this is behavior-identical to
  // the old literal for every current caller — see CIC's Design Context).
  const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);
  // Proves the deny store is readable before anything else is built: a missing or inaccessible
  // table stops boot rather than making every disconnected publisher silently look connected.
  const publishTrustRevocations = await publishTrustRevocationStoreFor({ kernel });
  // ADS-memory/reports/2026-09-05-db-split-scoping.md §6 — chat data lives in its own file,
  // sibling to content.db, for the same "a whole-file restore/duplicate must never carry (or
  // erase) chat history" reason `databaseJournalDb` below is separate. Opened with the content
  // store (`openCompositionStore`), so the orphaned-chat check below runs after it.
  const chatDbPath = resolveChatDbPath({ dbPath }, { overrides });
  const chat = store.chat;
  await warnCompositionChatOrphans({ dbPath, store, kernel, chatDbPath });

  // Media-generation vendors (built-in + Agent Plugin contributed), built ONCE here — see
  // `features/media-generation/media-provider-registry.ts`. A refused plugin vendor is logged, never fatal.
  // Awaited in the prelude, before the first fire-and-forget boot promise below (boot-order rule
  // pinned by composition-boot-order.unit.test.ts); it needs only the workspace and plugin layout.
  const mediaProviders = await loadMediaProviderRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions });
  logMediaProviderRefusals({ refusals: mediaProviders.refusals });
  const { postSearchBackfillReady, clock, idGen, reportToolAuditError, pluginActivationRepo } = composeStoreBasics({ kernel, workspaceId, agentPluginLayout });
  // Provider plugins load (and their SDK asks for the host) before `const routeDeps` below exists;
  // reading `routeDeps` then is a temporal-dead-zone ReferenceError. Until `routeDeps` is built the
  // answer is "no host yet" (the SDK then omits its `plugins` lookup facade).
  let routeDepsBuiltForPluginHost: { readonly pluginHost?: RouteDeps["pluginHost"] } | undefined;
  const { pluginRuntime } = composeSitePluginRuntime({ lifecycleTracker: () => lifecycleTracker, routeDepsBuiltForPluginHost: () => routeDepsBuiltForPluginHost, workspaceId, clock, pluginActivationRepo, resolvedSiteBinding, contentTypeRepo: () => contentTypeRepo, idGen, outbox: () => outbox, overrides });
  const { identity, settingsPrincipals, adminPasswordResetReady, presentationRepo, settingsRepo, settingsReady, seoReady, commentsSettingsReady, assistantSettingsReady, executionSettingsReady, settingsUiTabsReady, analyticsSettingsReady, siteTitlePreservationStore, siteDisplayName, siteTimeZone, siteTitleSettingsDeps, siteSettingsReady, siteTitleReady } = composeIdentitySettings({ kernel, workspaceId, clock, idGen, storeBound, overrides, dbPath });
  const { menuRepo, navLocationBindingRepo, menuBindingsReady, newsletterListRepo, newsletterReady, commentsReady, transformDefinitionRepo, mediaTransformReady, blobHydrationReady } = startBootData({ kernel, clock, workspaceId, dbPath, idGen, resolvedSiteBinding, blobStore, consoleLogger });
  const { outbox, bus, devCapabilityScheme, originReady, originRegistry, redirectRepo, redirectHitSink, assetRenditionRepo } = composeEventsOrigin({ kernel, clock, workspaceId });
  const { trashRegistry, sqliteTrashDb, trashRepo, taxonomyFollowUpTermRepo, taxonomyFollowUpRevisions, taxonomyFollowUpOutbox, formDeliveryRepo } = composeTrashStores({ kernel, workspaceId, outbox, clock, idGen });
  const { trashFollowUpHooks } = composeTrashFollowUpHooks({ kernel, mediaRepo: () => mediaRepo, workspaceId, postRepo: () => postRepo, clock, assetBlobRepo: () => assetBlobRepo, assetRenditionRepo, blobStore, entryRefsRepo: () => entryRefsRepo, outbox, formDeliveryRepo, routeDeps: () => routeDeps, menuRepo, idGen, taxonomyFollowUpTermRepo, trashRepo, taxonomyFollowUpRevisions, taxonomyFollowUpOutbox });
  const { pluginTrashAdapter, trashAdapters } = composeTrashAdapters({ pluginRuntime, pluginActivationRepo, kernel, mediaRepo: () => mediaRepo, entryRefsRepo: () => entryRefsRepo, postRepo: () => postRepo, assetBlobRepo: () => assetBlobRepo, assetRenditionRepo, blobStore, clock, identity, idGen, trashRegistry, sqliteTrashDb, trashFollowUpHooks });
  const { trashTransaction, trash, removePlugin, removeUser, isInTrash } = composeTrashService({ kernel, trashRepo, trashAdapters, postRepo: () => postRepo, pluginTrashAdapter, workspaceId });
  const { redirectsWriteDeps } = composeRedirects({ redirectRepo, trash, trashRepo, originRegistry, clock, idGen, outbox, onStoreClose, bus, redirectHitSink });
  const { databaseLedgerRepo, migrationRunsRepo, publishContentRunRepo, restorePointsRepo, dbOps, databaseIntrospection } = composeDatabaseJournal({ dbPath, onStoreClose, workspaceId, kernel, storeBound });
  const { entryRepo, sqliteEntryTermRepo, taxonomyRepo, termRepo, taxonomyRevisionRepo, stampWatermark, widgetBindingRepo, entryRefsRepo, formDefinitionRepo } = composeContentRepos({ kernel, workspaceId, storeBound });
  let formCollectionProviders = () => createFormCollectionRegistry({});
  const { formSubmissionRepo, contentTypeRepo, contentTypeIndexProvisioner, commentsModule, commentsCapability } = composeContentResolversComments({ kernel, siteTimeZone, entryRepo, mediaRepo: () => mediaRepo, transformDefinitionRepo, mediaContentTypeStore: () => mediaContentTypeStore, postRepo: () => postRepo, menuRepo, navLocationBindingRepo, formDefinitionRepo, formCollectionProviders: () => formCollectionProviders, routeDeps: () => routeDeps, outbox, clock, idGen, settingsRepo, workspaceId, trash, trashRepo, trashTransaction, commentsReady, commentsSettingsReady, identity, settingsPrincipals });
  const { runtimeMode, siteDirForKeyring, memberRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks, siteAssistantSecretKeyring, siteAssistantSecretSealer } = composeSiteKeysMembers({ dbPath, overrides, kernel });
  // 0012 retains legacy AAD until this fenced pass; no credential consumer may start first.
  // Safe alongside the settings-ledger chain: SqlSettingsRepo.transaction delegates to this SAME
  // kernel. Jini packages/db/src/kernel/kernel-core.ts takes an exclusive TurnLock through the awaited body;
  // Jini packages/db/src/kernel/sqlite/driver.ts commits only after it resolves. The lock, not the sync driver alone,
  // serializes BEGIN/COMMIT and prevents unrelated settings writes joining the vault transaction.
  await normalizeSiteVaultAtBoot({ kernel, workspaceId, siteDir: siteDirForKeyring, clock }, {
    keyring: siteAssistantSecretKeyring, sealer: siteAssistantSecretSealer,
    loadContributions: agentPluginLifecycle.loadPluginContributions,
  });
  const { siteAssistantCredentialRepo, externalMcpServerRepo, externalMcpOAuthDevices, siteReferenceRepo, projectKeyReferences } = composeAssistantCredentials({ kernel, workspaceId, clock, siteAssistantSecretSealer, siteAssistantSecretKeyring });
  const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ overrides, runtimeMode, onStoreClose, binding: resolvedSiteBinding, references: projectKeyReferences,
    site: createVaultProviderConfigSource({ workspaceId, scope: "site", state: createAgentPluginStateStore({ workspaceId,
      vault: createApiConnectionVault({ repo: new SqlSecretsVaultRepo({ kernel: kernel as unknown as KyselyKernel<SecretsVaultDatabase> }), keyring: siteAssistantSecretKeyring, sealer: siteAssistantSecretSealer, clock, workspaceId }) }) }) });
  const { providerConfigSource, customCredentialSetRepo } = composeProviderConfigSource({ savedProviderConfig, pluginRuntime, projectVault, kernel, projectStore });
  const providerPlugins = await providerPluginBoot({ overrides })({
    processRole: overrides.storeRole === 'client' ? 'daemon' : 'server',
    runtime: pluginRuntime,
    config: providerConfigSource,
    serviceName: "tovu",
    site: siteIdentityFor({ workspaceId, binding: resolvedSiteBinding, runtimeMode, projectId }),
    ...createTelemetryConsent({ settingsRepo, workspaceId }),
  });
  onStoreClose({ registration: async () => {
    // Provider disposal may perform late imports from its retained graph. Release copies only
    // after those users have stopped; a failed teardown leaves them for a later dead-owner reap.
    await providerPlugins.dispose({});
    await pluginRuntime.dispose({});
  } });
  let bindSharedApiOAuth: ((input: { keyId: string; use: boolean }) => Promise<void>) | undefined;
  const projectKeys = compositionProjectKeys({ resolvedSiteBinding, kernel, clock, projectKeyReferences, projectSiteId, projectStore, providerConfigSource, providerPlugins, bindSharedApiOAuth: () => bindSharedApiOAuth });

  onStoreClose({ registration: watchProviderRevisions({ read: () => projectStore?.providerRevisions({ siteId: projectSiteId }) ?? Promise.resolve([]),
    pluginIdOf: providerPluginOf,
    reapply: input => providerPlugins.reapply(input) }, {
    readSite: () => siteProviderRevisions({ kernel: kernel as unknown as KyselyKernel<unknown>, workspaceId }),
  }) });
  const { observability, tracker, aiTraceSink } = providerPlugins;
  formCollectionProviders = () => providerPlugins.formCollectionProviders?.() ?? createFormCollectionRegistry({});
  // Local logging reads only the current site tracing scope, through the live gated provider ports.
  setServerLogTraceReader({ traceIds: () => observability.activeTraceIds?.() });
  lifecycleTracker = tracker;
  flushLifecycleEvents({ pending: pendingLifecycleEvents, tracker });
  instrumentStorageKernel({ kernel, observability });
  instrumentStorageKernel({ kernel: chat, observability });
  const { resolvedMailer, mailDurableOutboxReady, customCredentialsHttpClient, siteBackupHttpClient, outboundTestOrigins, mediaImportHttpClient, publishContentPeerHttpClient } = composeMailHttp({ workspaceId, customCredentialSetRepo, siteAssistantSecretSealer, observability, agentPluginLifecycle, externalMcpServerRepo, runtimeMode, settingsRepo, clock, idGen, settingsPrincipals, identity, siteTitleReady, kernel, originRegistry, overrides });
  const { postRepo, changeSets, mediaRepo, assetBlobRepo } = composeContentStores({ kernel });
  if ((overrides.storeRole ?? "owner") === "owner") await protectExistingFormFiles({ kernel, workspaceId, siteDir: resolvedSiteBinding.dir });
  const { mediaContentTypeStore, publishContentBundleRepo, publishContentBaselineRepo, publishContentFileBlobIndex, publishContentPeerRepo, publishContentSeedHash, siteThemes, removeTheme } = composePublishingStoresThemes({ kernel, resolvedSiteBinding, workspaceId, clock, idGen, redirectsWriteDeps, resolvedThemesDir, trashAdapters, trash });
  const { publishContentApplyPort } = composePublishContentApplyPort({ workspaceId, publishContentBundleRepo, publishContentBaselineRepo, publishContentRunRepo, clock, idGen, outbox, changeSets, identity, postRepo, trashRepo, trash, mediaRepo, assetBlobRepo, blobStore, mediaContentTypeStore, redirectsWriteDeps, menuRepo, navLocationBindingRepo, formDefinitionRepo, contentTypeRepo, contentTypeIndexProvisioner, taxonomyRepo, termRepo, sqliteEntryTermRepo, taxonomyRevisionRepo, stampWatermark, entryRepo, entryRefsRepo, widgetBindingRepo, settingsRepo, settingsPrincipals, presentationRepo, siteThemes, resolvedThemesDir, publishContentSeedHash });
  const { guardedOutboundHttpClient, externalMcpOAuthHttpPorts, derivedPublicOrigin, agentPluginConnections } = composeOutboundConnections({ devCapabilityScheme, workspaceId, agentPluginLifecycle, kernel, siteAssistantSecretKeyring, siteAssistantSecretSealer, customCredentialSetRepo, clock, projectStore, projectSiteId, resolvedSiteBinding, identity, siteReferenceRepo, settingsRepo, idGen, settingsPrincipals, formDefinitionRepo });
  bindSharedApiOAuth = agentPluginConnections.apiConnections.host.sharedOAuth?.bind;
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
  routeDepsBuiltForPluginHost = routeDeps;
  // Start re-attachment only after its SDK's host getter is safe. Earlier composition awaits
  // (including vault normalization) must never race this pass. Boot awaits this before serving.
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
  await registerContentAnalytics({ deps: { bus, tracker, workspaceId } });
  return routeDeps;
}

interface WarnCompositionChatOrphansRequired {
  dbPath: string;
  store: SiteStore;
  kernel: SiteStore["content"];
  chatDbPath: ReturnType<typeof resolveChatDbPath>;
}

async function warnCompositionChatOrphans(required: WarnCompositionChatOrphansRequired, _optional = {}): Promise<void> {
  const { dbPath, store, kernel, chatDbPath } = required;
  // The split above was wiring-only: it redirected the chat stores at `chat.db` but never moved
  // the rows an already-deployed `content.db` was holding, and nothing anywhere reported that.
  // Every such conversation is intact but unread, because the stores no longer look in that file.
  // This counts them and prints one warning naming the counts and the migration script —
  // read-only, and completely silent (one bounded `count(*)` per table) on the already-migrated
  // boot. It deliberately does NOT migrate: `applyChatSplit` deletes from content.db after
  // copying, and its own header requires a backup first — see `chat-orphan-check.ts`'s header for
  // the rejected alternatives. A warning only: a failure is logged, never fatal.
  // SQLite only: a Postgres/PGlite site never had chat rows in its content tables.
  if (store.storage.kind === "sqlite") {
    await warnOnOrphanedChatRows({ contentDb: kernel, contentDbPath: dbPath, chatDbPath }).catch((err) => {
      consoleLogger.error({ message: `warnOnOrphanedChatRows failed at boot: ${(err as Error).message}` });
    });
  }
}


function flushLifecycleEvents(
  { pending, tracker }: { pending: Array<Parameters<RouteDeps['tracker']['capture']>>; tracker: RouteDeps['tracker'] },
  _optional = {},
): void {
  for (const [input, options] of pending.splice(0)) void tracker.capture(input, options);
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

/**
 * D10 fix — lets a second process (the agent daemon, `assistant/agent-daemon-server.ts`) bind to
 * the SAME workspace the main server process already resolved, instead of independently
 * re-resolving `resolveWorkspace`'s default (oldest-row) answer on its own connection. Without
 * this, the two processes agree only because the default resolution happens to be
 * time-invariant today (a newly created workspace can never become "the oldest") — correct by a
 * coincidence of `resolveWorkspace`'s current semantics, not by construction, and the two
 * processes have no way to agree at all once an explicit workspace choice enters the picture.
 *
 * `workspaceIdOverride` undefined reproduces `createSiteRouteDeps()`'s existing no-override
 * behavior exactly (byte-identical for every current single-workspace caller). When supplied, it
 * is validated against a real workspace row via {@link resolveWorkspace} BEFORE
 * `createSiteRouteDeps` is called — CIC U-001's `overrides.db`/`overrides.workspaceId`
 * "together or not at all" rule (`createSiteRouteDeps` above) means the caller cannot supply a
 * bare workspaceId override without also supplying the db handle it was validated against, so
 * this function opens that db handle itself rather than asking `createSiteRouteDeps` to do so
 * twice. Its returned teardown hook closes that handle AFTER the composition's borrowed store.
 *
 * @throws {ValidationError} (as a rejection) `workspaceIdOverride` was supplied but names no real workspace row —
 *   propagates uncaught (`resolveWorkspace`'s own error), which is deliberate: a caller (the
 *   daemon) that silently fell back to the default workspace on a bad override would be a worse
 *   failure mode than a loud boot-time crash naming the bad id.
 * @param required.workspaceIdOverride workspace to validate on the opened database, or the default.
 * @param optional.onStoreOpened receives the composition's owning teardown hook.
 * @complexity O(1) beyond `resolveWorkspace`'s own cost (see that function's own complexity note).
 * @overallScore 100
 */
export async function createSiteRouteDepsForWorkspace(
  { workspaceIdOverride }: { workspaceIdOverride: string | undefined },
  { dbPath = defaultContentDbPath(), storeRole = "owner", onStoreOpened }: {
    dbPath?: string; storeRole?: SiteStoreRole; onStoreOpened?: (required: { store: SiteStore }, optional?: Record<string, never>) => void;
  } = {}
): Promise<NewsletterRouteDeps & ByokToolSurfaceDeps> {
  // Before the workspace check below opens, migrates and seeds the file.
  assertContentDbFileName({ dbPath });
  if (workspaceIdOverride === undefined) return await createSiteRouteDeps({}, { dbPath, overrides: { onStoreOpened, storeRole } });
  // Postgres/PGlite: no SQLite handle to pair the id with; the composition validates it against the
  // store it opens.
  if (!isInMemoryDbPath({ dbPath }) && resolveSiteStorage({ siteDir: resolveSiteDirForDatabase({ dbPath }) }).kind !== "sqlite") {
    return await createSiteRouteDeps({}, { dbPath, overrides: { onStoreOpened, requestedWorkspaceId: workspaceIdOverride, storeRole } });
  }

  const db = await openSiteContentDb({ dbPath });
  try {
    const workspace = await resolveWorkspace({ kernel: contentKernel({ store: db }) }, { workspaceId: workspaceIdOverride });
    return await createSiteRouteDeps({}, { dbPath, overrides: { db, workspaceId: workspace.id, storeRole,
      onStoreOpened: ({ store }, _optional = {}) => onStoreOpened?.({ store: {
        ...store,
        close: async () => {
          try { await store.close(); }
          finally { closeSqliteConnection(db); }
        },
      } }),
    } });
  } catch (error) {
    // Validation/composition failure still belongs to this opener, not the borrowed store.
    closeSqliteConnection(db);
    throw error;
  }
}
