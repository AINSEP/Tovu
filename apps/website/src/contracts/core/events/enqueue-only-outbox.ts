import type { DomainEvent, OutboxPort, OutboxRecord, UUID } from "@jini-ai/cms/core";

/**
 * @file An `OutboxPort` view that enqueues but never claims, for a process that writes content but
 * does not own event delivery.
 *
 * Purpose (2026-09-14):
 * The agent daemon (`server/inbound/assistant/agent-daemon-server.ts`) and the site-serving process
 * share one `content.db`, but each builds its own in-memory bus. The site's real subscribers (SEO
 * sitemap invalidation, form notifications, webhook fan-out, newsletter batches) are attached only
 * to the serving process's bus, by `createApp`. The post tools drain inline after every write, so in
 * the daemon they published rows to a bus without those handlers and marked them `delivered`. Those
 * events were lost, along with any other pending rows the same claim picked up. Behind this view
 * every daemon drain claims nothing, the rows stay `pending`, and the serving process's background
 * drainer (`outbox-drainer.ts`) delivers them.
 *
 * `markDelivered`/`markFailed` reject: nothing reaches them without claiming a row first, and this
 * view never hands one out, so a call is a wiring bug and fails loudly.
 */

/**
 * Wraps `outbox` so `enqueue` passes through and `claimPending` always returns no rows.
 *
 * @param outbox the real (shared) outbox to enqueue into.
 * @returns a new `OutboxPort`; `outbox` itself is not modified.
 * @complexity O(1) per call beyond the wrapped `enqueue`.
 */
export function toEnqueueOnlyOutbox(outbox: OutboxPort): OutboxPort {
  return {
    enqueue: (event: DomainEvent) => outbox.enqueue(event),
    claimPending: async (): Promise<OutboxRecord[]> => [],
    markDelivered: async (id: UUID) => {
      throw new Error(enqueueOnlyViolation("markDelivered", id));
    },
    markFailed: async (id: UUID) => {
      throw new Error(enqueueOnlyViolation("markFailed", id));
    },
  };
}

function enqueueOnlyViolation(method: "markDelivered" | "markFailed", id: UUID): string {
  return `enqueue-only outbox: ${method}('${id}') was called, but this process never claims outbox rows`;
}
