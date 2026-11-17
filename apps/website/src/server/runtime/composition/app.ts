import { renderDocBodyAsPageHtml } from "#src/server/inbound/public-http/http/site/render/content-html";
import { composeMemoryComments } from "./memory-deps/slices/comments.js";
import { composeMemoryAgentPlugins } from "./memory-deps/slices/agent-plugins.js";
import { composeMemorySeo } from "./memory-deps/slices/seo-sitemap.js";
import { composeMemoryOutboundHttp } from "./memory-deps/slices/outbound-http.js";
import { composeMemoryTrash } from "./memory-deps/slices/memory-trash.js";
import { composePublishContentStores } from "./memory-deps/slices/publish-content-stores.js";
import { composeNavFormContentRepos } from "./memory-deps/slices/nav-form-content-repos.js";
import { composeTaxonomyTrashRepos } from "./memory-deps/slices/taxonomy-trash-repos.js";
import { composeOriginNewsletter } from "./memory-deps/slices/origin-newsletter.js";
import { composeSiteTitleSettings } from "./memory-deps/slices/site-title-settings.js";
import { composeIdentitySettings } from "./memory-deps/slices/identity-settings.js";
import { createLazyProxy } from "./memory-deps/lazy-proxy.js";
import { composeMemoryRepos } from "./memory-deps/slices/repos.js";
import { composeMemberSecrets } from "./memory-deps/slices/member-secrets.js";
import { getExportRunSnapshot } from '../../../features/deployments/export-run.js';
import { getPublishRunSnapshot } from '../../../features/deployments/static-publish/publish-run.js';
import { registerWarmSiteRetirement } from '../lifecycle/warm-site-retirement.js';
import { notifyExternalMcpRosterChanged } from "../../../assistant/external-mcp-roster-change.js";
import { composeAgentPluginMcp, composeAgentPluginPreferences, composePluginProviderFaces } from "./agent-plugin-service-ports.js";
import { sanitizeShareDatabase } from "./site-portability.js";
import { SharpImageTransformer } from "@jini-ai/cms/media/node";
import { createSite } from "./site-dir.js";
import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import { createPluginExportRuntime } from "#src/features/agent-plugins/exports/runtime";
import { createPluginExportSource } from "#src/features/agent-plugins/exports/source";
import { readBundledDeployWorkflowFiles } from "#src/features/deployments/index";
import { composeVisitorToolsManagement } from "./visitor-tools-management.js";
import { preparePreviewSwitcherWrite } from "#src/features/theme/preview-switcher";
import { contentKernel } from '#src/platform/db/content-kernel';
import { createSiteConsentStore } from '#src/features/consent/revisions.repo';
import { bindSiteConsentService } from './site-consent.js';
import { toolGapsFromAuditEvents } from "@jini-ai/daemon/tool-audit";
import { createNativeAgentRuntime } from "@jini-ai/agent-runtime";
import { createAssistantAgentInventory } from "#src/assistant/agents";
import { createTovuPluginHost } from "./plugin-host.js";
import { composeAgentPluginConnections } from "./agent-plugin-connections.js";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { resolvePublishContentPeerHttpClient } from "./publish-content-http.js";
import { widgetCollectionListPort } from "../../../features/entries/public-list.js";
import { resolveMenuDoc } from "@jini-ai/cms/navigation";
import { RESERVED_SEGMENTS } from "#src/platform/routing/reserved-paths";
import { readBuiltInExternalMcpServerIds } from "#src/features/external-mcp/built-in-connections";
import { bindWidgetRemoval } from "#src/features/trash/index";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import { executeCommand } from "@jini-ai/cms/core";
import express from "express";
import { NO_PUBLISH_CONTENT_SEED_HASH, type PublishContentSeedHashFn } from "#src/features/publish-content/seed-hash";
import { randomUUID } from "node:crypto";
import { createNoopObservabilityPort } from "@jini-ai/diagnostics/observability";
import { InMemoryPostRepo, InMemoryPostSearchIndex, createPostRevertRegistry, listPublishedPosts } from "#src/features/post/index";
import { COMMENT_ENTITY_TYPE, unhideIfRemoveThrows, MEDIA_ENTITY_TYPE, THEME_ENTITY_TYPE, POST_ENTITY_TYPE, REDIRECT_ENTITY_TYPE, removeEntityWithoutBlocker, type TrashKindMover } from "#src/features/trash/index";
import { bindRemoveEntity, bindForgetRemovedEntity, createTrashSweep } from "@jini-ai/cms/trash";
import { createInMemoryRevocations } from "#src/features/publish-trust/revocations";
import { memoryPublishContentApplyPort, memoryPublishContentPorts } from "./memory-deps/slices/publish-apply.js";
import { executionModeFromEnv } from "#src/features/deployments/publish-credentials/index";
import { InMemoryPublishCredentialVerificationCache, InMemoryPublishHistoryStore } from "#src/features/deployments/static-publish/index";
import { loadBundledDeployOpsRegistry } from "#src/features/deployments/deploy-ops/registry";
import { loadBundledDeployTargetRegistry } from "#src/features/deployments/deploy-targets/registry";
import { loadBundledSourceControlProviderRegistry } from "#src/features/source-control/provider-registry";
import { loadBundledMailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import { loadMailCredentialCards } from "../boot/mail-provider-catalog.js";
import { loadBundledCredentialSchemeRegistry } from "#src/features/agent-plugins/auth-schemes";
import { createDefaultHttpClient } from "#src/platform/http/client";
import {
  CUSTOM_CREDENTIALS_EGRESS_POLICY,
  SINGLE_HOP_HTTPS_EGRESS_POLICY,
  MEDIA_IMPORT_EGRESS_POLICY,
} from "#src/platform/http/egress-policies";
import { InMemorySourceControlCredentialSetRepo } from "#src/features/source-control/index";
import { InMemoryVendorCredentialSetRepo } from "#src/features/deployments/publish-credentials/repo.memory";
import { InMemoryPagesHtmlDocumentStore } from "#src/features/pages/index";
// 2026-09-05 (fix-cycle) — used to be a lazy `require()` here; see `runExportSite`'s doc below for
// why a plain static import is now correct.
import { exportSite } from "#src/features/site-export/index";
import { createInMemoryChatHistory, createInMemoryAgentSessionStore, InMemoryAdminExecutionCredentialRepo, InMemoryExternalMcpToolApprovalRepo, createInMemoryConversationToolApprovalStore } from "../../../assistant/index.js";
// Deep-imported rather than routed through the barrel above: `assistant/index.ts`'s Section D
// ("Admin Daemon Proxy / Process Composition") is documented as consumed by the DAEMON's own proxy
// composition (`apps/website/src/server/runtime/composition/modules/assistant.ts`) — this route is the opposite of that, a plain static
// page served by THIS website server for the browser's iframe to load directly (see the route's own
// module doc). Filing it under Section D would misdescribe it. `app.ts` is a composition root
// (`.dependency-cruiser.mjs`'s `COMPOSITION_ROOTS`), exempt from `no-deep-imports:assistant` for
// exactly this reason — the same exemption `express.static`'s `/agent-icons` mount below relies on.
import { InMemoryPresentationSettingsRepo, resolveActiveThemeId } from "#src/features/presentation/index";
import { InMemorySettingsRepo, getEffective, set, INSTRUCTIONS_NAMESPACE } from "#src/features/settings/index";
import { discoverAllBuiltInThemes, resolveActiveTheme, NO_THEME_ID } from "#src/features/theme/index";
import { createThemeTrashAdapter } from "#src/features/theme/theme-trash";
import { InMemoryWorkspaceRepo } from "#src/features/workspace/index";
import { createInMemoryToolAttemptAuditSink } from "#src/features/tool-audit/repo.memory";
import { bundledAgentPluginsDir, builtInThemesDir, defaultContentDbPath, mediaUploadsDir, resolveExportOutputRootDir, resolvePublishOutputRootDir, resolveSiteStoragePaths, resolveSourceControlExportRootDir } from "./site-paths.js";
import { deriveDevScheme, resolveDevTls, resolveDevTlsCertPaths } from "../../../platform/http/dev-tls.js";
import { describeSiteBinding, resolveCheckoutRoot } from "#src/platform/site-dir/index";
import {
  seededPosts,
  seededPresentation,
  seededWorkspace,
  SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID,
} from "../configuration/seed.js";
import { createLocalAnalyticsSink } from "#src/features/analytics/jini-adapters";
import { ConsoleMailerAdapter, InMemoryMagicLinkTokenRepo, InMemoryMemberSessionRepo, InMemoryMemberSubscriptionRepo, InMemoryMemberTierRepo } from "#src/features/members/index";
import { registerMenuReverters } from "#src/features/navigation/index";
import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "#src/features/webhooks/index";
import { createKeyringBackedSigner } from "#src/features/webhooks/signing.keyring";
import { InMemoryMediaProviderCredentialRepo } from "#src/features/media/provider-credential-store.memory";
import { InMemoryImageTransformer } from "#src/features/media/index";
import { InMemoryNewsletterAudienceSnapshotRepo, InMemoryNewsletterCampaignRepo, InMemoryNewsletterConfirmationTokenRepo, InMemoryNewsletterSendRepo, InMemoryNewsletterSubscriptionRepo } from "#src/features/newsletter/repo.memory";
import { ensureDefaultList } from "#src/features/newsletter/lists";
import type { NewsletterRouteDeps } from "../../inbound/admin-http/routes/newsletter/deps.js";
import { FORMS_SUBMIT_PROFILE } from "#src/features/forms/rate-limit-profile";
import { formSubmissionAttemptsFor } from "#src/features/forms/index";
import { redirectMatcher, RedirectSlugChangeCapture, registerRedirectHitOutboxHandler, type RedirectsWriteDeps } from "@jini-ai/cms/redirects";
import { registerRedirectsPhaseHandlers } from "#src/features/redirects/phase-handler";
import { getSlugChangeCapture, registerSlugChangeCapture } from "#src/platform/routing/adapter";
import { InMemoryDbOpsAdapter, InMemoryDatabaseIntrospectionAdapter, InMemoryMigrationRunsRepo, InMemorySiteStatusRepo, InMemoryDatabaseLedgerRepo } from "#src/features/database/repo.memory";
import { InMemoryPluginActivationRepo } from "@jini-ai/plugins/host";
import { readAdminChartProviderSnapshot } from "./chart-providers.js";
import { RECHARTS_RUNTIME_SOURCE, RECHARTS_BROWSER_APPROVAL, RECHARTS_DEFAULT_PROVIDER } from "./charts-recharts-source.js";
import { createSiteConsentReadiness } from "#src/features/consent/settings";
import { WORD_COUNT_RUNTIME_SOURCE } from "#src/features/plugin-runtime/built-ins/word-count/index";
import { CONTENT_ANALYZER_RUNTIME_SOURCE } from "#src/features/plugin-runtime/built-ins/content-analyzer/index";
import { createDeclaredContentTypePorts } from "./declared-content-types.js";
import { deferDeclaredContentTypePorts } from "@jini-ai/plugins/host";
import { createApplyConnectDefaults } from "#src/features/agent-plugins/apply-connect-defaults";
import { bindProviderFacePorts, followProviderActivations } from "#src/features/agent-plugins/provider-plugin-link";
import { composePluginRuntime } from "./plugin-runtime.js";
import { TOVU_CORE_EXTENSION_CLAIMS } from "./core-extension-claims.js";
import { resolveGalleryWidgetMedia } from "@jini-ai/cms/widgets/html";
import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import { wireCoreResolvers } from "@jini-ai/cms/widgets/resolvers";
import { createMenuPageTargetResolver } from "#src/features/navigation/page-target-resolver";
import { createNavMenuReadModel } from "#src/features/navigation/index";
import { createSettingsAnalyticsConfig } from "#src/features/analytics/config.settings";
import { createSiteTimeZonePort } from "#src/features/settings/site-timezone";
import { noopStampWatermark } from "#src/features/taxonomy/index";
import { AlwaysUnavailableWatermarkSource, RestorePointDeepLinkLookup } from "@jini-ai/db/recovery/lookup-adapters";
import { buildGatewayDeps, buildOwnerOnlyInstanceAuthorize } from "#src/contracts/core/gated-mutations/composition";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { wrapMailerWithPurposeGate } from "#src/platform/mail/purpose-scoped-mailer";

import { captureRouteError } from "../../inbound/shared/observability-middleware.js";
import { respondToOversizedBody } from "../../inbound/shared/json-body-parsers.js";
import { registerPluginContributionRoutes, createPluginRouteAuthPorts } from "../../inbound/public-http/routes/plugin-contributions.js";
import { resolveStorefrontProducts } from "../../inbound/public-http/routes/site/products.js";
import { createExternalMcpOAuthService } from "../../../features/external-mcp/external-mcp-oauth.js";
import { resolvePublicAssistantAvailability } from "../../../assistant/index.js";
import { createRateLimiter, SITE_ASSISTANT_PER_IP } from "#src/contracts/core/rate-limit/rate-limit";
import { isAdminAssistantEnabled } from "./admin-assistant-enabled.js";
import type { RouteDeps } from "../../routes/types.js";
// `type`-only, so it is erased and adds no runtime edge — used only to annotate
// {@link runExportSite} below.
import type { ExportEngine } from "#src/features/deployments/export-run";
import { createMediaProviderRegistry } from "@jini-ai/integrations/media-providers";
import type { CreateAppOptions } from "./create-app-options.js";
import { siteAppBootWorkByDeps } from "./site-app-boot-work.js";
import { subscribeSiteEventHandlersOnce } from "./site-event-subscriptions.js";
import { applyPublicMiddleware, registerAdminSpa, registerSiteIdlePark } from "./http-app/public-middleware.js";
import { mountPublicSite } from "./http-app/mount-public-site.js";
import { mountAdminData } from "./http-app/mount-admin-data.js";
import { mountAssistant } from "./http-app/mount-assistant.js";
import { mountAdminFeatures } from "./http-app/mount-admin-features.js";
import { mountAdminSystem } from "./http-app/mount-admin-system.js";
import { mountMembersNewsletter } from "./http-app/mount-members-newsletter.js";
import { mountCoreContent } from "./http-app/mount-core-content.js";

/**
 * @file HTTP composition root and route wiring.
 *
 * Purpose:
 * Assembles concrete adapters and exposes API endpoints.
 *
 * How it relates to the project:
 * - Default composition uses in-memory adapters seeded from `./seed` — this is
 *   what tests exercise (hermetic, no filesystem). The running server injects
 *   the SQLite composition from `./deps` instead (see `index.ts`).
 * - Triggers `processOutbox` after successful writes to deliver async events.
 * - SPEC-044: `CREATE_WORKSPACE`/list/get/update/delete now live in
 *   `modules/workspace.ts` (`createWorkspaceModule`), not inline here — the original unauthenticated
 *   `app.post("/workspaces", ...)` route this file used to own was moved to
 *   `routes/admin/workspace/create.ts` and hardened behind `AUTH_SESSION` + `workspace.manage`.
 *
 * Architectural role:
 * Keeps transport concerns (HTTP, status codes, request parsing) separate from
 * domain logic. Feature code remains reusable outside Express.
 */

export interface CreateRouteDepsOptions {
  readonly publishContentPeerHttpClient?: RouteDeps["publishContentPeerHttpClient"];
  readonly nativeApprovalMemory?: RouteDeps["nativeApprovalMemory"];
  readonly approvalIdentityForRun?: RouteDeps["approvalIdentityForRun"];
  readonly pluginFailureThreshold?: number;
  /** Site-installed plugin scan root, threaded to `composePluginRuntime`'s `discoverPlugins()`
   * call (REQ-02). Omitted by default — this composition root is documented "hermetic, no
   * filesystem" (see file header) and every existing caller relies on that; passing a real
   * directory here is opt-in, for a caller that specifically wants to exercise site-plugin
   * discovery through this in-memory root instead of `apps/website/src/server/runtime/composition/deps.ts`'s SQLite one. */
  readonly installDir?: string;
  /** D1 — the seed-version lookup this instance plans and applies imports against. Omitted means
   *  this hermetic root ships no seed ({@link NO_PUBLISH_CONTENT_SEED_HASH}); a two-instance test
   *  passes a real `createPublishContentSeedHash()` over a third instance standing in for the seed. */
  readonly publishContentSeedHash?: PublishContentSeedHashFn;
}

/** Preserve optional plugin-runtime overrides without turning absent values into explicit options.
 * @complexity O(1), no I/O. */
function inMemoryPluginRuntimeOptions({ options }: { options: CreateRouteDepsOptions }, _optional = {}) {
  return {
    ...(options.installDir === undefined ? {} : { installDir: options.installDir }),
    ...(options.pluginFailureThreshold === undefined ? {} : { failureThreshold: options.pluginFailureThreshold }),
  };
}

/** In-memory route deps seeded from `./seed`. Default for tests/dev. */
export function createRouteDeps(options: CreateRouteDepsOptions = {}): NewsletterRouteDeps & ByokToolSurfaceDeps {
  // TOVU_DB=memory can still serve public routes; anonymous audit traffic shares this bounded sink.
  const toolAttemptAuditSink = createInMemoryToolAttemptAuditSink({});
  const workspaceRepo = new InMemoryWorkspaceRepo({}, { initialRows: [seededWorkspace] });
  const postRepo = new InMemoryPostRepo({}, { initialRows: seededPosts });
  const presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [seededPresentation] });
  const settingsRepo = new InMemorySettingsRepo();
  // Canonical Jini clocks use milliseconds; existing CMS/DB host ports still read ISO timestamps.
  const clock = { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() };
  const idGen = { newId: () => randomUUID() };
  // Same one-switch rule as the SQLite composition (deps.ts): a provider plugin's linked agent plugin
  // face follows every write of its activation row. `agentPluginLayout` is declared further down;
  // the thunk only runs on a write, after composition finishes.
  const pluginActivationRepo = followProviderActivations({ repo: new InMemoryPluginActivationRepo(), workspaceId: seededWorkspace.id,
    ports: bindProviderFacePorts({ workspaceRoot: () => agentPluginLayout.forWorkspace({ workspaceId: seededWorkspace.id }).root }) });
  const pluginRuntime = composePluginRuntime({
    getPluginHost: () => routeDeps.pluginHost,
    workspaceId: seededWorkspace.id,
    clock,
    activationRepo: pluginActivationRepo,
    // content-analyzer (AW-7 Tier 2) is tier-2: compiled in, disabled until enabled, and its code
    // only ever runs in a fresh worker per call (`plugin-runtime.ts`'s tier-2 import seam).
    sources: [WORD_COUNT_RUNTIME_SOURCE, CONTENT_ANALYZER_RUNTIME_SOURCE, RECHARTS_RUNTIME_SOURCE],
    browserProviderApprovals: [RECHARTS_BROWSER_APPROVAL],
    bundledEnabledIds: [RECHARTS_RUNTIME_SOURCE.manifest.id],
    coreClaims: TOVU_CORE_EXTENSION_CLAIMS,
    // AW-7 Tier 1: plugins' declared content types go through core's own `registerContentType`.
    // Deferred: `contentTypeRepo`/`outbox` are declared further down, and enable never runs during
    // composition.
    declaredContentTypes: deferDeclaredContentTypePorts({
      build: () => createDeclaredContentTypePorts({ repo: contentTypeRepo, clock, ids: idGen, outbox }),
    }),
    ...inMemoryPluginRuntimeOptions({ options }),
  });
  const { settingsPrincipals, analyticsSettingsReady, settingsReady, commentsSettingsReady, identity, seoReady, assistantSettingsReady, executionSettingsReady, settingsUiTabsReady } = composeIdentitySettings({ clock, idGen, settingsRepo });
  const { siteTitleSettingsDeps, siteSettingsReady, siteTitleReady, siteTitlePreservationStore } = composeSiteTitleSettings({ settingsRepo, clock, idGen, settingsPrincipals, analyticsSettingsReady });
  const { originRegistry, newsletterListRepoInMemory } = composeOriginNewsletter({ clock });
  const { taxonomyDb, workspaceId, outbox, redirectRepo, commentRepo, mediaRepo, formSubmissionRepo, entryRepo, sqliteTrashDb, bus, redirectHitSink, assetRenditionRepo, restorePointsRepo } = composeMemoryRepos();
  const { trashRegistry, termRepo, taxonomyFollowUpTermRepo, trashRepo, taxonomyFollowUpRevisions, taxonomyFollowUpOutbox, taxonomyRepo, entryTermRepo, taxonomyRevisionRepo } = composeTaxonomyTrashRepos({ taxonomyDb, workspaceId, outbox, clock, idGen });
  const { trash, trashAdapters, formTrashEntry, removePlugin } = composeMemoryTrash({ pluginRuntime, pluginActivationRepo, trashRegistry, taxonomyFollowUpTermRepo, trashRepo, taxonomyFollowUpRevisions, taxonomyFollowUpOutbox, outbox, clock, idGen, postRepo, redirectRepo, commentRepo, mediaRepo, formSubmissionRepo, entryRepo, sqliteTrashDb, formDefinitionRepo: () => formDefinitionRepo, entryRefsRepo: () => entryRefsRepo, menuRepo: () => menuRepo, navLocationBindingRepo: () => navLocationBindingRepo, routeDeps: () => routeDeps });

  const redirectsWriteDeps: RedirectsWriteDeps = {
    repo: redirectRepo,
    remove: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: REDIRECT_ENTITY_TYPE
    }) }),
    // S7 (web-high fix plan 2026-09-24) — see `composition/deps.ts`'s identically-documented fields.
    isInTrash: async (required) =>
      (await trashRepo.findByEntity({ workspaceId: required.workspaceId, entityType: REDIRECT_ENTITY_TYPE, entityId: required.id })) !== null,
    restore: (required) =>
      trash.restore({
        workspaceId: required.workspaceId,
        entityType: REDIRECT_ENTITY_TYPE,
        entityId: required.id,
        at: required.at      }, {
        actor: required.actor      }),
    db: redirectRepo,
    transaction: async (fn) => fn(),
    reservedSegments: RESERVED_SEGMENTS,
    matcher: redirectMatcher,
    originRegistry,
    clock,
    idGen,
    outbox,
  };
  registerRedirectsPhaseHandlers({
    repo: redirectRepo,
    matcher: redirectMatcher,
    originRegistry,
    reservedSegments: RESERVED_SEGMENTS,
  }, { hits: { outbox, clock, idGen } });
  registerSlugChangeCapture({ impl: new RedirectSlugChangeCapture({ reservedSegments: RESERVED_SEGMENTS, repo: redirectRepo, db: redirectRepo, clock, idGen }) });
  void registerRedirectHitOutboxHandler({ bus, hitSink: redirectHitSink });
  const { menuRepo, navLocationBindingRepo, formDefinitionRepo, contentTypeRepo, contentTypeIndexProvisioner, entryRefsRepo, widgetBindingRepo } = composeNavFormContentRepos({  });
  // SPEC-043/ADR-047 (widgets, Fable adversarial-review fix 2026-07-21) — mirrors `apps/website/src/server/runtime/composition/deps.ts`'s
  // identical fix: without this, no test exercising the real HTTP path ever ran a dynamic widget
  // type (`menu`/`recent-entries`/`contact-form`) through its actual resolver, only test doubles.
  // No site directory means no creation zone; an unset `core.site.timezone` uses the server's zone.
  const siteTimeZone = createSiteTimeZonePort({ settingsRepo });
  wireCoreResolvers({
    siteTimeZone,
    crypto: globalThis.crypto,
    // Defer captures: media MIME metadata is assembled later in this composition root.
    galleryMedia: ({ refs, context }) => resolveGalleryWidgetMedia({ refs, context, deps: {
      host: buildWidgetHostPorts({}), entryRepo, mediaRepo, transformRepo: transformDefinitionRepo, mediaContentTypeStore,
    } }),
    menus: { resolveMenuDoc },
    collectionList: widgetCollectionListPort,
    resolveMenuTargetHref: createMenuPageTargetResolver({ postRepo }),
    entryList: entryRepo,
    navMenuReadModel: createNavMenuReadModel({ menuRepo, bindingRepo: navLocationBindingRepo }),
    formDefinitionRepo: { findById: formDefinitionRepo.findById.bind(formDefinitionRepo), findBySlug: formDefinitionRepo.findBySlug.bind(formDefinitionRepo) },
    contentTypes: contentTypeRepo,
  });
  const { commentsModule, commentsCapability } = composeMemoryComments({ commentRepo, entryRepo, postRepo, outbox, clock, idGen, settingsRepo, workspaceId, trash, trashRepo, commentsSettingsReady, identity, settingsPrincipals });
  const { externalMcpServerRepo, siteAssistantSecretSealer, siteAssistantSecretKeyring, siteAssistantCredentialRepo, externalMcpOAuthDevices, memberRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks } = composeMemberSecrets({  });

  // See `routes/types.ts`'s `derivedPublicOrigin` doc. Mirrors `deps.ts`'s identical derivation
  // (`resolveCheckoutRoot`, a walk-up that is right from both the tsx and the compiled tree) — this
  // hermetic root backs the same live HTTP server as `deps.ts`'s in `TOVU_DB=memory` mode, so its
  // fallback origin must be derived the same way rather than silently differing.
  const REPO_ROOT_FOR_ORIGIN = resolveCheckoutRoot({});
  const derivedPublicOrigin = process.env.TOVU_SITE_LISTENER_ORIGIN ?? `${deriveDevScheme({ tlsActive: resolveDevTls(resolveDevTlsCertPaths({ repoRoot: REPO_ROOT_FOR_ORIGIN })).active })}://localhost:${Number(process.env.PORT ?? 3000)}`;
  const { publishContentBundleRepo, publishContentBaselineRepo, publishContentRunRepo, changeSets, assetBlobRepo, blobStore, mediaContentTypeStore, fileBlobIndex, publishContentPeerRepo } = composePublishContentStores({ outbox });
  const publishContentSeedHash = options.publishContentSeedHash ?? NO_PUBLISH_CONTENT_SEED_HASH;
  // One array shared by `routeDeps.themes` (below) and the theme-files apply's refresh hook, so a
  // published theme's partials/pages re-render without a restart (`rescanThemes` refills IN PLACE).
  const siteThemes = discoverAllBuiltInThemes({ dir: builtInThemesDir(), source: "built-in" });
  // `theme` joins the Trash here rather than in `trashAdapters`' literal above: its adapter rescans
  // `siteThemes` after every move, and the Trash resolves adapters at call time, so this `set` is seen
  // by every later trash/restore/purge (`theme_trash`, `trash_restore_item`, the admin Trash screen).
  const themeTrashAdapter = createThemeTrashAdapter({ themes: siteThemes, themesDir: builtInThemesDir() });
  trashAdapters.set(THEME_ENTITY_TYPE, themeTrashAdapter);
  // Folder moves before the Trash row is written; if that write throws, move the folder back.
  const removeTheme = unhideIfRemoveThrows({ adapter: themeTrashAdapter, remove: bindRemoveEntity({ trash, entityType: THEME_ENTITY_TYPE }) });
  const publishContentApplyPort = memoryPublishContentApplyPort({
    workspaceId: seededWorkspace.id,
    bundleRepo: publishContentBundleRepo,
    baselineRepo: publishContentBaselineRepo,
    runRepo: publishContentRunRepo,
    clock,
    idGen,
    outbox,
    changeSets,
    authorize: identity.authorize,
    getSeedHash: publishContentSeedHash,
    ports: memoryPublishContentPorts({
      postRepo, trashRepo, trash, mediaRepo, assetBlobRepo, blobStore, mediaContentTypeStore, redirectsWriteDeps,
      menuRepo, navLocationBindingRepo, siteThemes,
      content: {
        workspaceId: seededWorkspace.id,
        postRepo,
        formDefinitionRepo,
        contentTypeRepo,
        contentTypeIndexProvisioner,
        taxonomyRepo,
        termRepo,
        entryTermRepo,
        taxonomyRevisionRepo,
        stampWatermark: noopStampWatermark,
        entryRepo,
        entryRefsRepo,
        widgetBindingRepo,
        settingsRepo,
        principalRepo: settingsPrincipals,
        presentationRepo,
        themes: siteThemes,
      },
    }),
  });

  // One lazy in-memory `chat.db` behind both the chat store and its run ledger (`store-factory.ts`).
  const inMemoryChatHistory = createInMemoryChatHistory();
  const { externalMcpOAuthHttpPorts, guardedOutboundHttpClient } = composeMemoryOutboundHttp({  });
  const { seoDeps, sitemapService, transformDefinitionRepo } = composeMemorySeo({ postRepo, settingsRepo, mediaRepo, mediaContentTypeStore, originRegistry, clock });
  const { agentPluginLifecycle, agentPluginLayout, customCredentialSetRepo, siteBinding, federatedMcpPresetRegistry, skillLayout } = composeMemoryAgentPlugins({ routeDeps: () => routeDeps });
  // Hermetic readiness registers definitions without asynchronously publishing CMS default content.
  // Serialize ledger registration, but never gate consent on unrelated title preservation.
  const siteConsentReady = createSiteConsentReadiness({ ...siteTitleSettingsDeps,
    after: Promise.all([siteSettingsReady, identity.identityReady]).then(() => undefined),
    systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID,
  });
  const pluginExports = createPluginExportRuntime({ workspaceId: seededWorkspace.id, embedConsentOff: () => routeDeps.cookieConsent?.embedConsentOff?.() === true, source: createPluginExportSource({ lifecycle: agentPluginLifecycle }), listProviders: async () => [] });
  // ONE composed MCP port: routeDeps.mcp and the sign-in grant share its projections and classifier.
  const agentPluginMcp = composeAgentPluginMcp({ repo: externalMcpServerRepo, sealer: siteAssistantSecretSealer, keyring: siteAssistantSecretKeyring, clock });
  const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {
    siteBackupSanitize: sanitizeShareDatabase,
    pluginExports,
    assistantAgentInventory: createAssistantAgentInventory({ runtime: createNativeAgentRuntime({ env: process.env }) }),
    workspaceId: seededWorkspace.id,
    trash,
    // The rest of this root stays hermetic; only term/taxonomy exercise the shared scratch database.
    registry: trashRegistry,
    db: sqliteTrashDb,
    // `POST /trash/items` (the admin Forms list's delete) reaches these memory-backed forms here:
    // `sqliteTrashDb` has no form row for `moveToTrash`'s snapshot read.
    trashMovers: new Map<string, TrashKindMover>([["form", {
      permission: formTrashEntry.permission,
      move: async ({ workspaceId, entityId, actor }) => {
        const form = await formDefinitionRepo.findById({ workspaceId, id: entityId });
        if (!form) return { ok: false, reason: "not-found" };
        const marker = await trash.trash({ workspaceId, entityType: "form", entityId, actor,
          display: { title: form.name, subtitle: form.slug }, at: clock.nowIso(), expectedVersion: form.version });
        if (marker.ok) return { ok: true, version: marker.version };
        return marker;
      },
    }]]),
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
    removeMenu: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: "menu"
    }) }),
    // Bound the same way as `composition/deps.ts`; the matching adapters share `taxonomyDb`.
    removeTerm: bindRemoveEntity({
      trash: trash,
      entityType: "term"
    }),
    removeTaxonomy: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: "taxonomy"
    }) }),
    forgetRemovedMedia: bindForgetRemovedEntity({
      repo: trashRepo,
      entityType: MEDIA_ENTITY_TYPE
    }),
    forgetRemovedPost: bindForgetRemovedEntity({
      repo: trashRepo,
      entityType: POST_ENTITY_TYPE
    }),
    // Present so this root satisfies `TrashDeps`, and harmless: `createApp` never starts the
    // timer (`createServingApp` does), and the hermetic media/comment adapters have no
    // `hardDelete`, so a pass here would stand down rather than claim a removal.
    sweepTrash: createTrashSweep({
      repo: trashRepo,
      adapters: trashAdapters,
      transaction: ({ work }) => work(),
      entityPolicy: ({ entityType }) => (trashAdapters).has(entityType)
    }),
    isTrashableEntityType: ({ entityType }) => trashAdapters.has(entityType),
    // The hermetic half of the real SQLite deny store. `core.ts` still narrows this to `list`
    // before giving it to the request gate, so tests retain the same least-authority boundary.
    publishTrustRevocations: createInMemoryRevocations(),
    workspaceRepo,
    postRepo,
    // Mirrors `postRepo` on every query rather than maintaining an index — see
    // `features/post/search-index.memory.ts` for why that is right for this root and wrong for
    // `deps.ts`'s. Constructed eagerly, but its scratch database is not opened until the first
    // search, so the many tests that call `createRouteDeps()` without searching pay nothing.
    postSearch: new InMemoryPostSearchIndex(postRepo),
    // SPEC-009 REQ-15 — `updatePost` looks the capture up per write, so whatever is bound in routing's
    // slot at that moment (`registerSlugChangeCapture` above) decides whether a rename leaves a redirect.
    slugChangeCapture: () => getSlugChangeCapture({}),
    // Backed by `postRepo` above, NOT by a throwaway `:memory:` ContentDb — this root's posts do
    // not live in any SQLite database, so a real-adapter-over-scratch-db would edit rows nothing
    // else in this root can see. See `features/pages/html-document-store.memory.ts`'s header.
    // `entryRefsRepo` (SPEC-047 Slice 3) is the same instance `RouteDeps.entryRefsRepo` below
    // exposes — one shared index, mirroring `apps/website/src/server/runtime/composition/deps.ts`'s identical wiring. No separate
    // `revisions:` field to wire here (S1, fix plan 2026-09-24 row 14) — unlike the sqlite store,
    // this double's `deps.repo` is already the full `postRepo`, so its own `appendRevision` calls
    // use that same instance unconditionally; see `html-document-store.memory.ts`'s header.
    docBodyAsPageHtml: renderDocBodyAsPageHtml,
    pagesHtmlStore: (scope, options: { allowedKinds?: ReadonlySet<import("#src/features/post/index").PostKind> } = {}) => new InMemoryPagesHtmlDocumentStore(scope, { ...options, repo: postRepo, clock, entryRefsRepo, outbox, validatePluginEmbeds: pluginExports.validateHtml }),
    // No in-memory *reimplementation* of the chat store: this root gets the real adapter over a
    // throwaway `:memory:` database. `search-index.memory.ts` earns a hand-written double because
    // it mirrors `postRepo` rather than maintaining an index; chat history has no such alternate
    // shape, so a second implementation would only be a second thing to keep in sync — and the
    // one property tests most need to trust here is the isolation predicate, which only the real
    // adapter has. `ensureChatHistoryTables` is the package's own path for a host with no
    // migration system, which is exactly this root's situation.
    chatHistory: inMemoryChatHistory.chatHistory,
    chatRunLedger: inMemoryChatHistory.chatRunLedger,
    // Same "no in-memory reimplementation needed" situation as `chatHistory` above, but this port
    // has no `ai_chats` foreign key or isolation predicate to get right, so a plain map (no `db`
    // at all) is the whole double — see `agent-session-store.ts`'s own doc.
    agentSessions: createInMemoryAgentSessionStore(),
    conversationToolApprovals: createInMemoryConversationToolApprovalStore(),
    ...(options.nativeApprovalMemory ? { nativeApprovalMemory: options.nativeApprovalMemory } : {}),
    ...(options.approvalIdentityForRun ? { approvalIdentityForRun: options.approvalIdentityForRun } : {}),
    presentationRepo,
    settingsRepo,
    getEffective,
    set: (required, optional) => set(required, {
      ...optional,
      preparePreviewSwitcherWrite: async write => preparePreviewSwitcherWrite({ write, themes: siteThemes, workspaceId: seededWorkspace.id, activeThemeId: await resolveActiveThemeId({ presentationRepo, workspaceId: seededWorkspace.id }) }),
      canEnablePublicAssistant: async ({ workspaceId }) => (await resolvePublicAssistantAvailability({
        repo: siteAssistantCredentialRepo, sealer: siteAssistantSecretSealer, workspaceId,
      })).ready,
    }),
    instructionsNamespace: INSTRUCTIONS_NAMESPACE,
    settingsReady,
    seoReady,
    seoDeps,
    sitemapService,
    assistantSettingsReady,
    visitorToolsManagement: composeVisitorToolsManagement({ workspaceId: seededWorkspace.id, ready: assistantSettingsReady,
      settings: { repo: settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals } }),
    siteAssistantCredentialRepo,
    siteAssistantSecretSealer,
    siteAssistantSecretKeyring,
    adminExecutionCredentialRepo: new InMemoryAdminExecutionCredentialRepo(),
    mediaProviderCredentialRepo: new InMemoryMediaProviderCredentialRepo(),
    externalMcpServerRepo,
    bundledSourceRoot: bundledAgentPluginsDir(),
    mcp: agentPluginMcp,
    preferences: composeAgentPluginPreferences({ settings: { repo: settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals }, read: getEffective, write: (required, optional) => routeDeps.set(required, optional) }),
    providerFaces: composePluginProviderFaces({ workspaceRoot: () => agentPluginLayout.forWorkspace({ workspaceId: seededWorkspace.id }).root }),
    notifyRosterChanged: notifyExternalMcpRosterChanged,
    builtInExternalMcpServerIds: readBuiltInExternalMcpServerIds({ env: process.env }),
    externalMcpToolApprovalRepo: new InMemoryExternalMcpToolApprovalRepo(),
    /**
     * ADR-058 sealing again, one more consumer: the OAuth subsystem for `authMode: "oauth"`
     * external MCP connections. Built HERE rather than inside `modules/external-mcp.ts` because its
     * device-authorization store must be shared by connect and poll. Redirect state is sealed with
     * this root's site key, also used by the public callback. A composition root owns both lifetimes.
     * See
     * `routes/types.ts`'s `externalMcpOAuth` doc for why the field is optional at all.
     */
    externalMcpOAuth: createExternalMcpOAuthService({
      httpPorts: externalMcpOAuthHttpPorts,
      workspaceId: seededWorkspace.id,
      repo: externalMcpServerRepo,
      sealer: siteAssistantSecretSealer,
      keyring: siteAssistantSecretKeyring,
      clock,
      devices: externalMcpOAuthDevices,
      onConnected: createApplyConnectDefaults({ agentPluginLayout, workspaceId: seededWorkspace.id, repo: externalMcpServerRepo, applyAccess: input => routeDeps.mcp.applyAccess(input), clock, notifyRosterChanged: notifyExternalMcpRosterChanged, projections: agentPluginMcp.projections, classifyError: agentPluginMcp.classifyError }),
    }),
    externalMcpOAuthDevices,
    derivedPublicOrigin,
    passkeyOrigin: process.env.TOVU_PUBLIC_URL,
    // Same three plugin seams as `deps.ts`, over an in-memory vault. Handler modules load on the
    // first surface bootstrap rather than at this hermetic root's construction (no boot disk read).
    ...composeAgentPluginConnections({
      workspaceId: seededWorkspace.id, loadContributions: agentPluginLifecycle.loadPluginContributions, vaultRepo: new InMemoryVaultRepo({}),
      keyring: siteAssistantSecretKeyring, sealer: siteAssistantSecretSealer, customCredentialRepo: customCredentialSetRepo, clock, http: guardedOutboundHttpClient,
      env: process.env, derivedPublicOrigin,
    }, {
      deliveryBindings: { settings: { repo: settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals }, forms: formDefinitionRepo, newBindingId: () => idGen.newId() },
    }),
    executionSettingsReady,
    settingsUiTabsReady,
    analyticsSettingsReady,
    siteTitleReady,
    siteConsentReady,
    consentStore: createLazyProxy({ factory: () => createSiteConsentStore({ kernel: contentKernel({ store: taxonomyDb }), workspaceId }) }),
    siteTitlePreservationStore,
    // No site directory: the site title's no-owner-title value falls back to `workspaces.name` (SPEC-050 EC-03).
    siteDisplayName: { read: () => undefined },
    siteTimeZone,
    // BR-04 (2026-07-16): the repo forwards insert()'s optional event to this SAME outbox
    // instance, matching what the old separate executeCommand()-level enqueue() call did.
    // Hoisted above (not constructed inline) — see the comment there for why.
    changeSets,
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
    themesDir: builtInThemesDir(),
    siteBinding,
    createSite,
    federatedMcpPresetRegistry,
    agentPluginLayout,
    agentPluginLifecycle,
    skillLayout,
    // Hermetic: no `content.db` is opened here, so this reports the path a real boot of the same
    // env/cwd site WOULD open (`defaultContentDbPath()`) — exactly what the deployment overview and
    // the chat-attachment read-back route resolved per request before this field existed, and what
    // an in-memory agent daemon (`TOVU_DB=memory`, which composes from THIS root) writes uploads under.
    siteStoragePaths: resolveSiteStoragePaths({
      contentDbPath: defaultContentDbPath(),
      siteDir: describeSiteBinding().dir,
      uploadsDir: mediaUploadsDir({ siteDir: describeSiteBinding().dir }),
    }),
    outbox,
    bus,
    // Always the no-op adapter here, never provider-plugin selection (`provider-plugins.ts`) — this
    // root is documented "hermetic, no filesystem" (file header above), and nothing configured on a
    // developer's machine must ever make a test try to reach a real collector. See `routes/types.ts`'s
    // `ObservabilityDeps` doc for the full rule-of-two.
    observability: createNoopObservabilityPort({}),
    tracker: createNoopTracker({}),
    clock,
    idGen,
    analyticsSink: createLocalAnalyticsSink({}),
    analyticsConfig: createSettingsAnalyticsConfig({ settingsRepo }),
    ...identity,
    principalRepo: settingsPrincipals,
    redirectRepo,
    redirectHitSink,
    originRegistry,
    redirectsWriteDeps,
    memberRepo,
    memberTierRepo: new InMemoryMemberTierRepo({}, { initialRows: [] }),
    memberSubscriptionRepo: new InMemoryMemberSubscriptionRepo({}, { initialRows: [] }),
    memberSessionRepo: new InMemoryMemberSessionRepo({}, { initialRows: [] }),
    magicLinkRepo: new InMemoryMagicLinkTokenRepo({}, { initialRows: [] }),
    // SPEC-022 REQ-09/REQ-10 — see deps.ts's identical wiring for the rationale. This hermetic
    // composition resolves `local` by default (no test sets TOVU_RUNTIME_MODE), so the gate stays
    // inert here — existing tests are unaffected (INV-06).
    mailer: wrapMailerWithPurposeGate({
      inner: new ConsoleMailerAdapter(),
      mode: resolveRuntimeMode(),
      durableOutboxReady: () => false,
    }),
    menuRepo,
    navLocationBindingRepo,
    webhookSubscriptionRepo: new InMemoryWebhookSubscriptionRepo(),
    webhookDeliveryRepo: new InMemoryWebhookDeliveryRepo(),
    // ADR-PIPE-015 Phase 1 T017: the real createKeyringBackedSigner code path, backed by an
    // in-memory KeyringPort so this hermetic test/dev composition never touches a real file or
    // env var. The delivery worker is still the first real consumer — activation stays gated
    // (Phase 4) until the real KeyringPort/HttpClientPort/SQLite adapters are wired in deps.ts.
    webhookSigner: createKeyringBackedSigner(newsletterKeyring),
    // `media` (ADR-027 walking skeleton): in-memory rows + in-memory blob bytes here so tests
    // stay hermetic (no filesystem writes) — the real running server (`apps/website/src/server/runtime/composition/deps.ts`) uses
    // `LocalFsBlobStore` for actual byte durability while keeping rows in-memory too (see that
    // file's comment for why: no SQLite adapter exists yet for this newer library, matching the
    // disclosed precedent the last several admin-section libraries followed).
    mediaRepo,
    assetBlobRepo,
    assetRenditionRepo,
    mediaContentTypeStore,
    blobStore,
    // ADR-027 §4 transform registry + rendition generation (new in this task): in-memory registry
    // rows (no SQLite adapter yet, same disclosed precedent as the media repos above) and the
    // deterministic `InMemoryImageTransformer` test double here so hermetic tests never depend on
    // `sharp` being installed — see `src/media/image-transformer.sharp.ts`'s file header for the
    // disclosed blocker on the real adapter, which `apps/website/src/server/runtime/composition/deps.ts` wires instead.
    transformDefinitionRepo,
    imageTransformer: new InMemoryImageTransformer(),
    imageCodec: new SharpImageTransformer(),
    // SPEC-011 (Newsletter): in-memory adapters — no `declareDataModule()` boot step needed (that
    // mechanism is SQLite-only), so `newsletterReady` resolves immediately, unlike `apps/website/src/server/runtime/composition/deps.ts`'s
    // real fire-and-forget install. `membersConsentCapability` stays `null` (unbound) — see that
    // file's identical note.
    // T030: seed the default "all subscribers" list once, same as `apps/website/src/server/runtime/composition/deps.ts`'s real boot path.
    newsletterReady: ensureDefaultList({
      deps: { listRepo: newsletterListRepoInMemory, clock, ids: idGen },
      input: { workspaceId: seededWorkspace.id },
    }).then(() => undefined),
    newsletterCampaignRepo: new InMemoryNewsletterCampaignRepo(),
    newsletterListRepo: newsletterListRepoInMemory,
    newsletterSubscriptionRepo: new InMemoryNewsletterSubscriptionRepo(),
    newsletterAudienceSnapshotRepo: new InMemoryNewsletterAudienceSnapshotRepo(),
    newsletterSendRepo: new InMemoryNewsletterSendRepo(),
    newsletterConfirmationTokenRepo: new InMemoryNewsletterConfirmationTokenRepo(),
    membersConsentCapability: null,
    // Stage 5 (routes) wiring — see the hoisted-vars comment above `commentsModule`/return.
    newsletterSubscriberDirectory,
    newsletterKeyring,
    newsletterHooks,
    // SPEC-010 (Forms, Tier-1 sample plugin, ADR-PIPE-010): in-memory adapters, matching every
    // other core-owned-table feature's hermetic test/dev composition. `formsRateLimiter` is one
    // process-lifetime `FORMS_SUBMIT_PROFILE` counter store (constructed once here, not
    // per-request) so its fixed-window counts persist across requests within one `createApp()`.
    formDefinitionRepo,
    formSubmissionRepo,
    formSubmissionAttempts: formSubmissionAttemptsFor({ submissionRepo: formSubmissionRepo }),
    removeFormSubmission: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: "form_submission"
    }) }),
    executeCommand,
    formsRateLimiter: createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock }),
    // SPEC-046 REQ-7 — same one-process-lifetime-counter-store shape as `formsRateLimiter` above,
    // matching `apps/website/src/server/runtime/composition/deps.ts`'s real composition's identical construction.
    siteAssistantRateLimiter: createRateLimiter({ profile: SITE_ASSISTANT_PER_IP, clock }),
    // ADR-041 §1/§2 (Database Timeline): in-memory ledger, same disclosed precedent as every other
    // feature's hermetic test/dev composition above. `apps/website/src/server/runtime/composition/deps.ts`'s real composition opens
    // the sidecar `ops/database-journal.db` and uses `SqliteDatabaseLedgerRepo` instead.
    databaseLedgerRepo: new InMemoryDatabaseLedgerRepo(),
    migrationRunsRepo: new InMemoryMigrationRunsRepo(),
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
    // Task 6 of the publish-content (Publish Content) feature — hermetic double for
    // `server/runtime/composition/deps.ts`'s real `SqlitePublishContentBundleRepo`. Hoisted above
    // (not constructed inline) so Task 8's `publishContentApplyPort` reads the SAME store. See
    // `routes/types.ts`'s `publishContentBundleRepo` doc.
    publishContentBundleRepo,
    // `publish-files-plan-2026-09-24.md` §3 — hoisted above so it is the SAME instance a `pack()`
    // fills and a route reads. See `routes/types.ts`'s `fileBlobIndex` doc.
    fileBlobIndex,
    // Task 7 — hermetic double for `server/runtime/composition/deps.ts`'s real
    // `SqlitePublishContentBaselineRepo`. Hoisted above for the same reason. See
    // `routes/types.ts`'s `publishContentBaselineRepo` doc.
    publishContentBaselineRepo,
    // Task 8 — the real apply loop (`apply-loop.ts`). See `routes/types.ts`'s
    // `publishContentApplyPort` doc.
    publishContentApplyPort,
    publishContentSeedHash,
    // Task 8 — the apply loop's audit trail. See `routes/types.ts`'s `publishContentRunRepo` doc.
    publishContentRunRepo,
    // Task 10 — peers + the guarded outbound client that dials them. The client is built from
    // `createPublishContentPeerEgressPolicy()` with the same operator-set `devHostAllowlist` the
    // SQLite root reads, so a hermetic app is not accidentally more permissive than a real one.
    publishContentPeerRepo,
    publishContentPeerHttpClient: resolvePublishContentPeerHttpClient({}, options.publishContentPeerHttpClient ? { client: options.publishContentPeerHttpClient } : {}),
    // 2026-08-15 — the real export engine, bound here rather than imported inside
    // `features/deployments/export-run.ts`/`export-site.ts` — see `routes/types.ts`'s
    // `runExportSite` doc for why that indirection is required, not stylistic. NOT resolved lazily
    // any more; see {@link runExportSite} (the local const below, shadowing this field's own name)
    // for why a plain static import replaced the `require()` this used to carry.
    runExportSite,
    // Read ONCE here rather than deep in `export-run.ts`/`cli/commands/export.ts` — see
    // `apps/website/src/server/runtime/composition/deps.ts`'s `resolveExportOutputRootDir` doc and `routes/types.ts`'s
    // `exportOutputRootDir` doc. Rooted at the same `describeSiteBinding()` this root reports as
    // `siteBinding`, as are the publish and source-control roots below.
    exportOutputRootDir: resolveExportOutputRootDir({ siteDir: describeSiteBinding().dir }),
    // Read ONCE here — see `routes/types.ts`'s `adminAssistantEnabled` doc. This module's own
    // mount-gating code below reads THIS field rather than calling `isAdminAssistantEnabled()` a
    // second time, so the value never disagrees with which admin-assistant routes are actually live.
    adminAssistantEnabled: isAdminAssistantEnabled(),
    // 2026-08-16 — see `routes/types.ts`'s `createSiteApp` doc: the direct reference this file can
    // take (createApp is declared in this same module) closing `export -> server` for the in-memory
    // composition root. `apps/website/src/server/runtime/composition/deps.ts`'s SQLite composition root needs the lazy-`require`d
    // equivalent instead, since it cannot take a same-file reference.
    //
    // 2026-08-20 (RouteDeps-narrowing pass 2) — now NULLARY, closed over the `const routeDeps`
    // binding below rather than taking it per call. Same self-referencing-closure shape
    // `exportSiteBound` below already uses (safe for the identical reason: this arrow only runs
    // after `createRouteDeps()` has returned, by which point `routeDeps` is fully constructed) — see
    // `routes/types.ts`'s `exportSiteBound` doc, now generalized, for the TEST GOTCHA this closure
    // shape carries (spread-override is silently inert; mutate the object in place instead).
    createSiteApp: ({ themeId, consentAudit }: { themeId?: string; consentAudit?: true } = {}) => createApp(routeDeps, { ...(themeId === undefined ? {} : { themeIdOverride: themeId }), ...(consentAudit ? { consentAudit } : {}) }),
    // 2026-08-16 — see `routes/types.ts`'s `resolveStorefrontProducts` doc (edge 2 of the
    // export<->server decoupling): a direct reference, same reasoning as `createSiteApp` above
    // (`resolveStorefrontProducts` is declared in `./routes/site/products`, already imported by
    // this file to register the real product routes).
    //
    // 2026-08-20 (RouteDeps-narrowing pass 2) — same nullary-closure conversion as `createSiteApp`
    // immediately above, same reasoning, same TEST GOTCHA.
    resolveStorefrontProducts: () => resolveStorefrontProducts(routeDeps),
    // 2026-09-03 — see `routes/types.ts`'s `resolveActiveThemeId`/`listPublishedPosts` docs: closes
    // the `platform <-> features/presentation`/`platform <-> features/post` module cycles
    // `check:architecture` flagged (`features/site-export/route-manifest.ts` no longer imports either
    // function directly). Same nullary-closure-over-`routeDeps` shape as `resolveStorefrontProducts`
    // immediately above.
    resolveActiveThemeId: () => resolveActiveThemeId(routeDeps),
    listPublishedPosts: () =>
      listPublishedPosts({ deps: { repo: routeDeps.postRepo }, input: { workspaceId: routeDeps.workspaceId } }),
    // 2026-08-16 rework — hermetic double for `apps/website/src/server/runtime/composition/deps.ts`'s real `SqlitePublishHistoryStore`;
    // see `routes/types.ts`'s `publishHistoryStore` doc.
    publishHistoryStore: new InMemoryPublishHistoryStore(),
    // 2026-08-15 (Contract v2) — see `routes/types.ts`'s `publishExecutionMode` doc.
    // `executionModeFromEnv()` (not a hardcoded `"self-hosted-cli"`) so a test can still exercise
    // `TOVU_EXECUTION_MODE=hosted-api-only` against this hermetic root.
    publishExecutionMode: executionModeFromEnv(),
    // Read ONCE here rather than deep in `static-publish/adapter.ts` — see `apps/website/src/server/runtime/composition/deps.ts`'s
    // `resolvePublishOutputRootDir` doc and `routes/types.ts`'s `publishOutputRootDir` doc.
    publishOutputRootDir: resolvePublishOutputRootDir({ siteDir: describeSiteBinding().dir }),
    // Hermetic: every bundled plugin's own source directory (each hosting plugin ships its own
    // targets), no install or activation step — see `routes/types.ts`'s `loadDeployTargets` doc.
    loadDeployTargets: () =>
      loadBundledDeployTargetRegistry({ sourceRoot: bundledAgentPluginsDir() }),
    loadDeployWorkflowFiles: async () => readBundledDeployWorkflowFiles({ sourceRoot: bundledAgentPluginsDir() }),
    loadDeployOps: () => loadBundledDeployOpsRegistry({ sourceRoot: bundledAgentPluginsDir() }),
    // Hermetic the same way: every bundled source-control declaration — see `routes/types.ts`'s
    // `loadSourceControlProviders` doc.
    loadSourceControlProviders: () =>
      loadBundledSourceControlProviderRegistry({ sourceRoot: bundledAgentPluginsDir() }),
    // And the bundled plugins' own key cards — see `routes/types.ts`'s `loadPluginCredentialCards` doc.
    loadPluginCredentialCards: () =>
      loadMailCredentialCards({ loadMailAdapters: () => loadBundledMailAdapterRegistry({ sourceRoot: bundledAgentPluginsDir() }) }),
    // And the bundled plugins' credential scheme rules — see `routes/types.ts`'s `loadAuthSchemes` doc.
    loadAuthSchemes: async () =>
      (await loadBundledCredentialSchemeRegistry({ sourceRoot: bundledAgentPluginsDir() })).rules,
    // 2026-08-16 — hermetic double for `apps/website/src/server/runtime/composition/deps.ts`'s real (also in-memory — see
    // `routes/types.ts`'s `publishCredentialVerificationCache` doc for why this cache is
    // deliberately never DB-backed) instance.
    publishCredentialVerificationCache: new InMemoryPublishCredentialVerificationCache(),
    // 2026-08-15 — hermetic double for `apps/website/src/server/runtime/composition/deps.ts`'s real
    // `SqliteSourceControlCredentialSetRepo`; see `routes/types.ts`'s
    // `sourceControlCredentialSetRepo` doc.
    sourceControlCredentialSetRepo: new InMemorySourceControlCredentialSetRepo(),
    // Read ONCE here rather than deep in `source-control/commit-site.ts` — see `apps/website/src/server/runtime/composition/deps.ts`'s
    // `resolveSourceControlExportRootDir` doc and `routes/types.ts`'s `sourceControlExportRootDir`
    // doc.
    sourceControlExportRootDir: resolveSourceControlExportRootDir({ siteDir: describeSiteBinding().dir }),
    // 2026-08-16 (Phase 3) — hermetic double for `apps/website/src/server/runtime/composition/deps.ts`'s real
    // `SqliteVendorCredentialSetRepo`; see `routes/types.ts`'s `vendorCredentialSetRepo` doc.
    vendorCredentialSetRepo: new InMemoryVendorCredentialSetRepo({}),
    customCredentialSetRepo,
    // `features/custom-credentials`'s two agent tools need a guarded `HttpClientPort` — see
    // `routes/types.ts`'s `customCredentialsHttpClient` doc. `createDefaultHttpClient` performs no
    // I/O until a request is actually sent, so building a real one here (rather than a fake) keeps
    // this hermetic composition root's own tests exercising the real SSRF-guard/host-binding path.
    // `CUSTOM_CREDENTIALS_EGRESS_POLICY`: the SAME policy `apps/website/src/server/runtime/composition/deps.ts` uses for its own instance
    // (2026-09-10) — see that export's own doc for why this domain needed to follow a GET redirect
    // (GitHub's Actions job-logs endpoint 302s to a signed Azure Blob URL) and could no longer share
    // the mailer's zero-redirect `SINGLE_HOP_HTTPS_EGRESS_POLICY`.
    customCredentialsHttpClient: createDefaultHttpClient({ policy: CUSTOM_CREDENTIALS_EGRESS_POLICY }),
    deployOpsHttpClient: createDefaultHttpClient({ policy: SINGLE_HOP_HTTPS_EGRESS_POLICY }),
    // 2026-09-06 — `features/media-import`'s `media_import_from_url`. Same reasoning as the line
    // above (a real guarded client, not a fake, so this hermetic composition root's own tests
    // exercise the real SSRF guard), built from `MEDIA_IMPORT_EGRESS_POLICY` instead — see
    // `routes/types.ts`'s `mediaImportHttpClient` doc for why the two policies cannot be shared.
    mediaImportHttpClient: createDefaultHttpClient({ policy: MEDIA_IMPORT_EGRESS_POLICY }),
    mediaGenerationHttpClient: guardedOutboundHttpClient,
    // Built-in vendors only: this hermetic root reads no plugin modules at construction (same rule as
    // the plugin seams above); `deps.ts` adds plugin vendors via `loadMediaProviderRegistry`.
    mediaProviderRegistry: createMediaProviderRegistry(),
    // 2026-08-20 (RouteDeps-narrowing fix) — see `routes/types.ts`'s `exportSiteBound` doc. `routeDeps`
    // spread LAST: this self-referencing closure captures the `const routeDeps` binding below (safe —
    // the arrow body only runs after `createRouteDeps()` has returned, by which point `routeDeps` is
    // fully constructed), and it must always win over whatever `opts` a caller passes, even if that
    // `opts` happens to carry its own `routeDeps` key (see `routes/types.ts`'s own doc on this field
    // for the exact bug this ordering closes).
    // 2026-09-05 (fix-cycle) — plain static reference now; see `runExportSite`'s doc below for why
    // the lazy `require()` this used to carry is gone.
    exportSiteBound: (opts) => exportSite({ ...opts, routeDeps }),
    staticSiteContext: async () => {
      const theme = resolveActiveTheme({ deps: routeDeps, activeThemeId: await routeDeps.resolveActiveThemeId() });
      return { name: routeDeps.siteDisplayName.read() ?? siteBinding.name, slug: siteBinding.name,
        theme: theme && typeof theme === "object" ? theme.manifest.name : "None",
        themeId: theme && typeof theme === "object" ? theme.manifest.id : NO_THEME_ID };
    },
  };
  routeDeps.pluginHost = createTovuPluginHost({ deps: routeDeps });
  routeDeps.pluginRuntimeReady = pluginRuntime.attachEnabledPluginsAtBoot();
  routeDeps.siteConsent = bindSiteConsentService({ deps: routeDeps });
  return routeDeps;
}

/**
 * `exportSite`, now a plain static reference — until 2026-09-05 this was resolved at CALL time via a
 * lazy `require()`, to break a cycle that no longer exists.
 *
 * THE CYCLE THIS USED TO BREAK, AND WHY IT'S GONE. The original justification (2026-08-15, this
 * doc's own prior text): `features/site-export/site-exporter.ts` imported `createApp` from THIS file, so
 * a static `import { exportSite } from "#src/features/site-export/index"` here would have closed
 *
 *     server/app.ts -> export/index.ts -> export/site-exporter.ts -> server/app.ts
 *
 * and the daemon (`server/inbound/assistant/agent-daemon-server.ts`, which imports this file for
 * `createRouteDeps`) crashed on every boot with `TypeError: Cannot read properties of undefined
 * (reading 'createInMemoryChatStoreFactory')` when that edge closed eagerly. That back-edge was
 * removed for real on 2026-08-16 (generalized 2026-08-20, "RouteDeps-narrowing pass 2"):
 * `site-exporter.ts` no longer imports `server/app.ts` at all, static OR lazy — it boots the app via
 * `options.routeDeps.createSiteApp()`, injected through `RouteDeps` (see that file's own header
 * comment and `routes/types.ts`'s `createSiteApp` doc). This file's lazy `require()` for the
 * OPPOSITE direction (this file calling INTO `features/site-export`) was never actually needed once that
 * injection landed — it just never got revisited, including across two path-rewrite commits
 * (`03cc71442`, `e031173e4`) that mechanically edited these very lines without re-checking the cycle
 * claim.
 *
 * VERIFIED 2026-09-05, not assumed: `features/site-export`'s complete runtime closure (`ports.ts`,
 * `route-manifest.ts`, `site-exporter.ts`, `export-failure-summary.ts`, `index.ts`, and everything
 * THEY import — `features/theme`, `features/post`, `features/presentation`, `features/redirects`,
 * `platform/routing`, `contracts/core`) contains zero imports of this file or any `#src/server/**`
 * module — confirmed by direct source read of every file in that closure, a repo-wide grep for any
 * specifier reaching `runtime/composition/app`, and independently by `.dependency-cruiser.mjs`'s own
 * 2026-08-28 cross-validated (DFS + `no-circular` + madge) 5-SCC baseline, which names the real
 * `deps.ts`/`app.ts`/`deployment-overview.ts` cycle (deps.ts closed the same cycle via a static
 * import as of 2026-09-16, t91 F4.1-A — see that file's own doc) but does not include this edge. This file already statically
 * imports every one of those modules' own dependencies anyway (`#src/features/theme/index`,
 * `#src/features/post/index`, `#src/features/presentation/index`, `#src/features/redirects/index`,
 * `#src/platform/routing/index`, `#src/contracts/core/**` are all imported above), so this static
 * import adds `features/site-export`'s own 5 files to this file's runtime closure and nothing else.
 *
 * Also fixes a real defect, not just cleanup: the lazy `require()` ran tsx's CJS loader over
 * `features/site-export`'s whole barrel graph inside processes that had already loaded the same files
 * via tsx's ESM loader (any in-process test that calls `routeDeps.exportSiteBound`/`runExportSite`,
 * e.g. `commit-site.ts`, `static-publish/adapter.ts`), producing two V8 coverage images per file that
 * lcov merges into one corrupted `SF:` block — see
 * `ADS-memory/reports/2026-09-05-coverage-dual-instantiation-routes-W-and-A.md`'s "Route A".
 */
const runExportSite: ExportEngine<RouteDeps> = (options, _optional = {}) => exportSite(options);

export function createApp(routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps, options: CreateAppOptions = {}) {
  const app = express();
  // Read the lifecycle owners now: a completed job must not pin a warm child forever.
  const hasBackgroundWork = async (): Promise<boolean> => {
    if (getExportRunSnapshot().status === 'running' || getPublishRunSnapshot().status === 'running') return true;
    if (routeDeps.siteShareBackend && routeDeps.siteShareBackend.hasWork?.({}) !== false) return true;
    await routeDeps.newsletterReady;
    return await routeDeps.newsletterCampaignRepo.hasSending?.({ workspaceId: routeDeps.workspaceId }, {}) ?? true;
  };
  registerSiteIdlePark({ app, routeDeps, hasBackgroundWork }, options);
  registerWarmSiteRetirement({ app, siteDir: routeDeps.siteBinding.dir, hasBackgroundWork });
  // All admin error mappers share this request-scoped diagnostic port, including narrow route deps.
  app.use("/api/admin", (_req, res, next) => { res.locals.adminFailureTracker = routeDeps.tracker; next(); });
  const internalRouter = express.Router();
  applyPublicMiddleware({ app, routeDeps, internalRouter }, options);
  registerPluginContributionRoutes({ app, deps: routeDeps, auth: createPluginRouteAuthPorts({ deps: routeDeps }) });

  // Once per bus, not once per createApp call: see `subscribeSiteEventHandlersOnce`.
  subscribeSiteEventHandlersOnce(routeDeps);

  const { isAuthenticatedPreviewRevision } = mountCoreContent({ app, routeDeps }, { onAdminSignIn: options.onAdminSignIn });

  mountMembersNewsletter({ app, routeDeps });

  mountAdminSystem({ app, routeDeps });
  mountAdminFeatures({ app, routeDeps });

  mountAssistant({ app, routeDeps, internalRouter, bootWorkByDeps: siteAppBootWorkByDeps }, options);

  mountAdminData({ app, routeDeps });

  registerAdminSpa({ app, routeDeps });

  mountPublicSite({ app, routeDeps, isAuthenticatedPreviewRevision });

  // Last, so it sees a body-parser 413 from any route and answers JSON instead of Express's HTML page.
  app.use(respondToOversizedBody);
  // Last: hands the request's 5xx error report the error Express's default handler answers with.
  app.use(captureRouteError);

  return app;
}

