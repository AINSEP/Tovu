import type { DeliveryEnvelopeStore, HttpClientPort, WebhookDeliveryRepoPort, WebhookSubscriptionRepoPort } from "#src/features/webhooks/index";
import { processDueDeliveries } from "#src/features/webhooks/delivery";
import type { WebhookSigner } from "#src/features/webhooks/signing";
import { createDefaultHttpClient } from "#src/platform/http/client";
import { SINGLE_HOP_HTTPS_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import type { ObservabilityPort } from "#src/platform/observability/index";
import { startWebhookDeliveryWorker, type WebhookDeliveryWorker, type WebhookDeliveryWorkerOptional } from "@jini-ai/integrations/webhooks";
import { webhookEnvelopeStoreFor } from "./modules/integrations.js";

// Loop lifecycle (interval, single flight, cancel-on-stop, grace, scrubbed tick-error line) and
// its rationale: Jini/packages/integrations/src/webhooks/worker.ts.
export {
  describeWebhookTickError,
  nodeWebhookDeliveryScheduler,
  startWebhookDeliveryWorker,
  WEBHOOK_DELIVERY_FAILED_LINE,
  WEBHOOK_DELIVERY_INTERVAL_MS,
  WEBHOOK_DELIVERY_STOP_GRACE_MS,
  WEBHOOK_DELIVERY_STOP_LATE_LINE,
} from "@jini-ai/integrations/webhooks";
export type { WebhookDeliveryScheduler, WebhookDeliveryTimer, WebhookDeliveryWorker, WebhookDeliveryWorkerOptional } from "@jini-ai/integrations/webhooks";

/**
 * @file Tovu's wiring of the outbound webhook delivery loop: every interval it runs
 * `processDueDeliveries` once, which claims a bounded batch of due deliveries, signs and POSTs them,
 * and records each outcome (retry with backoff, or dead-letter).
 *
 * Why it exists: the integrations module's fan-out (`modules/integrations.ts`) only ENQUEUES. Until
 * this loop, nothing ever called `processDueDeliveries` outside tests, so every webhook delivery sat
 * `pending` forever.
 *
 * Only `createServingApp` starts it, for the outbox drainer's reason: this is the one process pair
 * that serves a site. A delivery loop in the exporter, the agent daemon or `app.ts`'s eager app
 * would POST a site's data from a process nobody is watching.
 *
 * Stop grace: shutdown closes the site store at most 4 s after a signal (`closeStoreOnShutdown`),
 * shared with the other loops' stops, so a tick gets 1 s ({@link WEBHOOK_DELIVERY_STOP_GRACE_MS}).
 * `stop` aborts the running pass first, so the in-flight POST rejects at once and unattempted claims
 * return to `pending` inside that second; a pass still running then is abandoned, and the claim
 * lease makes its rows claimable again after a restart.
 */

/** The serving deps the loop reads (all on `RouteDeps`). */
export interface ServingWebhookDeliveryDeps {
  webhookDeliveryRepo: WebhookDeliveryRepoPort;
  webhookSubscriptionRepo: WebhookSubscriptionRepoPort;
  webhookSigner: WebhookSigner;
  clock: { nowIso(): string };
  observability: ObservabilityPort;
}

/**
 * Starts the loop over the serving process's own webhook ports. The envelope store is the one the
 * fan-out writes to ({@link webhookEnvelopeStoreFor}). Outbound POSTs go through a guarded client on
 * `SINGLE_HOP_HTTPS_EGRESS_POLICY`: https only, private/loopback addresses refused, no redirects
 * (a redirect would replay a signed body to a host the subscriber never named), 1 MB response cap.
 *
 * @param optional.httpClient replaces the guarded client (tests).
 * @complexity O(1); each tick's cost is `processDueDeliveries`'s.
 */
export function startServingWebhookDeliveryWorker(
  required: { deps: ServingWebhookDeliveryDeps },
  optional: WebhookDeliveryWorkerOptional & { httpClient?: HttpClientPort } = {},
): WebhookDeliveryWorker {
  const { deps } = required;
  const { httpClient = createDefaultHttpClient(SINGLE_HOP_HTTPS_EGRESS_POLICY, { observability: deps.observability }), ...workerOptional } = optional;
  const envelopeStore: DeliveryEnvelopeStore = webhookEnvelopeStoreFor({ deliveryRepo: deps.webhookDeliveryRepo });
  const processDue = ({ signal }: { signal: AbortSignal }) => processDueDeliveries({ deps: {
    deliveryRepo: deps.webhookDeliveryRepo,
    subscriptionRepo: deps.webhookSubscriptionRepo,
    envelopeStore,
    httpClient,
    signer: deps.webhookSigner,
    clock: deps.clock,
  } }, { signal });
  return startWebhookDeliveryWorker({ processDue }, workerOptional);
}
