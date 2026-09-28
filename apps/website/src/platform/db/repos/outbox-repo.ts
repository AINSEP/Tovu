import type { Selectable } from "kysely";

import type { ContentKernel } from "../content-kernel.js";
import type { OutboxEventsTable } from "../content-database.generated.js";
import { DEFAULT_OUTBOX_CLAIM_LEASE_MS } from "#src/contracts/core/events/outbox-worker";
import type { DomainEvent, ISODateTime, OutboxPort, OutboxRecord, UUID } from "@jini-ai/cms/core";

/**
 * @file THE `OutboxPort` adapter over `outbox_events` (ADR-046 Phase 1): one Kysely query body for
 * every dialect (storage plan §4, ADR-066). ADR-006 rule-of-two "second adapter" half;
 * `core/events/memory-bus.ts`'s `InMemoryOutbox` is the first. `sqlite/outbox-repo.sqlite.ts` is the
 * thin subclass the composition root (`server/deps.ts`) builds from the content db handle.
 *
 * Events enqueued by `executeCommand()` (via `ChangeSetRepoPort.insert()`'s co-persisted write) and
 * by direct `OutboxPort.enqueue()` callers survive a restart. `enqueue()` is the plain single-row
 * path for callers outside `executeCommand()`.
 *
 * `claimPending()` selects and marks rows `processing` inside one kernel transaction under
 * `lockKey("outbox_events:claim")` (ADR-046's "claim rows atomically"): two concurrent claims can
 * never both walk away with the same row — on Postgres too, where a transaction alone would not
 * serialize the select-then-update.
 *
 * A claim is a lease (2026-09-14). The claim stores its expiry in `next_attempt_at`, and a
 * `processing` row past that expiry is claimable again, so a process that dies mid-drain no longer
 * strands its rows forever; delivery is at-least-once. `idx_outbox_events_claim` (status,
 * next_attempt_at) covers the query.
 */

function toRecord(row: Selectable<OutboxEventsTable>): OutboxRecord {
  return {
    id: row.id,
    event: JSON.parse(row.event_json) as DomainEvent,
    status: row.status as OutboxRecord["status"],
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
  };
}

/** Statuses `claimPending` may take: never claimed, or claimed under a lease that may have expired. */
const CLAIMABLE_STATUSES = ["pending", "processing"];

/** The `outbox_events` row for a freshly-produced `event` (snake_case; `sqlite/outbox-repo.sqlite.ts`'s
 *  `outboxRowFor` is the same row in Drizzle's shape for callers still inserting through Drizzle). */
export function outboxEventValues(event: DomainEvent) {
  return {
    id: event.id,
    workspace_id: event.workspaceId,
    event_json: JSON.stringify(event),
    status: "pending",
    attempts: 0,
    next_attempt_at: event.occurredAt,
    created_at: event.occurredAt,
  };
}

export class SqlOutboxAdapter implements OutboxPort {
  private readonly claimLeaseMs: number;

  /**
   * @param kernel the content database holding `outbox_events`.
   * @param optional.claimLeaseMs claim lease length (default {@link DEFAULT_OUTBOX_CLAIM_LEASE_MS}).
   */
  constructor(
    protected readonly kernel: ContentKernel,
    optional: { claimLeaseMs?: number } = {}
  ) {
    this.claimLeaseMs = optional.claimLeaseMs ?? DEFAULT_OUTBOX_CLAIM_LEASE_MS;
  }

  async enqueue(event: DomainEvent): Promise<void> {
    await this.kernel.run((db) => db.insertInto("outbox_events").values(outboxEventValues(event)).execute());
  }

  /** Selects due rows (pending, or processing under an expired claim lease) and marks them
   * `processing` under a fresh lease in one kernel transaction — the select-then-update is never
   * observable as two separate steps to a concurrent claimer. Returned records keep the due time
   * they were claimed at. */
  async claimPending(batchSize: number, nowIso: ISODateTime): Promise<OutboxRecord[]> {
    const leaseExpiresAt = new Date(Date.parse(nowIso) + this.claimLeaseMs).toISOString();
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey("outbox_events:claim");
      const eligible = await this.kernel.run((db) =>
        db
          .selectFrom("outbox_events")
          .selectAll()
          .where("status", "in", CLAIMABLE_STATUSES)
          .where("next_attempt_at", "<=", nowIso)
          .orderBy("next_attempt_at", "asc")
          .limit(batchSize)
          .execute()
      );
      for (const row of eligible) {
        await this.kernel.run((db) =>
          db
            .updateTable("outbox_events")
            .set({ status: "processing", attempts: row.attempts + 1, next_attempt_at: leaseExpiresAt })
            .where("id", "=", row.id)
            .execute()
        );
      }
      return eligible.map((row) => toRecord({ ...row, status: "processing", attempts: row.attempts + 1 }));
    });
  }

  async markDelivered(id: UUID): Promise<void> {
    await this.kernel.run((db) => db.updateTable("outbox_events").set({ status: "delivered" }).where("id", "=", id).execute());
  }

  /**
   * Marks a claimed row failed and persists whichever `nextStatus` the caller decided (the retry-cap
   * decision lives with the worker — `contracts/core/events/outbox-worker.ts`'s header doc). A
   * single UPDATE, same shape as `markDelivered`: the caller already had every value it needed.
   */
  async markFailed(
    id: UUID,
    error: string,
    nextAttemptAt: ISODateTime,
    nextStatus: Extract<OutboxRecord["status"], "pending" | "failed">
  ): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("outbox_events")
        .set({ status: nextStatus, last_error: error, next_attempt_at: nextAttemptAt })
        .where("id", "=", id)
        .execute()
    );
  }
}

/** The outbox on `kernel`'s database, whichever dialect. */
export function outboxFor(kernel: ContentKernel, optional: { claimLeaseMs?: number } = {}): OutboxPort {
  return new SqlOutboxAdapter(kernel, optional);
}
