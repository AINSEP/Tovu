/**
 * @file Barrel for newsletter's cross-module data contract (ADS-memory/reports/architecture/
 * 2026-08-13-api-surface-trace-A.md, proposal N-1).
 *
 * Composition-root wiring (repo adapters, hooks, send pipeline, campaign/list/subscription/
 * confirmation/unsubscribe services, data-module manifest) is deliberately NOT re-exported here —
 * same boundary as `comments/index.ts`'s existing precedent and the `forms/index.ts` barrel this
 * mirrors. Only the typed domain errors and the port interfaces — including the dependency-
 * inversion seam into Members (`SubscriberContact`/`SubscriberDirectoryPort`, ADR-030 §4) and the
 * send-pipeline job payload (`SendBatchJob`) — live behind this door. `MailerPort` is re-exported
 * from `ports.ts` itself for internal use only; it is not re-exported here because no external
 * importer reaches it through `newsletter/ports` (every external caller already gets it directly
 * from `../mail`).
 */
export {
  NewsletterCampaignNotFoundError,
  NewsletterListNotFoundError,
  NewsletterSubscriptionNotFoundError,
  NewsletterSubscriberNotFoundError,
  NewsletterValidationError,
  NewsletterCampaignNotEditableError,
  NewsletterDefaultListProtectedError,
  NewsletterConflictError,
  NewsletterLaunchGateBlockedError,
  NewsletterConfirmTokenInvalidError,
  NewsletterUnsubscribeTokenInvalidError,
  NewsletterForbiddenError,
} from "./errors";
export type {
  SubscriberContact,
  SubscriberDirectoryPort,
  SendBatchJob,
  NewsletterCampaignRepoPort,
  NewsletterListRepoPort,
  NewsletterSubscriptionRepoPort,
  NewsletterAudienceSnapshotRepoPort,
  NewsletterSendRepoPort,
  NewsletterConfirmationTokenRepoPort,
  MembersConsentCapability,
} from "./ports";
