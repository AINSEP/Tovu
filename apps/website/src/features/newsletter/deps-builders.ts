import type { ConfirmationDeps } from "./confirmation.js";
import type { SendPipelineDeps } from "./send-pipeline.js";
import type { SubscriptionsDeps } from "./subscriptions.js";
import type { NewsletterToolDeps } from "./tool-registrations.js";
import type { UnsubscribeDeps } from "./unsubscribe.js";

export type ConfirmationSourceDeps = Pick<NewsletterToolDeps, "newsletterConfirmationTokenRepo" | "newsletterSubscriptionRepo" | "mailer" | "membersConsentCapability" | "originRegistry" | "clock" | "idGen" | "mailSenderIdentity">;
export type SubscriptionsSourceDeps = ConfirmationSourceDeps & Pick<NewsletterToolDeps, "newsletterListRepo" | "newsletterSubscriberDirectory">;
export type SendPipelineSourceDeps = Pick<NewsletterToolDeps, "newsletterCampaignRepo" | "newsletterSubscriptionRepo" | "newsletterAudienceSnapshotRepo" | "newsletterSendRepo" | "newsletterSubscriberDirectory" | "newsletterHooks" | "mailer" | "membersConsentCapability" | "originRegistry" | "outbox" | "bus" | "clock" | "idGen">;

/** Assemble the confirmation service's ports from the feature or route deps. @complexity O(1). */
export function buildConfirmationDeps(
  { deps }: { deps: ConfirmationSourceDeps },
  _optional: Record<string, never> = {},
): ConfirmationDeps {
  return {
    tokenRepo: deps.newsletterConfirmationTokenRepo,
    subscriptionRepo: deps.newsletterSubscriptionRepo,
    mailer: deps.mailer,
    consentCapability: deps.membersConsentCapability,
    originRegistry: deps.originRegistry,
    clock: deps.clock,
    ids: deps.idGen,
    senderIdentity: deps.mailSenderIdentity,
  };
}

/** Assemble the subscription ports; saving a subscription can issue a confirmation token. @complexity O(1). */
export function buildSubscriptionsDeps(
  { deps }: { deps: SubscriptionsSourceDeps },
  _optional: Record<string, never> = {},
): SubscriptionsDeps {
  return {
    subscriptionRepo: deps.newsletterSubscriptionRepo,
    listRepo: deps.newsletterListRepo,
    subscriberDirectory: deps.newsletterSubscriberDirectory,
    confirmationDeps: buildConfirmationDeps({ deps }),
    clock: deps.clock,
    ids: deps.idGen,
  };
}

/** Assemble send ports with the caller's launch gate and optional delivery controls. @complexity O(1). */
export function buildSendPipelineDeps(
  { deps, isSendingEnabled }: { deps: SendPipelineSourceDeps; isSendingEnabled: (workspaceId: string) => Promise<boolean> },
  { unsubscribe, sleep }: { unsubscribe?: UnsubscribeDeps; sleep?: (ms: number) => Promise<void> } = {},
): SendPipelineDeps {
  return {
    campaignRepo: deps.newsletterCampaignRepo,
    subscriptionRepo: deps.newsletterSubscriptionRepo,
    audienceSnapshotRepo: deps.newsletterAudienceSnapshotRepo,
    sendRepo: deps.newsletterSendRepo,
    subscriberDirectory: deps.newsletterSubscriberDirectory,
    hooks: deps.newsletterHooks,
    mailer: deps.mailer,
    launchGateDeps: {
      isSendingEnabled,
      consentCapability: deps.membersConsentCapability,
      originRegistry: deps.originRegistry,
      mailer: deps.mailer,
    },
    // Campaign mail is bulk: each recipient gets signed RFC 8058 one-click unsubscribe headers.
    ...(unsubscribe === undefined ? {} : { unsubscribe }),
    outbox: deps.outbox,
    bus: deps.bus,
    clock: deps.clock,
    ids: deps.idGen,
    // Short provider quota hints are waited out inside the batch (send-pipeline.ts, quota waits).
    ...(sleep === undefined ? {} : { sleep }),
  };
}
