import { and, asc, eq, lte } from "drizzle-orm";

import { outboxEvents } from "../schema.js";
import type { ContentDb } from "./content-db.js";
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

export class SqliteOutboxAdapter implements OutboxPort {
  constructor(private readonly db: ContentDb) {}

  async enqueue(event: DomainEvent): Promise<void> {
    this.db
      .insert(outboxEvents)
      .values({
        id: event.id,
        workspaceId: event.workspaceId,
        eventJson: JSON.stringify(event),
        status: "pending",
        attempts: 0,
        nextAttemptAt: event.occurredAt,
        createdAt: event.occurredAt,
      })
      .run();
  }

  /** Selects eligible rows and marks them `processing` in one synchronous transaction — the
   * select-then-update is never observable as two separate steps to a concurrent claimer. */
  async claimPending(batchSize: number, nowIso: ISODateTime): Promise<OutboxRecord[]> {
    return this.db.transaction((tx) => {
      const eligible = tx
        .select()
        .from(outboxEvents)
        .where(and(eq(outboxEvents.status, "pending"), lte(outboxEvents.nextAttemptAt, nowIso)))
        .orderBy(asc(outboxEvents.nextAttemptAt))
        .limit(batchSize)
        .all();

      for (const row of eligible) {
        tx.update(outboxEvents)
          .set({ status: "processing", attempts: row.attempts + 1 })
          .where(eq(outboxEvents.id, row.id))
          .run();
      }

      return eligible.map((row) => toRecord({ ...row, status: "processing", attempts: row.attempts + 1 }));
    });
  }

  async markDelivered(id: UUID): Promise<void> {
    this.db.update(outboxEvents).set({ status: "delivered" }).where(eq(outboxEvents.id, id)).run();
  }

  async markFailed(id: UUID, error: string, nextAttemptAt: ISODateTime): Promise<void> {
    this.db
      .update(outboxEvents)
      .set({ status: "pending", lastError: error, nextAttemptAt })
      .where(eq(outboxEvents.id, id))
      .run();
  }
}
