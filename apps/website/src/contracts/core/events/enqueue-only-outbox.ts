import type { OutboxPort } from "@jini-ai/cms/core";
import { toEnqueueOnlyOutbox as jiniEnqueueOnlyOutbox } from "@jini-ai/infra/events/outbox";
import { toCmsOutbox, toJiniOutbox } from "./jini-outbox-adapter.js";

/**
 * @file An `OutboxPort` view that enqueues but never claims, for a process that writes content but
 * does not own event delivery.
 *
 * Process ownership:
 * The agent daemon (`server/inbound/assistant/agent-daemon-server.ts`) and the site-serving process
 * share one `content.db`, but each builds its own in-memory bus. The site's real subscribers (SEO
 * sitemap invalidation, form notifications, webhook fan-out, newsletter batches) are attached only
 * to the serving process's bus, by `createApp`. The post tools drain inline after every write, so in
 * the daemon they would publish rows to a bus without those handlers and mark them `delivered`,
 * losing those events and any other pending rows claimed in the same batch. Behind this view
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
 * @example const daemonOutbox = toEnqueueOnlyOutbox(routeDeps.outbox);
 * @complexity O(1) per call beyond the wrapped `enqueue`.
 */
export function toEnqueueOnlyOutbox(outbox: OutboxPort): OutboxPort {
  return toCmsOutbox({ outbox: jiniEnqueueOnlyOutbox({ outbox: toJiniOutbox({ outbox }) }) });
}
