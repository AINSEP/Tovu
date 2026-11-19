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
import { renderDocBodyAsPageHtml } from "#src/server/inbound/public-http/http/site/render/content-html";
import { publicPageSecurityHeaders } from "#src/features/theme/public-page-security-headers";
import { createSharedOAuthOwnerStorage, createSharedOAuthLabels } from "#src/features/api-connections/shared-owner";
import { createSiteOAuthBindings } from "#src/features/project-keys/site-references";
import { createFormCollectionRegistry } from "@jini-ai/cms/forms";
import { composeCommerce } from "./commerce.js";
import { protectExistingFormFiles } from "#src/features/forms/protect-existing-files";
import { formsMailOutboxReady } from "#src/features/forms/mail-outbox-readiness";
import { TOVU_ERROR_REDACTION_OPTIONS } from '@tovu/contracts/secret-redaction';
import { notifyExternalMcpRosterChanged } from "../../../assistant/external-mcp-roster-change.js";
import { composeAgentPluginMcp, composeAgentPluginPreferences, composePluginProviderFaces } from "./agent-plugin-service-ports.js";
import { createSiteKeyReferences } from "#src/features/project-keys/site-references";
import { sourceControlKeyBinding } from "./source-control-key-binding.js";
import { createProjectKeys, providerPluginOf } from "#src/features/project-keys/service";
import { siteProviderRevisions } from "./provider-revision-watch.js";

import { setAgentPluginEnabled } from "#src/features/agent-plugins/set-enabled";
import { createReadyLoginProviderList } from "#src/features/member-login/index";
import { createPluginExportRuntime } from "#src/features/agent-plugins/exports/runtime";
import { createPluginExportSource } from "#src/features/agent-plugins/exports/source";
import { loadDeployWorkflowFiles } from "#src/features/deployments/index";
import { createPluginAccountTokenResolver } from "../boot/mail-plugin-account-token.js";
import { composeVisitorToolsManagement } from "./visitor-tools-management.js";
import { preparePreviewSwitcherWrite } from "#src/features/theme/preview-switcher";
import { createSiteConsentStore } from '#src/features/consent/revisions.repo';
import { bindSiteConsentService, ensureSiteConsentPrivacy } from './site-consent.js';
import { bindCookieConsentAnalyticsGate, createSiteCookieConsentDeps } from './site-cookie-consent.js';
import { findExclusionReason } from '@jini-ai/analytics';
import { resolveClientIp } from '#src/contracts/core/rate-limit/rate-limit';
import { registerContentAnalytics } from './content-events.js';
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { createSiteShareBackend } from "#src/features/site-backup/share-backend";
import { createStaticSitePackager } from "#src/features/site-backup/static-site-packager";
import { bindCredentialsHostPorts } from "./credentials-host-ports.js";
import { bindStaticSiteContext } from "./static-site-context.js";
import { composeSiteImportBackend } from "./site-import-backend.js";
import { composeSiteSavedKeys } from "#src/server/runtime/composition/site-portability";
import { startLocalSiteWhenRunning } from "#src/platform/site-dir/local-site-supervisor";
import { createShareArchiveReader } from "#src/features/site-backup/import-archive-reader";
import { createUnpdfDocumentTextExtractor } from "@jini-ai/cms/media/plugins/document-text/unpdf";
import { createMammothDocumentTextExtractor } from "@jini-ai/cms/media/plugins/document-text/mammoth";
import * as importYauzl from "yauzl";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { siteCreationBaseForBinding } from "#src/platform/site-dir/index";
import { localSiteSupervisorForHost } from "../lifecycle/local-site-host.js";
import { SiteShareRegistry } from "#src/features/site-backup/share-registry";
import { prepareShareContent } from "#src/features/site-backup/share-preparation";
import { sanitizeShareDatabase, rewriteArchiveMedia } from "#src/server/runtime/composition/site-portability";
import { createRuntimeShareDelivery, resolveShareDelivery } from "#src/features/site-backup/share-hosting";
import { selectConnectedDestination } from "#src/features/publish-content/peers";
import { resolvePublishDestinationCredential } from "#src/features/publish-content/destination-credential";
import { composePublishCredentialSource, toDeployTargetCredential } from "#src/features/deployments/static-publish/credentials";
import { createDeployHostKit } from "#src/features/deployments/deploy-targets/host-kit";
import { createToolGapReader } from "#src/features/tool-audit/tool-gaps.repo";
import { loadSiteVaultKinds, normalizeSiteVaultAtBoot } from "./vault-boot.js";
import { composeAgentPluginConnections, sharedApiConnectionOptions, resolveApiConnectionRuntime } from "./agent-plugin-connections.js";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import { createPeerSiteReads } from "./peer-site-reads.js";

import { resolveSiteDatabasePaths, resolveSiteDirForDatabase } from "#src/platform/site-dir/site-databases";
import { createTovuPluginHost } from "./plugin-host.js";
import { resolvePublishContentPeerHttpClient } from "./publish-content-http.js";
import { readBuiltInExternalMcpServerIds } from "#src/features/external-mcp/built-in-connections";
import { identityServiceDepsFrom } from "#src/server/inbound/admin-http/routes/users/deps";
import { bindWidgetRemoval } from "#src/features/trash/index";
import { createTovuOAuthHttpPorts } from "#src/platform/oauth/endpoint-safety";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createHttpClient as createGuardedMediaHttpClient, createNodeGuardedHttpPorts } from "@jini-ai/platform/http/guarded";
import { executeCommand } from "@jini-ai/cms/core";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { instrumentStorageKernel } from "@jini-ai/diagnostics/observability";
import { legacyProviderCredentialCheck } from "./provider-plugins.js";
import { setServerLogTraceReader } from '../../../platform/server-logs/index.js';
import { withToolUseEvents } from "./tool-use-events.js";
import { createVaultProviderConfigSource, withProviderSettingsMigrations } from "./provider-config-source.js";
import { createOtherSiteKeys } from "./other-site-keys.js";
import { isLocalTovuHost } from "./registered-sites.js";
import { createAgentPluginStateStore } from "#src/features/api-connections/plugin-state";
import { createApiConnectionVault } from "#src/features/api-connections/vault-stores";
import { createTelemetryConsent } from "./telemetry-consent.js";
import { resolveProductRoot } from "#src/platform/site-dir/product-root";
// A plain static import, unlike `createApp`/`exportSite` below: `resolveStorefrontProducts` has no
// eager top-level side effect (`routes/site/products.ts`'s module body only declares functions/a
// route registrar), so there is no load-order hazard to defer — see `routes/types.ts`'s
// `resolveStorefrontProducts` doc for why this field exists at all.
import { resolveStorefrontProducts } from "../../inbound/public-http/routes/site/products.js";
import {
  preparePostSearchIndex,
  SqlitePostRepo,
  postSearchIndexFor,
  createPostRevertRegistry,
  listPublishedPosts,
} from "#src/features/post/index";
import { createApplyConnectDefaults } from "#src/features/agent-plugins/apply-connect-defaults";
import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import type { SiteBackupSources } from "#src/features/site-backup/sources";
import { SqlitePublishHistoryStore } from "#src/platform/db/sqlite/publish-history-repo.sqlite";
import { SqlitePublishContentBundleRepo } from "#src/platform/db/sqlite/publish-content-bundle-repo.sqlite";
import { SqlitePublishContentPeerRepo } from "#src/features/publish-content/publish-content-peer-repo.sqlite";
import { SqlitePublishContentBaselineRepo } from "#src/platform/db/sqlite/publish-content-baseline-repo.sqlite";
import { publishTrustRevocationStoreFor } from "#src/features/publish-trust/publish-trust-revocations";
import { contentKernel } from "#src/platform/db/content-kernel";
import { createPublishContentApplyPort, toPublishContentApplyDeps } from "#src/features/publish-content/apply-port";
import { createFileBlobIndex } from "#src/features/publish-content/file-blob-index";
import { buildContentPublishPorts } from "#src/server/runtime/composition/content-publish-ports";
import { composeFormSubmissions } from "#src/server/runtime/composition/form-submissions";
import { SqlFormSubmissionReceiptRepo } from "#src/platform/db/repos/form-submission-receipt-repo";
import { composeFormDelivery } from "#src/server/runtime/composition/form-delivery";
import { composeFormDeliveryDeliverer } from "#src/server/runtime/composition/form-delivery-deliverer";
import { SqlFormPullLeaseRepo } from "#src/platform/db/repos/form-delivery-repo";
import { readMailSenderSetting } from "#src/features/settings/index";
import { createSqlitePublishContentSeedHash } from "./publish-content-seed-hash.js";
import { SqliteCustomCredentialSetRepo } from "#src/features/custom-credentials/custom-credential-repo.sqlite";
import { createDefaultHttpClient } from "#src/platform/http/client";
import { createTestOriginHttpClientFactory } from "#src/platform/http/test-origin-allowlist";
import {
  CUSTOM_CREDENTIALS_EGRESS_POLICY,
  SITE_BACKUP_EGRESS_POLICY,
  MEDIA_IMPORT_EGRESS_POLICY,
  SINGLE_HOP_HTTPS_EGRESS_POLICY,
} from "#src/platform/http/egress-policies";
import { createSiteMailer } from "./site-mailer.js";
import { loadMailCredentialCards } from "../boot/mail-provider-catalog.js";
import { createDomainBindingSweep } from "./dns-change-deps.js";
import { DOMAIN_DNS_EGRESS_POLICY } from "./domain-dns-adapters.js";
import { loadDeployOpsRegistry } from "#src/features/deployments/deploy-ops/registry";
import { loadCredentialSchemeRegistry } from "#src/features/agent-plugins/auth-schemes";
import { loadSourceControlProviderRegistry } from "#src/features/source-control/provider-registry";
import { loadMailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import { loadMediaProviderRegistry } from "#src/features/media-generation/media-provider-registry";
import { createMailCaptureRepo, createMailSendLedgerRepo, createMailSuppressionRepo, createSiteMailFeedbackRoute } from "#src/features/mail/index";
import { createMailActivityRepo } from "#src/features/mail/activity.repo";
import { createMailSuppressionAdminRepo } from "#src/features/mail/suppression-admin.repo";
import { SqliteSourceControlCredentialSetRepo } from "#src/features/source-control/source-control-credential-repo.sqlite";
import { SqliteVendorCredentialSetRepo } from "#src/features/vendor-credentials/vendor-credential-repo.sqlite";
import { executionModeFromEnv } from "#src/features/deployments/publish-credentials/index";
import { InMemoryPublishCredentialVerificationCache } from "#src/features/deployments/static-publish/index";
import { loadDeployTargetRegistry, loadInstalledDeployTargets } from "#src/features/deployments/deploy-targets/registry";
import { loadFormDestinationRegistry } from "#src/features/form-destinations/registry";
import { PagesHtmlDocumentStore } from "#src/features/pages/index";
import {
  createChatRunLedger,
  createChatStoreFactory,
  createSqliteAgentSessionStore,
} from "#src/assistant/index";
import { resolveActiveThemeId } from "#src/features/presentation/index";
import { SqliteToolAttemptAuditSink } from "#src/features/tool-audit/repo.sqlite";
import { formatErrorForLog } from "@jini-ai/core";
import { discoverAllBuiltInThemes, rescanThemes, syncThemeRoster } from "#src/features/theme/index";
import { createThemeTrashAdapter } from "#src/features/theme/theme-trash";
import { SqliteWorkspaceRepo } from "#src/features/workspace/index";
import { sqliteConnectionOf, closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";
import { openSiteContentDb } from "./open-site-content-db.js";
import { type SiteStore, type SiteStoreRole } from "./open-site-store.js";
import { createSite } from "./site-dir.js";
import { isInMemoryDbPath } from "@jini-ai/db/data-modules";
import { resolveSiteStorage } from "#src/platform/site-dir/site-storage";
import { createMailAttemptObserver } from "#src/features/mail/attempts.repo";
import { hydrateBlobStoreFromSeed } from "#src/features/media/hydrate-blob-store-from-seed";
import { resolveWorkspace } from "#src/platform/site-dir/resolve-workspace";
import { createSiteCreationTimeZone } from "#src/platform/site-dir/read-site-dir";
import { resolveSiteTimeZone } from "#src/features/settings/site-timezone";
import { seedSiteThemes } from "#src/platform/site-dir/seed-site-themes";
import { SqliteChangeSetRepo } from "#src/platform/db/sqlite/change-set-repo.sqlite";
import { SqliteTokenStore } from "#src/platform/db/sqlite/gated-mutation-token-repo.sqlite";
import { warnOnOrphanedChatRows } from "#src/platform/db/sqlite/chat-orphan-check";
import { createSitemapService } from "@jini-ai/cms/seo";
import { createSeoDeps } from "#src/features/seo/index";
import {
  SqliteNewsletterAudienceSnapshotRepo,
  SqliteNewsletterCampaignRepo,
  SqliteNewsletterConfirmationTokenRepo,
  SqliteNewsletterListRepo,
  SqliteNewsletterSendRepo,
  SqliteNewsletterSubscriptionRepo,
} from "#src/features/newsletter/repo.sqlite";
import { DefaultMemberAccessResolver } from "#src/features/members/index";
import { listCustomCredentials, resolveCustomCredentialByLabel } from "#src/features/custom-credentials/index";
import { CustomCredentialVaultRepo } from "#src/features/custom-credentials/vault-repo";
import { TovuCredentialSetVaultAdapter, VendorCredentialSetVaultRepo } from "#src/features/vendor-credentials/vault-adapter";
import type { SourceControlCredentialSetRecord } from "#src/features/source-control/types";
import { bindSiteSearchPorts, createSiteSearchRuntime } from "./modules/site-search.js";
import {
  SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID,
} from "../configuration/seed.js";
import { SqliteBufferSink } from "#src/platform/db/sqlite/analytics-sink.sqlite";
import { buildAnalyticsProviders } from "./analytics-providers.js";
import {
  SqliteMagicLinkTokenRepo,
  SqliteMemberRepo,
  SqliteMemberSessionRepo,
  SqliteMemberSubscriptionRepo,
  SqliteMemberTierRepo,
} from "#src/features/members/index";
import { registerMenuReverters } from "#src/features/navigation/index";
import { SqliteWebhookDeliveryRepo, SqliteWebhookSubscriptionRepo } from "#src/platform/db/sqlite/webhook-repo.sqlite";
import { EnvOrFileKeyring } from "#src/features/webhooks/keyring.env";
import { resolveSiteKeyId, siteKeySources } from "#src/features/webhooks/site-key-sources";
import { createKeyringBackedSigner } from "#src/features/webhooks/signing.keyring";
import { SqliteSiteAssistantCredentialRepo } from "#src/assistant/site-credential-repo.sqlite";
import { SealedDatabaseDestinationStore } from "#src/features/database-transfer/destination-store";
import { DatabaseDestinationRepo } from "#src/features/database-transfer/destination-repo";
import { SqliteAdminExecutionCredentialRepo } from "#src/assistant/execution-credential-repo.sqlite";
import { SqliteMediaProviderCredentialRepo } from "#src/features/media/media-provider-credential-repo.sqlite";
import { SqliteExternalMcpServerRepo } from "../../../features/external-mcp/external-mcp-repo.sqlite.js";
import { SqliteExternalMcpToolApprovalRepo } from "#src/platform/db/sqlite/external-mcp-tool-approval-repo.sqlite";
import { createSqliteConversationToolApprovalStore } from "#src/assistant/persistence/conversation-tool-approval-store";
import {
  DEFAULT_GC_GRACE_MS,
  LocalFsBlobStore,
  purgeMedia,
  SharpImageTransformer,
} from "#src/features/media/index";
import { readMediaObjectStoreSetting, artifactStoreBinding, artifactStoreTarget, selectArtifactStoreProvider } from "#src/features/object-storage/index";
import type { IdentityRepos } from "@jini-ai/user-management";
import { FORMS_SUBMIT_PROFILE } from "#src/features/forms/index";
import { formSubmissionAttemptsFor } from "#src/features/forms/index";
import { createRateLimiter, SITE_ASSISTANT_PER_IP } from "#src/contracts/core/rate-limit/rate-limit";
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
import { getSlugChangeCapture, registerSlugChangeCapture } from "#src/platform/routing/adapter";
import { InMemorySiteStatusRepo } from "#src/features/database/repo.memory";
import { buildWidgetsDeps } from "#src/features/widgets/deps";
import { adoptLegacyTrashedWidgets } from "@jini-ai/cms/widgets";
import { readAdminChartProviderSnapshot } from "./chart-providers.js";
import { RECHARTS_DEFAULT_PROVIDER } from "./charts-recharts-source.js";
import { createSiteConsentReadiness } from "#src/features/consent/settings";
import { watchProviderRevisions } from "@jini-ai/plugins/host";
import { composePluginRuntime } from "./plugin-runtime.js";
import { isAdminAssistantEnabled } from "./admin-assistant-enabled.js";
import {
  getEffective,
  set,
  INSTRUCTIONS_NAMESPACE,
} from "#src/features/settings/index";
import { createSettingsAnalyticsConfig } from "#src/features/analytics/config.settings";
import { ensureSiteTitleSettingDefinition, preserveLegacySiteTitles } from "#src/features/settings/site-title";
import {
  COMMENT_ENTITY_TYPE,
  buildTrashRegistry,
  createCommentTrashAdapter,
  createContentDbTransactionRunner,
  createDirectoryTrashAdapter,
  unhideIfRemoveThrows,
  createMediaTrashAdapter,
  createPostTrashAdapter,
  createRedirectTrashAdapter,
  MEDIA_ENTITY_TYPE,
  PLUGIN_ENTITY_TYPE,
  THEME_ENTITY_TYPE,
  POST_ENTITY_TYPE,
  REDIRECT_ENTITY_TYPE,
  SqliteTrashRepo,
  USER_ENTITY_TYPE,
  createUserTrashAdapter,
  removeEntityWithoutBlocker,
} from "#src/features/trash/index";
import {
  bindRemoveEntity,
  bindForgetRemovedEntity,
  createTrashService,
  createTrashSweep,
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
import { AlwaysUnavailableWatermarkSource, RestorePointDeepLinkLookup } from "@jini-ai/db/recovery/lookup-adapters";
import { buildGatewayDeps, buildOwnerOnlyInstanceAuthorize } from "#src/contracts/core/gated-mutations/composition";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { resolveSitesHome } from "#src/platform/site-dir/sites-home";
import { wrapMailerWithPurposeGate } from "#src/platform/mail/purpose-scoped-mailer";
import { createExternalMcpOAuthService } from "../../../features/external-mcp/external-mcp-oauth.js";
import { resolvePublicAssistantAvailability } from "../../../assistant/index.js";
import { createSqliteDeviceAuthorizationStore } from "#src/platform/db/sqlite/oauth-pending-store.sqlite";

import { builtInContentSeedDbPath, pluginsInstallDir, resolveShareDirectory } from "./site-paths.js";
import { bundledAgentPluginsDir, assertContentDbFileName, builtInThemesDir, defaultContentDbPath, mediaUploadsDir, resolveExportOutputRootDir, resolvePublishOutputRootDir, resolveSiteStoragePaths, resolveSourceControlExportRootDir, siteDir, type SitePathResolverOptional } from "./site-paths.js";
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
import { createApp } from "./app.js";
import { siteAppBootWorkByDeps } from "./site-app-boot-work.js";
import { type CreateSiteRouteDepsOverrides, assertOverridesPairedOrAbsent, pluginFailureThresholdOverride, resolveThemesDirOverride, resolveSiteBindingOverride, resolveWorkspaceIdOverride } from "./site-deps/overrides.js";
import { type StoreCloseRegistration, openCompositionStore, resolveChatDbPath } from "./site-deps/open-store.js";
import { providerPluginBoot, composeProviderConfig, credentialProject, siteIdentityFor } from "./site-deps/provider-identity.js";

const consoleLogger = createConsoleLogger({ prefix: "" });

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
  await warnCompositionChatOrphans({}, {});

  async function warnCompositionChatOrphans(_required: Record<string, never>, _options = {}): Promise<void> {
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
  const siteAssistantCredentialRepo = new SqliteSiteAssistantCredentialRepo({ store: kernel });
  // Held as a local rather than constructed inline, because the OAuth service below must be given
  // the SAME repo instance the routes read through — two instances would refresh a token into one
  // and read it back from the other.
  const externalMcpServerRepo = new SqliteExternalMcpServerRepo({ store: kernel });
  // Device begin/poll share this root's durable store without opening another database handle.
  // Redirect callbacks carry their own sealed state and only need the same site key.
  const externalMcpOAuthDevices = createSqliteDeviceAuthorizationStore({ db: kernel, workspaceId, clock, sealer: siteAssistantSecretSealer, keyring: siteAssistantSecretKeyring });

  // Provider plugins (observability, product analytics, AI tracing): installed + enabled +
  // configured (their key card) → loaded and initialized here, awaited and bounded, before any
  // consumer of their ports; otherwise each contract keeps its noop. This is the composition root
  // BOTH real-process boot paths build `RouteDeps` from (`index.ts`'s non-memory branch AND
  // `cli/commands/serve.ts`'s `tovu serve`), so this is the one call site where the real
  // (non-hermetic) choice belongs; `app.ts`'s hermetic root keeps the noop — see `routes/types.ts`'s
  // `ObservabilityDeps` doc for the rule-of-two this mirrors. The storage kernels and guarded HTTP
  // clients below are decorated with the port (identity for the no-op port, so a default boot keeps
  // its exact objects). See `provider-plugins.ts`.
  // Saved provider settings: the project store when one is open, else sealed plugin-state rows in this
  // site's vault (see provider-config-source.ts and project-store.ts).
  const siteReferenceRepo = new SqlSecretsVaultRepo({ kernel: kernel as unknown as KyselyKernel<SecretsVaultDatabase> });
  const projectKeyReferences = createSiteKeyReferences({ workspaceId, repo: siteReferenceRepo,
    vault: createApiConnectionVault({ repo: siteReferenceRepo, keyring: siteAssistantSecretKeyring, sealer: siteAssistantSecretSealer, clock, workspaceId }) });
  const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, siteId: projectSiteId } = await composeProviderConfig({ overrides, runtimeMode, onStoreClose, binding: resolvedSiteBinding, references: projectKeyReferences,
    site: createVaultProviderConfigSource({ workspaceId, scope: "site", state: createAgentPluginStateStore({ workspaceId,
      vault: createApiConnectionVault({ repo: new SqlSecretsVaultRepo({ kernel: kernel as unknown as KyselyKernel<SecretsVaultDatabase> }), keyring: siteAssistantSecretKeyring, sealer: siteAssistantSecretSealer, clock, workspaceId }) }) }) });
  const providerConfigSource = withProviderSettingsMigrations({ source: savedProviderConfig, providers: async ({ pluginId }) =>
    (await pluginRuntime.discoverPlugins()).find(record => record.id === pluginId)?.manifest?.contributes?.providers ?? [] });
  // 2026-08-31 (mail rule-of-two build): resolved once here, ahead of the `RouteDeps` object
  // literal below, because `mailer:` (built from it) is an earlier property than
  // `customCredentialSetRepo:` — see `resolve-mailer.ts`'s own header for the full design. Sealed
  // via the SAME shared sealer/keyring every other credential repo on this root already reuses (no
  // third `EnvOrFileKeyring` instance).
  // Local rows retain their original ownership; only shared owner rows require site grants.
  // The owner store is opened before this reader (owner 2026-10-25).
  const customCredentialSetRepo = compositionCustomCredentials();

  /** Bind site credentials to the optional project inventory without changing local ownership.
   * @complexity O(1) adapter construction; no repository reads. */
  function compositionCustomCredentials() {
    const customProject = credentialProject({ projectVault, repo: vault => new CustomCredentialVaultRepo({ vault }) });
    return new SqliteCustomCredentialSetRepo(kernel, customProject.project && projectStore
      ? { project: { ...customProject.project, inventoryRepo: new CustomCredentialVaultRepo({ vault: projectStore.vault.repo }) } }
      : customProject);
  }
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
  const projectKeys = compositionProjectKeys();

  /** Build the shared-key service only for an attached project; binding remains late-bound.
   * @complexity O(1) service construction; I/O occurs only through later service operations. */
  function compositionProjectKeys() {
    return projectStore ? createProjectKeys({ vault: projectStore.vault.repo, attachments: projectStore.attachments,
      describeOAuth: createSharedOAuthLabels({ scope: projectStore.vault, clock }),
      siteId: projectSiteId, siteName: resolvedSiteBinding.name, providerUsage: input => providerConfigSource.usage(input), reapply: input => providerPlugins.reapply(input),
      transaction: input => projectStore.transaction(input), inventory: projectStore.inventory ? () => {
        if (!projectStore.inventory) throw new Error("project keys have no inventory service");
        return projectStore.inventory({});
      } : undefined, references: projectKeyReferences,
      // The site registry exists only on a desktop or self-hosted multi-site install.
      ...(projectSiteId && isLocalTovuHost({}, {}) ? { siteKeys: createOtherSiteKeys({ target: { siteId: projectSiteId, name: resolvedSiteBinding.name, dir: resolvedSiteBinding.dir, file: sqliteConnectionOf(kernel)?.name }, project: projectStore.vault }) } : {}),
      bindOAuth: input => {
        if (!bindSharedApiOAuth) throw new Error("Shared connections are not available yet. Reopen this saved connection and try again.");
        return bindSharedApiOAuth(input);
      } }) : undefined;
  }
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
  // `runtimeMode` itself is now resolved further up (see `newsletterKeyring`'s own hoisting
  // comment above) — kept read here via the same local rather than re-hoisting every downstream
  // use, since everything below this point already assumed a local named `runtimeMode` exists.
  // Outbound mail-API calls (plugin-provided hosted mail adapters) use the shared `SINGLE_HOP_HTTPS_EGRESS_POLICY` — see
  // `platform/http/egress-policies.ts`'s own header for why this used to be a hand-copied literal
  // (no default policy exists elsewhere in this codebase to reuse otherwise; checked: no production
  // `HttpClientPort` consumer was wired into either composition root before this).
  // Email provider contract v1 (2026-10-21): lanes read `core.mail.provider` (first boot writes the
  // provider the old implicit chain picked), and every provider sits behind Jini's delivery policy
  // over the mail ledgers (`features/mail`). See `site-mailer.ts` and `resolve-mailer.ts`.
  const mailResolveDeps = {
    workspaceId,
    customCredentialRepo: customCredentialSetRepo,
    sealer: siteAssistantSecretSealer,
    httpClient: createDefaultHttpClient({ policy: SINGLE_HOP_HTTPS_EGRESS_POLICY }, { observability }),
    loadMailAdapters: () => loadMailAdapterRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions }),
    resolvePluginAccountToken: createPluginAccountTokenResolver({ workspaceId, repo: externalMcpServerRepo, sealer: siteAssistantSecretSealer }),
    mode: runtimeMode,
  };
  const resolvedMailer = createSiteMailer({
    resolve: mailResolveDeps,
    settings: { repo: settingsRepo, deps: { clock, ids: idGen, principals: settingsPrincipals }, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID, authorize: identity.authorize },
    settingsReady: siteTitleReady,
    delivery: { observe: createMailAttemptObserver({ db: kernel }), ledger: createMailSendLedgerRepo({ db: kernel }), suppression: createMailSuppressionRepo({ db: kernel }), capture: createMailCaptureRepo({ db: kernel, origin: originRegistry }) },
    readSenderEmail: async () => (await readMailSenderSetting({ settingsRepo, workspaceId })).email,
    readConfiguredSender: (required) => readMailSenderSetting({ settingsRepo, workspaceId: required.workspaceId }),
  }, { durableOutboxReady: required => mailDurableOutboxReady(required),
    setAgentPluginEnabled: input => setAgentPluginEnabled(input, { lifecycle: agentPluginLifecycle, notifyRosterChanged: notifyExternalMcpRosterChanged }) });
  // Email page phase 3: the provider's own sender-domain verdict and the test-mode read, each fresh.
  // SPEC-022's durable-outbox readiness, named once: the live mailer's purpose gate below and the
  // Email page's use readiness probe (`platform/mail/purpose-gate-probe.ts`) read the same function.
  const mailDurableOutboxReady = formsMailOutboxReady;
  // `features/custom-credentials`'s two agent tools (`custom_credential_verify`/
  // `custom_credential_make_request`) need a guarded `HttpClientPort` of their own — see
  // `routes/types.ts`'s `customCredentialsHttpClient` doc for why this is a genuinely separate
  // CLIENT instance from the mailer's above. Built from its own `CUSTOM_CREDENTIALS_EGRESS_POLICY`
  // (2026-09-10) rather than the mailer's `SINGLE_HOP_HTTPS_EGRESS_POLICY` — that policy's own doc
  // has the live incident (GitHub's Actions job-logs endpoint 302s to a signed Azure Blob URL) that
  // made a zero-redirect policy the wrong fit for this tool specifically.
  const customCredentialsHttpClient = createDefaultHttpClient({ policy: CUSTOM_CREDENTIALS_EGRESS_POLICY }, { observability });
  // `site_backup_push`'s large uploads: see `SITE_BACKUP_EGRESS_POLICY`'s own doc.
  const siteBackupHttpClient = createDefaultHttpClient({ policy: SITE_BACKUP_EGRESS_POLICY }, { observability });

  const { outboundTestOrigins, mediaImportHttpClient, publishContentPeerHttpClient } = composeContentHttpClients({}, {});

  function composeContentHttpClients(_required: Record<string, never>, _options = {}) {
    // `features/media-import`'s `media_import_from_url` needs its own guarded `HttpClientPort` — a
    // THIRD instance, and the only one built from a policy other than SINGLE_HOP_HTTPS. See
    // `routes/types.ts`'s `mediaImportHttpClient` doc and `MEDIA_IMPORT_EGRESS_POLICY`'s own doc for
    // why fetching an image file cannot use the fixed-method, no-redirect, 1 MB policy above.
    const outboundTestOrigins = overrides.outboundTestOrigins ?? [];
    const mediaImportHttpClient = createTestOriginHttpClientFactory({ allowedOrigins: outboundTestOrigins })({ policy: MEDIA_IMPORT_EGRESS_POLICY }, { observability });

    // `features/publish-content`'s outbound push/pull leg needs its own guarded `HttpClientPort` — a
    // FOURTH instance. It is the only one whose policy is built rather than imported as a literal,
    // because it is the only one with an operator-configurable `devHostAllowlist`: a legitimate
    // publish peer may sit on a private network (Railway/Render internal DNS, an AWS VPC, two Tovus
    // behind one VPS firewall), and `TOVU_PUBLISH_CONTENT_DEV_HOSTS` is the plain env var that says
    // so on every platform. Unset means "every peer must resolve to a public address", the safe
    // default. See `createPublishContentPeerEgressPolicy`'s own doc.
    const publishContentPeerHttpClient = resolvePublishContentPeerHttpClient({}, {
      ...(overrides.publishContentPeerHttpClient ? { client: overrides.publishContentPeerHttpClient } : {}),
      createClient: ({ policy }) => createDefaultHttpClient({ policy }, { observability }),
    });

    return { outboundTestOrigins, mediaImportHttpClient, publishContentPeerHttpClient };
  }

  // Extracted (not inlined into the return object below) so `revertRegistry` can close over the
  // SAME instance `RouteDeps.postRepo` exposes, rather than a second `SqlitePostRepo(kernel)` — both
  // are stateless wrappers over the shared kernel, so a second instance would behave
  // identically, but reusing one matches this root's existing single-instance convention (see
  // `outbox`/`settingsRepo` above).
  const postRepo = new SqlitePostRepo({ store: kernel });

  // Task 8 of the publish-content (Publish Content) feature — same "reuse one instance" convention
  // as `postRepo` just above: `publishContentApplyPort`'s own bundle/baseline reads must hit the
  // SAME rows `RouteDeps.publishContentBundleRepo`/`publishContentBaselineRepo` expose (both are
  // stateless wrappers over the shared `db`, so a second instance would behave identically, but one
  // instance matches this root's own stated convention). `changeSets` is hoisted for the identical
  // reason as `revertRegistry`'s `postRepo` above.
  const changeSets = new SqliteChangeSetRepo({ store: kernel });
  // Hoisted out of the `routeDeps` literal below for the SAME reason as `changeSets` above: the
  // apply loop's `media.apply()` must read and write through the same adapters every media route
  // uses. Both are stateless wrappers over the shared `db`, so a second instance would behave
  // identically — one instance simply matches this root's own stated convention.
  const mediaRepo = new SqliteMediaRepo({ store: kernel });
  const assetBlobRepo = new SqliteAssetBlobRepo({ store: kernel });
  if ((overrides.storeRole ?? "owner") === "owner") await protectExistingFormFiles({ kernel, workspaceId, siteDir: resolvedSiteBinding.dir });
  // One instance for the render path and publish's media apply, which records what render reads.
  const mediaContentTypeStore = new SqliteMediaContentTypeStore({ store: kernel });
  const publishContentBundleRepo = new SqlitePublishContentBundleRepo({ store: kernel });
  const publishContentBaselineRepo = new SqlitePublishContentBaselineRepo({ store: kernel });
  // `publish-files-plan-2026-09-24.md` §3 — ONE process-lifetime instance, same "hoisted, never
  // rebuilt per request" convention as every repo above. See `routes/types.ts`'s `fileBlobIndex` doc.
  const publishContentFileBlobIndex = createFileBlobIndex();
  // Task 10 — named remote Tovus, with their API keys sealed at rest under the shared ADR-058
  // sealer/keyring below. See `routes/types.ts`'s `publishContentPeerRepo` doc.
  const publishContentPeerRepo = new SqlitePublishContentPeerRepo(kernel);
  // D1 — ONE seed lookup for both the import route's planner and the apply loop's re-verification
  // (`RouteDeps.publishContentSeedHash`), so the two can never disagree on "untouched since seed".
  const publishContentSeedHash = createSqlitePublishContentSeedHash({
    seedDbPath: builtInContentSeedDbPath({ siteName: resolvedSiteBinding.name }),
    workspaceId,
    clock,
    idGen,
    redirectsWriteDeps,
  });
  // One array shared by `routeDeps.themes` (below) and the theme-files apply's refresh hook, so a
  // published theme's partials/pages re-render without a restart (`rescanThemes` refills IN PLACE).
  const siteThemes = discoverAllBuiltInThemes({ dir: resolvedThemesDir, source: "built-in" });
  // Records what the folder looked like at discovery, so the first theme change ANOTHER process
  // makes (the agent daemon's `theme_duplicate`, or the web server's admin Duplicate seen from the
  // daemon) is noticed by this one. See `theme-roster-sync.ts`.
  syncThemeRoster({ themes: siteThemes, themesDir: resolvedThemesDir });
  // `theme` joins the Trash here rather than in `trashAdapters`' literal above: its adapter rescans
  // `siteThemes` after every move, and the Trash resolves adapters at call time, so this `set` is seen
  // by every later trash/restore/purge (`theme_trash`, `trash_restore_item`, the admin Trash screen).
  const themeTrashAdapter = createThemeTrashAdapter({ themes: siteThemes, themesDir: resolvedThemesDir });
  trashAdapters.set(THEME_ENTITY_TYPE, themeTrashAdapter);
  // Folder moves before the Trash row is written; if that write throws, move the folder back.
  const removeTheme = unhideIfRemoveThrows({ adapter: themeTrashAdapter, remove: bindRemoveEntity({ trash, entityType: THEME_ENTITY_TYPE }) });
  const publishContentApplyPort = createPublishContentApplyPort({
    workspaceId,
    bundleRepo: publishContentBundleRepo,
    baselineRepo: publishContentBaselineRepo,
    runRepo: publishContentRunRepo,
    publishContentDeps: toPublishContentApplyDeps({
      workspaceId,
      clock,
      idGen,
      outbox,
      changeSets,
      authorize: identity.authorize,
      // F2 — one ports bag keyed by entityType (`type-registry.ts`'s `PublishContentPorts`).
      ports: {
        post: {
          repo: postRepo,
          forgetRemoved: bindForgetRemovedEntity({
            repo: trashRepo,
            entityType: POST_ENTITY_TYPE
          }),
          // S4 (publish-overwrite-live-plan-2026-09-24) — same binding `routeDeps.removePost` below
          // uses; the post handler's `retire()` needs it to wrap `retirePostForReplacement`.
          remove: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
            trash: trash,
            entityType: POST_ENTITY_TYPE
          }) }),
        },
        media: { repo: mediaRepo, assetBlobRepo, blobStore, contentTypeStore: mediaContentTypeStore },
        redirect: redirectsWriteDeps,
        menu: { repo: menuRepo, bindingRepo: navLocationBindingRepo },
        ...buildContentPublishPorts({
          workspaceId,
          postRepo,
          formDefinitionRepo,
          contentTypeRepo,
          contentTypeIndexProvisioner,
          taxonomyRepo,
          termRepo,
          entryTermRepo: sqliteEntryTermRepo,
          taxonomyRevisionRepo,
          stampWatermark,
          entryRepo,
          entryRefsRepo,
          widgetBindingRepo,
          settingsRepo,
          principalRepo: settingsPrincipals,
          presentationRepo,
          themes: siteThemes,
        }),
        "theme-files": {
          // S19 (S-F4) — the theme-files handler's `apply()` stages/writes under this site's own
          // themes root, the SAME value `routeDeps.themesDir` (below) resolves to. See
          // `routes/types.ts`'s `themesDir` doc.
          themesDir: resolvedThemesDir,
          onReplaced: () => {
            rescanThemes({ themes: siteThemes, dir: resolvedThemesDir });
          },
        },
      },
    }),
    clock,
    idGen,
    getSeedHash: publishContentSeedHash,
  });

  // One pinned HTTP capability backs both media and OAuth; each request keeps its own tighter budget.
  const guardedOutboundHttpClient = createGuardedMediaHttpClient({
      ...createNodeGuardedHttpPorts({}),
      userAgent: "Tovu/0.1.0",
      // Preserve Jini's generation budget (10 minutes, 96 MiB); asset requests may choose less.
      // Redirects are refused; provider-returned URLs get no private-network exception.
      policy: { allowedSchemes: ["https", "http"], denyPrivateAddresses: true, devHostAllowlist: [],
        maxRedirects: 0, connectTimeoutMs: 10 * 60 * 1000,
        maxResponseBytes: 96 * 1024 * 1024, maxDecompressedBytes: 96 * 1024 * 1024 },
    });
  // c266749d0: desktop's loopback callback needs the same exception as plugin API OAuth.
  const externalMcpOAuthHttpPorts = createTovuOAuthHttpPorts({ http: guardedOutboundHttpClient }, { allowLoopbackHttp: resolveApiConnectionRuntime({ env: process.env }) === "desktop" });
  const derivedPublicOrigin = resolveCompositionPublicOrigin({}, {});

  function resolveCompositionPublicOrigin(_required: Record<string, never>, _options = {}): string {
    // See `routes/types.ts`'s `derivedPublicOrigin` doc. Reuses `devCapabilityScheme` (derived just
    // above for the dev-capability origin seed) rather than calling `resolveDevTls` a second time —
    // that would re-read the cert/key PEM files off disk for no reason, since the scheme is the only
    // part of that resolution this needs. Hoisted so the plugin connection seams share it.
    return process.env.TOVU_SITE_LISTENER_ORIGIN ?? `${devCapabilityScheme}://localhost:${Number(process.env.PORT ?? 3000)}`;
  }
  // Plugin API connections, executable plugin-tool ports and admin-surface handlers share one
  // connection port and one sealed vault (kind `api-connection`, migration 0020).
  const agentPluginConnections = composeAgentPluginConnections({
    workspaceId, loadContributions: agentPluginLifecycle.loadPluginContributions,
    vaultRepo: new SqlSecretsVaultRepo({ kernel: kernel as unknown as KyselyKernel<SecretsVaultDatabase> }),
    keyring: siteAssistantSecretKeyring, sealer: siteAssistantSecretSealer, customCredentialRepo: customCredentialSetRepo, clock, http: guardedOutboundHttpClient,
    env: process.env, derivedPublicOrigin,
  }, {
    shared: sharedApiConnectionOptions({ projectStore, siteId: projectSiteId, siteName: resolvedSiteBinding.name, ownerPrincipalId: identity.ownerPrincipalId,
      bindings: createSiteOAuthBindings({ workspaceId, repo: siteReferenceRepo,
        vault: createApiConnectionVault({ repo: siteReferenceRepo, keyring: siteAssistantSecretKeyring, sealer: siteAssistantSecretSealer, clock, workspaceId }) }) }),
    // A plugin's destination screen saves its own adapter's form-delivery bindings (an admin action).
    deliveryBindings: { settings: { repo: settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals }, forms: formDefinitionRepo, newBindingId: () => idGen.newId() },
  });
  bindSharedApiOAuth = agentPluginConnections.apiConnections.host.sharedOAuth?.bind;
  // Boot load of plugin admin-surface handlers (each surface open reloads them too; see handlers.ts).
  const adminSurfaceHandlersReady = agentPluginConnections.adminSurfaceHost.refresh().then(() => {}, (error: unknown) => {
    console.warn(`[admin-surfaces] handler modules could not be loaded at boot, continuing without them — ${error instanceof Error ? error.message : String(error)}`);
  });
  // Every app over this composition shares the store's lifetime; each boot pass leaves once settled.
  const siteAppBootWork = new Set<Promise<void>>();
  const seoDeps = createSeoDeps({ deps: { postRepo, settingsRepo, mediaRepo, mediaContentTypeStore, transformDefinitionRepo, originRegistry, clock } }, {});
  const sitemapService = createSitemapService({ deps: seoDeps }, {});
  let resolveRouteDeps!: (deps: RouteDeps) => void;
  const routeDepsBuilt = new Promise<RouteDeps>(resolve => { resolveRouteDeps = resolve; });
  // Serialize ledger registration, but never gate consent on unrelated title preservation.
  const siteConsentReady = createSiteConsentReadiness({ ...siteTitleSettingsDeps,
    after: Promise.all([siteSettingsReady, identity.identityReady]).then(() => undefined),
    systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID,
  }, {
    ensurePrivacyDefaults: () => ensureSiteConsentPrivacy({ deps: routeDepsBuilt }),
  });
  const pluginExports = createPluginExportRuntime({ workspaceId: workspaceId, embedConsentOff: () => routeDeps.cookieConsent?.embedConsentOff?.() === true, source: createPluginExportSource({ lifecycle: agentPluginLifecycle }), listProviders: createReadyLoginProviderList({ sourceRoot: bundledAgentPluginsDir(), loadContributions: agentPluginLifecycle.loadPluginContributions, credentials: { repo: customCredentialSetRepo, sealer: siteAssistantSecretSealer } }) });
  // ONE composed MCP port: routeDeps.mcp and the sign-in grant share its projections and classifier.
  const agentPluginMcp = composeAgentPluginMcp({ repo: externalMcpServerRepo, sealer: siteAssistantSecretSealer, keyring: siteAssistantSecretKeyring, clock });
  const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {
    siteBackupSanitize: sanitizeShareDatabase,
    pluginExports,
    assistantAgentInventory,
    workspaceId: workspaceId,
    peerSiteReads: createPeerSiteReads({ currentSiteDir: resolvedSiteBinding.dir }, {}),
    workspaceRepo: new SqliteWorkspaceRepo({ store: kernel }),
    trash,
    // Pre-bound per domain. A delete path receives exactly one of these and therefore cannot reach
    // another domain's entities by passing the wrong string.
    removePost: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: POST_ENTITY_TYPE
    }) }),
    removeComment: bindRemoveEntity({
      trash: trash,
      entityType: COMMENT_ENTITY_TYPE
    }),
    removeMedia: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: MEDIA_ENTITY_TYPE
    }) }),
    removeRedirect: bindRemoveEntity({
      trash: trash,
      entityType: REDIRECT_ENTITY_TYPE
    }),
    removeWidget: removeEntityWithoutBlocker({ remove: bindWidgetRemoval({ trash }) }),
    forgetRemovedMedia: bindForgetRemovedEntity({
      repo: trashRepo,
      entityType: MEDIA_ENTITY_TYPE
    }),
    forgetRemovedPost: bindForgetRemovedEntity({
      repo: trashRepo,
      entityType: POST_ENTITY_TYPE
    }),
    // The 60-day backstop's one pass. `createServingApp` owns the timer that calls it, so it runs
    // only in a site-serving process — never in the exporter or the agent daemon.
    sweepTrash: createTrashSweep({
      repo: trashRepo,
      adapters: trashAdapters,
      transaction: ({ work }) => trashTransaction(work),
      entityPolicy: ({ entityType }) => (trashAdapters).has(entityType)
    }),
    // Read on every call; see `TrashDeps.isTrashableEntityType`.
    isTrashableEntityType: ({ entityType }) => trashAdapters.has(entityType),
    // `TrashDeps.registry`/`db` — read by `moveToTrash` (`POST .../trash/items`) and by
    // `permissions.ts`'s registry-based permission lookup, both via this same `routeDeps` object.
    registry: trashRegistry,
    db: sqliteTrashDb,
    postRepo,
    postGoLiveCandidates: postRepo,
    postSearch: postSearchIndexFor(kernel, { ready: postSearchBackfillReady }),
    // SPEC-009 REQ-15 — `updatePost` looks the capture up per write, so whatever is bound in routing's
    // slot at that moment (`registerSlugChangeCapture` above) decides whether a rename leaves a redirect.
    slugChangeCapture: () => getSlugChangeCapture({}),
    // SPEC-047/ADR-056 — the db handle and clock are closed over here so no route ever holds one;
    // a route supplies only the `(workspaceId, postId)` scope. See `RouteDeps.pagesHtmlStore`.
    // `entryRefsRepo` (SPEC-047 Slice 3) is the same instance `RouteDeps.entryRefsRepo` below
    // exposes — one shared index, not a second writer. `revisions: postRepo` (S1, fix plan
    // 2026-09-24 row 14) is the SAME `postRepo` constructed above — one `post_revisions` ledger,
    // not a second writer of that either.
    // `outbox`: a published HTML page edit enqueues `entry.updated`, so site search reindexes it.
    docBodyAsPageHtml: renderDocBodyAsPageHtml,
    pagesHtmlStore: (scope, options: { allowedKinds?: ReadonlySet<import("#src/features/post/index").PostKind> } = {}) => new PagesHtmlDocumentStore(scope, { ...options, db: kernel, clock, entryRefsRepo, revisions: postRepo, outbox, validatePluginEmbeds: pluginExports.validateHtml }),
    // `chat` is the store's chat kernel (on SQLite, the sidecar `chat.db`, NOT `content.db` —
    // ADS-memory/reports/2026-09-05-db-split-scoping.md §6). None of these stores opens a database
    // itself.
    chatHistory: createChatStoreFactory({ store: chat }),
    chatRunLedger: createChatRunLedger({ store: chat }, { tracker }),
    // Migration `0051`'s table, over the same sidecar handle immediately above — see
    // `RouteDeps.agentSessions`'s own doc for why this is not principal-scoped like `chatHistory`.
    agentSessions: createSqliteAgentSessionStore({ store: chat, clock }),
    // G3 "Allow for this chat": with the conversation, over the same sidecar handle.
    conversationToolApprovals: createSqliteConversationToolApprovalStore({ store: chat }),
    ...compositionApprovalOverrides({ overrides }),
    presentationRepo,
    settingsRepo,
    getEffective,
    set: (required, optional) => set(required, {
      ...optional,
      preparePreviewSwitcherWrite: async write => preparePreviewSwitcherWrite({ write, themes: siteThemes, workspaceId: workspaceId, activeThemeId: await resolveActiveThemeId({ presentationRepo, workspaceId: workspaceId }) }),
      canEnablePublicAssistant: async ({ workspaceId }) => (await resolvePublicAssistantAvailability({
        repo: siteAssistantCredentialRepo, sealer: siteAssistantSecretSealer, workspaceId,
      })).ready,
    }),
    instructionsNamespace: INSTRUCTIONS_NAMESPACE,
    seoReady,
    seoDeps,
    sitemapService,
    settingsReady,
    assistantSettingsReady,
    visitorToolsManagement: composeVisitorToolsManagement({ workspaceId, ready: assistantSettingsReady,
      settings: { repo: settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals } }),
    // See `routes/types.ts`'s `adminAssistantEnabled` field doc — read once here, mirroring
    // `apps/website/src/server/runtime/composition/app.ts`'s `createRouteDeps()`.
    adminAssistantEnabled: isAdminAssistantEnabled(),
    siteAssistantCredentialRepo,
    siteAssistantSecretSealer,
    siteAssistantSecretKeyring,
    // Transfer uses this composition's exact chat store, including any TOVU_CHAT_DB override.
    // Online backup includes WAL writes; copying the database file alone would silently omit them.
    databaseTransferChatSnapshot: async () => {
      const dir = await mkdtemp(join(tmpdir(), "tovu-transfer-chat-"));
      try {
        const snapshotPath = join(dir, "chat.db");
        await chat.backupTo(snapshotPath);
        return await readFile(snapshotPath);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    databaseTransferDestinationStore: new SealedDatabaseDestinationStore({ repo: new DatabaseDestinationRepo(kernel), sealer: siteAssistantSecretSealer, keyring: siteAssistantSecretKeyring }),
    // The ADMIN's own BYOK credential store — reuses the SAME sealer/keyring instances just above
    // (see `routes/types.ts`'s `adminExecutionCredentialRepo` doc for why one shared sealing
    // capability is correct here rather than a third `EnvOrFileKeyring` instance).
    adminExecutionCredentialRepo: new SqliteAdminExecutionCredentialRepo({ store: kernel }),
    // Same shared sealer/keyring again — one sealing capability across all three credential tables.
    mediaProviderCredentialRepo: new SqliteMediaProviderCredentialRepo(kernel),
    externalMcpServerRepo,
    bundledSourceRoot: bundledAgentPluginsDir(),
    mcp: agentPluginMcp,
    preferences: composeAgentPluginPreferences({ settings: { repo: settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals }, read: getEffective, write: (required, optional) => routeDeps.set(required, optional) }),
    providerFaces: composePluginProviderFaces({ workspaceRoot: () => agentPluginLayout.forWorkspace({ workspaceId }).root }),
    notifyRosterChanged: notifyExternalMcpRosterChanged,
    builtInExternalMcpServerIds: readBuiltInExternalMcpServerIds({ env: process.env }),
    externalMcpToolApprovalRepo: new SqliteExternalMcpToolApprovalRepo({ store: kernel }),
    /**
     * ADR-058 sealing again, one more consumer: the OAuth subsystem for `authMode: "oauth"`
     * external MCP connections. Built HERE rather than inside `modules/external-mcp.ts` because its
     * device begin/poll must use the same durable store. Redirect state carries its own encrypted
     * verifier and binding between the daemon and the callback, using this root's site key.
     * See `routes/types.ts`'s `externalMcpOAuthDevices` doc for the shared store's lifetime.
     */
    externalMcpOAuth: createExternalMcpOAuthService({
      httpPorts: externalMcpOAuthHttpPorts,
      workspaceId,
      repo: externalMcpServerRepo,
      sealer: siteAssistantSecretSealer,
      keyring: siteAssistantSecretKeyring,
      clock,
      devices: externalMcpOAuthDevices,
      ...compositionSharedOAuth(),
      onConnected: createApplyConnectDefaults({ agentPluginLayout, workspaceId, repo: externalMcpServerRepo, applyAccess: input => routeDeps.mcp.applyAccess(input), clock, notifyRosterChanged: notifyExternalMcpRosterChanged, projections: agentPluginMcp.projections, classifyError: agentPluginMcp.classifyError }),
    }),
    externalMcpOAuthDevices,
    // See `routes/types.ts`'s `derivedPublicOrigin` doc; computed above with the plugin connection seams.
    derivedPublicOrigin,
    passkeyOrigin: process.env.TOVU_PUBLIC_URL,
    ...agentPluginConnections,
    // Same shared sealer/keyring once more — see the note above the BYOK repo.
    executionSettingsReady,
    settingsUiTabsReady,
    analyticsSettingsReady,
    siteTitleReady,
    siteConsentReady,
    consentStore: createSiteConsentStore({ kernel, workspaceId }),
    publicPageSecurityHeaders: () => publicPageSecurityHeaders({ formCollectionProviders: () => formCollectionProviders() }),
    pluginExportHosts: () => pluginExports.declaredHosts({ workspaceId }),
    ...compositionConsentOptions({ workspaceId, loadContributions: agentPluginLifecycle.loadPluginContributions }, { env: process.env }),
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
      createPostRevertRegistry({
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
      { menuRepo, clock, idGen, outbox }
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
    ...identity,
    principalRepo: settingsPrincipals,
    // Overrides `identity`'s placeholder default (`undefined`/`async () => false`) — see
    // `wiring.ts`'s `IdentityRouteDepsSlice.removeUser` doc. Must stay AFTER `...identity` above.
    removeUser,
    isInTrash,
    redirectRepo,
    redirectHitSink,
    originRegistry,
    redirectsWriteDeps,
    // ADR-046 Phase 1 (2026-07-16): durable SQLite adapters — already fully built and
    // contract-tested, wired into a real composition root for the first time.
    memberRepo,
    removeMember: bindRemoveEntity({ trash, entityType: "member" }),
    memberTierRepo: new SqliteMemberTierRepo({ store: kernel }),
    memberSubscriptionRepo: new SqliteMemberSubscriptionRepo({ store: kernel }),
    memberSessionRepo: new SqliteMemberSessionRepo({ store: kernel }),
    magicLinkRepo: new SqliteMagicLinkTokenRepo({ store: kernel }),
    // SPEC-022 REQ-09/REQ-10: every send routes through the purpose-scoped seam. No capability
    // had a durable outbox path in Phase 1 (see capability-inventory.ts's "outbox" entry). Forms
    // now has isolated recipient jobs; other capabilities still fail the readiness gate; in `local` mode (the
    // default) the gate never refuses regardless (INV-06). `resolvedMailer.mailer` (built above,
    // ahead of this object literal) is the boot-time-resolved real-or-console adapter — see
    // `resolve-mailer.ts`'s own header for the hosted-API/SMTP/console resolution order and the
    // disclosed startup race.
    mailer: wrapMailerWithPurposeGate({
      inner: resolvedMailer.mailer,
      mode: runtimeMode,
      durableOutboxReady: mailDurableOutboxReady,
    }),
    settleMailer: resolvedMailer.settle,
    mailStatus: resolvedMailer.status,
    setAgentPluginEnabled: resolvedMailer.setAgentPluginEnabled,
    mailProviderControl: { check: resolvedMailer.checkProvider, select: resolvedMailer.selectProvider, readSelection: resolvedMailer.readProviderSelection, describe: resolvedMailer.describeProviders, invalidate: resolvedMailer.invalidate },
    // `dns_plan`/`dns_verify` `include: ["mail"]` read the provider's sender-domain records here.
    mailDomainRequirements: resolvedMailer.domainRequirements,
    // The From for members/newsletter/forms system mail (`platform/mail/sender-identity.ts`): the
    // site's `core.mail.*` setting, read fresh per send, checked against the settled mailer.
    ...resolvedMailer.operations,
    // Email page phase 4: send history over the ledgers, and the live purpose gate asked without sending.
    mailActivity: createMailActivityRepo({ db: kernel }),
    // Email page phase 5: the do-not-send list's operator side (list, audited removal) and feedback setup.
    mailSuppressionAdmin: createMailSuppressionAdminRepo({ db: kernel }),
    menuRepo,
    navLocationBindingRepo,
    removeMenu: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: "menu"
    }) }),
    // ADR-046 Phase 1 (2026-07-16): durable SQLite adapters, wired into a real composition root
    // for the first time. Delivery-worker activation itself stays gated (REQ-07/SPEC-022's
    // capabilityRouteGuard unconditionally contains "webhooks" in production mode regardless of
    // durability) until a Phase-1-follow-on spec supplies the rest of the production gate ADR-046
    // names for this row (guarded HttpClientPort, egress policy, worker lifecycle).
    webhookSubscriptionRepo: new SqliteWebhookSubscriptionRepo({ store: kernel }),
    webhookDeliveryRepo: new SqliteWebhookDeliveryRepo({ store: kernel }),
    // ADR-PIPE-015 Phase 1: the real KeyringPort-backed signer (GAP-02/GAP-03). Inert until
    // Phase 4 registers the fan-out subscriber + delivery worker — no route calls this directly
    // yet, so wiring it now carries no live-traffic risk ahead of that gated activation.
    webhookSigner: createKeyringBackedSigner(newsletterKeyring),
    // ADR-046 Phase 1 (2026-07-16): durable SQLite adapters for all four route-consumed media
    // repos — previously in-memory (ADR-027 walking skeleton, rows lost on every restart). Bytes
    // already used the real `LocalFsBlobStore` (unlike `apps/website/src/server/runtime/composition/app.ts`'s hermetic-test
    // composition) since durable byte database was always the one piece of Media pointless to fake
    // in the actual running server.
    mediaRepo,
    assetBlobRepo,
    assetRenditionRepo,
    mediaContentTypeStore,
    blobStore,
    documentTextExtractors: [createUnpdfDocumentTextExtractor({}),
      createMammothDocumentTextExtractor({ archiveReader: createShareArchiveReader({ yauzl: importYauzl }) })],
    // Boot-time blob hydration readiness — see the `blobHydrationReady` construction above (hoisted
    // alongside `blobStore` itself) for why this is fired independently and exposed here.
    blobHydrationReady,
    // The opt-in boot password reset's completion — see its construction above and
    // `routes/types.ts`'s `adminPasswordResetReady` doc.
    adminPasswordResetReady,
    // ADR-027 §4 transform registry + rendition generation: registry rows are now durable too
    // (ADR-046 Phase 1). The real running server gets `SharpImageTransformer` (unlike
    // `apps/website/src/server/runtime/composition/app.ts`'s hermetic-test composition, which uses the deterministic in-memory
    // double). `sharp` is a pinned, installed dependency (`package.json`) — this stale "not
    // installed" note was flagged by the 2026-07-15 `/audit-work` batch (ADR-046 finding B-01)
    // and corrected here and in ADR-046 itself. See `src/media/image-transformer.sharp.ts`'s file
    // header for the still-real lazy-require rationale.
    transformDefinitionRepo,
    imageTransformer: new SharpImageTransformer(),
    imageCodec: new SharpImageTransformer(),
    // SPEC-011 (Newsletter): real SQLite adapters for all 6 repo ports (the campaign pair is
    // Drizzle-backed; the 5 `p_newsletter__*` tables are raw-SQL, `declareDataModule()`-created —
    // see `newsletterReady` above). `membersConsentCapability` stays `null` (unbound) — Members has
    // not shipped a real capability this pass (ADR-PIPE-011 Risks item 3); Newsletter must not
    // substitute a local stand-in that returns success by default.
    newsletterReady,
    newsletterCampaignRepo: new SqliteNewsletterCampaignRepo({ store: kernel }),
    newsletterListRepo,
    newsletterSubscriptionRepo: new SqliteNewsletterSubscriptionRepo({ store: kernel }),
    newsletterAudienceSnapshotRepo: new SqliteNewsletterAudienceSnapshotRepo({ store: kernel }),
    newsletterSendRepo: new SqliteNewsletterSendRepo({ store: kernel }),
    newsletterConfirmationTokenRepo: new SqliteNewsletterConfirmationTokenRepo({ store: kernel }),
    membersConsentCapability: null,
    // Stage 5 (routes) wiring — see the hoisted-vars comment above `commentsModule`/return.
    newsletterSubscriberDirectory,
    newsletterKeyring,
    newsletterHooks,
    // SPEC-010 (Forms, Tier-1 sample plugin, ADR-PIPE-010): the real SQLite rule-of-two adapters
    // (unlike the several "no SQLite adapter yet" libraries noted above — Forms' C-012 ports both
    // ship one). `formsRateLimiter` is one process-lifetime counter store, matching
    // `apps/website/src/server/runtime/composition/app.ts`'s hermetic-test composition's identical construction.
    formDefinitionRepo,
    formCollectionProviders: () => formCollectionProviders(),
    formSubmissionRepo,
    formSubmissionAttempts: formSubmissionAttemptsFor({ submissionRepo: formSubmissionRepo }),
    removeFormSubmission: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: "form_submission"
    }) }),
    executeCommand,
    formsRateLimiter: createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock }),
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
      createApp(routeDeps, {
        ...(themeId === undefined ? {} : { themeIdOverride: themeId }),
        ...(consentAudit ? { consentAudit } : {}),
      }),
    siteAppBootWork,
    // 2026-08-20 (RouteDeps-narrowing pass 2) — same nullary-closure conversion, same reasoning, same
    // TEST GOTCHA.
    resolveStorefrontProducts: () => resolveStorefrontProducts(routeDeps),
    // 2026-09-03 — see `routes/types.ts`'s `resolveActiveThemeId`/`listPublishedPosts` docs and
    // `apps/website/src/server/runtime/composition/app.ts`'s identical binding. Same nullary-closure-over-`routeDeps` shape as
    // `resolveStorefrontProducts` immediately above.
    resolveActiveThemeId: () => resolveActiveThemeId(routeDeps),
    listPublishedPosts: () =>
      listPublishedPosts({ deps: { repo: routeDeps.postRepo }, input: { workspaceId: routeDeps.workspaceId } }),
    // 2026-08-16 rework — see `routes/types.ts`'s `publishHistoryStore` doc. Real, DB-backed;
    // `apps/website/src/server/runtime/composition/app.ts`'s hermetic composition uses `InMemoryPublishHistoryStore` instead.
    publishHistoryStore: new SqlitePublishHistoryStore({ store: kernel }),
    // 2026-08-15 (Contract v2) — see `routes/types.ts`'s `publishExecutionMode` doc.
    publishExecutionMode: executionModeFromEnv(),
    // Read ONCE here rather than deep in `static-publish/adapter.ts` — see
    // `resolvePublishOutputRootDir`'s own doc above and `routes/types.ts`'s `publishOutputRootDir`
    // doc.
    publishOutputRootDir: resolvePublishOutputRootDir({ siteDir: resolvedSiteBinding.dir }),
    // See `routes/types.ts`'s `loadDeployTargets` doc: the installed, activated deploy Agent Plugin.
    loadDeployTargets: ({ workspaceId }) => loadDeployTargetRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions }),
    loadInstalledDeployTargets: ({ workspaceId }) => loadInstalledDeployTargets({ workspaceId,
      loadContributions: agentPluginLifecycle.loadPluginContributions,
      readEnabled: async ({ workspaceId, pluginId }) => {
        const activation = await agentPluginLifecycle.resolveAgentPluginActivation({ workspaceRoot: agentPluginLayout.forWorkspace({ workspaceId }).root, pluginId });
        return activation.verdict === "undetermined" ? null : activation.verdict === "active";
      },
    }),
    loadDeployWorkflowFiles: input => loadDeployWorkflowFiles({ ...input, loadContributions: agentPluginLifecycle.loadPluginContributions }),
    loadDeployOps: (ctx) => loadDeployOpsRegistry(ctx, { loadContributions: agentPluginLifecycle.loadPluginContributions }),
    loadSourceControlProviders: ({ workspaceId }) => loadSourceControlProviderRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions }),
    loadPluginCredentialCards: (workspaceId) => loadMailCredentialCards({ loadMailAdapters: () => loadMailAdapterRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions }) }),
    loadAuthSchemes: async (ctx) => (await loadCredentialSchemeRegistry(ctx, { loadContributions: agentPluginLifecycle.loadPluginContributions })).rules,
    // 2026-08-16 — see `routes/types.ts`'s `publishCredentialVerificationCache` doc. Deliberately
    // in-memory, not DB-backed — one instance per process (this function runs once per boot, per
    // `index.ts`/`agent-daemon-server.ts`'s own call sites), same singleton lifetime
    // `siteAssistantSecretSealer` above already has.
    publishCredentialVerificationCache: new InMemoryPublishCredentialVerificationCache(),
    // 2026-08-15 — see `routes/types.ts`'s `sourceControlCredentialSetRepo` doc. Sealed via the
    // same shared sealer/keyring the credential repos above already reuse (no third
    // `EnvOrFileKeyring` instance).
    // Its rows: this site's own, then the project's (owner 2026-10-25).
    sourceControlCredentialSetRepo: new SqliteSourceControlCredentialSetRepo(kernel, {
      ...credentialProject({ projectVault, repo: vault => new TovuCredentialSetVaultAdapter<SourceControlCredentialSetRecord>({ vault, kind: "source-control" }) }),
      canonical: sourceControlKeyBinding({ credentials: { repo: customCredentialSetRepo, keyring: siteAssistantSecretKeyring, sealer: siteAssistantSecretSealer, clock, idGen },
        loadProviders: ({ workspaceId }) => loadSourceControlProviderRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions }) }),
    }),
    // Read ONCE here rather than deep in `source-control/commit-site.ts` — see
    // `resolveSourceControlExportRootDir`'s own doc above and `routes/types.ts`'s
    // `sourceControlExportRootDir` doc.
    sourceControlExportRootDir: resolveSourceControlExportRootDir({ siteDir: resolvedSiteBinding.dir }),
    // 2026-08-16 (Phase 3) — see `routes/types.ts`'s `vendorCredentialSetRepo` doc. Sealed via the
    // same shared sealer/keyring the two legacy credential repos above already reuse (no third
    // `EnvOrFileKeyring` instance). Its rows: this site's own, then the project's (owner 2026-10-25).
    vendorCredentialSetRepo: new SqliteVendorCredentialSetRepo(kernel, credentialProject({ projectVault, repo: vault => new VendorCredentialSetVaultRepo({ vault, kind: "vendor", vendor: true }) })),
    // 2026-08-17 — see `routes/types.ts`'s `customCredentialSetRepo` doc. Sealed via the same
    // shared sealer/keyring the credential repos above already reuse (no third `EnvOrFileKeyring`
    // instance). Same instance `resolvedMailer` above was built from — not a second repo.
    customCredentialSetRepo,
    // See `routes/types.ts`'s own doc — a genuinely separate `HttpClientPort` instance from
    // `resolvedMailer`'s, built above.
    customCredentialsHttpClient,
    siteBackupHttpClient,
    deployOpsHttpClient: createDefaultHttpClient({ policy: SINGLE_HOP_HTTPS_EGRESS_POLICY }, { observability }),
    // 2026-09-06 — see `routes/types.ts`'s `mediaImportHttpClient` doc. A third instance, built
    // above from `MEDIA_IMPORT_EGRESS_POLICY` rather than `SINGLE_HOP_HTTPS_EGRESS_POLICY`.
    mediaImportHttpClient,
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

  // Owner decision 6 (2026-09-21): the widgets the retired "delete permanently" rung left behind
  // (payload status `purged`/`trash`) go into the Trash, once — idempotent, so every later boot finds
  // none and logs nothing. Waits for every boot-time SQLite writer above to settle first (the shared-
  // connection transaction hazard `seoReady`'s comment documents); fire-and-forget, logged, never
  // aborts boot.
  const widgetAdoptionReady = Promise.allSettled([siteTitleReady, menuBindingsReady, mediaTransformReady])
    .then(() => adoptLegacyTrashedWidgets({ deps: buildWidgetsDeps(routeDeps), input: { workspaceId } }))
    .then(({ adopted }) => {
      for (const widget of adopted) {
        consoleLogger.info({ message: `[trash] moved legacy deleted widget '${widget.id}' ("${widget.title}") to the Trash` });
      }
    })
    .catch((err) => {
      consoleLogger.error({ message: `adoptLegacyTrashedWidgets failed at boot: ${(err as Error).message}` });
    });

  // Keep the boot-tail contract used by shutdown. Legacy credentials are folded once by 0012;
  // recurring copies would resurrect a credential deleted from the vault.
  routeDeps.legacyPublishCredentialsReady = widgetAdoptionReady;

  // Form destinations: a published static site's receiver (a plugin's form destination, selected by
  // the site's `core.forms` setting) stores submissions; publishing hands it the active forms and a
  // receiver key, and the pull imports what it stored (`form-submissions.ts`).
  const formSubmissions = composeFormSubmissions({
    formDefinitionRepo: routeDeps.formDefinitionRepo, formSubmissionRepo: routeDeps.formSubmissionRepo,
    receipts: new SqlFormSubmissionReceiptRepo(kernel), pullLeases: new SqlFormPullLeaseRepo({ kernel }), outbox, bus, clock, idGen,
    credentials: { repo: customCredentialSetRepo, sealer: siteAssistantSecretSealer, keyring: siteAssistantSecretKeyring, clock, idGen },
    loadFormDestinations: ({ workspaceId }, _optional = {}) => loadFormDestinationRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions }),
    settingsRepo,
  }, { observability });
  routeDeps.formDestination = formSubmissions.destination;
  routeDeps.formSubmissionsPull = formSubmissions.pull;
  routeDeps.formSubmissionsAutoPull = formSubmissions.autoPull;

  // Durable delivery of each new submission to the `core.forms/deliveryBindings` destinations: one
  // outbox child job per binding, its credential resolved fresh per attempt (a plugin's OAuth
  // connection first, else a saved custom credential), status read back from the same rows. The
  // integrations module starts the subscriptions once per bus.
  routeDeps.formDeliveryStatus = formDeliveryRepo;
  routeDeps.formDelivery = composeFormDelivery({
    bus, plans: formDeliveryRepo, settingsRepo, idGen, clock,
    formDefinitionRepo: routeDeps.formDefinitionRepo, formSubmissionRepo: routeDeps.formSubmissionRepo,
    deliver: composeFormDeliveryDeliverer({
      apiConnections: agentPluginConnections.apiConnections,
      loadRegistry: ({ workspaceId }) => loadFormDestinationRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions }),
      credentials: { repo: customCredentialSetRepo, sealer: siteAssistantSecretSealer },
      kit: createDeployHostKit({ observability }),
    }),
  });

  // Site search (lots S4-S6): registry, query service and indexer, built once per composition so the
  // public route, the bus subscription (`app.ts`), the serving loop (`serving-app.ts`) and the
  // assistant's search tools share one registry. See `modules/site-search.ts`'s header for the vendor
  // credential labels (`Tovu Search — <Provider label>`), index names and the empty built-in slot.
  // Vendor calls go through the shared single-hop public-HTTPS policy, like hosted mail adapters.
  routeDeps.siteSearch = createSiteSearchRuntime(bindSiteSearchPorts({
    workspaceId, kernel, now: clock.nowMs, settingsRepo,
    settingsWriteDeps: { repo: settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals },
    keyring: siteAssistantSecretKeyring,
    resolveCredentialByLabel: (input) => resolveCustomCredentialByLabel({ repo: customCredentialSetRepo, sealer: siteAssistantSecretSealer }, input),
    resolveMemberContext: (input) => new DefaultMemberAccessResolver({
      sessions: routeDeps.memberSessionRepo, subscriptions: routeDeps.memberSubscriptionRepo, tiers: routeDeps.memberTierRepo,
    }).resolveContext(input),
    httpClient: createDefaultHttpClient({ policy: SINGLE_HOP_HTTPS_EGRESS_POLICY }, { observability }),
    loadContributions: agentPluginLifecycle.loadPluginContributions,
    // Fail closed: an unreadable activations file is `undetermined`, never active.
    isPluginActive: async ({ pluginId }) => (await agentPluginLifecycle.resolveAgentPluginActivation({ workspaceRoot: agentPluginLayout.root, pluginId })).verdict === "active",
  }), { storage: kernel, settingsReady: siteTitleReady });

  /** Bind OAuth to the optional project transaction owner; no service exists without a site id.
   * @complexity O(1) service construction; no network or storage calls. */
  function compositionSharedOAuth() {
    return projectStore && projectSiteId ? { shared: { ownerWorkspaceId: 'project', owner: createSharedOAuthOwnerStorage({ scope: projectStore.vault, clock }),
        bindings: createSiteOAuthBindings({ workspaceId, repo: siteReferenceRepo,
          vault: createApiConnectionVault({ repo: siteReferenceRepo, keyring: siteAssistantSecretKeyring, sealer: siteAssistantSecretSealer, clock, workspaceId }) }),
        attachments: projectStore.attachments, transaction: projectStore.transaction, siteId: projectSiteId, siteName: resolvedSiteBinding.name,
        ownerPrincipalId: identity.ownerPrincipalId, inventory: projectStore.inventory ? () => {
          if (!projectStore.inventory) throw new Error("shared OAuth has no project inventory service");
          return projectStore.inventory({});
        } : undefined } } : {};
  }

  const commerceBinding = compositionCommerce();

  /** Assemble the commerce runtime with this process's existing site and worker ownership.
   * @complexity O(1) composition; the commerce service owns subsequent bounded work. */
  function compositionCommerce() {
    return composeCommerce({ kernel: kernel as unknown as KyselyKernel<unknown>,
      workspaceId, siteId: projectSiteId || workspaceId, workspaceRoot: agentPluginLayout.forWorkspace({ workspaceId }).root,
      workerOwner: (overrides.storeRole ?? 'owner') === 'owner', workerDirectory: dbPath === ':memory:' ? resolvedSiteBinding.dir : dirname(dbPath),
      settingsRepo, providerConfig: providerConfigSource, providers: providerPlugins,
      // Commerce reads only registered setting definitions (ready with `siteSettingsReady`); gating it on `siteTitleReady` made /products wait on the legacy-title pin.
      settingsReady: siteSettingsReady,
      httpClient: { send: ({ request }, options) => createDefaultHttpClient({ policy: SINGLE_HOP_HTTPS_EGRESS_POLICY }, { observability }).send(request, options) }, clock, idGen,
    });
  }
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
  configureSiteSharing({}, {});

  function configureSiteSharing(_required: Record<string, never>, _options = {}): void {
    const sources = routeDeps.siteBackupSources;
    if (sources) {
      try {
        const contentRoots = [resolvedThemesDir, resolvedUploadsDir, agentPluginLayout.root, skillLayout.root, join(resolvedSiteBinding.dir, "plugins"), join(resolvedSiteBinding.dir, "overrides")];
        const registry = new SiteShareRegistry({ directory: resolveShareDirectory({ siteDir: resolvedSiteBinding.dir, dbPath, contentRoots }) });
        const credentials = composePublishCredentialSource({ workspaceId, executionMode: routeDeps.publishExecutionMode,
          dbDeps: { repo: routeDeps.vendorCredentialSetRepo, sealer: siteAssistantSecretSealer, loadDeployTargets: routeDeps.loadDeployTargets } });
        const resolveShareCredential = async ({ id }: { id: string }, _options = {}) => {
          const resolved = await credentials.resolve({ workspaceId, target: artifactStoreTarget({ id }) });
          return resolved.ok ? resolved : undefined;
        };
        const createShareHostKit = (_required: Record<string, never>, _options = {}) => {
          // Reuse the plugin's signing/PUT/DELETE owner; pin only the anonymous verification hop.
          // A normal publish's kit remains unchanged, including its observability.
          const kit = createDeployHostKit({});
          return { ...kit, fetch: async (url: string, init: RequestInit, options: { timeoutMs: number }) => {
            // A provider whose own upload/delete API goes through kit.fetch (not SigV4) keeps it.
            if (init.method !== "HEAD") return kit.fetch(url, init, options);
            const response = await guardedOutboundHttpClient.send({ request: { method: "HEAD", url, headers: {}, idleTimeoutMs: options.timeoutMs, totalDeadlineMs: options.timeoutMs, maxResponseBytes: 1024, signal: init.signal ?? undefined } }, { redirect: "error" });
            return new Response(null, { status: response.status, headers: response.headers });
          } };
        };
        // Token-bearing verification requests use the guarded HTTP owner without telemetry. Never
        // infer a recipient-facing URL from localhost, Host, or ephemeral deployment storage.
        routeDeps.siteShareBackend = createSiteShareBackend({ registry, site: workspaceId, zip: zipFolderFiles, savedKeys, ownerPrincipalId: identity.ownerPrincipalId,
          prepare: ({ signal, ...selection }) => prepareShareContent({ dbOps: routeDeps.dbOps, snapshotRoot: tmpdir(), sources, sanitize: sanitizeShareDatabase, blobStore, imageTransformer: routeDeps.imageTransformer, rewriteMedia: rewriteArchiveMedia, savedKeys, ...selection }, { signal, packageThemesRoot: routeDeps.packageThemesDir }),
          staticSite: {
            render: input => routeDeps.exportSiteBound({ ...input, includeThemePreviews: false }),
            now: () => new Date(routeDeps.clock.nowMs()),
            themes: () => routeDeps.themes.filter(theme => theme.status === "valid").map(theme => ({ themeId: theme.manifest.id, title: theme.manifest.name })),
            context: async () => {
              const context = await routeDeps.staticSiteContext();
              const creationZone = createSiteCreationTimeZone({ dir: resolvedSiteBinding.dir });
              const timeZone = await resolveSiteTimeZone({ settingsRepo, creationTimeZone: { read: () => creationZone.read() ?? Intl.DateTimeFormat().resolvedOptions().timeZone } }, { workspaceId });
              return { ...context, timeZone };
            },
          },
          delivery: selection => resolveShareDelivery({
            http: guardedOutboundHttpClient,
            peer: async () => {
              const rows = await routeDeps.publishContentPeerRepo.listByWorkspace({ workspaceId });
              const connected = selectConnectedDestination({ rows });
              if (!connected || selection.binding !== undefined && selection.binding !== connected.baseUrl) return undefined;
              const credential = await resolvePublishDestinationCredential({ deps: { repo: routeDeps.publishContentPeerRepo,
                sealer: siteAssistantSecretSealer, keyring: siteAssistantSecretKeyring, httpClient: publishContentPeerHttpClient },
              input: { workspaceId, id: connected.id } });
              return { credential, httpClient: publishContentPeerHttpClient };
            },
            ...(process.env.TOVU_SHARE_PUBLIC_ORIGIN && process.env.TOVU_SHARE_PERSISTENT_STORAGE === "1" ? {
              runtime: () => {
                const publicOrigin = process.env.TOVU_SHARE_PUBLIC_ORIGIN;
                if (!publicOrigin) throw new Error("site share delivery has no public origin");
                return createRuntimeShareDelivery({ registry, site: workspaceId, publicOrigin, http: guardedOutboundHttpClient });
              },
            } : {}),
            objectStore: async () => {
              // Any object-store provider that can deliver artifacts (not one hard-coded deploy target);
              // the site's media choice wins so media and shares share one provider and connection.
              // Revoke passes the share's saved provider, so only that store may delete it.
              const chosen = await selectArtifactStoreProvider({ loaded: await mediaStorePorts().loadSiteRegistry(), preferredId: await readMediaObjectStoreSetting({ settingsRepo, workspaceId }),
                resolveCredential: resolveShareCredential },
              selection.provider === undefined ? {} : { savedProvider: selection.provider });
              if (!chosen) return undefined;
              const target = artifactStoreTarget({ id: chosen.id }), resolved = chosen.credential;
              const store = chosen.provider.createArtifactStore({ credential: toDeployTargetCredential(resolved), config: {}, kit: createShareHostKit({}) });
              return { provider: target, binding: artifactStoreBinding({ store, credential: resolved }), store };
            },
          }, selection),
        });
      } catch (error) {
        console.error("[site-share] Private share storage unavailable; sharing is disabled:", error);
        routeDeps.siteShareBackend = undefined;
      }
    }
  }
  configureSiteImports({}, {});

  function configureSiteImports(_required: Record<string, never>, _options = {}): void {
    // Import needs local site creation and a known sites home, not the switcher: desktop serves
    // `<home>/<name>` pinned and starts its own sites, so it has no supervisor here.
    const importBase = siteCreationBaseForBinding({ binding: resolvedSiteBinding });
    if (importBase !== null) {
      const importSupervisor = localSiteSupervisorForHost({ binding: resolvedSiteBinding, workspaceId });
      const workspace = createSitesWorkspace({}, { cwd: importBase });
      routeDeps.siteImportBackend = composeSiteImportBackend({ workspaceId, workspace, savedKeys,
        // Wait for the new site to answer, so the import's "Open" link never points at a port still booting.
        startSite: async input => importSupervisor ? startLocalSiteWhenRunning({ supervisor: importSupervisor, name: input.name }) : { adminUrl: null, status: "stopped" },
      }, { tracker, observability,
        setupBase: "/api/admin/v1/workspaces/" + encodeURIComponent(workspaceId) + "/site-imports",
        report: ({ importId, status }) => console.info("[site-import]", importId, status) });
    }
  }
  routeDeps.siteConsent = bindSiteConsentService({ deps: routeDeps });
  configureVisitorConsentAnalytics({ routeDeps, workspaceId });
  await registerContentAnalytics({ deps: { bus, tracker, workspaceId } });
  return routeDeps;
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
