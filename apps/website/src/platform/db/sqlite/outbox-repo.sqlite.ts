import { and, asc, eq, inArray, lte } from "drizzle-orm";

import { outboxEvents } from "../schema.sqlite.js";
import type { ContentDb } from "./content-db.js";
import { DEFAULT_OUTBOX_CLAIM_LEASE_MS } from "#src/contracts/core/events/outbox-worker";
import type { DomainEvent, ISODateTime, OutboxPort, OutboxRecord, UUID } from "@jini-ai/cms/core";

/**
 * @file ADR-046 Phase 1 — real SQLite `OutboxPort` adapter (ADR-006 rule-of-two "second adapter"
 * half; `core/events/memory-bus.ts`'s `InMemoryOutbox` is the first — until this file, the only
 * `OutboxPort` implementation in the codebase).
 *
 * Purpose:
 * Events enqueued by `executeCommand()` (via `ChangeSetRepoPort.insert()`'s co-persisted write —
 * see `change-set-repo.sqlite.ts`) and by direct `OutboxPort.enqueue()` callers now survive a
 * restart. Reads/writes the SAME `outbox_events` table `SqliteChangeSetRepo.insert()` writes into
 * directly inside its own transaction — this adapter's `enqueue()` is the plain single-row path
 * for callers outside `executeCommand()` (BR-04's resolution deliberately covers the
 * `executeCommand()` producer only; see that file's header for the full list of other producers,
 * each its own future durability slice).
 *
 * `claimPending()` selects and marks rows `processing` inside one transaction (ADR-046 Phase 1's
 * "claim rows atomically" requirement) — two concurrent claims can never both walk away with the
 * same row.
 *
 * A claim is a lease (2026-09-14). The claim stores its expiry in `next_attempt_at`, and a
 * `processing` row past that expiry is claimable again, so a process that dies mid-drain no longer
 * strands its rows forever; delivery is at-least-once. No schema change: the column already exists
 * and `idx_outbox_events_claim` (status, next_attempt_at) still covers the query.
 *
 * Architectural role:
 * Infrastructure adapter. `core/events` never imports this file — it depends only on
 * `OutboxPort`; composition roots (`server/deps.ts`) bind the concrete class.
 */

function toRecord(row: typeof outboxEvents.$inferSelect): OutboxRecord {
  return {
    id: row.id,
    event: JSON.parse(row.eventJson) as DomainEvent,
    status: row.status as OutboxRecord["status"],
    attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt,
    lastError: row.lastError ?? undefined,
    createdAt: row.createdAt,
  };
}

/** Statuses `claimPending` may take: never claimed, or claimed under a lease that may have expired. */
const CLAIMABLE_STATUSES = ["pending", "processing"];

/**
 * Builds the `outbox_events` insert row for a freshly-produced `event`, factored out of
 * `SqliteOutboxAdapter.enqueue()` below so a caller that inserts the row as part of its OWN
 * transaction (e.g. `SqliteUserPurge.purgeUser()`, which must enqueue its audit event atomically
 * with the purge deletes rather than through this adapter's own single-row `enqueue()`) can reuse
 * the identical row shape instead of hand-rolling a second copy that could drift out of sync.
 */
export function outboxRowFor(event: DomainEvent): typeof outboxEvents.$inferInsert {
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    eventJson: JSON.stringify(event),
    status: "pending",
    attempts: 0,
    nextAttemptAt: event.occurredAt,
    createdAt: event.occurredAt,
  };
}

export class SqliteOutboxAdapter implements OutboxPort {
  private readonly claimLeaseMs: number;

  /**
   * @param db the content database holding `outbox_events`.
   * @param optional.claimLeaseMs claim lease length (default {@link DEFAULT_OUTBOX_CLAIM_LEASE_MS}).
   */
  constructor(
    private readonly db: ContentDb,
    optional: { claimLeaseMs?: number } = {}
  ) {
    this.claimLeaseMs = optional.claimLeaseMs ?? DEFAULT_OUTBOX_CLAIM_LEASE_MS;
  }

  async enqueue(event: DomainEvent): Promise<void> {
    this.db.insert(outboxEvents).values(outboxRowFor(event)).run();
  }

  /** Selects due rows (pending, or processing under an expired claim lease) and marks them
   * `processing` under a fresh lease in one synchronous transaction — the select-then-update is never
   * observable as two separate steps to a concurrent claimer. Returned records keep the due time
   * they were claimed at. */
  async claimPending(batchSize: number, nowIso: ISODateTime): Promise<OutboxRecord[]> {
    const leaseExpiresAt = new Date(Date.parse(nowIso) + this.claimLeaseMs).toISOString();
    return this.db.transaction((tx) => {
      const eligible = tx
        .select()
        .from(outboxEvents)
        .where(and(inArray(outboxEvents.status, CLAIMABLE_STATUSES), lte(outboxEvents.nextAttemptAt, nowIso)))
        .orderBy(asc(outboxEvents.nextAttemptAt))
        .limit(batchSize)
        .all();

      for (const row of eligible) {
        tx.update(outboxEvents)
          .set({ status: "processing", attempts: row.attempts + 1, nextAttemptAt: leaseExpiresAt })
          .where(eq(outboxEvents.id, row.id))
          .run();
      }

      return eligible.map((row) => toRecord({ ...row, status: "processing", attempts: row.attempts + 1 }));
    });
  }

  async markDelivered(id: UUID): Promise<void> {
    this.db.update(outboxEvents).set({ status: "delivered" }).where(eq(outboxEvents.id, id)).run();
  }

  /**
   * Marks a claimed row failed and persists whichever `nextStatus` the caller decided (2026-09-06:
   * `OutboxPort.markFailed` gained this parameter so the retry-cap decision lives with the worker,
   * not here — see `contracts/core/events/outbox-worker.ts`'s header doc). A single UPDATE, same
   * shape as `markDelivered` — no read-then-write race to guard against any more, since the caller
   * already had every value it needed (including `row.attempts`) at the moment it decided.
   */
  async markFailed(
    id: UUID,
    error: string,
    nextAttemptAt: ISODateTime,
    nextStatus: Extract<OutboxRecord["status"], "pending" | "failed">
  ): Promise<void> {
    this.db
      .update(outboxEvents)
      .set({ status: nextStatus, lastError: error, nextAttemptAt })
      .where(eq(outboxEvents.id, id))
      .run();
  }
}
