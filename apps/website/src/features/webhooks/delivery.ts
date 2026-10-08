// Delivery, deduplication, jitter and hook rationale: Jini/packages/integrations/src/webhooks/delivery.ts.
/** Bind the canonical delivery worker to Tovu's wire headers, ISO clock and outbound HTTP policy.
 * Hook throws/vetoes must fail the attempt before unfiltered data can be sent; they follow the
 * ordinary backoff/dead path because the delivery port has no separate veto terminal state.
 */
import {
  enqueueDelivery as enqueueWebhookDelivery,
  processDueDeliveries as processWebhookDeliveries,
  type EnqueueDeliveryDeps as JiniEnqueueDeps,
  type ProcessDueDeliveriesDeps as JiniProcessDeps,
  type EnqueueDeliveryOptional,
  type ProcessDueDeliveriesOptional,
  type ProcessDueDeliveriesResult,
  type WebhookSourceEvent,
} from "@jini-ai/integrations/webhooks";
import type { WebhookDeliveryRepoPort, HttpClientPort } from "./ports.js";

export { computeBackoffMs, MAX_DELIVERY_ATTEMPTS, WebhookDeliveryVetoedError } from "@jini-ai/integrations/webhooks";
export type { EnqueueDeliveryOptional, ProcessDueDeliveriesOptional, ProcessDueDeliveriesResult, WebhookSourceEvent } from "@jini-ai/integrations/webhooks";

export interface EnqueueDeliveryDeps extends Omit<JiniEnqueueDeps, "deliveryRepo" | "clock"> {
  deliveryRepo: WebhookDeliveryRepoPort;
  clock: { nowIso(): string };
}
export interface EnqueueDeliveryRequired { deps: EnqueueDeliveryDeps; input: { event: WebhookSourceEvent }; }
export interface ProcessDueDeliveriesDeps extends Omit<JiniProcessDeps, "deliveryRepo" | "httpClient" | "headers" | "clock"> {
  deliveryRepo: WebhookDeliveryRepoPort;
  httpClient: HttpClientPort;
  clock: { nowIso(): string };
}
export interface ProcessDueDeliveriesRequired { deps: ProcessDueDeliveriesDeps; }

/** Retain atomic durable enqueue({ record }, { envelope }) and optional dead-letter timestamps.
 * ADR-046 fold-in item 5 (GAP-05/GAP-12): the durable adapter writes the envelope in the SAME
 * INSERT as the delivery row, closing the crash gap. Jini's following envelopeStore.save remains
 * the actual write for memory adapters and a harmless repeated write for co-persisting adapters.
 */

/** Delegate fan-out without changing durable deduplication or envelope co-persistence.
 * @complexity O(matching subscriptions × delivery history), as defined by the existing repo port.
 */
export function enqueueDelivery({ deps, input }: EnqueueDeliveryRequired, optional: EnqueueDeliveryOptional = {}) {
  return enqueueWebhookDelivery({ deps: {
    ...deps,
    clock: { nowMs: () => Date.parse(deps.clock.nowIso()) },
  }, input }, optional);
}

/** Jini owns claim/retry/hooks/sign/send; host adapters preserve transport and signature headers.
 * @complexity O(batch size × bounded envelope bytes), with one bounded HTTP request per delivery.
 */
export function processDueDeliveries({ deps }: ProcessDueDeliveriesRequired, optional: ProcessDueDeliveriesOptional = {}): Promise<ProcessDueDeliveriesResult> {
  return processWebhookDeliveries({ deps: {
    ...deps,
    // Preserve the signed body bytes; only unwrap the canonical HTTP request object.
    // Redirect policy comes from host composition; unsupported per-call controls fail closed.
    httpClient: { send: ({ request }, options = {}) => {
      if (options.redirect !== undefined) throw new Error("webhook HTTP adapter does not support per-request redirect controls");
      return deps.httpClient.send(request);
    } },
    clock: { nowMs: () => Date.parse(deps.clock.nowIso()) },
    headers: { signature: "tovu-signature", deliveryId: "tovu-delivery-id", eventId: "tovu-event-id" },
  } }, optional);
}
