// Canonical row and wire-shape rationale: Jini/packages/integrations/src/webhooks/types.ts.
/** Host type boundary for durable repositories (ADR-036).
 * Webhook tables are core-owned, not third-party plugin data modules; writes use the host mutation
 * chokepoint and composite workspace isolation. API keys remain owned by identity.
 * Host rows use stable ULIDs. Delivery/signature/envelope contracts belong to the Jini owner.
 */
export type {
  IntegrationId, IntegrationSecretRecord, SecretVersion,
  WebhookBeforeDispatchHook, WebhookBeforeDispatchResult,
  WebhookDeliveryRecord, WebhookDeliveryStatus, WebhookEventEnvelope,
  WebhookSignature, WebhookSubscriptionRecord, WebhookSubscriptionStatus, WebhookTopic,
} from "@jini-ai/integrations/webhooks";
export type { SealedSecret } from "@jini-ai/platform/secrets";
