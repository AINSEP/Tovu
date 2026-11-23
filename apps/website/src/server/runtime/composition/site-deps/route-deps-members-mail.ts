import { executeCommand } from "@jini-ai/cms/core";
import type { SiteStore } from "../open-site-store.js";
import type { composeIdentitySettings } from "./identity-settings.js";
import type { composeEventsOrigin } from "./events-origin.js";
import type { composeTrashService } from "./trash-service.js";
import type { composeRedirects } from "./redirects.js";
import type { composeSiteKeysMembers } from "./site-keys-members.js";
import type { composeMailHttp } from "./mail-http.js";
import type { composeMediaStorage } from "./media-storage.js";
import type { composeStoreBasics } from "./store-basics.js";
import type { startBootData } from "./boot-data.js";
import type { composeContentRepos } from "./content-repos.js";
import type { createFormCollectionRegistry } from "@jini-ai/cms/forms";
import type { composeContentResolversComments } from "./content-resolvers-comments.js";
import type { composeContentStores } from "./content-stores.js";
import type { composePublishingStoresThemes } from "./publishing-stores-themes.js";
import { FORMS_SUBMIT_PROFILE } from "#src/features/forms/index";
import { SharpImageTransformer } from "#src/features/media/index";
import { SqliteMagicLinkTokenRepo } from "#src/features/members/index";
import { SqliteMemberSessionRepo } from "#src/features/members/index";
import { SqliteMemberSubscriptionRepo } from "#src/features/members/index";
import { SqliteMemberTierRepo } from "#src/features/members/index";
import { SqliteNewsletterAudienceSnapshotRepo } from "#src/features/newsletter/repo.sqlite";
import { SqliteNewsletterCampaignRepo } from "#src/features/newsletter/repo.sqlite";
import { SqliteNewsletterConfirmationTokenRepo } from "#src/features/newsletter/repo.sqlite";
import { SqliteNewsletterSendRepo } from "#src/features/newsletter/repo.sqlite";
import { SqliteNewsletterSubscriptionRepo } from "#src/features/newsletter/repo.sqlite";
import { SqliteWebhookDeliveryRepo } from "#src/platform/db/sqlite/webhook-repo.sqlite";
import { SqliteWebhookSubscriptionRepo } from "#src/platform/db/sqlite/webhook-repo.sqlite";
import { bindRemoveEntity } from "@jini-ai/cms/trash";
import { createKeyringBackedSigner } from "@jini-ai/integrations/webhooks/site/signing.keyring";
import { createMailActivityRepo } from "#src/features/mail/activity.repo";
import { createMailSuppressionAdminRepo } from "#src/features/mail/suppression-admin.repo";
import { createMammothDocumentTextExtractor } from "@jini-ai/cms/media/plugins/document-text/mammoth";
import { createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { createShareArchiveReader } from "#src/features/site-backup/import-archive-reader";
import { createUnpdfDocumentTextExtractor } from "@jini-ai/cms/media/plugins/document-text/unpdf";
import { formSubmissionAttemptsFor } from "#src/features/forms/index";
import * as importYauzl from "yauzl";
import { removeEntityWithoutBlocker } from "@jini-ai/cms/trash/site/remove-without-blocker";
import { wrapMailerWithPurposeGate } from "#src/platform/mail/purpose-scoped-mailer";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";

interface RouteDepsMembersMailRequired {
  kernel: SiteStore["content"];
  settingsPrincipals: ReturnType<typeof composeIdentitySettings>["settingsPrincipals"];
  originRegistry: ReturnType<typeof composeEventsOrigin>["originRegistry"];
  redirectRepo: ReturnType<typeof composeEventsOrigin>["redirectRepo"];
  redirectHitSink: ReturnType<typeof composeEventsOrigin>["redirectHitSink"];
  trash: ReturnType<typeof composeTrashService>["trash"];
  removeUser: ReturnType<typeof composeTrashService>["removeUser"];
  isInTrash: ReturnType<typeof composeTrashService>["isInTrash"];
  redirectsWriteDeps: ReturnType<typeof composeRedirects>["redirectsWriteDeps"];
  runtimeMode: ReturnType<typeof composeSiteKeysMembers>["runtimeMode"];
  memberRepo: ReturnType<typeof composeSiteKeysMembers>["memberRepo"];
  resolvedMailer: ReturnType<typeof composeMailHttp>["resolvedMailer"];
  mailDurableOutboxReady: ReturnType<typeof composeMailHttp>["mailDurableOutboxReady"];
}

interface RouteDepsMailFormsNewsletterRequired {
  kernel: SiteStore["content"];
  blobStore: ReturnType<typeof composeMediaStorage>["blobStore"];
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  adminPasswordResetReady: ReturnType<typeof composeIdentitySettings>["adminPasswordResetReady"];
  menuRepo: ReturnType<typeof startBootData>["menuRepo"];
  navLocationBindingRepo: ReturnType<typeof startBootData>["navLocationBindingRepo"];
  newsletterListRepo: ReturnType<typeof startBootData>["newsletterListRepo"];
  newsletterReady: ReturnType<typeof startBootData>["newsletterReady"];
  transformDefinitionRepo: ReturnType<typeof startBootData>["transformDefinitionRepo"];
  blobHydrationReady: ReturnType<typeof startBootData>["blobHydrationReady"];
  assetRenditionRepo: ReturnType<typeof composeEventsOrigin>["assetRenditionRepo"];
  trash: ReturnType<typeof composeTrashService>["trash"];
  formDefinitionRepo: ReturnType<typeof composeContentRepos>["formDefinitionRepo"];
  formCollectionProviders: () => ReturnType<typeof createFormCollectionRegistry>;
  formSubmissionRepo: ReturnType<typeof composeContentResolversComments>["formSubmissionRepo"];
  newsletterKeyring: ReturnType<typeof composeSiteKeysMembers>["newsletterKeyring"];
  newsletterSubscriberDirectory: ReturnType<typeof composeSiteKeysMembers>["newsletterSubscriberDirectory"];
  newsletterHooks: ReturnType<typeof composeSiteKeysMembers>["newsletterHooks"];
  mediaRepo: ReturnType<typeof composeContentStores>["mediaRepo"];
  assetBlobRepo: ReturnType<typeof composeContentStores>["assetBlobRepo"];
  mediaContentTypeStore: ReturnType<typeof composePublishingStoresThemes>["mediaContentTypeStore"];
}

export function routeDepsMembersMail(required: RouteDepsMembersMailRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "principalRepo" | "removeUser" | "isInTrash" | "redirectRepo" | "redirectHitSink" | "originRegistry" | "redirectsWriteDeps" | "memberRepo" | "removeMember" | "memberTierRepo" | "memberSubscriptionRepo" | "memberSessionRepo" | "magicLinkRepo" | "mailer" | "settleMailer" | "mailStatus" | "setAgentPluginEnabled" | "mailProviderControl" | "mailDomainRequirements"> {
  const { kernel, settingsPrincipals, originRegistry, redirectRepo, redirectHitSink, trash, removeUser, isInTrash, redirectsWriteDeps, runtimeMode, memberRepo, resolvedMailer, mailDurableOutboxReady } = required;
  return {
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
  };
}

export function routeDepsMailFormsNewsletter(required: RouteDepsMailFormsNewsletterRequired, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, "mailActivity" | "mailSuppressionAdmin" | "menuRepo" | "navLocationBindingRepo" | "removeMenu" | "webhookSubscriptionRepo" | "webhookDeliveryRepo" | "webhookSigner" | "mediaRepo" | "assetBlobRepo" | "assetRenditionRepo" | "mediaContentTypeStore" | "blobStore" | "documentTextExtractors" | "blobHydrationReady" | "adminPasswordResetReady" | "transformDefinitionRepo" | "imageTransformer" | "imageCodec" | "newsletterReady" | "newsletterCampaignRepo" | "newsletterListRepo" | "newsletterSubscriptionRepo" | "newsletterAudienceSnapshotRepo" | "newsletterSendRepo" | "newsletterConfirmationTokenRepo" | "membersConsentCapability" | "newsletterSubscriberDirectory" | "newsletterKeyring" | "newsletterHooks" | "formDefinitionRepo" | "formCollectionProviders" | "formSubmissionRepo" | "formSubmissionAttempts" | "removeFormSubmission" | "executeCommand" | "formsRateLimiter"> {
  const { kernel, blobStore, clock, adminPasswordResetReady, menuRepo, navLocationBindingRepo, newsletterListRepo, newsletterReady, transformDefinitionRepo, blobHydrationReady, assetRenditionRepo, trash, formDefinitionRepo, formCollectionProviders, formSubmissionRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks, mediaRepo, assetBlobRepo, mediaContentTypeStore } = required;
  return {
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
  };
}
