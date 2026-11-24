import type { WebhookHeaderVocabulary } from "@jini-ai/integrations/webhooks";

/**
 * Tovu's outbound webhook wire header names, passed to `@jini-ai/integrations/webhooks/site/delivery`'s
 * `processDueDeliveries` as `deps.headers`. These are WIRE values: receivers verify `tovu-signature`
 * and deduplicate by `tovu-delivery-id`, so they must stay byte-identical across releases.
 */
export const TOVU_WEBHOOK_HEADERS: WebhookHeaderVocabulary = { signature: "tovu-signature", deliveryId: "tovu-delivery-id", eventId: "tovu-event-id" };
