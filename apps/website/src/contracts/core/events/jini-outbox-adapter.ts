import { createConsoleLogger, type Clock } from "@jini-ai/core/primitives";
import type { DomainEvent, EventBusPort, OutboxPort } from "@jini-ai/cms/core";
import { createNodeOutboxScheduler, DEFAULT_OUTBOX_CLAIM_LEASE_MS, type OutboxPort as JiniOutboxPort, type OutboxWorkerArgs } from "@jini-ai/infra/events/outbox";

/**
 * @file CMS port translation only. Jini owns retry, timeout, enqueue-only and drain lifecycles.
 * CMS storage owns the existing lease in next_attempt_at; there is no claim-token field and no
 * new persisted format. Neither constructing these adapters nor importing them starts a drain.
 */

/**
 * Adapt the CMS event-shaped enqueue and fixed-lease claim contract to Jini without rewriting rows.
 * The worker wrapper exposes no custom claimLeaseMs: production CMS stores already use the same
 * 30-minute default. Passing a per-call lease would change the storage contract and needs a separate
 * owner decision. CMS settlement remains unfenced and carries only its existing fields.
 * @example const port = toJiniOutbox({ outbox: routeDeps.outbox });
 */
export function toJiniOutbox(required: { outbox: OutboxPort }, _optional: Record<string, never> = {}): JiniOutboxPort<DomainEvent> {
  const { outbox } = required;
  return {
    enqueue: ({ event }) => outbox.enqueue(event),
    claimPending: ({ batchSize, nowIso }) => outbox.claimPending({ batchSize, nowIso }),
    markDelivered: ({ id }) => outbox.markDelivered({ id }),
    markFailed: ({ id, error, nextAttemptAt, nextStatus }) => outbox.markFailed({ id, error, nextAttemptAt, nextStatus }),
  };
}

/**
 * Present a Jini enqueue-only view through the unchanged CMS port. Array copying satisfies the
 * CMS mutable result type; envelopes and records retain their identity and contents.
 * @example const cmsView = toCmsOutbox({ outbox: jiniView });
 */
export function toCmsOutbox(required: { outbox: JiniOutboxPort<DomainEvent> }, _optional: Record<string, never> = {}): OutboxPort {
  const { outbox } = required;
  return {
    enqueue: (event) => outbox.enqueue({ event }),
    claimPending: async ({ batchSize, nowIso }) => [...await outbox.claimPending({ batchSize, nowIso, claimLeaseMs: DEFAULT_OUTBOX_CLAIM_LEASE_MS })],
    markDelivered: ({ id }) => outbox.markDelivered({ id }),
    markFailed: ({ id, error, nextAttemptAt, nextStatus }) => outbox.markFailed({ id, error, nextAttemptAt, nextStatus }),
  };
}

/**
 * Bind the CMS bus, storage and clock to Jini's existing worker. Node scheduling and console logging
 * use their owning Jini adapters; the host supplies its Math.random default.
 * @example const worker = outboxWorkerArgs({ outbox, bus, clock }, { random: () => 0 });
 */
export function outboxWorkerArgs(
  required: { outbox: OutboxPort; bus: EventBusPort; clock: Clock }, optional: { random?: () => number } = {},
): OutboxWorkerArgs<DomainEvent> {
  return {
    outbox: toJiniOutbox({ outbox: required.outbox }),
    bus: { publish: ({ event }) => required.bus.publish(event) },
    clock: required.clock,
    scheduler: createNodeOutboxScheduler({}),
    random: optional.random ?? Math.random,
    logger: createConsoleLogger({ prefix: "" }),
  };
}
