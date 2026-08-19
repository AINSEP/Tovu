/**
 * @file Shared `RouteDeps` extension for the newsletter admin + public routes (ADR-PIPE-011 wiring).
 *
 * Purpose:
 * `src/server/routes/types.ts` is being extended by several parallel agents right now (each wiring
 * a different admin section) — this file follows the exact precedent
 * `src/server/routes/admin/members/deps.ts` established: define `NewsletterRouteDeps` here
 * (`RouteDeps` intersected with what Newsletter's routes/domain layer need) rather than editing the
 * shared file directly. Each route in this directory narrows its `RouteDeps` argument via a cast
 * (safe: `NewsletterRouteDeps` is a strict extension, never a widening). `server/deps.ts`/
 * `server/app.ts`'s composition roots widen their OWN return-type annotation to
 * `NewsletterRouteDeps` (not `RouteDeps`) so the extra fields type-check without an unsafe cast at
 * the construction site — once `RouteDeps` is amended upstream to declare these fields directly,
 * that widened annotation becomes provably redundant and can be deleted with no behavior change.
 */
import type {
  MembersConsentCapability,
  NewsletterCampaignRepoPort,
  NewsletterListRepoPort,
  NewsletterSubscriptionRepoPort,
  NewsletterAudienceSnapshotRepoPort,
  NewsletterSendRepoPort,
  NewsletterConfirmationTokenRepoPort,
  SubscriberDirectoryPort,
} from "#src/newsletter/index";
import type { CampaignWriteServiceDeps } from "#src/newsletter/campaign-write-service";
import type { ConfirmationDeps } from "#src/newsletter/confirmation";
import type { HookRegistry } from "#src/newsletter/hooks";
import type { ListsDeps } from "#src/newsletter/lists";
import type { SendPipelineDeps } from "#src/newsletter/send-pipeline";
import type { SubscriptionsDeps, UnsubscribeSubscriptionDeps } from "#src/newsletter/subscriptions";
import type { UnsubscribeDeps } from "#src/newsletter/unsubscribe";
import type { KeyringPort } from "#src/webhooks/index";
import type { RouteDeps } from "../../types.js";

export interface NewsletterRouteDeps extends RouteDeps {
  /** Fire-and-forget at boot (mirrors `settingsReady`/`menuBindingsReady`) — await before relying on the `p_newsletter__*` tables existing. */
  newsletterReady: Promise<void>;
  newsletterCampaignRepo: NewsletterCampaignRepoPort;
  newsletterListRepo: NewsletterListRepoPort;
  newsletterSubscriptionRepo: NewsletterSubscriptionRepoPort;
  newsletterAudienceSnapshotRepo: NewsletterAudienceSnapshotRepoPort;
  newsletterSendRepo: NewsletterSendRepoPort;
  newsletterConfirmationTokenRepo: NewsletterConfirmationTokenRepoPort;
  /**
   * The not-yet-implemented Members consent seam (ADR-PIPE-011 Risks item 3). `null` is the
   * CORRECT default state until Members ships a real binding — the Launch Readiness Gate's
   * precondition (b) checks for a real (non-null) binding; a Newsletter-local stand-in that
   * returns success by default must never be substituted here.
   */
  membersConsentCapability: MembersConsentCapability | null;
  /**
   * Stage 5 (routes) wiring — the three remaining seams the domain layer (Stages 1-4) declared
   * but no composition root had constructed yet:
   *  - `newsletterSubscriberDirectory`: Members' real `SubscriberDirectoryPort` implementation
   *    (`members/subscriber-directory.ts`'s `MembersSubscriberDirectory`), NOT a local stand-in.
   *  - `newsletterKeyring`: the real `KeyringPort` (`webhooks/ports.ts`) `unsubscribe.ts` needs
   *    for `derive()` — reuses the SAME process-lifetime keyring instance `webhookSigner` is built
   *    from in `server/app.ts`/`server/deps.ts` (one root key, purpose-namespaced, per that port's
   *    own contract), not a second independent instance.
   *  - `newsletterHooks`: one process-lifetime `HookRegistry` (`hooks.ts`'s `createHookRegistry()`)
   *    shared by every `SendPipelineDeps` composition (route-triggered and the `newsletter.send.
   *    batch.claimed` bus subscriber alike) — matches `hooks.ts`'s own "avoid a hidden singleton,
   *    but still one registry per running process" framing.
   */
  newsletterSubscriberDirectory: SubscriberDirectoryPort;
  newsletterKeyring: KeyringPort;
  newsletterHooks: HookRegistry;
}

/** Assemble `campaign-write-service.ts`'s deps bundle from `NewsletterRouteDeps` — mirrors `members/deps.ts`'s `toMembersWriteServiceDeps`. */
export function toCampaignWriteServiceDeps(deps: NewsletterRouteDeps): CampaignWriteServiceDeps {
  return {
    campaignRepo: deps.newsletterCampaignRepo,
    listRepo: deps.newsletterListRepo,
    clock: deps.clock,
    ids: deps.idGen,
  };
}

/** Assemble `lists.ts`'s deps bundle. */
export function toListsDeps(deps: NewsletterRouteDeps): ListsDeps {
  return { listRepo: deps.newsletterListRepo, clock: deps.clock, ids: deps.idGen };
}

/** Assemble `confirmation.ts`'s deps bundle. */
export function toConfirmationDeps(deps: NewsletterRouteDeps): ConfirmationDeps {
  return {
    tokenRepo: deps.newsletterConfirmationTokenRepo,
    subscriptionRepo: deps.newsletterSubscriptionRepo,
    mailer: deps.mailer,
    consentCapability: deps.membersConsentCapability,
    originRegistry: deps.originRegistry,
    clock: deps.clock,
    ids: deps.idGen,
  };
}

/** Assemble `subscriptions.ts`'s deps bundle (nests `toConfirmationDeps` — `saveSubscription` triggers `issueConfirmationToken`). */
export function toSubscriptionsDeps(deps: NewsletterRouteDeps): SubscriptionsDeps {
  return {
    subscriptionRepo: deps.newsletterSubscriptionRepo,
    listRepo: deps.newsletterListRepo,
    subscriberDirectory: deps.newsletterSubscriberDirectory,
    confirmationDeps: toConfirmationDeps(deps),
    clock: deps.clock,
    ids: deps.idGen,
  };
}

/** Assemble `subscriptions.ts`'s `unsubscribeSubscription` deps bundle (REMOVE_SUBSCRIPTION). */
export function toUnsubscribeSubscriptionDeps(deps: NewsletterRouteDeps): UnsubscribeSubscriptionDeps {
  return {
    subscriptionRepo: deps.newsletterSubscriptionRepo,
    consentCapability: deps.membersConsentCapability,
    clock: deps.clock,
  };
}

/** Assemble `unsubscribe.ts`'s deps bundle. */
export function toUnsubscribeDeps(deps: NewsletterRouteDeps): UnsubscribeDeps {
  return {
    subscriptionRepo: deps.newsletterSubscriptionRepo,
    keyring: deps.newsletterKeyring,
    originRegistry: deps.originRegistry,
    consentCapability: deps.membersConsentCapability,
    clock: deps.clock,
  };
}

/**
 * Assemble `send-pipeline.ts`'s deps bundle. `launchGateDeps.isSendingEnabled` always resolves
 * `false`: no admin route in api.spec.md's 19+2 manages a `newsletter.launch_gate.sending_enabled`
 * settings toggle (out of scope this pass, same as the deferred admin UI), and `false` is
 * behavior.spec.md §3's own documented default — never a corner cut, since precondition (d)
 * (mailer adapter driver) is separately, permanently unmet in both composition roots anyway (no
 * real `MailerPort` adapter exists yet, ADR-PIPE-011's disclosed, by-design gap).
 */
export function toSendPipelineDeps(deps: NewsletterRouteDeps): SendPipelineDeps {
  return {
    campaignRepo: deps.newsletterCampaignRepo,
    subscriptionRepo: deps.newsletterSubscriptionRepo,
    audienceSnapshotRepo: deps.newsletterAudienceSnapshotRepo,
    sendRepo: deps.newsletterSendRepo,
    subscriberDirectory: deps.newsletterSubscriberDirectory,
    hooks: deps.newsletterHooks,
    mailer: deps.mailer,
    launchGateDeps: {
      isSendingEnabled: async () => false,
      consentCapability: deps.membersConsentCapability,
      originRegistry: deps.originRegistry,
      mailer: deps.mailer,
    },
    outbox: deps.outbox,
    bus: deps.bus,
    clock: deps.clock,
    ids: deps.idGen,
  };
}
