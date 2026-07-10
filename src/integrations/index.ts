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
  HttpClientPort,
  HttpRequest,
  HttpResponse,
  IntegrationSecretRepoPort,
  KeyringPort,
  RootKeyHandle,
  SecretSealerPort,
  WebhookDeliveryRepoPort,
  WebhookEgressPolicy,
  WebhookSubscriptionRepoPort,
} from "./ports";
