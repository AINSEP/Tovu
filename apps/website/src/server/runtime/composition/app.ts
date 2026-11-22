
import { assembleMemoryRouteDeps } from "./memory-deps/route-deps/assemble.js";
import type { MemoryRootContext, MemoryRouteDeps } from "./memory-deps/route-deps/context.js";
import type { CreateRouteDepsOptions } from "./memory-deps/create-route-deps-options.js";
import { composeMemoryComments } from "./memory-deps/slices/comments.js";
import { composeMemoryAgentPlugins } from "./memory-deps/slices/agent-plugins.js";
import { composeMemorySeo } from "./memory-deps/slices/seo-sitemap.js";
import { composeOutboundHttp } from "./outbound-http.js";
import { composeMemoryTrash } from "./memory-deps/slices/memory-trash.js";
import { composePublishContentStores } from "./memory-deps/slices/publish-content-stores.js";
import { composeNavFormContentRepos } from "./memory-deps/slices/nav-form-content-repos.js";
import { composeTaxonomyTrashRepos } from "./memory-deps/slices/taxonomy-trash-repos.js";
import { composeOriginNewsletter } from "./memory-deps/slices/origin-newsletter.js";
import { composeSiteTitleSettings } from "./memory-deps/slices/site-title-settings.js";
import { composeIdentitySettings } from "./memory-deps/slices/identity-settings.js";
import { composeMemoryRepos } from "./memory-deps/slices/repos.js";
import { composeMemberSecrets } from "./memory-deps/slices/member-secrets.js";
import { getExportRunSnapshot } from '../../../features/deployments/index.js';
import { getPublishRunSnapshot } from '../../../features/deployments/static-publish/publish-run.js';
import { registerWarmSiteRetirement } from '../lifecycle/warm-site-retirement.js';
import { composeAgentPluginMcp } from "./agent-plugin-service-ports.js";
import { createPluginExportRuntime } from "#src/features/agent-plugins/exports/runtime";
import { createPluginExportSource } from "#src/features/agent-plugins/exports/source";
import { bindSiteConsentService } from './site-consent.js';
import { createTovuPluginHost } from "./plugin-host.js";
import { widgetCollectionListPort } from "../../../features/entries/public-list.js";
import { resolveMenuDoc } from "@jini-ai/cms/navigation";
import { RESERVED_SEGMENTS } from "#src/platform/routing/reserved-paths";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import express from "express";
import { NO_PUBLISH_CONTENT_SEED_HASH } from "#src/features/publish-content/seed-hash";
import { randomUUID } from "node:crypto";
import { createNoopObservabilityPort } from "@jini-ai/core/contracts/observability";
import { InMemoryPostRepo } from "#src/features/post/index";
import { unhideIfRemoveThrows } from "@jini-ai/cms/trash/adapters/directory";
import { reportDirectoryRollbackFailure, THEME_ENTITY_TYPE, REDIRECT_ENTITY_TYPE, removeEntityWithoutBlocker } from "#src/features/trash/index";
import { bindRemoveEntity } from "@jini-ai/cms/trash";
import { memoryPublishContentApplyPort, memoryPublishContentPorts } from "./memory-deps/slices/publish-apply.js";
import { createInMemoryChatHistory } from "../../../assistant/index.js";
// Deep-imported rather than routed through the barrel above: `assistant/index.ts`'s Section D
// ("Admin Daemon Proxy / Process Composition") is documented as consumed by the DAEMON's own proxy
// composition (`apps/website/src/server/runtime/composition/modules/assistant.ts`) — this route is the opposite of that, a plain static
// page served by THIS website server for the browser's iframe to load directly (see the route's own
// module doc). Filing it under Section D would misdescribe it. `app.ts` is a composition root
// (`.dependency-cruiser.mjs`'s `COMPOSITION_ROOTS`), exempt from `no-deep-imports:assistant` for
// exactly this reason — the same exemption `express.static`'s `/agent-icons` mount below relies on.
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import { InMemorySettingsRepo, set } from "#src/features/settings/index";
import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { bindThemeTrashAdapter } from "#src/features/theme/theme-trash-binding";
import { InMemoryWorkspaceRepo } from "#src/features/workspace/index";
import { createInMemoryToolAttemptAuditSink } from "#src/features/tool-audit/repo.memory";
import { builtInThemesDir } from "./site-paths.js";
import { deriveDevScheme, resolveDevTls, resolveDevTlsCertPaths } from "../../../platform/dev-host/dev-tls.js";
import { resolveCheckoutRoot } from "#src/platform/site-dir/index";
import {
  seededPosts,
  seededPresentation,
  seededWorkspace,
  SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID,
} from "../configuration/seed.js";
import type { NewsletterRouteDeps } from "../../inbound/admin-http/routes/newsletter/deps.js";
import { redirectMatcher, RedirectSlugChangeCapture, registerRedirectHitOutboxHandler, type RedirectsWriteDeps } from "@jini-ai/cms/redirects";
import { registerRedirectsPhaseHandlers } from "#src/features/redirects/index";
import { registerSlugChangeCapture } from "#src/platform/routing/adapter";
import { InMemoryPluginActivationRepo } from "@jini-ai/plugins/host";
import { RECHARTS_RUNTIME_SOURCE, RECHARTS_BROWSER_APPROVAL } from "./charts-recharts-source.js";
import { createSiteConsentReadiness } from "#src/features/consent/settings";
import { WORD_COUNT_RUNTIME_SOURCE } from "#src/features/plugin-runtime/built-ins/word-count/index";
import { CONTENT_ANALYZER_RUNTIME_SOURCE } from "#src/features/plugin-runtime/built-ins/content-analyzer/index";
import { createDeclaredContentTypePorts } from "./declared-content-types.js";
import { deferDeclaredContentTypePorts } from "@jini-ai/plugins/host";
import { bindProviderFacePorts, followProviderActivations } from "#src/features/agent-plugins/provider-plugin-link";
import { composePluginRuntime } from "./plugin-runtime.js";
import { TOVU_CORE_EXTENSION_CLAIMS } from "./core-extension-claims.js";
import { resolveGalleryWidgetMedia } from "@jini-ai/cms/widgets/html";
import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import { wireCoreResolvers } from "@jini-ai/cms/widgets/resolvers";
import { createMenuPageTargetResolver } from "#src/features/navigation/page-target-resolver";
import { createNavMenuReadModel } from "#src/features/navigation/index";
import { createSiteTimeZonePort } from "@jini-ai/cms/settings/site/site-timezone";
import { noopStampWatermark } from "@jini-ai/cms/taxonomy";

import { captureRouteError } from "../../inbound/shared/observability-middleware.js";
import { respondToOversizedBody } from "../../inbound/shared/json-body-parsers.js";
import { registerPluginContributionRoutes, createPluginRouteAuthPorts } from "../../inbound/public-http/routes/plugin-contributions.js";
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
  const runtime = createMemoryRuntime(options, {
    routeDeps: () => routeDeps, agentPluginLayout: () => agentPluginLayout,
    declaredContentTypes: () => createDeclaredContentTypePorts({ repo: contentTypeRepo, clock, ids: idGen, outbox }),
  });
  const { clock, idGen, settingsRepo, postRepo } = runtime;
  const foundation = createMemoryFoundation(runtime, {
    formDefinitionRepo: () => formDefinitionRepo, entryRefsRepo: () => entryRefsRepo, menuRepo: () => menuRepo,
    navLocationBindingRepo: () => navLocationBindingRepo, routeDeps: () => routeDeps,
  });
  const { outbox, commentRepo, entryRepo, mediaRepo, workspaceId, trash, trashRepo, commentsSettingsReady,
    identity, settingsPrincipals, siteTitleSettingsDeps, siteSettingsReady, originRegistry } = foundation;
  const widgets = createMemoryWidgets({ ...runtime, ...foundation }, {
    transformDefinitionRepo: () => transformDefinitionRepo, mediaContentTypeStore: () => mediaContentTypeStore,
  });
  const { formDefinitionRepo, entryRefsRepo, menuRepo, navLocationBindingRepo, contentTypeRepo } = widgets;
  const { commentsModule, commentsCapability } = composeMemoryComments({ commentRepo, entryRepo, postRepo, outbox, clock, idGen, settingsRepo, workspaceId, trash, trashRepo, commentsSettingsReady, identity, settingsPrincipals });
  const { externalMcpServerRepo, siteAssistantSecretSealer, siteAssistantSecretKeyring, siteAssistantCredentialRepo, externalMcpOAuthDevices, memberRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks } = composeMemberSecrets({  });

  const derivedPublicOrigin = deriveMemoryPublicOrigin();
  const publishing = createMemoryPublishing({ ...runtime, ...foundation, ...widgets }, options);
  const { mediaContentTypeStore } = publishing;
  // One lazy in-memory `chat.db` behind both the chat store and its run ledger (`store-factory.ts`).
  const inMemoryChatHistory = createInMemoryChatHistory();
  const { externalMcpOAuthHttpPorts, guardedOutboundHttpClient } = composeOutboundHttp({  });
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
  const createSiteApp: MemoryRouteDeps["createSiteApp"] = ({ themeId, consentAudit }: { themeId?: string; consentAudit?: true } = {}) => createApp(routeDeps, { ...(themeId === undefined ? {} : { themeIdOverride: themeId }), ...(consentAudit ? { consentAudit } : {}) });
  const context: MemoryRootContext = {
    ...runtime, ...foundation, ...widgets, ...publishing,
    options, routeDeps: () => routeDeps, createSiteApp, derivedPublicOrigin,
    agentPluginLayout, agentPluginLifecycle, agentPluginMcp, customCredentialSetRepo, siteBinding, federatedMcpPresetRegistry, skillLayout,
    commentsModule, commentsCapability, externalMcpServerRepo, siteAssistantSecretSealer, siteAssistantSecretKeyring,
    siteAssistantCredentialRepo, externalMcpOAuthDevices, memberRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks,
    inMemoryChatHistory, externalMcpOAuthHttpPorts, guardedOutboundHttpClient, seoDeps, sitemapService, transformDefinitionRepo,
    siteConsentReady, pluginExports,
  };
  const routeDeps: MemoryRouteDeps = assembleMemoryRouteDeps(context);
  routeDeps.pluginHost = createTovuPluginHost({ deps: routeDeps });
  routeDeps.pluginRuntimeReady = runtime.pluginRuntime.attachEnabledPluginsAtBoot();
  routeDeps.siteConsent = bindSiteConsentService({ deps: routeDeps });
  return routeDeps;
}

function createMemoryRuntime(options: CreateRouteDepsOptions, references: {
  routeDeps: () => MemoryRouteDeps; agentPluginLayout: () => MemoryRootContext["agentPluginLayout"];
  declaredContentTypes: () => ReturnType<typeof createDeclaredContentTypePorts>;
}) {
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
    ports: bindProviderFacePorts({ workspaceRoot: () => references.agentPluginLayout().forWorkspace({ workspaceId: seededWorkspace.id }).root }) });
  const pluginRuntime = composePluginRuntime({
    getPluginHost: () => references.routeDeps().pluginHost,
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
      build: references.declaredContentTypes,
    }),
    ...inMemoryPluginRuntimeOptions({ options }),
  });
  return { toolAttemptAuditSink, workspaceRepo, postRepo, presentationRepo, settingsRepo, clock, idGen, pluginActivationRepo, pluginRuntime };
}

function createMemoryFoundation(runtime: ReturnType<typeof createMemoryRuntime>, deferred: Pick<Parameters<typeof composeMemoryTrash>[0],
  "formDefinitionRepo" | "entryRefsRepo" | "menuRepo" | "navLocationBindingRepo" | "routeDeps">) {
  const { clock, idGen, settingsRepo, pluginRuntime, pluginActivationRepo, postRepo } = runtime;
  const { settingsPrincipals, analyticsSettingsReady, settingsReady, commentsSettingsReady, identity, seoReady, assistantSettingsReady, executionSettingsReady, settingsUiTabsReady } = composeIdentitySettings({ clock, idGen, settingsRepo });
  const { siteTitleSettingsDeps, siteSettingsReady, siteTitleReady, siteTitlePreservationStore } = composeSiteTitleSettings({ settingsRepo, clock, idGen, settingsPrincipals, analyticsSettingsReady });
  const { originRegistry, newsletterListRepoInMemory } = composeOriginNewsletter({ clock });
  const { taxonomyDb, workspaceId, outbox, redirectRepo, commentRepo, mediaRepo, formSubmissionRepo, entryRepo, sqliteTrashDb, bus, redirectHitSink, assetRenditionRepo, restorePointsRepo } = composeMemoryRepos();
  const { trashRegistry, termRepo, taxonomyFollowUpTermRepo, trashRepo, taxonomyFollowUpRevisions, taxonomyFollowUpOutbox, taxonomyRepo, entryTermRepo, taxonomyRevisionRepo } = composeTaxonomyTrashRepos({ taxonomyDb, workspaceId, outbox, clock, idGen });
  const { trash, trashAdapters, formTrashEntry, removePlugin } = composeMemoryTrash({ pluginRuntime, pluginActivationRepo, trashRegistry, taxonomyFollowUpTermRepo, trashRepo, taxonomyFollowUpRevisions, taxonomyFollowUpOutbox, outbox, clock, idGen, postRepo, redirectRepo, commentRepo, mediaRepo, formSubmissionRepo, entryRepo, sqliteTrashDb, ...deferred });

  const redirectsWriteDeps = createMemoryRedirects({ ...runtime, redirectRepo, trash, trashRepo, originRegistry, outbox, bus, redirectHitSink });
  return { settingsPrincipals, analyticsSettingsReady, settingsReady, commentsSettingsReady, identity, seoReady, assistantSettingsReady,
    executionSettingsReady, settingsUiTabsReady, siteTitleSettingsDeps, siteSettingsReady, siteTitleReady, siteTitlePreservationStore,
    originRegistry, newsletterListRepoInMemory, taxonomyDb, workspaceId, outbox, redirectRepo, commentRepo, mediaRepo,
    formSubmissionRepo, entryRepo, sqliteTrashDb, bus, redirectHitSink, assetRenditionRepo, restorePointsRepo, trashRegistry,
    termRepo, taxonomyFollowUpTermRepo, trashRepo, taxonomyFollowUpRevisions, taxonomyFollowUpOutbox, taxonomyRepo, entryTermRepo,
    taxonomyRevisionRepo, trash, trashAdapters, formTrashEntry, removePlugin, redirectsWriteDeps };
}

function createMemoryRedirects(context: ReturnType<typeof createMemoryRuntime> & Pick<MemoryRootContext, "redirectRepo" | "trash" | "trashRepo" | "originRegistry" | "outbox" | "bus" | "redirectHitSink">) {
  const { redirectRepo, trash, trashRepo, originRegistry, clock, idGen, outbox, bus, redirectHitSink } = context;
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
  return redirectsWriteDeps;
}

function createMemoryWidgets(context: ReturnType<typeof createMemoryRuntime> & ReturnType<typeof createMemoryFoundation>, deferred: {
  transformDefinitionRepo: () => MemoryRootContext["transformDefinitionRepo"]; mediaContentTypeStore: () => MemoryRootContext["mediaContentTypeStore"];
}) {
  const { settingsRepo, entryRepo, mediaRepo, postRepo } = context;
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
      host: buildWidgetHostPorts({}), entryRepo, mediaRepo, transformRepo: deferred.transformDefinitionRepo(), mediaContentTypeStore: deferred.mediaContentTypeStore(),
    } }),
    menus: { resolveMenuDoc },
    collectionList: widgetCollectionListPort,
    resolveMenuTargetHref: createMenuPageTargetResolver({ postRepo }),
    entryList: entryRepo,
    navMenuReadModel: createNavMenuReadModel({ menuRepo, bindingRepo: navLocationBindingRepo }),
    formDefinitionRepo: { findById: formDefinitionRepo.findById.bind(formDefinitionRepo), findBySlug: formDefinitionRepo.findBySlug.bind(formDefinitionRepo) },
    contentTypes: contentTypeRepo,
  });
  return { menuRepo, navLocationBindingRepo, formDefinitionRepo, contentTypeRepo, contentTypeIndexProvisioner, entryRefsRepo, widgetBindingRepo, siteTimeZone };
}

function deriveMemoryPublicOrigin() {
  // See `routes/types.ts`'s `derivedPublicOrigin` doc. Mirrors `deps.ts`'s identical derivation
  // (`resolveCheckoutRoot`, a walk-up that is right from both the tsx and the compiled tree) — this
  // hermetic root backs the same live HTTP server as `deps.ts`'s in `TOVU_DB=memory` mode, so its
  // fallback origin must be derived the same way rather than silently differing.
  const REPO_ROOT_FOR_ORIGIN = resolveCheckoutRoot({});
  const derivedPublicOrigin = process.env.TOVU_SITE_LISTENER_ORIGIN ?? `${deriveDevScheme({ tlsActive: resolveDevTls(resolveDevTlsCertPaths({ repoRoot: REPO_ROOT_FOR_ORIGIN })).active })}://localhost:${Number(process.env.PORT ?? 3000)}`;
  return derivedPublicOrigin;
}

function createMemoryPublishing(context: ReturnType<typeof createMemoryRuntime> & ReturnType<typeof createMemoryFoundation> & ReturnType<typeof createMemoryWidgets>, options: CreateRouteDepsOptions) {
  const { outbox, trashAdapters, trash } = context;
  const { publishContentBundleRepo, publishContentBaselineRepo, publishContentRunRepo, changeSets, assetBlobRepo, blobStore, mediaContentTypeStore, fileBlobIndex, publishContentPeerRepo } = composePublishContentStores({ outbox });
  const publishContentSeedHash = options.publishContentSeedHash ?? NO_PUBLISH_CONTENT_SEED_HASH;
  // One array shared by `routeDeps.themes` (below) and the theme-files apply's refresh hook, so a
  // published theme's partials/pages re-render without a restart (`rescanThemes` refills IN PLACE).
  const siteThemes = discoverAllBuiltInThemes({ dir: builtInThemesDir(), source: "built-in" });
  // `theme` joins the Trash here rather than in `trashAdapters`' literal above: its adapter rescans
  // `siteThemes` after every move, and the Trash resolves adapters at call time, so this `set` is seen
  // by every later trash/restore/purge (`theme_trash`, `trash_restore_item`, the admin Trash screen).
  const themeTrashAdapter = bindThemeTrashAdapter({ themes: siteThemes, themesDir: builtInThemesDir() });
  trashAdapters.set(THEME_ENTITY_TYPE, themeTrashAdapter);
  // Folder moves before the Trash row is written; if that write throws, move the folder back.
  const removeTheme = unhideIfRemoveThrows({ onRollbackError: reportDirectoryRollbackFailure, adapter: themeTrashAdapter, remove: bindRemoveEntity({ trash, entityType: THEME_ENTITY_TYPE }) });
  const publishContentApplyPort = createMemoryPublishApply({ ...context,
    publishContentBundleRepo, publishContentBaselineRepo, publishContentRunRepo, changeSets, assetBlobRepo, blobStore,
    mediaContentTypeStore, publishContentSeedHash, siteThemes,
  });
  return { publishContentBundleRepo, publishContentBaselineRepo, publishContentRunRepo, changeSets, assetBlobRepo, blobStore,
    mediaContentTypeStore, fileBlobIndex, publishContentPeerRepo, publishContentSeedHash, siteThemes, removeTheme, publishContentApplyPort };
}

function createMemoryPublishApply(context: Pick<MemoryRootContext,
  "publishContentBundleRepo" | "publishContentBaselineRepo" | "publishContentRunRepo" | "clock" | "idGen" | "outbox" |
  "changeSets" | "identity" | "publishContentSeedHash" | "postRepo" | "trashRepo" | "trash" | "mediaRepo" |
  "assetBlobRepo" | "blobStore" | "mediaContentTypeStore" | "redirectsWriteDeps" | "menuRepo" | "navLocationBindingRepo" |
  "siteThemes" | "formDefinitionRepo" | "contentTypeRepo" | "contentTypeIndexProvisioner" | "taxonomyRepo" | "termRepo" |
  "entryTermRepo" | "taxonomyRevisionRepo" | "entryRepo" | "entryRefsRepo" | "widgetBindingRepo" | "settingsRepo" |
  "settingsPrincipals" | "presentationRepo">): ReturnType<typeof memoryPublishContentApplyPort> {
  const { publishContentBundleRepo, publishContentBaselineRepo, publishContentRunRepo, clock, idGen, outbox,
    changeSets, identity, publishContentSeedHash } = context;
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
    ports: createMemoryPublishPorts(context),
  });

  return publishContentApplyPort;
}

function createMemoryPublishPorts(context: Parameters<typeof createMemoryPublishApply>[0]) {
  const { postRepo, trashRepo, trash, mediaRepo, assetBlobRepo, blobStore, mediaContentTypeStore, redirectsWriteDeps,
    menuRepo, navLocationBindingRepo, siteThemes, formDefinitionRepo, contentTypeRepo, contentTypeIndexProvisioner,
    taxonomyRepo, termRepo, entryTermRepo, taxonomyRevisionRepo, entryRepo, entryRefsRepo, widgetBindingRepo,
    settingsRepo, settingsPrincipals, presentationRepo } = context;
  return memoryPublishContentPorts({
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
  });
}

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

