import express from "express";
import { randomUUID } from "node:crypto";

import { InMemoryEventBus, InMemoryOutbox, processOutbox } from "../core/events";
import { InMemoryChangeSetRepo } from "../core/commands";
import { createSeoEventSubscriptions, createSeoPageHeadHook, ensureSeoSettingDefinitions } from "../seo";
import { registerPageHeadContributor } from "./http/site/page-head";
import { InMemoryPostRepo, InMemoryPostSearchIndex, createPostRevertRegistry } from "../features/post";
import { InMemoryPagesHtmlDocumentStore } from "../features/pages";
import {
  createInMemoryChatStoreFactory,
  InMemorySiteAssistantCredentialRepo,
  InMemoryAdminExecutionCredentialRepo,
  InMemoryExternalMcpServerRepo,
  ensurePublicAssistantSettingDefinitions,
  ensureExecutionSettingDefinitions,
} from "../assistant";
import { InMemoryPresentationSettingsRepo } from "../features/presentation";
import { InMemorySettingsRepo, ensureSettingsUiTabDefinitions } from "../features/settings";
import { discoverAllBuiltInThemes } from "../features/theme";
import { InMemoryWorkspaceRepo } from "../features/workspace";
import path from "node:path";
import { builtInThemesDir } from "./deps";
import {
  seededPosts,
  seededPresentation,
  seededWorkspace,
  seedSettingsFromPresentation,
  SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID,
} from "./seed";
import { LocalBufferSink } from "../analytics/repo.memory";
import {
  ConsoleMailerAdapter,
  InMemoryMagicLinkTokenRepo,
  InMemoryMemberRepo,
  InMemoryMemberSessionRepo,
  InMemoryMemberSubscriptionRepo,
  InMemoryMemberTierRepo,
} from "../members";
import { InMemoryMenuRepo, InMemoryNavLocationBindingRepo } from "../navigation";
import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "../integrations";
import { InMemoryKeyring } from "../integrations/keyring.memory";
import { createKeyringBackedSigner } from "../integrations/signing.keyring";
import { AesGcmSecretSealer } from "../integrations/secret-sealer.aesgcm";
import { InMemoryComposioConfigRepo } from "../connectors/composio-config-store.memory";
import { createComposioConnectors } from "../connectors/composio-service";
import { InMemoryConnectorCredentialRepo } from "../connectors/connector-credential-store.memory";
import { InMemoryMediaProviderCredentialRepo } from "../media/provider-credential-store.memory";
import {
  InMemoryAssetBlobRepo,
  InMemoryAssetRenditionRepo,
  InMemoryBlobStore,
  InMemoryImageTransformer,
  InMemoryMediaRepo,
  InMemoryTransformDefinitionRepo,
} from "../media";
import { createInMemoryIdentityRouteDeps } from "../identity/wiring";
import {
  InMemoryNewsletterAudienceSnapshotRepo,
  InMemoryNewsletterCampaignRepo,
  InMemoryNewsletterConfirmationTokenRepo,
  InMemoryNewsletterListRepo,
  InMemoryNewsletterSendRepo,
  InMemoryNewsletterSubscriptionRepo,
} from "../newsletter/repo.memory";
import { ensureDefaultList } from "../newsletter/lists";
import { createHookRegistry, handleSendBatchClaimed, SEND_BATCH_CLAIMED_EVENT } from "../newsletter/send-pipeline";
import type { SendBatchJob } from "../newsletter";
import { MembersSubscriberDirectory } from "../members";
import type { NewsletterRouteDeps } from "./routes/admin/newsletter/deps";
import { toSendPipelineDeps } from "./routes/admin/newsletter/deps";
import { createNewsletterModule } from "./modules/newsletter";
import type { NewsletterPublicRouteDeps } from "./routes/site/newsletter-deps";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "../forms/repo.memory";
import { FORMS_SUBMIT_PROFILE } from "../forms/rate-limit-profile";
import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "../origin";
import {
  InMemoryRedirectRepo,
  RedirectHitSinkImpl,
  RedirectPhaseHandlerResolver,
  redirectMatcher,
  RedirectSlugChangeCapture,
  registerRedirectHitOutboxHandler,
  registerRedirectsPhaseHandlers,
  type RedirectsWriteDeps,
} from "../redirects";
import { registerSlugChangeCapture } from "../routing";
import { InMemoryDbOpsAdapter, InMemoryDatabaseIntrospectionAdapter, InMemoryMigrationRunsRepo, InMemoryRestorePointsRepo, InMemorySiteStatusRepo, InMemoryDatabaseLedgerRepo } from "../features/database/repo.memory";
import { InMemoryContentTypeRepo, NoopContentTypeIndexProvisioner } from "../features/content-types";
import { InMemoryEntryRepo } from "../features/entries";
import { InMemoryWidgetRegionBindingRepo } from "../widgets/repo.memory";
import { InMemoryEntryRefsRepo } from "../core/entry-refs/repo.memory";
import { InMemoryPluginActivationRepo } from "../features/plugin-runtime/repo.memory";
import { WORD_COUNT_RUNTIME_SOURCE } from "../features/plugin-runtime/built-ins/word-count";
import { createPluginsModule } from "./modules/plugins";
import { composePluginRuntime } from "./plugin-runtime";
import { wireCoreResolvers } from "../widgets/resolvers/index";
import { createNavMenuReadModel } from "../navigation";
import { createCommentsModule, ensureCommentsSettingDefinitions } from "../comments";
import { createSettingsAnalyticsConfig, ensureAnalyticsSettingDefinitions } from "../analytics/config.settings";
import { InMemoryCommentRepo } from "../comments/repo.memory";
import { registerCommentsSubmitRoute } from "./routes/site/comments-submit";
import {
  InMemoryEntryTermRepo,
  InMemoryTaxonomyRepo,
  InMemoryTaxonomyRevisionRepo,
  InMemoryTermRepo,
  noopStampWatermark,
} from "../features/taxonomy";
import { AlwaysUnavailableWatermarkSource, RestorePointDeepLinkLookup } from "../features/recovery/repo.memory";
import { buildGatewayDeps, buildOwnerOnlyInstanceAuthorize } from "../core/gated-mutations/composition";
import { resolveRuntimeMode } from "#src/core/runtime-mode";
import { wrapMailerWithPurposeGate } from "../mail/purpose-scoped-mailer";
import { registerAdminTaxonomyMergeTermRoutes } from "./routes/admin/taxonomy/merge-term";
import { registerAdminDatabaseMigrateForwardRoutes } from "./routes/admin/database/migrate-forward";
import { registerAdminRecoveryRestoreRoutes } from "./routes/admin/recovery/restore";

import { applyDevCors } from "./middleware/dev-cors";
import { applySiteServingGate } from "./middleware/site-serving-gate";
import { registerAdminStatic } from "./middleware/admin-static";
import { registerSiteChatStatic } from "./middleware/site-chat-static";
import { registerThemePreviewStatic } from "./middleware/theme-preview-static";
import { registerThemeStaticAssets } from "./middleware/theme-static-assets";
import { registerThemePagePreview } from "./middleware/theme-page-preview";
import { registerSiteRoutes } from "./routes/site/pages";
import { registerStoreRoutes } from "./routes/site/store";
import { registerPaymentsWebhookRoute } from "./routes/site/payments-webhook";
import { registerProductRoutes } from "./routes/site/products";
import { registerAnalyticsIngestRoute } from "./routes/site/analytics-ingest";
import { registerContentPostGetRoute } from "./routes/content/posts/get-by-slug";
import { createCommentsModerationModule } from "./modules/comments-moderation";
import { createCoreModule } from "./modules/core";
import { createFormsModule } from "./modules/forms";
import { createMenusModule } from "./modules/menus";
import { createWidgetsModule } from "./modules/widgets";
import { createSettingsModule } from "./modules/settings";
import { createUsersModule } from "./modules/users";
import { createWorkspaceModule } from "./modules/workspace";
import { createIntegrationsModule } from "./modules/integrations";
import { createIntegrationsAdminModule } from "./modules/integrations-admin";
import { createConnectorsModule } from "./modules/connectors";
import { createExternalMcpModule } from "./modules/external-mcp";
import { createMediaModule } from "./modules/media";
import { createTaxonomyModule } from "./modules/taxonomy";
import { createContentModule } from "./modules/content";
import { createMembersModule } from "./modules/members";
import type { MembersRouteDeps } from "./routes/admin/members/deps";
import type { MemberPublicRouteDeps } from "./routes/members/deps";
import {
  createRateLimiter,
  MAGIC_LINK_COMPLETE_ATTEMPT,
  MAGIC_LINK_PER_EMAIL,
  MAGIC_LINK_PER_IP,
  SITE_ASSISTANT_PER_IP,
} from "#src/core/rate-limit/rate-limit";
import { createAnalyticsModule } from "./modules/analytics";
import { createCommerceModule } from "./modules/commerce";
import { registerAdminModuleStatusRoute } from "./routes/admin/system/module-status";
import { createFormsAdminModule } from "./modules/forms-admin";
import { registerFormsSubmitRoute } from "./routes/site/forms-submit";
import { createRedirectsModule } from "./modules/redirects";
import { createDatabaseRecoveryModule } from "./modules/database-recovery";
import { createContentTypesModule } from "./modules/content-types";
import { createSeoModule } from "./modules/seo";
import { createAssistantModule } from "./modules/assistant";
import { createSiteAssistantModule } from "./modules/site-assistant";
import { createAssistantChatsModule } from "./modules/assistant-chats";
import { createAssistantSettingsModule } from "./modules/assistant-settings";
import { createAssistantExecutionModule } from "./modules/assistant-execution";
import { createAssistantByokModule } from "./modules/assistant-byok";
import type { RouteDeps } from "./routes/types";

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
  readonly pluginFailureThreshold?: number;
}

/** In-memory route deps seeded from `./seed`. Default for tests/dev. */
export function createRouteDeps(options: CreateRouteDepsOptions = {}): NewsletterRouteDeps {
  const workspaceRepo = new InMemoryWorkspaceRepo([seededWorkspace]);
  const postRepo = new InMemoryPostRepo(seededPosts);
  const presentationRepo = new InMemoryPresentationSettingsRepo([seededPresentation]);
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowIso: () => new Date().toISOString() };
  const idGen = { newId: () => randomUUID() };
  const pluginActivationRepo = new InMemoryPluginActivationRepo();
  const pluginRuntime = composePluginRuntime({
    workspaceId: seededWorkspace.id,
    clock,
    activationRepo: pluginActivationRepo,
    sources: [WORD_COUNT_RUNTIME_SOURCE],
    ...(options.pluginFailureThreshold === undefined
      ? {}
      : { failureThreshold: options.pluginFailureThreshold }),
  });
  const identity = createInMemoryIdentityRouteDeps({ workspaceId: seededWorkspace.id, clock, idGen });
  // Fire-and-forget, mirroring `identityReady` (see routes/types.ts's `settingsReady` doc) — this
  // composition root stays synchronous; consumers await `settingsReady` before relying on the
  // migrated value being present.
  const settingsReady = seedSettingsFromPresentation({
    presentationRepo,
    settingsRepo,
    clock,
    ids: idGen,
    principals: identity.principalRepo,
    systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID,
  }).then(() => undefined);

  // SPEC-008 (ADR-PIPE-008 Decision §3, T050) — idempotently registers the 8 `site.seo.*`
  // definitions at boot, mirroring `settingsReady`'s fire-and-forget shape. Chained AFTER
  // `settingsReady` resolves (not fired in parallel) — see `deps.ts`'s identical fix for why:
  // two independent writers opening the settings chokepoint's transaction concurrently on the
  // SQLite composition root throws; chaining keeps both composition roots' boot sequence identical.
  const seoReady = settingsReady.then(() =>
    ensureSeoSettingDefinitions(
      { settingsRepo, clock, ids: idGen, principals: identity.principalRepo },
      { workspaceId: seededWorkspace.id, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }
    ).then(() => undefined)
  );

  // SPEC-035 (ADR-028 Settings Layered Ledger wiring for Comments) — idempotently registers the 6
  // `comments.*` definitions at boot, mirroring `seoReady`'s exact fire-and-forget shape. Chained
  // AFTER `seoReady` resolves (not fired in parallel) for the identical reason `seoReady` itself
  // chains after `settingsReady` — see that binding's comment immediately above.
  const commentsSettingsReady = seoReady.then(() =>
    ensureCommentsSettingDefinitions(
      { settingsRepo, clock, ids: idGen, principals: identity.principalRepo },
      { workspaceId: seededWorkspace.id, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }
    ).then(() => undefined)
  );

  // The visitor-facing assistant's master switch (`assistant/public-assistant-settings.ts`).
  // Chained after `commentsSettingsReady` rather than fired in parallel, for the identical reason
  // that binding chains after `seoReady` — see `seoReady`'s own comment above. Registering the
  // definition does NOT enable anything: its default is `false`.
  const assistantSettingsReady = commentsSettingsReady.then(() =>
    ensurePublicAssistantSettingDefinitions(
      { settingsRepo, clock, ids: idGen, principals: identity.principalRepo },
      { workspaceId: seededWorkspace.id, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }
    ).then(() => undefined)
  );

  // The admin "Execution mode" tab's `core.execution.*` definitions
  // (`assistant/execution-mode-settings.ts`). Chained after `assistantSettingsReady` rather than
  // fired in parallel, for the identical single-SQLite-connection-transaction reason `seoReady`'s
  // own comment above documents. `ownerKind: "core"` (not "site"), so unlike the three bindings
  // above this one does not pass a `workspaceId` into the registration call — see that file's
  // header for the namespace-fence reasoning.
  const executionSettingsReady = assistantSettingsReady.then(() =>
    ensureExecutionSettingDefinitions(
      { settingsRepo, clock, ids: idGen, principals: identity.principalRepo },
      { systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }
    ).then(() => undefined)
  );

  // The remaining ledger-only settings-dialog tabs (Instructions, Notifications, Privacy).
  // Chained after `executionSettingsReady` rather than fired alongside it for the same
  // single-SQLite-connection-transaction reason every registration above documents.
  const settingsUiTabsReady = executionSettingsReady.then(() =>
    ensureSettingsUiTabDefinitions(
      { settingsRepo, clock, ids: idGen, principals: identity.principalRepo },
      { systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }
    ).then(() => undefined)
  );

  // The public analytics beacon's `core.analytics.*` definitions (`analytics/config.settings.ts`).
  // Chained after `settingsUiTabsReady` rather than fired alongside it, for the identical
  // single-SQLite-connection-transaction reason every registration above documents.
  const analyticsSettingsReady = settingsUiTabsReady.then(() =>
    ensureAnalyticsSettingDefinitions(
      { settingsRepo, clock, ids: idGen, principals: identity.principalRepo },
      { systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }
    ).then(() => undefined)
  );

  // SPEC-011 (Newsletter) — declared here (not inline in the return object) so `newsletterReady`
  // below can seed the default list against the SAME repo instance the returned deps expose.
  const newsletterListRepoInMemory = new InMemoryNewsletterListRepo();

  // SPEC-009 (Redirects, ADR-PIPE-009) — FIRST-TIME composition-root wiring of `origin`'s
  // OriginRegistry and `routing`'s registration functions (Context item 4: neither library had a
  // real consumer before this feature). Seeds a `dev-capability` verified origin for the single
  // seeded workspace, mirroring every other dev-mode fixture in this file (e.g. `seededWorkspace`).
  const originRegistry = new OriginRegistry({
    repo: new InMemoryOriginSettingRepo([
      {
        workspaceId: seededWorkspace.id,
        origin: createVerifiedOrigin({
          scheme: "http",
          host: "localhost",
          port: 3000,
          verifiedAt: clock.nowIso(),
          source: "dev-capability",
        }),
        // ADR-PIPE-015 T016: a dev-capability egress allowlist entry so the real
        // isAllowedEgressTarget oracle doesn't fail-closed on every fresh dev server — matches the
        // `example.com` target every integrations fixture/test in this repo already uses.
        egressAllowlist: ["example.com"],
      },
    ]),
  });
  const redirectRepo = new InMemoryRedirectRepo();
  const redirectHitSink = new RedirectHitSinkImpl();
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  // Admin-UI backend-gap closure (design-spec.md §0.4/§4.8, this dispatch): declared here (not
  // inline in the return object) so Recovery's `deepLinkRestorePointLookup` below reads the SAME
  // in-memory rows Database's restore-points routes write into, not a second, disconnected instance.
  const restorePointsRepo = new InMemoryRestorePointsRepo();
  const redirectsWriteDeps: RedirectsWriteDeps = {
    repo: redirectRepo,
    db: redirectRepo,
    transaction: async (fn) => fn(),
    matcher: redirectMatcher,
    originRegistry,
    clock,
    idGen,
    outbox,
  };
  registerRedirectsPhaseHandlers({
    resolver: new RedirectPhaseHandlerResolver({
      repo: redirectRepo,
      matcher: redirectMatcher,
      originRegistry,
      hits: { outbox, clock, idGen },
    }),
  });
  registerSlugChangeCapture(
    new RedirectSlugChangeCapture({ repo: redirectRepo, db: redirectRepo, clock, idGen })
  );
  void registerRedirectHitOutboxHandler({ bus, hitSink: redirectHitSink });

  // ADR-031/ADR-023 (SPEC-033) — hoisted so the Comments module's `entryLookup` reads the SAME
  // in-memory entries the rest of the hermetic composition writes into (mirrors
  // `restorePointsRepo`'s identical hoisting rationale above).
  const entryRepo = new InMemoryEntryRepo();
  // SPEC-043/ADR-047 (widgets) — hoisted alongside `entryRepo` for the same reason: both the admin
  // `widgets` routes and the public site-render path (`routes/site/pages.ts` → `resolvePageWidgets`,
  // W-004) must see the SAME binding/ref-index state, not two independent in-memory instances.
  const widgetBindingRepo = new InMemoryWidgetRegionBindingRepo();
  const entryRefsRepo = new InMemoryEntryRefsRepo();
  const menuRepo = new InMemoryMenuRepo();
  const navLocationBindingRepo = new InMemoryNavLocationBindingRepo();
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  // SPEC-043/ADR-047 (widgets, Fable adversarial-review fix 2026-07-21) — mirrors `server/deps.ts`'s
  // identical fix: without this, no test exercising the real HTTP path ever ran a dynamic widget
  // type (`menu`/`recent-entries`/`contact-form`) through its actual resolver, only test doubles.
  wireCoreResolvers({
    entryList: entryRepo,
    navMenuReadModel: createNavMenuReadModel({ menuRepo, bindingRepo: navLocationBindingRepo }),
    formDefinitionRepo,
  });
  const commentsModule = createCommentsModule({
    commentRepo: new InMemoryCommentRepo(),
    entryRepo,
    outbox,
    clock,
    idGen,
    settingsRepo,
  });

  // SPEC-011 (Newsletter) Stage 5 wiring — hoisted so `newsletterSubscriberDirectory` below reads
  // the SAME member rows the returned `memberRepo` field exposes (mirrors `entryRepo`/
  // `widgetBindingRepo`'s identical hoisting rationale above), and so `newsletterKeyring` is the
  // ONE process-lifetime `KeyringPort` instance also used to build `webhookSigner` just below —
  // one root key, purpose-namespaced (`integrations/ports.ts`'s `KeyringPort.derive()` contract),
  // not two independent keyrings.
  const memberRepo = new InMemoryMemberRepo([]);
  const newsletterKeyring = new InMemoryKeyring();
  const newsletterSubscriberDirectory = new MembersSubscriberDirectory({ members: memberRepo });
  const newsletterHooks = createHookRegistry();

  // ADR-058: the SITE assistant credential store's OWN `KeyringPort` instance, deliberately not
  // `newsletterKeyring` above — see `routes/types.ts`'s `siteAssistantSecretKeyring` doc and ADR-058
  // §2 for why a separate instance matters in the real composition root (`server/deps.ts`). This
  // hermetic root has no "fail closed on a missing env var" concern to preserve (there is no env var
  // here at all), so a second `InMemoryKeyring` is just the same rule-of-two test double, kept
  // distinct so this root's wiring shape matches `deps.ts`'s one-instance-per-purpose shape.
  const siteAssistantSecretKeyring = new InMemoryKeyring();
  const siteAssistantSecretSealer = new AesGcmSecretSealer(siteAssistantSecretKeyring);

  // Composio connectors, hermetic half. No boot `refresh()` here, unlike `deps.ts`: the in-memory
  // repo starts empty every time, so hydrating it could only ever install the same empty config
  // the provider is already constructed with.
  const composioConfigRepo = new InMemoryComposioConfigRepo();
  const composioConnectors = createComposioConnectors({
    workspaceId: seededWorkspace.id,
    repo: composioConfigRepo,
    credentialRepo: new InMemoryConnectorCredentialRepo(),
    sealer: siteAssistantSecretSealer,
    keyring: siteAssistantSecretKeyring,
    clock,
    ...(process.env.TOVU_COMPOSIO_BASE_URL ? { baseUrl: process.env.TOVU_COMPOSIO_BASE_URL } : {}),
  });

  return {
    workspaceId: seededWorkspace.id,
    workspaceRepo,
    postRepo,
    // Mirrors `postRepo` on every query rather than maintaining an index — see
    // `features/post/search-index.memory.ts` for why that is right for this root and wrong for
    // `deps.ts`'s. Constructed eagerly, but its scratch database is not opened until the first
    // search, so the many tests that call `createRouteDeps()` without searching pay nothing.
    postSearch: new InMemoryPostSearchIndex(postRepo),
    // Backed by `postRepo` above, NOT by a throwaway `:memory:` ContentDb — this root's posts do
    // not live in any SQLite database, so a real-adapter-over-scratch-db would edit rows nothing
    // else in this root can see. See `features/pages/html-document-store.memory.ts`'s header.
    // `entryRefsRepo` (SPEC-047 Slice 3) is the same instance `RouteDeps.entryRefsRepo` below
    // exposes — one shared index, mirroring `server/deps.ts`'s identical wiring.
    pagesHtmlStore: (scope) => new InMemoryPagesHtmlDocumentStore(scope, { repo: postRepo, clock, entryRefsRepo }),
    // No in-memory *reimplementation* of the chat store: this root gets the real adapter over a
    // throwaway `:memory:` database. `search-index.memory.ts` earns a hand-written double because
    // it mirrors `postRepo` rather than maintaining an index; chat history has no such alternate
    // shape, so a second implementation would only be a second thing to keep in sync — and the
    // one property tests most need to trust here is the isolation predicate, which only the real
    // adapter has. `ensureChatHistoryTables` is the package's own path for a host with no
    // migration system, which is exactly this root's situation.
    chatHistory: createInMemoryChatStoreFactory(),
    presentationRepo,
    settingsRepo,
    settingsReady,
    seoReady,
    assistantSettingsReady,
    siteAssistantCredentialRepo: new InMemorySiteAssistantCredentialRepo(),
    siteAssistantSecretSealer,
    siteAssistantSecretKeyring,
    adminExecutionCredentialRepo: new InMemoryAdminExecutionCredentialRepo(),
    mediaProviderCredentialRepo: new InMemoryMediaProviderCredentialRepo(),
    externalMcpServerRepo: new InMemoryExternalMcpServerRepo(),
    composioConfigRepo,
    composioConnectors,
    executionSettingsReady,
    settingsUiTabsReady,
    analyticsSettingsReady,
    // BR-04 (2026-07-16): the repo forwards insert()'s optional event to this SAME outbox
    // instance, matching what the old separate executeCommand()-level enqueue() call did.
    changeSets: new InMemoryChangeSetRepo([], [], outbox),
    // Pre-loaded with the post-domain reverters, closed over the SAME postRepo/clock/outbox
    // instances this root threads through everything else (ADR-018 C-005/C-006; 2026-08-13
    // features-post-deep-import-trace.md Job 2 — see `features/post/reverters.ts`'s header).
    revertRegistry: createPostRevertRegistry({ postRepo, clock, outbox }),
    themes: discoverAllBuiltInThemes({ dir: builtInThemesDir(), source: "built-in" }),
    themesDir: builtInThemesDir(),
    outbox,
    bus,
    clock,
    idGen,
    analyticsSink: new LocalBufferSink(),
    analyticsConfig: createSettingsAnalyticsConfig({ settingsRepo }),
    ...identity,
    redirectRepo,
    redirectHitSink,
    originRegistry,
    redirectsWriteDeps,
    memberRepo,
    memberTierRepo: new InMemoryMemberTierRepo([]),
    memberSubscriptionRepo: new InMemoryMemberSubscriptionRepo([]),
    memberSessionRepo: new InMemoryMemberSessionRepo([]),
    magicLinkRepo: new InMemoryMagicLinkTokenRepo([]),
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
    // stay hermetic (no filesystem writes) — the real running server (`server/deps.ts`) uses
    // `LocalFsBlobStore` for actual byte durability while keeping rows in-memory too (see that
    // file's comment for why: no SQLite adapter exists yet for this newer library, matching the
    // disclosed precedent the last several admin-section libraries followed).
    mediaRepo: new InMemoryMediaRepo([]),
    assetBlobRepo: new InMemoryAssetBlobRepo([]),
    assetRenditionRepo: new InMemoryAssetRenditionRepo([]),
    blobStore: new InMemoryBlobStore(),
    // ADR-027 §4 transform registry + rendition generation (new in this task): in-memory registry
    // rows (no SQLite adapter yet, same disclosed precedent as the media repos above) and the
    // deterministic `InMemoryImageTransformer` test double here so hermetic tests never depend on
    // `sharp` being installed — see `src/media/image-transformer.sharp.ts`'s file header for the
    // disclosed blocker on the real adapter, which `server/deps.ts` wires instead.
    transformDefinitionRepo: new InMemoryTransformDefinitionRepo([]),
    imageTransformer: new InMemoryImageTransformer(),
    // SPEC-011 (Newsletter): in-memory adapters — no `declareDataModule()` boot step needed (that
    // mechanism is SQLite-only), so `newsletterReady` resolves immediately, unlike `server/deps.ts`'s
    // real fire-and-forget install. `membersConsentCapability` stays `null` (unbound) — see that
    // file's identical note.
    // T030: seed the default "all subscribers" list once, same as `server/deps.ts`'s real boot path.
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
    formSubmissionRepo: new InMemoryFormSubmissionRepo(),
    formsRateLimiter: createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock }),
    // SPEC-046 REQ-7 — same one-process-lifetime-counter-store shape as `formsRateLimiter` above,
    // matching `server/deps.ts`'s real composition's identical construction.
    siteAssistantRateLimiter: createRateLimiter({ profile: SITE_ASSISTANT_PER_IP, clock }),
    // ADR-041 §1/§2 (Database Timeline): in-memory ledger, same disclosed precedent as every other
    // feature's hermetic test/dev composition above. `server/deps.ts`'s real composition opens
    // the sidecar `ops/database-journal.db` and uses `SqliteDatabaseLedgerRepo` instead.
    databaseLedgerRepo: new InMemoryDatabaseLedgerRepo(),
    migrationRunsRepo: new InMemoryMigrationRunsRepo(),
    // Admin-UI backend-gap closure (design-spec.md §0.4, this dispatch): in-memory adapters for
    // content-types/entries/taxonomy (no SQLite adapter exists yet for any of the three — see
    // `routes/types.ts`'s doc comment on this field group for the full disclosure) plus the
    // restore-points/dbOps/site-status/recovery seams the Database/Recovery screens' remaining
    // read routes need.
    contentTypeRepo: new InMemoryContentTypeRepo(),
    contentTypeIndexProvisioner: new NoopContentTypeIndexProvisioner(),
    entryRepo,
    taxonomyRepo: new InMemoryTaxonomyRepo(),
    termRepo: new InMemoryTermRepo(),
    entryTermRepo: new InMemoryEntryTermRepo(),
    taxonomyRevisionRepo: new InMemoryTaxonomyRevisionRepo(),
    stampWatermark: noopStampWatermark,
    restorePointsRepo,
    dbOps: new InMemoryDbOpsAdapter(),
    databaseIntrospection: new InMemoryDatabaseIntrospectionAdapter(),
    siteStatusRepo: new InMemorySiteStatusRepo(),
    disclosureWatermarkSource: new AlwaysUnavailableWatermarkSource(),
    deepLinkRestorePointLookup: new RestorePointDeepLinkLookup(restorePointsRepo),
    // SPEC-016 (`core/gated-mutations`'s gateway, ADR-041 §5) — same composition `server/deps.ts`
    // wires for the real server, mirrored here for the hermetic test/dev composition (its own
    // `InMemoryTokenStore` instance — see `core/gated-mutations/composition.ts`'s file header for
    // the disclosed `TokenStorePort` decision). `authorizeInstance` mirrors `server/deps.ts`'s own
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
    commentWriteService: commentsModule.writeService,
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
    pluginBeforeSaveHook: pluginRuntime.beforeSaveHook,
  };
}

export function createApp(routeDeps: RouteDeps = createRouteDeps()) {
  const app = express();
  applyDevCors(app);
  // ADR-041/043/044/045 re-audit (2026-07-16, TM-adr041-043-044-045-audit-001, round-2, codex
  // finding R2-F2-BLOCK-NOT-ENFORCED) — must run before every other route/middleware so a
  // BLOCKED_PENDING_RECOVERY site refuses normal traffic regardless of which route would have
  // handled it. See site-serving-gate.ts's own header for the allowlist rationale.
  applySiteServingGate(app, { siteStatusRepo: routeDeps.siteStatusRepo, workspaceId: routeDeps.workspaceId });

  // MUST stay ahead of the blanket `express.json()` immediately below. Payment webhooks are
  // HMAC-signed over the exact received bytes, and the blanket parser destroys them — so this one
  // route registers its own `express.raw()` first and terminates the response before the JSON
  // parser layer is ever reached. See `routes/site/payments-webhook.ts`'s file header for why
  // registration order is the fix and why the API is resolved per request rather than captured
  // here. This is the only route in the app that inverts the parser/route registration order.
  registerPaymentsWebhookRoute(app, { resolveLipay: () => routeDeps.lipay ?? null });

  // Default 100kb body limit is too small for the media upload route, which accepts
  // base64-encoded bytes in the JSON body (no multipart-parsing dependency in this repo yet —
  // see routes/admin/media/upload.ts's file comment for the disclosed simplification). 15mb
  // covers modest walking-skeleton test/dev uploads; a real implementation should stream
  // multipart/octet-stream instead of inflating bytes through base64 JSON.
  app.use(express.json({ limit: "15mb" }));

  void routeDeps.bus.subscribe("workspace.created", async (event) => {
    // Demonstration side effect. Replace with indexers/webhooks/etc.
    console.log("event handled:", event.name, event.payload);
  });

  // SPEC-008 (ADR-PIPE-008 Decision §5, T038) — SEO subscribes to the 3 entry-lifecycle events
  // `post.ts`'s `updatePost()` now emits, invalidating that workspace's sitemap cache entry on
  // delivery (idempotent per ADR-009 — a duplicate delivery is a no-op, `invalidateSitemapCache`
  // is itself idempotent). Real event delivery requires the producing route to drain the outbox
  // (see `routes/admin/posts/update.ts`'s `processOutbox` call, mirroring the `/workspaces` route
  // below).
  const seoEventSubscriptions = createSeoEventSubscriptions();
  void routeDeps.bus.subscribe("entry.published", (event) => seoEventSubscriptions.onEntryPublished(event as never));
  void routeDeps.bus.subscribe("entry.updated", (event) => seoEventSubscriptions.onEntryUpdated(event as never));
  void routeDeps.bus.subscribe("entry.unpublished", (event) => seoEventSubscriptions.onEntryUnpublished(event as never));

  // SPEC-008 (ADR-PIPE-008 Decision §2/§3, T009) — SEO's `page.head` contributor, registered once
  // at boot into the core-owned `page-head.ts` registry (never imported directly by `render.ts`).
  registerPageHeadContributor(
    createSeoPageHeadHook({ postRepo: routeDeps.postRepo, settingsRepo: routeDeps.settingsRepo, media: routeDeps })
  );

  // ADR-046 Phase 3 (SPEC-039): the `core` server module — ops routes, then
  // login/logout/me (ungated), then the `/api/admin` session gate, all
  // registered together in that order so login is never caught by its own
  // gate. Real argon2id + principal/session model (ADR-021/SPEC-006) — see
  // middleware/dev-auth.ts.
  createCoreModule(routeDeps).registerRoutes?.(app);

  // ADR-046 Phase 3 (SPEC-038): the `content` server module — 11 posts/pages/change-sets/
  // presentation admin routes. `registerContentPostGetRoute` (public site content serving) stays
  // inline immediately below — it was never one of this module's 11 registrations.
  createContentModule(routeDeps).registerRoutes?.(app);
  registerContentPostGetRoute(app, routeDeps);

  // ADR-PIPE-013 Decision §2-3 (FEAT-013 Phase 2) — one shared
  // MAGIC_LINK_PER_EMAIL limiter instance consulted by BOTH the admin
  // request-magic-link route and the new public sign-in route (C-015: one
  // counter per email, not two). Per-boot-scoped, mirroring
  // `registerAuthRoutes`'s own `loginRateLimiter` construction.
  const magicLinkPerEmailLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock });
  const magicLinkPerIpLimiter = createRateLimiter({ profile: MAGIC_LINK_PER_IP, clock: routeDeps.clock });
  const magicLinkCompleteAttemptLimiter = createRateLimiter({ profile: MAGIC_LINK_COMPLETE_ATTEMPT, clock: routeDeps.clock });
  const membersDeps: MembersRouteDeps = { ...routeDeps, magicLinkPerEmailLimiter };

  // NEW public (non-admin) member route family (ADR-PIPE-013 Decision §2-3) —
  // mounted OUTSIDE /api/admin's `requireAdminSession` middleware (this
  // family is unauthenticated by design), alongside the existing
  // `registerContentPostGetRoute`-style public mount above. Boot-time repo
  // adapters remain in-memory (Decision §5) — unchanged by this wiring.
  const memberPublicDeps: MemberPublicRouteDeps = {
    workspaceId: routeDeps.workspaceId,
    memberRepo: routeDeps.memberRepo,
    memberTierRepo: routeDeps.memberTierRepo,
    memberSubscriptionRepo: routeDeps.memberSubscriptionRepo,
    memberSessionRepo: routeDeps.memberSessionRepo,
    magicLinkRepo: routeDeps.magicLinkRepo,
    mailer: routeDeps.mailer,
    clock: routeDeps.clock,
    idGen: routeDeps.idGen,
    magicLinkPerEmailLimiter,
    magicLinkPerIpLimiter,
    magicLinkCompleteAttemptLimiter,
  };
  // ADR-046 Phase 3 (SPEC-038): the `members` server module — 4 admin CRUD/list routes + 2 public
  // sign-in routes, genuinely two deps objects (see `modules/members.ts`'s file header).
  createMembersModule({ admin: membersDeps, public: memberPublicDeps }).registerRoutes?.(app);

  // SPEC-011 (Newsletter, ADR-PIPE-011) Stage 5 — the `newsletter` server module: 19 admin routes
  // (inside the `/api/admin` gate mounted by `createCoreModule` above) + 2 public, cookie-less,
  // token-only routes (`newsletter-confirm.ts`/`newsletter-unsubscribe.ts`), genuinely two deps
  // objects, same rationale as `members` immediately above (see `modules/newsletter.ts`'s header).
  // `routeDeps` is cast to `NewsletterRouteDeps` here (not widened) — mirrors every admin
  // newsletter route file's own `routeDeps as NewsletterRouteDeps` cast (`routes/admin/newsletter/
  // deps.ts`'s file header); `createRouteDeps()`'s actual return type already IS
  // `NewsletterRouteDeps`, this parameter's own `RouteDeps` annotation is just narrower.
  const newsletterAdminDeps = routeDeps as NewsletterRouteDeps;
  const newsletterPublicDeps: NewsletterPublicRouteDeps = {
    workspaceId: newsletterAdminDeps.workspaceId,
    newsletterReady: newsletterAdminDeps.newsletterReady,
    newsletterConfirmationTokenRepo: newsletterAdminDeps.newsletterConfirmationTokenRepo,
    newsletterSubscriptionRepo: newsletterAdminDeps.newsletterSubscriptionRepo,
    newsletterKeyring: newsletterAdminDeps.newsletterKeyring,
    mailer: newsletterAdminDeps.mailer,
    membersConsentCapability: newsletterAdminDeps.membersConsentCapability,
    originRegistry: newsletterAdminDeps.originRegistry,
    clock: newsletterAdminDeps.clock,
    idGen: newsletterAdminDeps.idGen,
  };
  createNewsletterModule({ admin: newsletterAdminDeps, public: newsletterPublicDeps }).registerRoutes?.(app);

  // T040 (tasks.md Phase 4) — the `newsletter.send.batch.claimed` bus subscriber `send-pipeline.ts`'s
  // own file header names as the one piece of Stage 4 wiring no composition root had done yet
  // (found while wiring Stage 5's `send-campaign.ts`, which is the only real caller of `claimBatch`/
  // `processOutbox` for this campaign). Mirrors the demonstration `bus.subscribe("workspace.created",
  // ...)` above. In practice this handler is never reached in either composition root today: no real
  // `MailerPort` adapter exists yet, so `authorizeSend`'s Launch Gate check always rejects before
  // `freezeAudience` ever enqueues a batch (tasks.md's disclosed, by-design "Real Sending Is
  // Inherently Blocked Today" flag) — wired now anyway so the pipeline is genuinely complete end to
  // end the moment a real adapter lands, not silently half-wired.
  void routeDeps.bus.subscribe<SendBatchJob>(SEND_BATCH_CLAIMED_EVENT, async (event) => {
    await handleSendBatchClaimed({ deps: toSendPipelineDeps(newsletterAdminDeps), job: event.payload });
  });

  // ADR-046 Phase 3 (SPEC-041): the `analytics` server module — the single admin "recent hits"
  // read route (ADR-035/ADR-PIPE-014).
  createAnalyticsModule(routeDeps).registerRoutes?.(app);
  // ADR-001 bounded operational read: provider discovery reflects only the optional composed
  // payment runtime; configuration and downstream Commerce capabilities remain explicitly absent.
  createCommerceModule(routeDeps).registerRoutes?.(app);
  // ADR-054: the PUBLIC visitor assistant. Deliberately NOT behind `requireAdminSession` — it is
  // the one assistant surface anonymous traffic may reach, which is why it runs on its own
  // in-process provider relay with a read-only published-content tool surface rather than the
  // admin's process-spawning agent daemon. `start()` logs the demo-gate state at boot.
  const siteAssistantModule = createSiteAssistantModule(routeDeps);
  siteAssistantModule.start?.();
  siteAssistantModule.registerRoutes?.(app);
  registerAdminModuleStatusRoute(app, routeDeps);
  // ADR-046 Phase 3 (SPEC-040): the `comments-moderation` server module — 4 admin
  // moderation-queue/moderate/settings routes. Distinct from `createCommentsModule` above
  // (the ADR-031 backend composition) and from `registerCommentsSubmitRoute` below (the public,
  // unauthenticated submission route, which stays inline near the site catch-all).
  createCommentsModerationModule(routeDeps).registerRoutes?.(app);
  // ADR-046 Phase 3 (SPEC-040): the `menus` server module — 6 admin CRUD/location-assignment
  // routes (ADR-029). `MenuRouteDeps` reused as-is from its existing location in
  // `http/admin/menus.ts` (see `modules/menus.ts`'s file header for why it lives there).
  createMenusModule(routeDeps).registerRoutes?.(app);
  // SPEC-043 (widgets, ADR-047) — 13 admin routes (instance CRUD, region binding/placement,
  // server-side embed mutation) + the widgets.place/create/remove/diagnose AI tool surface.
  // `RouteDeps` already carries every dependency this module needs (`widgetBindingRepo`/
  // `entryRefsRepo`, added by this same dispatch) — no widened deps type, unlike menus.
  createWidgetsModule(routeDeps).registerRoutes?.(app);
  // SPEC-005 (ADR-005-ARCH) — the `plugins` server module: PLUGINS_LIST/PLUGIN_SET_ENABLED (REQ-10).
  createPluginsModule(routeDeps).registerRoutes?.(app);
  // ADR-046 Phase 3 (SPEC-034): the `integrations-admin` server module — 5 admin CRUD/read routes
  // over webhook subscriptions/deliveries (ADR-036). Distinct from `createIntegrationsModule`
  // below, which owns the Forms-to-webhook fan-out subscriber, not an HTTP surface.
  createIntegrationsAdminModule(routeDeps).registerRoutes?.(app);
  // ADR-046 Phase 3 (SPEC-034): the `media` server module — 5 admin routes + the public rendition
  // route (previously registered much later, see below near the old catch-all-precedence group;
  // moved up here since its only real constraint, "before `/:slug`", still holds — see
  // `modules/media.ts`'s file header for the full disclosure).
  createMediaModule(routeDeps).registerRoutes?.(app);
  // The `connectors` server module — Composio-backed third-party accounts behind the admin's
  // Settings → Connectors tab. Registered next to `integrations-admin` above because the two share
  // the `admin.integrations.manage` permission, but they own different subsystems (outbound
  // webhooks there, inbound third-party accounts here) — see `modules/connectors.ts`.
  createConnectorsModule(routeDeps).registerRoutes?.(app);
  createExternalMcpModule(routeDeps).registerRoutes?.(app);
  // ADR-046 Phase 3 (SPEC-040): the `users` server module — 8 admin CRUD/list routes over
  // users/roles/policies (ADR-021/SPEC-006 identity RBAC).
  createUsersModule(routeDeps).registerRoutes?.(app);
  // SPEC-044: the `workspace` server module — 5 admin routes (list/create/get/update/delete), the
  // real successor to the original unauthenticated inline `POST /workspaces` route this file used
  // to own directly (see the file header note).
  createWorkspaceModule(routeDeps).registerRoutes?.(app);
  // ADR-046 Phase 3 (SPEC-040): the `settings` server module — 5 admin settings HTTP routes
  // (SPEC-007 Phase 5, T043).
  createSettingsModule(routeDeps).registerRoutes?.(app);

  // ADR-046 Phase 3 (SPEC-041): the `forms-admin` server module — 7 admin routes (definitions
  // CRUD + submissions list/get/delete), gated per api.spec.md §2's `admin.forms.*` profiles.
  // Distinct from `createFormsModule` below, which owns the Forms-to-notify-subscriber
  // subscription, not an HTTP surface.
  createFormsAdminModule(routeDeps).registerRoutes?.(app);

  // ADR-046 Phase 3 (SPEC-041): the `redirects` server module — 7 admin routes (list/get/create/
  // update/tombstone/import/hits), each gated by `admin.redirects.manage` (api.spec.md §1/§2).
  createRedirectsModule(routeDeps).registerRoutes?.(app);

  // ADR-046 Phase 3 (SPEC-042, final slice): the `database-recovery` server module — all 7
  // Database/Recovery plain registrations (Timeline + restore-points list/create, Recovery's own
  // restore-points list, disclosure, deep-link, status). Consolidates what used to be two
  // non-contiguous inline blocks (this one, plus a second block after `createTaxonomyModule`
  // below) into one call site — see `modules/database-recovery.ts`'s file header for the full
  // disclosure of why that consolidation is safe (no path overlap with content-types/entries/
  // taxonomy). `registerAdminDatabaseMigrateForwardRoutes`/`registerAdminRecoveryRestoreRoutes`
  // (the 2 gated-mutation ceremonies) stay inline below, unchanged non-goal since SPEC-031.
  createDatabaseRecoveryModule(routeDeps).registerRoutes?.(app);

  // Built ONCE, by calling `createAssistantByokModule` here (rather than at its original position
  // below) so its returned `.toolSurface` can be handed to `createAssistantModule` immediately after
  // — never folded into `routeDeps` (that bag already carries 53 back-edges into this file, a
  // tracked architectural metric; see `npm run check:architecture`). Deliberately NOT
  // `createByokToolSurface(routeDeps)` called directly here: that would add a new edge from this
  // file straight to `byok-tool-surface.ts`, and measuring with `check:architecture` showed that one
  // edge alone regresses the "core size" metric (it flips ~17 files into the core classification,
  // both fan-in and fan-out above the graph median) — this file already transitively reaches that
  // module THROUGH `createAssistantByokModule`, so reading the value off its return object is free.
  // See `AssistantByokModuleHandle`'s own doc for the full trace.
  const byokAssistantModule = createAssistantByokModule(routeDeps);

  // ADR-049: the admin assistant's tool-execution/run surface, composed from the published
  // `@jini-ai/core` + `@jini-ai/daemon` + `@jini-ai/node-host` kernel — see `src/assistant/`.
  createAssistantModule(routeDeps, byokAssistantModule.toolSurface.surfaceExchanges).registerRoutes?.(app);

  // Durable transcripts for that same assistant, in `content.db` rather than the daemon. Separate
  // module because nothing here is proxied: run execution belongs to the daemon (that is where run
  // state lives), while history belongs to Tovu's own database, where backups, snapshots, and
  // workspace scoping already work. The daemon can restart or be replaced without touching it.
  createAssistantChatsModule(routeDeps).registerRoutes?.(app);

  // The AI Assistant admin section's 2 settings routes (GET/PUT the public assistant's master
  // switch). Registered next to `createAssistantModule` for readability only — the two modules share
  // no dependencies and no path prefix (see `modules/assistant-settings.ts`'s header), and both sit
  // inside the `/api/admin` session gate, so this position is not load-bearing.
  createAssistantSettingsModule(routeDeps).registerRoutes?.(app);
  // The same admin section's "Execution mode" tab — Local CLI detection + BYOK connection
  // test/model discovery. Separate module from the settings pair above for the reason
  // `modules/assistant-execution.ts`'s header gives (stateless egress probes, not settings CRUD).
  createAssistantExecutionModule(routeDeps).registerRoutes?.(app);
  // 2026-08-04: the admin dock's "API · BYOK" execution mode — a second, provider-direct run path
  // alongside `createAssistantModule`'s daemon proxy above. Composes its own registry/executor over
  // the SAME `buildAssistantToolRegistrations` catalog the daemon uses (see `modules/assistant-byok.ts`'s
  // header for the full trace and disclosed gaps). Reuses this SAME `routeDeps` — the whole reason
  // this can be a second, independent composition rather than a daemon-process change. Routes only —
  // the module itself (and its `toolSurface`) was already built above, so
  // `createAssistantModule`'s redemption proxy shares the exact same confirmation store.
  byokAssistantModule.registerRoutes?.(app);

  // ADR-046 Phase 3 (SPEC-042, final slice): the `content-types` server module (ADR-043
  // Collections backend) — all 8 registrations (content-types' list/register/update-fields/
  // lifecycle, entries' list/create/update/lifecycle). Admin-UI backend-gap closure (design-
  // spec.md §0.4) — the read-side domain functions + admin routes the Web Design pass found
  // missing across Collections, Categories & Tags (taxonomy), and the rest of Database/Recovery.
  // `mergeTerm`'s plan/confirm/execute ceremony and the migrate-forward/restore-ceremony routes
  // were deferred at the time this block was first written; see the gated-mutation route
  // registrations below for where they now live.
  createContentTypesModule(routeDeps).registerRoutes?.(app);
  // ADR-046 Phase 3 (SPEC-034): the `taxonomy` server module — the 5 plain CRUD/list routes.
  // `registerAdminTaxonomyMergeTermRoutes` (the gated-mutation ceremony) stays inline below,
  // alongside the unrelated database/recovery ceremonies it shares a gateway pattern with.
  createTaxonomyModule(routeDeps).registerRoutes?.(app);

  // SPEC-016 (`core/gated-mutations`'s gateway composed into a real composition root, this
  // dispatch) — the 3 deferred gated-mutation ceremonies: taxonomy `mergeTerm`, database
  // `migrate-forward`, recovery `restore`. Each registers 3 endpoints (`/plan`, `/confirm`,
  // `/execute`) mirroring `gateway.ts`'s own 3-method shape.
  registerAdminTaxonomyMergeTermRoutes(app, routeDeps);
  registerAdminDatabaseMigrateForwardRoutes(app, routeDeps);
  registerAdminRecoveryRestoreRoutes(app, routeDeps);

  // ADR-046 Phase 3 (SPEC-042, final slice): the `seo` server module (SPEC-008 SEO) — 6 admin
  // routes gated by `admin.seo.manage`, plus the 2 public site routes (sitemap.xml/robots.txt),
  // which must register before `registerSiteRoutes`'s `/:slug` catch-all below. This call site
  // sits at the exact same position the 8 inline registrations previously occupied — well before
  // `registerSiteRoutes` — so that ordering constraint is unchanged. See `modules/seo.ts`'s file
  // header for the full disclosure and the re-run `route-class-precedence.unit.test.ts` evidence.
  createSeoModule(routeDeps).registerRoutes?.(app);

  /**
   * ADR-046 Phase 3 (SPEC-031) — SPEC-010 (Forms) outbox wiring, now split across two
   * feature-owned modules instead of two inline blocks: `forms` owns the C-009 notify
   * subscriber (its own business logic); `integrations` owns the webhook-fanout subscriber to
   * the SAME `form.submission.received` topic (cross-feature integration owned by the
   * consumer, per the ADR's explicit Phase 3 rule — see `modules/integrations.ts`'s header).
   */
  createFormsModule({
    bus: routeDeps.bus,
    mailer: routeDeps.mailer,
    formDefinitionRepo: routeDeps.formDefinitionRepo,
    formSubmissionRepo: routeDeps.formSubmissionRepo,
  }).start?.();
  createIntegrationsModule({
    bus: routeDeps.bus,
    webhookSubscriptionRepo: routeDeps.webhookSubscriptionRepo,
    webhookDeliveryRepo: routeDeps.webhookDeliveryRepo,
    idGen: routeDeps.idGen,
    clock: routeDeps.clock,
  }).start?.();

  // Built admin SPA (apps/admin/dist) at /admin; helpful 503 when unbuilt.
  registerAdminStatic(app, {
    distDir: process.env.TOVU_ADMIN_DIST ?? path.resolve(__dirname, "../../apps/admin/dist"),
  });

  // ADR-049 — `@jini-ai/chat-react`'s runtime picker requests agent icons from `/agent-icons/*`
  // at the site root (hardcoded, no `ChatPaneProps` override exists to relocate it — verified
  // against `chat-react@0.2.0`'s `AgentRuntimePicker.tsx`), which sits outside the admin SPA's own
  // `/admin/*`-scoped static serving above. Served from Tovu's own root here (in both dev, via
  // `apps/admin/vite.config.ts`'s matching proxy entry, and prod) rather than duplicated inside
  // `apps/admin/dist` (which would only ever resolve under `/admin/`).
  app.use("/agent-icons", express.static(path.resolve(__dirname, "../public/agent-icons")));

  // ADR-054 Task 2/3 — the built public site-chat bundle (apps/site-chat/dist) at /site-chat.
  // Distinct static mount from the admin SPA above: a single self-mounting script, not an app with
  // client-side routing, so `site-chat-static.ts` has no `index.html` SPA fallback to serve.
  registerSiteChatStatic(app, {
    distDir: process.env.TOVU_SITE_CHAT_DIST ?? path.resolve(__dirname, "../../apps/site-chat/dist"),
  });

  // SPIKE — `static`-tier theme preview builds at /theme-preview/<theme-id>/<dark|light>/...; see
  // theme-preview-static.ts's file header for exactly what this is (and isn't) wired up to.
  registerThemePreviewStatic(app, {
    themesStaticDir: path.resolve(__dirname, "../themes/static"),
  });

  // Real (non-spike) asset serving for a theme's own files at /theme-assets/{id}/...: static-tier
  // css/js (used by render.ts's static-tier branch when actually rendering one as the live site),
  // EXTENDED 2026-08-12 to also cover templated-tier theme folders so a Liquid theme's own images/
  // screenshots are reachable (see theme-static-assets.ts's own header for why declarative/handlebars
  // are not listed here yet, and why templates/*.liquid source being servable is deliberate).
  registerThemeStaticAssets(app, {
    themeRoots: [path.resolve(__dirname, "../themes/static"), path.resolve(__dirname, "../themes/templated")],
  });

  // Admin Explore screen's preview iframe: any static theme's page, fully rendered, at
  // /theme-explore/<theme-id>/<page-id>. Registered AFTER the asset route above so the rendered
  // page's own `/theme-assets/...` references are already being served when it loads. `getThemes`
  // rather than the array itself — `rescanThemes` refills that array in place, and a theme
  // downloaded after boot has to be previewable without a restart.
  registerThemePagePreview(app, { getThemes: () => routeDeps.themes });

  // SPEC-044: the `workspace` server module (list/create/get/update/delete) is registered near the
  // other ADR-046 Phase 3 module calls above (`createUsersModule`); the original inline
  // unauthenticated `POST /workspaces` route that lived here has been removed (see the file header).

  // SPIKE: sample Tier-3 store page — must precede the site `/:slug` catch-all.
  registerStoreRoutes(app, routeDeps);
  // `/products`/`/products/:id` — theme-rendered product grid/detail over the same store data.
  // Must also precede the site `/:slug` catch-all.
  registerProductRoutes(app, routeDeps);

  // Public comment submission (ADR-031 §4) — unauthenticated by design; must precede the site
  // `/:slug` catch-all, same reasoning as the store/analytics routes above.
  registerCommentsSubmitRoute(app, { ingressPolicy: routeDeps.commentIngressPolicy, workspaceId: routeDeps.workspaceId });

  // Public analytics beacon (ADR-035 §5) — unauthenticated by design; must precede the site
  // `/:slug` catch-all. `config` is now the real ADR-028-backed adapter
  // (`analytics/config.settings.ts`'s `createSettingsAnalyticsConfig`), replacing the former
  // hardcoded dev-only stub.
  registerAnalyticsIngestRoute(app, {
    clock: routeDeps.clock,
    ids: routeDeps.idGen,
    sink: routeDeps.analyticsSink,
    config: routeDeps.analyticsConfig,
    resolveWorkspaceForHost: async () => routeDeps.workspaceId, // single-workspace v1
    rootKeySeed: process.env.ANALYTICS_ROOT_KEY_SEED ?? "dev-only-insecure-seed",
  });

  // ADR-046 Phase 3 (SPEC-034): the public media rendition route now registers earlier, as part of
  // `createMediaModule(routeDeps).registerRoutes(app)` above — it's still safely before the site
  // `/:slug` catch-all below, which is the only ordering constraint that ever applied to it.

  // Public, unauthenticated form submission endpoint (SPEC-010 REQ-05, FORMS_POST_SUBMIT) — must
  // precede the site `/:slug` catch-all, same reasoning as the routes immediately above.
  registerFormsSubmitRoute(app, {
    workspaceId: routeDeps.workspaceId,
    submitForm: {
      definitionRepo: routeDeps.formDefinitionRepo,
      submissionRepo: routeDeps.formSubmissionRepo,
      outbox: routeDeps.outbox,
      bus: routeDeps.bus,
      clock: routeDeps.clock,
      idGen: routeDeps.idGen,
      rateLimiter: routeDeps.formsRateLimiter,
    },
  });

  // Public dummy site — registered last (GET /:slug is a catch-all).
  registerSiteRoutes(app, routeDeps);

  return app;
}

export const app = createApp();
