import type { DomainEvent, EventBusPort, OutboxPort, OutboxRecord } from "@jini-ai/cms/core";

/**
 * @file In-memory implementations of the event bus and outbox contracts.
 *
 * Purpose:
 * Provides zero-infrastructure adapters so the project can run immediately
 * without a database, queue, or broker.
 *
 * How it relates to the project:
 * - Implements interfaces from `src/core/ports.ts`.
 * - Used by `src/server/app.ts` as the concrete runtime wiring in development.
 * - Works with `src/core/events/outbox-worker.ts` to demonstrate hybrid sync + async flow.
 * - Used by tests to validate behavior without external dependencies.
 *
 * Architectural role:
 * Local adapter implementations. Production adapters can replace these later
 * (Postgres outbox, Redis/Kafka/NATS bus, etc.) without touching feature logic.
 */
export class InMemoryEventBus implements EventBusPort {
  /** Map of event name -> subscribed handlers. */
  private handlers = new Map<string, Array<(event: DomainEvent) => Promise<void>>>();
  /** Handlers subscribed to every event regardless of name (C-009). */
  private allHandlers: Array<(event: DomainEvent) => Promise<void>> = [];

  /** Publish a single event to all handlers registered for `event.name`, then every `subscribeAll` handler. */
  async publish<TPayload>(event: DomainEvent<TPayload>): Promise<void> {
    const eventHandlers = this.handlers.get(event.name) ?? [];
    for (const handler of eventHandlers) {
      await handler(event as DomainEvent);
    }
    for (const handler of this.allHandlers) {
      await handler(event as DomainEvent);
    }
  }

  /** Publish events in order. */
  async publishBatch<TPayload>(events: Array<DomainEvent<TPayload>>): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  /** Register a handler and return an async unsubscriber. */
  async subscribe<TPayload>(
    eventName: string,
    handler: (event: DomainEvent<TPayload>) => Promise<void>
  ): Promise<() => Promise<void>> {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler as (event: DomainEvent) => Promise<void>);
    this.handlers.set(eventName, list);

    return async () => {
      const current = this.handlers.get(eventName) ?? [];
      this.handlers.set(
        eventName,
        current.filter((h) => h !== (handler as (event: DomainEvent) => Promise<void>))
      );
    };
  }

  /** Register a handler for every event; returns an async unsubscriber (C-009). */
  async subscribeAll(handler: (event: DomainEvent) => Promise<void>): Promise<() => Promise<void>> {
    this.allHandlers.push(handler);

    return async () => {
      this.allHandlers = this.allHandlers.filter((h) => h !== handler);
    };
  }
}

/**
 * In-memory outbox implementation.
 *
 * This mirrors outbox behavior for local execution without a database.
 */
export class InMemoryOutbox implements OutboxPort {
  /** Internal mutable storage for outbox rows. */
  private records: OutboxRecord[] = [];

  /** Enqueue a domain event as a pending outbox row, preserving the full envelope. */
  async enqueue(event: DomainEvent): Promise<void> {
    this.records.push({
      id: event.id,
      event,
      status: "pending",
      attempts: 0,
      nextAttemptAt: event.occurredAt,
      createdAt: event.occurredAt,
    });
  }

  /**
   * Claim up to `batchSize` pending rows eligible at `nowIso`.
   * Claimed rows are immediately marked as `processing`.
   */
  async claimPending(batchSize: number, nowIso: string): Promise<OutboxRecord[]> {
    const pending = this.records
      .filter((r) => r.status === "pending" && r.nextAttemptAt <= nowIso)
      .slice(0, batchSize);

    for (const row of pending) {
      row.status = "processing";
      row.attempts += 1;
    }

    return pending;
  }

  /** Mark a claimed row as delivered. */
  async markDelivered(id: string): Promise<void> {
    const row = this.records.find((r) => r.id === id);
    if (row) row.status = "delivered";
  }

  /** Mark a claimed row as failed and schedule retry. */
  async markFailed(id: string, error: string, nextAttemptAt: string): Promise<void> {
    const row = this.records.find((r) => r.id === id);
    if (!row) return;
    row.status = "pending";
    row.lastError = error;
    row.nextAttemptAt = nextAttemptAt;
  }
}
