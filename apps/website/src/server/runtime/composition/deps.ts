import { composeStoragePhase, composeSiteServicesPhase, composeProviderLifecyclePhase, composeInstrumentedContentPhase, composePublishingPhase } from "./site-deps/boot-phases.js";
import { assembleRouteDepsPhase, finishRouteDepsPhase } from "./site-deps/assembly-phases.js";

import { composeProviderConfigSource } from "./site-deps/provider-config.js";
import { composeAssistantCredentials } from "./site-deps/assistant-credentials.js";

import { createConsoleLogger } from "@jini-ai/core/primitives";
import { createFormCollectionRegistry } from "@jini-ai/cms/forms";
import { protectExistingFormFiles } from "#src/features/forms/protect-existing-files";

import { registerContentAnalytics } from './content-events.js';

import { normalizeSiteVaultAtBoot } from "./vault-boot.js";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { KyselyKernel } from "@jini-ai/db/kernel";

import { resolveSiteDirForDatabase } from "#src/platform/site-dir/site-databases";

import { identityServiceDepsFrom } from "#src/server/inbound/admin-http/routes/users/deps";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";

import { setServerLogTraceReader } from '../../../platform/server-logs/index.js';
import { createVaultProviderConfigSource } from "./provider-config-source.js";
import { createAgentPluginStateStore } from "#src/features/api-connections/plugin-state";
import { createApiConnectionVault } from "#src/features/api-connections/vault-stores";
import { createTelemetryConsent } from "./telemetry-consent.js";

import { publishTrustRevocationStoreFor } from "#src/features/publish-trust/publish-trust-revocations";
import { contentKernel } from "#src/platform/db/content-kernel";

import { loadMediaProviderRegistry } from "#src/features/media-generation/media-provider-registry";

import { closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";
import { openSiteContentDb } from "./open-site-content-db.js";
import { type SiteStore, type SiteStoreRole } from "./open-site-store.js";

import { isInMemoryDbPath } from "@jini-ai/db/data-modules";
import { resolveSiteStorage } from "#src/platform/site-dir/site-storage";

import { resolveWorkspace } from "#src/platform/site-dir/resolve-workspace";

import { warnOnOrphanedChatRows } from "#src/platform/db/sqlite/chat-orphan-check";

import type { RouteDeps } from "../../routes/types.js";
import type { NewsletterRouteDeps } from "../../inbound/admin-http/routes/newsletter/deps.js";

import { assertContentDbFileName, defaultContentDbPath } from "./site-paths.js";
export { builtInThemesDir, defaultContentDbPath, mediaUploadsDir, resolveExportOutputRootDir, resolvePublishOutputRootDir, resolveSiteStoragePaths, resolveSourceControlExportRootDir, siteDir, type SitePathResolverOptional } from "./site-paths.js";

import { type CreateSiteRouteDepsOverrides, assertOverridesPairedOrAbsent, pluginFailureThresholdOverride, resolveThemesDirOverride, resolveSiteBindingOverride, resolveWorkspaceIdOverride } from "./site-deps/overrides.js";
import { type StoreCloseRegistration, openCompositionStore, resolveChatDbPath } from "./site-deps/open-store.js";
import { providerPluginBoot, composeProviderConfig, siteIdentityFor } from "./site-deps/provider-identity.js";

const consoleLogger = createConsoleLogger({ prefix: "" });


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
  // Provider plugins load (and their SDK asks for the host) before `const routeDeps` below exists;
  // reading `routeDeps` then is a temporal-dead-zone ReferenceError. Until `routeDeps` is built the
  // answer is "no host yet" (the SDK then omits its `plugins` lookup facade).
  let routeDepsBuiltForPluginHost: { readonly pluginHost?: RouteDeps["pluginHost"] } | undefined;
  let formCollectionProviders = () => createFormCollectionRegistry({});
  let bindSharedApiOAuth: ((input: { keyId: string; use: boolean }) => Promise<void>) | undefined;
  const { assistantAgentInventory, resolvedSiteBinding, agentPluginLayout, agentPluginLifecycle, federatedMcpPresetRegistry, skillLayout, resolvedThemesDir, kernel, resolvedUploadsDir, provideMediaCredentials, mediaStorePorts, blobStore, mediaIsRemoteByEnv, isMediaRemote, storeBound } = composeStoragePhase({ dbPath, overrides, onStoreClose, store, lifecycleTracker: () => lifecycleTracker, workspaceId: () => workspaceId, settingsRepo: () => settingsRepo, observability: () => observability, routeDeps: () => routeDeps });
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
  const { postSearchBackfillReady, clock, idGen, reportToolAuditError, pluginActivationRepo, pluginRuntime, identity, settingsPrincipals, adminPasswordResetReady, presentationRepo, settingsRepo, settingsReady, seoReady, commentsSettingsReady, assistantSettingsReady, executionSettingsReady, settingsUiTabsReady, analyticsSettingsReady, siteTitlePreservationStore, siteDisplayName, siteTimeZone, siteTitleSettingsDeps, siteSettingsReady, siteTitleReady, menuRepo, navLocationBindingRepo, menuBindingsReady, newsletterListRepo, newsletterReady, commentsReady, transformDefinitionRepo, mediaTransformReady, blobHydrationReady, outbox, bus, devCapabilityScheme, originReady, originRegistry, redirectRepo, redirectHitSink, assetRenditionRepo, trashRegistry, sqliteTrashDb, trashRepo, formDeliveryRepo, trashAdapters, trashTransaction, trash, removePlugin, removeUser, isInTrash, redirectsWriteDeps, databaseLedgerRepo, migrationRunsRepo, publishContentRunRepo, restorePointsRepo, dbOps, databaseIntrospection, entryRepo, sqliteEntryTermRepo, taxonomyRepo, termRepo, taxonomyRevisionRepo, stampWatermark, widgetBindingRepo, entryRefsRepo, formDefinitionRepo, formSubmissionRepo, contentTypeRepo, contentTypeIndexProvisioner, commentsModule, commentsCapability, runtimeMode, siteDirForKeyring, memberRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks, siteAssistantSecretKeyring, siteAssistantSecretSealer } = composeSiteServicesPhase({ dbPath, overrides, onStoreClose, lifecycleTracker: () => lifecycleTracker, routeDepsBuiltForPluginHost: () => routeDepsBuiltForPluginHost, formCollectionProviders: () => formCollectionProviders, agentPluginLayout, resolvedSiteBinding, kernel, blobStore, storeBound, workspaceId, mediaProviders, assetBlobRepo: () => assetBlobRepo, mediaRepo: () => mediaRepo, postRepo: () => postRepo, mediaContentTypeStore: () => mediaContentTypeStore, routeDeps: () => routeDeps, consoleLogger });
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
  const { projectKeys, observability, tracker, aiTraceSink } = composeProviderLifecyclePhase({ onStoreClose, bindSharedApiOAuth: () => bindSharedApiOAuth, resolvedSiteBinding, kernel, workspaceId, clock, pluginRuntime, projectKeyReferences, projectSiteId, projectStore, providerConfigSource, providerPlugins });
  formCollectionProviders = () => providerPlugins.formCollectionProviders?.() ?? createFormCollectionRegistry({});
  // Local logging reads only the current site tracing scope, through the live gated provider ports.
  setServerLogTraceReader({ traceIds: () => observability.activeTraceIds?.() });
  lifecycleTracker = tracker;
  const { resolvedMailer, mailDurableOutboxReady, customCredentialsHttpClient, siteBackupHttpClient, outboundTestOrigins, mediaImportHttpClient, publishContentPeerHttpClient, postRepo, changeSets, mediaRepo, assetBlobRepo } = composeInstrumentedContentPhase({ overrides, pendingLifecycleEvents, agentPluginLifecycle, kernel, workspaceId, chat, clock, idGen, identity, settingsPrincipals, settingsRepo, siteTitleReady, originRegistry, runtimeMode, siteAssistantSecretSealer, externalMcpServerRepo, customCredentialSetRepo, observability, tracker });
  if ((overrides.storeRole ?? "owner") === "owner") await protectExistingFormFiles({ kernel, workspaceId, siteDir: resolvedSiteBinding.dir });
  const { mediaContentTypeStore, publishContentBundleRepo, publishContentBaselineRepo, publishContentFileBlobIndex, publishContentPeerRepo, publishContentSeedHash, siteThemes, removeTheme, publishContentApplyPort, guardedOutboundHttpClient, externalMcpOAuthHttpPorts, derivedPublicOrigin, agentPluginConnections } = composePublishingPhase({ agentPluginLifecycle, resolvedSiteBinding, resolvedThemesDir, kernel, blobStore, workspaceId, clock, idGen, identity, presentationRepo, settingsPrincipals, settingsRepo, menuRepo, navLocationBindingRepo, devCapabilityScheme, outbox, trashRepo, trashAdapters, trash, redirectsWriteDeps, publishContentRunRepo, entryRefsRepo, entryRepo, formDefinitionRepo, sqliteEntryTermRepo, stampWatermark, taxonomyRepo, taxonomyRevisionRepo, termRepo, widgetBindingRepo, contentTypeIndexProvisioner, contentTypeRepo, siteAssistantSecretKeyring, siteAssistantSecretSealer, siteReferenceRepo, projectSiteId, projectStore, customCredentialSetRepo, assetBlobRepo, changeSets, mediaRepo, postRepo });
  bindSharedApiOAuth = agentPluginConnections.apiConnections.host.sharedOAuth?.bind;
  const { adminSurfaceHandlersReady, siteAppBootWork, routeDeps, widgetAdoptionReady } = assembleRouteDepsPhase({ dbPath, overrides, onStoreClose, formCollectionProviders, agentPluginLayout, agentPluginLifecycle, assistantAgentInventory, federatedMcpPresetRegistry, resolvedSiteBinding, resolvedThemesDir, skillLayout, kernel, blobStore, isMediaRemote, mediaIsRemoteByEnv, resolvedUploadsDir, workspaceId, publishTrustRevocations, chat, mediaProviders, clock, idGen, pluginActivationRepo, postSearchBackfillReady, reportToolAuditError, pluginRuntime, adminPasswordResetReady, analyticsSettingsReady, assistantSettingsReady, commentsSettingsReady, executionSettingsReady, identity, presentationRepo, seoReady, settingsPrincipals, settingsReady, settingsRepo, settingsUiTabsReady, siteDisplayName, siteSettingsReady, siteTimeZone, siteTitlePreservationStore, siteTitleReady, siteTitleSettingsDeps, blobHydrationReady, commentsReady, mediaTransformReady, menuBindingsReady, menuRepo, navLocationBindingRepo, newsletterListRepo, newsletterReady, transformDefinitionRepo, assetRenditionRepo, bus, originRegistry, outbox, redirectHitSink, redirectRepo, formDeliveryRepo, sqliteTrashDb, trashRegistry, trashRepo, trashAdapters, isInTrash, removePlugin, removeUser, trash, trashTransaction, redirectsWriteDeps, databaseIntrospection, databaseLedgerRepo, dbOps, migrationRunsRepo, publishContentRunRepo, restorePointsRepo, entryRefsRepo, entryRepo, formDefinitionRepo, sqliteEntryTermRepo, stampWatermark, taxonomyRepo, taxonomyRevisionRepo, termRepo, widgetBindingRepo, commentsCapability, commentsModule, contentTypeIndexProvisioner, contentTypeRepo, formSubmissionRepo, memberRepo, newsletterHooks, newsletterKeyring, newsletterSubscriberDirectory, runtimeMode, siteAssistantSecretKeyring, siteAssistantSecretSealer, externalMcpOAuthDevices, externalMcpServerRepo, siteAssistantCredentialRepo, siteReferenceRepo, projectSiteId, projectStore, projectVault, customCredentialSetRepo, providerConfigSource, providerPlugins, projectKeys, aiTraceSink, observability, tracker, customCredentialsHttpClient, mailDurableOutboxReady, mediaImportHttpClient, outboundTestOrigins, publishContentPeerHttpClient, resolvedMailer, siteBackupHttpClient, assetBlobRepo, mediaRepo, postRepo, mediaContentTypeStore, publishContentBaselineRepo, publishContentBundleRepo, publishContentFileBlobIndex, publishContentPeerRepo, publishContentSeedHash, removeTheme, siteThemes, publishContentApplyPort, agentPluginConnections, derivedPublicOrigin, externalMcpOAuthHttpPorts, guardedOutboundHttpClient, consoleLogger });
  routeDepsBuiltForPluginHost = routeDeps;
  // Start re-attachment only after its SDK's host getter is safe. Earlier composition awaits
  // (including vault normalization) must never race this pass. Boot awaits this before serving.
  finishRouteDepsPhase({ dbPath, opened, agentPluginLayout, resolvedSiteBinding, resolvedThemesDir, skillLayout, blobStore, mediaStorePorts, provideMediaCredentials, resolvedUploadsDir, workspaceId, postSearchBackfillReady, pluginRuntime, adminPasswordResetReady, identity, settingsRepo, blobHydrationReady, originReady, siteAssistantSecretKeyring, siteAssistantSecretSealer, observability, tracker, publishContentPeerHttpClient, guardedOutboundHttpClient, adminSurfaceHandlersReady, siteAppBootWork, routeDeps, widgetAdoptionReady });
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
