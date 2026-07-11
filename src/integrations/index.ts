/**
 * @file Public surface of the `integrations` Tier-2 core library (ADR-036).
 *
 * Barrel exports only. Boundary lint forbids deep imports into this library — consumers
 * (the delivery worker, admin routes, AI tools) depend on `integrations` via this index
 * (ADR-009 §1: a module's public surface is its `index.ts`).
 *
 * v1 exports the type + port seams; the delivery worker, repos, signer, and handlers land
 * against these contracts in the Implementation Proposal phases (see the design report).
 */
export type {
  IntegrationId,
  IntegrationSecretRecord,
  SealedSecret,
  SecretVersion,
  WebhookBeforeDispatchHook,
  WebhookBeforeDispatchResult,
  WebhookDeliveryRecord,
  WebhookDeliveryStatus,
  WebhookEventEnvelope,
  WebhookSignature,
  WebhookSubscriptionRecord,
  WebhookSubscriptionStatus,
  WebhookTopic,
} from "./types";

export type {
  IntegrationSecretRepoPort,
  KeyringPort,
  RootKeyHandle,
  SecretSealerPort,
  WebhookDeliveryRepoPort,
  WebhookSubscriptionRepoPort,
} from "./ports";

// `HttpClientPort`/`EgressPolicy` are the shared `../http` core primitive (ADR-038) — re-exported
// here (via `./ports`) so existing `integrations` consumers don't need to know the type moved.
export type { EgressPolicy, HttpClientPort, HttpRequest, HttpResponse } from "./ports";

// Subscription CRUD write-service (ADR-036 §6) — the first landed consumer is the admin HTTP API
// (`src/server/routes/admin/integrations`), so this barrel now carries the surface that file's own
// doc comment already promised ("the delivery worker, admin routes, AI tools depend on
// `integrations` via this index"). Additive only — no behavior change to `./subscriptions`.
export {
  createSubscription,
  deleteSubscription,
  pauseSubscription,
  updateSubscription,
  WebhookSubscriptionNotFoundError,
  WebhookSubscriptionValidationError,
} from "./subscriptions";
export type {
  CreateSubscriptionInput,
  CreateSubscriptionRequired,
  DeleteSubscriptionInput,
  DeleteSubscriptionRequired,
  PauseSubscriptionInput,
  PauseSubscriptionRequired,
  PauseSubscriptionOptional,
  UpdateSubscriptionInput,
  UpdateSubscriptionRequired,
  WebhookSubscriptionDeps,
  WebhookSubscriptionOptional,
} from "./subscriptions";

// In-memory repo adapters (the local-dev/test half of each ADR-006 rule-of-two) — same rationale
// as the `./subscriptions` export above.
export {
  InMemoryDeliveryEnvelopeStore,
  InMemoryWebhookDeliveryRepo,
  InMemoryWebhookSubscriptionRepo,
} from "./repo.memory";
export type { DeliveryEnvelopeStore } from "./repo.memory";
