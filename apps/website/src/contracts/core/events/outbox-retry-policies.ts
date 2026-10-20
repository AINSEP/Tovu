import { FORM_DELIVERY_EVENT, formDeliveryRetryPolicy } from "@jini-ai/cms/forms";
import type { OutboxRetryPolicyResolver } from "@jini-ai/infra/events/outbox";
import { computeBackoffMs, MAX_DELIVERY_ATTEMPTS } from "@jini-ai/integrations/webhooks";

/**
 * @file The site's per-event outbox retry table. It lives beside the outbox facade
 * (`outbox-worker.ts`, `outbox-drainer.ts`) rather than in a feature because every drain, inline
 * after a route write or in the background drainer, must apply the same policy to the same row;
 * a feature-owned resolver would need every caller of `processOutbox` to remember to pass it.
 *
 * Only external form deliveries differ from the outbox defaults: a destination being down for an
 * hour is normal, so they reuse the outgoing-webhook schedule (8 attempts over about a day), honour
 * an adapter's bounded `retryAfterMs`, and stop at once on a non-retryable delivery error. Every
 * other event keeps the in-process defaults (6 attempts over minutes), which suit internal failures.
 */

const formDelivery = formDeliveryRetryPolicy({
  backoffMs: ({ attempts, random }) => computeBackoffMs({ attempts }, { random }),
  maxAttempts: MAX_DELIVERY_ATTEMPTS,
});

/** Returns the policy for `event`, or undefined to keep the outbox defaults. @complexity O(1). */
export const outboxRetryPolicyForEvent: OutboxRetryPolicyResolver = ({ event }) => (event.name === FORM_DELIVERY_EVENT ? formDelivery : undefined);
