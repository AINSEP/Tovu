import express from "express";
import { randomUUID } from "node:crypto";

import { InMemoryEventBus, InMemoryOutbox, processOutbox } from "../core/events";
import { InMemoryChangeSetRepo } from "../core/commands";
import { createSeoEventSubscriptions, createSeoPageHeadHook, ensureSeoSettingDefinitions } from "../seo";
import { registerPageHeadContributor } from "./http/site/page-head";
import { registerAdminSeoGetEntryRoute } from "./routes/admin/seo/get-entry";
import { registerAdminSeoGetEntryAnalyzeRoute } from "./routes/admin/seo/get-entry-analyze";
import { registerAdminSeoGetSettingsRoute } from "./routes/admin/seo/get-settings";
import { registerAdminSeoPostSitemapRegenerateRoute } from "./routes/admin/seo/post-sitemap-regenerate";
import { registerAdminSeoPutEntryRoute } from "./routes/admin/seo/put-entry";
import { registerAdminSeoPutSettingsRoute } from "./routes/admin/seo/put-settings";
import { registerSeoRobotsRoute } from "./routes/site/robots";
import { registerSeoSitemapRoute } from "./routes/site/sitemap";
import { InMemoryPostRepo } from "../features/post";
import { InMemoryPresentationSettingsRepo } from "../features/presentation";
import { InMemorySettingsRepo } from "../features/settings/repo.memory";
import { discoverThemes } from "../features/theme";
import { createWorkspace, InMemoryWorkspaceRepo, WorkspaceConflictError, WorkspaceValidationError } from "../features/workspace";
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
import { InMemoryMenuRepo, InMemoryNavLocationBindingRepo } from "../navigation/repo.memory";
import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "../integrations";
import { InMemoryKeyring } from "../integrations/keyring.memory";
import { createKeyringBackedSigner } from "../integrations/signing.keyring";
import {
  InMemoryAssetBlobRepo,
  InMemoryAssetRenditionRepo,
  InMemoryBlobStore,
  InMemoryImageTransformer,
  InMemoryMediaRepo,
  InMemoryTransformDefinitionRepo,
} from "../media";
import { createInMemoryIdentityRouteDeps } from "../identity";
import {
  InMemoryNewsletterAudienceSnapshotRepo,
  InMemoryNewsletterCampaignRepo,
  InMemoryNewsletterConfirmationTokenRepo,
  InMemoryNewsletterListRepo,
  InMemoryNewsletterSendRepo,
  InMemoryNewsletterSubscriptionRepo,
} from "../newsletter/repo.memory";
import { ensureDefaultList } from "../newsletter/lists";
import type { NewsletterRouteDeps } from "./routes/admin/newsletter/deps";
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
import { InMemoryDbOpsAdapter, InMemoryMigrationRunsRepo, InMemoryRestorePointsRepo, InMemorySiteStatusRepo, InMemoryStorageLedgerRepo } from "../features/storage/repo.memory";
import { registerAdminStorageTimelineRoute } from "./routes/admin/storage/timeline";
import { registerAdminStorageRestorePointsCreateRoute, registerAdminStorageRestorePointsListRoute } from "./routes/admin/storage/restore-points";
import { InMemoryContentTypeRepo, NoopContentTypeIndexProvisioner } from "../features/content-types/repo.memory";
import { registerAdminContentTypeListRoute } from "./routes/admin/content-types/list";
import { registerAdminContentTypeRegisterRoute } from "./routes/admin/content-types/register";
import { registerAdminContentTypeUpdateFieldsRoute } from "./routes/admin/content-types/update-fields";
import { registerAdminContentTypeLifecycleRoute } from "./routes/admin/content-types/lifecycle";
import { InMemoryEntryRepo } from "../features/entries/repo.memory";
import { createCommentsModule, ensureCommentsSettingDefinitions } from "../comments";
import { InMemoryCommentRepo } from "../comments/repo.memory";
import { registerCommentsSubmitRoute } from "./routes/site/comments-submit";
import { registerAdminEntryListRoute } from "./routes/admin/entries/list";
import { registerAdminEntryCreateRoute } from "./routes/admin/entries/create";
import { registerAdminEntryUpdateRoute } from "./routes/admin/entries/update";
import { registerAdminEntryLifecycleRoute } from "./routes/admin/entries/lifecycle";
import { InMemoryEntryTermRepo, InMemoryTaxonomyRepo, InMemoryTaxonomyRevisionRepo, InMemoryTermRepo } from "../features/taxonomy/repo.memory";
import { AlwaysUnavailableWatermarkSource, RestorePointDeepLinkLookup } from "../features/recovery/repo.memory";
import { registerAdminRecoveryRestorePointsListRoute } from "./routes/admin/recovery/restore-points";
import { registerAdminRecoveryDisclosureRoute } from "./routes/admin/recovery/disclosure";
import { registerAdminRecoveryDeepLinkRoute } from "./routes/admin/recovery/deep-link";
import { registerAdminRecoveryStatusRoute } from "./routes/admin/recovery/status";
import { buildGatewayDeps } from "./gated-mutations-composition";
import { resolveRuntimeMode } from "./runtime-mode";
import { wrapMailerWithPurposeGate } from "../mail/purpose-scoped-mailer";
import { registerAdminTaxonomyMergeTermRoutes } from "./routes/admin/taxonomy/merge-term";
import { registerAdminStorageMigrateForwardRoutes } from "./routes/admin/storage/migrate-forward";
import { registerAdminRecoveryRestoreRoutes } from "./routes/admin/recovery/restore";

import { applyDevCors } from "./middleware/dev-cors";
import { applySiteServingGate } from "./middleware/site-serving-gate";
import { registerAdminStatic } from "./middleware/admin-static";
import { registerSiteRoutes } from "./routes/site/pages";
import { registerStoreRoutes } from "./routes/site/store";
import { registerAnalyticsIngestRoute } from "./routes/site/analytics-ingest";
import { registerContentPostGetRoute } from "./routes/content/posts/get-by-slug";
import { createCommentsModerationModule } from "./modules/comments-moderation";
import { createCoreModule } from "./modules/core";
import { createFormsModule } from "./modules/forms";
import { createIntegrationsModule } from "./modules/integrations";
import { createIntegrationsAdminModule } from "./modules/integrations-admin";
import { createMediaModule } from "./modules/media";
import { createTaxonomyModule } from "./modules/taxonomy";
import { createContentModule } from "./modules/content";
import { createMembersModule } from "./modules/members";
import type { MembersRouteDeps } from "./routes/admin/members/deps";
import type { MemberPublicRouteDeps } from "./routes/members/deps";
import { createRateLimiter, MAGIC_LINK_COMPLETE_ATTEMPT, MAGIC_LINK_PER_EMAIL, MAGIC_LINK_PER_IP } from "./middleware/rate-limit";
import { registerAdminAnalyticsRecentHitsRoute } from "./routes/admin/analytics/recent-hits";
import { registerAdminModuleStatusRoute } from "./routes/admin/system/module-status";
import { registerAdminMenuListRoute } from "./routes/admin/menus/list";
import { registerAdminMenuGetRoute } from "./routes/admin/menus/get-by-id";
import { registerAdminMenuCreateRoute } from "./routes/admin/menus/create";
import { registerAdminMenuUpdateTreeRoute } from "./routes/admin/menus/update-tree";
import { registerAdminMenuAssignLocationRoute } from "./routes/admin/menus/assign-location";
import { registerAdminMenuDeleteRoute } from "./routes/admin/menus/delete";
import { registerAdminUserListRoute } from "./routes/admin/users/list";
import { registerAdminUserCreateRoute } from "./routes/admin/users/create";
import { registerAdminUserAssignRoleRoute } from "./routes/admin/users/assign-role";
import { registerAdminUserAttachPolicyRoute } from "./routes/admin/users/attach-policy";
import { registerAdminRoleListRoute } from "./routes/admin/users/list-roles";
import { registerAdminRoleCreateRoute } from "./routes/admin/users/create-role";
import { registerAdminPolicyListRoute } from "./routes/admin/users/list-policies";
import { registerAdminPolicyCreateRoute } from "./routes/admin/users/create-policy";
import { registerAdminSettingsRegisterDefinitionsRoute } from "./routes/admin/settings/register-definitions";
import { registerAdminSettingsGetEffectiveRoute } from "./routes/admin/settings/get-effective";
import { registerAdminSettingsSetRoute } from "./routes/admin/settings/set";
import { registerAdminSettingsClearRoute } from "./routes/admin/settings/clear";
import { registerAdminSettingsResetRoute } from "./routes/admin/settings/reset";
import { registerAdminFormsListRoute } from "./routes/admin/forms/list";
import { registerAdminFormsCreateRoute } from "./routes/admin/forms/create";
import { registerAdminFormsGetRoute } from "./routes/admin/forms/get-by-id";
import { registerAdminFormsUpdateRoute } from "./routes/admin/forms/update";
import { registerAdminFormsListSubmissionsRoute } from "./routes/admin/forms/list-submissions";
import { registerAdminFormsGetSubmissionRoute } from "./routes/admin/forms/get-submission";
import { registerAdminFormsDeleteSubmissionRoute } from "./routes/admin/forms/delete-submission";
import { registerFormsSubmitRoute } from "./routes/site/forms-submit";
import { registerAdminRedirectListRoute } from "./routes/admin/redirects/list";
import { registerAdminRedirectGetRoute } from "./routes/admin/redirects/get-by-id";
import { registerAdminRedirectCreateRoute } from "./routes/admin/redirects/create";
import { registerAdminRedirectUpdateRoute } from "./routes/admin/redirects/update";
import { registerAdminRedirectTombstoneRoute } from "./routes/admin/redirects/tombstone";
import { registerAdminRedirectImportRoute } from "./routes/admin/redirects/import";
import { registerAdminRedirectHitsRoute } from "./routes/admin/redirects/hits";
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
 * - Calls `createWorkspace` slice for command handling.
 * - Triggers `processOutbox` after successful writes to deliver async events.
 *
 * Architectural role:
 * Keeps transport concerns (HTTP, status codes, request parsing) separate from
 * domain logic. Feature code remains reusable outside Express.
 */

/** In-memory route deps seeded from `./seed`. Default for tests/dev. */
export function createRouteDeps(): NewsletterRouteDeps {
  const workspaceRepo = new InMemoryWorkspaceRepo([seededWorkspace]);
  const postRepo = new InMemoryPostRepo(seededPosts);
  const presentationRepo = new InMemoryPresentationSettingsRepo([seededPresentation]);
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowIso: () => new Date().toISOString() };
  const idGen = { newId: () => randomUUID() };
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
  // in-memory rows Storage's restore-points routes write into, not a second, disconnected instance.
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
  const commentsModule = createCommentsModule({
    commentRepo: new InMemoryCommentRepo(),
    entryRepo,
    outbox,
    clock,
    idGen,
    settingsRepo,
  });

  return {
    workspaceId: seededWorkspace.id,
    workspaceRepo,
    postRepo,
    presentationRepo,
    settingsRepo,
    settingsReady,
    seoReady,
    // BR-04 (2026-07-16): the repo forwards insert()'s optional event to this SAME outbox
    // instance, matching what the old separate executeCommand()-level enqueue() call did.
    changeSets: new InMemoryChangeSetRepo([], [], outbox),
    themes: discoverThemes(builtInThemesDir(), "built-in"),
    outbox,
    bus,
    clock,
    idGen,
    analyticsSink: new LocalBufferSink(),
    ...identity,
    redirectRepo,
    redirectHitSink,
    originRegistry,
    redirectsWriteDeps,
    memberRepo: new InMemoryMemberRepo([]),
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
    menuRepo: new InMemoryMenuRepo(),
    navLocationBindingRepo: new InMemoryNavLocationBindingRepo(),
    webhookSubscriptionRepo: new InMemoryWebhookSubscriptionRepo(),
    webhookDeliveryRepo: new InMemoryWebhookDeliveryRepo(),
    // ADR-PIPE-015 Phase 1 T017: the real createKeyringBackedSigner code path, backed by an
    // in-memory KeyringPort so this hermetic test/dev composition never touches a real file or
    // env var. The delivery worker is still the first real consumer — activation stays gated
    // (Phase 4) until the real KeyringPort/HttpClientPort/SQLite adapters are wired in deps.ts.
    webhookSigner: createKeyringBackedSigner(new InMemoryKeyring()),
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
    // SPEC-010 (Forms, Tier-1 sample plugin, ADR-PIPE-010): in-memory adapters, matching every
    // other core-owned-table feature's hermetic test/dev composition. `formsRateLimiter` is one
    // process-lifetime `FORMS_SUBMIT_PROFILE` counter store (constructed once here, not
    // per-request) so its fixed-window counts persist across requests within one `createApp()`.
    formDefinitionRepo: new InMemoryFormDefinitionRepo(),
    formSubmissionRepo: new InMemoryFormSubmissionRepo(),
    formsRateLimiter: createRateLimiter(FORMS_SUBMIT_PROFILE, clock),
    // ADR-041 §1/§2 (Storage Timeline): in-memory ledger, same disclosed precedent as every other
    // feature's hermetic test/dev composition above. `server/deps.ts`'s real composition opens
    // the sidecar `ops/storage-journal.db` and uses `SqliteStorageLedgerRepo` instead.
    storageLedgerRepo: new InMemoryStorageLedgerRepo(),
    migrationRunsRepo: new InMemoryMigrationRunsRepo(),
    // Admin-UI backend-gap closure (design-spec.md §0.4, this dispatch): in-memory adapters for
    // content-types/entries/taxonomy (no SQLite adapter exists yet for any of the three — see
    // `routes/types.ts`'s doc comment on this field group for the full disclosure) plus the
    // restore-points/dbOps/site-status/recovery seams the Storage/Recovery screens' remaining
    // read routes need.
    contentTypeRepo: new InMemoryContentTypeRepo(),
    contentTypeIndexProvisioner: new NoopContentTypeIndexProvisioner(),
    entryRepo,
    taxonomyRepo: new InMemoryTaxonomyRepo(),
    termRepo: new InMemoryTermRepo(),
    entryTermRepo: new InMemoryEntryTermRepo(),
    taxonomyRevisionRepo: new InMemoryTaxonomyRevisionRepo(),
    restorePointsRepo,
    dbOps: new InMemoryDbOpsAdapter(),
    siteStatusRepo: new InMemorySiteStatusRepo(),
    disclosureWatermarkSource: new AlwaysUnavailableWatermarkSource(),
    deepLinkRestorePointLookup: new RestorePointDeepLinkLookup(restorePointsRepo),
    // SPEC-016 (`core/gated-mutations`'s gateway, ADR-041 §5) — same composition `server/deps.ts`
    // wires for the real server, mirrored here for the hermetic test/dev composition (its own
    // `InMemoryTokenStore` instance — see `gated-mutations-composition.ts`'s file header for the
    // disclosed `TokenStorePort` decision).
    gatedMutations: { gatewayDeps: buildGatewayDeps({ clock, idGen, authorize: identity.authorize }) },
    commentRepo: commentsModule.commentRepo,
    commentIngressPolicy: commentsModule.ingressPolicy,
    commentWriteService: commentsModule.writeService,
    // In-memory repo needs no dataModule declare — resolves immediately, unlike `deps.ts`'s real
    // fire-and-forget install (mirrors `newsletterReady`'s identical hermetic-vs-real split).
    commentsReady: Promise.resolve(),
    commentsSettingsReady,
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
  const magicLinkPerEmailLimiter = createRateLimiter(MAGIC_LINK_PER_EMAIL, routeDeps.clock);
  const magicLinkPerIpLimiter = createRateLimiter(MAGIC_LINK_PER_IP, routeDeps.clock);
  const magicLinkCompleteAttemptLimiter = createRateLimiter(MAGIC_LINK_COMPLETE_ATTEMPT, routeDeps.clock);
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

  registerAdminAnalyticsRecentHitsRoute(app, routeDeps);
  registerAdminModuleStatusRoute(app, routeDeps);
  // ADR-046 Phase 3 (SPEC-040): the `comments-moderation` server module — 4 admin
  // moderation-queue/moderate/settings routes. Distinct from `createCommentsModule` above
  // (the ADR-031 backend composition) and from `registerCommentsSubmitRoute` below (the public,
  // unauthenticated submission route, which stays inline near the site catch-all).
  createCommentsModerationModule(routeDeps).registerRoutes?.(app);
  registerAdminMenuListRoute(app, routeDeps);
  registerAdminMenuGetRoute(app, routeDeps);
  registerAdminMenuCreateRoute(app, routeDeps);
  registerAdminMenuUpdateTreeRoute(app, routeDeps);
  registerAdminMenuAssignLocationRoute(app, routeDeps);
  registerAdminMenuDeleteRoute(app, routeDeps);
  // ADR-046 Phase 3 (SPEC-034): the `integrations-admin` server module — 5 admin CRUD/read routes
  // over webhook subscriptions/deliveries (ADR-036). Distinct from `createIntegrationsModule`
  // below, which owns the Forms-to-webhook fan-out subscriber, not an HTTP surface.
  createIntegrationsAdminModule(routeDeps).registerRoutes?.(app);
  // ADR-046 Phase 3 (SPEC-034): the `media` server module — 5 admin routes + the public rendition
  // route (previously registered much later, see below near the old catch-all-precedence group;
  // moved up here since its only real constraint, "before `/:slug`", still holds — see
  // `modules/media.ts`'s file header for the full disclosure).
  createMediaModule(routeDeps).registerRoutes?.(app);
  registerAdminUserListRoute(app, routeDeps);
  registerAdminUserCreateRoute(app, routeDeps);
  registerAdminUserAssignRoleRoute(app, routeDeps);
  registerAdminUserAttachPolicyRoute(app, routeDeps);
  registerAdminRoleListRoute(app, routeDeps);
  registerAdminRoleCreateRoute(app, routeDeps);
  registerAdminPolicyListRoute(app, routeDeps);
  registerAdminPolicyCreateRoute(app, routeDeps);
  // SPEC-007 Phase 5 (T043) — admin settings HTTP surface.
  registerAdminSettingsRegisterDefinitionsRoute(app, routeDeps);
  registerAdminSettingsGetEffectiveRoute(app, routeDeps);
  registerAdminSettingsSetRoute(app, routeDeps);
  registerAdminSettingsClearRoute(app, routeDeps);
  registerAdminSettingsResetRoute(app, routeDeps);

  // SPEC-010 (Forms, Tier-1 sample plugin) — 7 admin routes (definitions CRUD + submissions
  // list/get/delete), gated per api.spec.md §2's `admin.forms.*` profiles.
  registerAdminFormsListRoute(app, routeDeps);
  registerAdminFormsCreateRoute(app, routeDeps);
  registerAdminFormsGetRoute(app, routeDeps);
  registerAdminFormsUpdateRoute(app, routeDeps);
  registerAdminFormsListSubmissionsRoute(app, routeDeps);
  registerAdminFormsGetSubmissionRoute(app, routeDeps);
  registerAdminFormsDeleteSubmissionRoute(app, routeDeps);

  // SPEC-009 (Redirects) — 7 admin routes (list/get/create/update/tombstone/import/hits), each
  // gated by `admin.redirects.manage` (api.spec.md §1/§2).
  registerAdminRedirectListRoute(app, routeDeps);
  registerAdminRedirectGetRoute(app, routeDeps);
  registerAdminRedirectCreateRoute(app, routeDeps);
  registerAdminRedirectUpdateRoute(app, routeDeps);
  registerAdminRedirectTombstoneRoute(app, routeDeps);
  registerAdminRedirectImportRoute(app, routeDeps);
  registerAdminRedirectHitsRoute(app, routeDeps);

  // ADR-041 §1 (Storage Timeline) — the one Storage/Recovery route wired in the prior pass (see
  // that route file's own header for history).
  registerAdminStorageTimelineRoute(app, routeDeps);
  registerAdminStorageRestorePointsListRoute(app, routeDeps);
  registerAdminStorageRestorePointsCreateRoute(app, routeDeps);

  // Admin-UI backend-gap closure (design-spec.md §0.4) — the read-side domain functions + admin
  // routes the Web Design pass found missing across Collections (content-types + entries),
  // Categories & Tags (taxonomy), and the rest of Storage/Recovery. `mergeTerm`'s plan/confirm/
  // execute ceremony and the migrate-forward/restore-ceremony routes were deferred at the time
  // this block was first written; see the gated-mutation route registrations below (this dispatch)
  // for where they now live.
  registerAdminContentTypeListRoute(app, routeDeps);
  registerAdminContentTypeRegisterRoute(app, routeDeps);
  registerAdminContentTypeUpdateFieldsRoute(app, routeDeps);
  registerAdminContentTypeLifecycleRoute(app, routeDeps);
  registerAdminEntryListRoute(app, routeDeps);
  registerAdminEntryCreateRoute(app, routeDeps);
  registerAdminEntryUpdateRoute(app, routeDeps);
  registerAdminEntryLifecycleRoute(app, routeDeps);
  // ADR-046 Phase 3 (SPEC-034): the `taxonomy` server module — the 5 plain CRUD/list routes.
  // `registerAdminTaxonomyMergeTermRoutes` (the gated-mutation ceremony) stays inline below,
  // alongside the unrelated storage/recovery ceremonies it shares a gateway pattern with.
  createTaxonomyModule(routeDeps).registerRoutes?.(app);
  registerAdminRecoveryRestorePointsListRoute(app, routeDeps);
  registerAdminRecoveryDisclosureRoute(app, routeDeps);
  registerAdminRecoveryDeepLinkRoute(app, routeDeps);
  registerAdminRecoveryStatusRoute(app, routeDeps);

  // SPEC-016 (`core/gated-mutations`'s gateway composed into a real composition root, this
  // dispatch) — the 3 deferred gated-mutation ceremonies: taxonomy `mergeTerm`, storage
  // `migrate-forward`, recovery `restore`. Each registers 3 endpoints (`/plan`, `/confirm`,
  // `/execute`) mirroring `gateway.ts`'s own 3-method shape.
  registerAdminTaxonomyMergeTermRoutes(app, routeDeps);
  registerAdminStorageMigrateForwardRoutes(app, routeDeps);
  registerAdminRecoveryRestoreRoutes(app, routeDeps);

  // SPEC-008 (SEO) — 6 admin routes gated by `admin.seo.manage`, plus the 2 public site routes
  // (sitemap.xml/robots.txt), which must register before `registerSiteRoutes`'s `/:slug` catch-all.
  registerAdminSeoGetEntryRoute(app, routeDeps);
  registerAdminSeoPutEntryRoute(app, routeDeps);
  registerAdminSeoGetEntryAnalyzeRoute(app, routeDeps);
  registerAdminSeoGetSettingsRoute(app, routeDeps);
  registerAdminSeoPutSettingsRoute(app, routeDeps);
  registerAdminSeoPostSitemapRegenerateRoute(app, routeDeps);
  registerSeoSitemapRoute(app, routeDeps);
  registerSeoRobotsRoute(app, routeDeps);

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

  /**
   * Create workspace route.
   *
   * Hybrid execution model:
   * - synchronous command path for validation + persistence
   * - outbox flush to run async side effects reliably
   */
  app.post("/workspaces", async (req, res) => {
    try {
      const { id } = await createWorkspace(
        {
          deps: {
            idGen: routeDeps.idGen,
            clock: routeDeps.clock,
            repo: routeDeps.workspaceRepo,
            outbox: routeDeps.outbox,
          },
          input: {
            name: String(req.body?.name ?? ""),
            slug: String(req.body?.slug ?? ""),
          },
        }
      );

      await processOutbox({ outbox: routeDeps.outbox, bus: routeDeps.bus, clock: routeDeps.clock });

      res.status(201).json({ id });
    } catch (err) {
      if (err instanceof WorkspaceValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }

      if (err instanceof WorkspaceConflictError) {
        res.status(409).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });

  // SPIKE: sample Tier-3 store page — must precede the site `/:slug` catch-all.
  registerStoreRoutes(app, routeDeps);

  // Public comment submission (ADR-031 §4) — unauthenticated by design; must precede the site
  // `/:slug` catch-all, same reasoning as the store/analytics routes above.
  registerCommentsSubmitRoute(app, { ingressPolicy: routeDeps.commentIngressPolicy, workspaceId: routeDeps.workspaceId });

  // Public analytics beacon (ADR-035 §5) — unauthenticated by design; must precede the site
  // `/:slug` catch-all. DEV-ONLY config stub: always-enabled, no exclusions, honors DNT/GPC.
  // Real config should be backed by ADR-028 settings once that wiring exists.
  registerAnalyticsIngestRoute(app, {
    clock: routeDeps.clock,
    ids: routeDeps.idGen,
    sink: routeDeps.analyticsSink,
    config: {
      get: async ({ workspaceId }) => ({
        workspaceId,
        enabled: true,
        honorDoNotTrack: true,
        honorGlobalPrivacyControl: true,
        rawRetentionDays: 30,
        excludedPaths: [],
        excludedIpRanges: [],
        sink: "local",
      }),
    },
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
