import type { ClockPort, EventBusPort, OutboxPort } from "../ports";

/**
 * @file Outbox processing orchestration.
 *
 * Purpose:
 * Converts persisted outbox records into delivered bus events.
 *
 * How it relates to the project:
 * - Reads and updates outbox state through `OutboxPort` (`src/core/ports.ts`).
 * - Publishes delivered events through `EventBusPort`.
 * - Called by `src/server/app.ts` after a successful command write.
 *
 * Architectural role:
 * This is the hybrid reliability bridge:
 * synchronous command handling writes data immediately, and this worker
 * handles asynchronous side effects with retry semantics.
 */
export async function processOutbox(
  required: { outbox: OutboxPort; bus: EventBusPort; clock: ClockPort },
  optional: { batchSize?: number } = {}
): Promise<number> {
  const { outbox, bus, clock } = required;
  const { batchSize = 20 } = optional;
  const now = clock.nowIso();
  const rows = await outbox.claimPending(batchSize, now);

  for (const row of rows) {
    try {
      await bus.publish(row.event);
      await outbox.markDelivered(row.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown outbox error";
      await outbox.markFailed(row.id, message, now);
    }
  }

  return rows.length;
}
