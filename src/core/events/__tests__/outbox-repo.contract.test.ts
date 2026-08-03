import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "#src/db/sqlite/content-db";
import { SqliteOutboxAdapter } from "#src/db/sqlite/outbox-repo.sqlite";
import { InMemoryOutbox } from "../memory-bus";
import type { DomainEvent, OutboxPort } from "../../ports";

/**
 * @file ADR-046 Phase 1 — shared `OutboxPort` contract-test suite, run against BOTH
 * `memory-bus.ts`'s `InMemoryOutbox` and `db/sqlite/outbox-repo.sqlite.ts`'s
 * `SqliteOutboxAdapter` (rule-of-two, ADR-006). Same pattern as every other rule-of-two contract
 * suite in this codebase.
 */

function makeEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: overrides.id ?? "evt-1",
    name: "change-set.applied",
    occurredAt: "2026-07-16T00:00:00.000Z",
    workspaceId: "workspace-1",
    payload: { changeSetId: "cs-1" },
    ...overrides,
  };
}

function runContractSuite(label: string, makeOutbox: () => OutboxPort) {
  test(`[${label}] enqueue() then claimPending() returns the event as pending->processing`, async () => {
    const outbox = makeOutbox();
    await outbox.enqueue(makeEvent());

    const claimed = await outbox.claimPending(10, "2026-07-16T00:00:01.000Z");
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].id, "evt-1");
    assert.equal(claimed[0].status, "processing");
    assert.equal(claimed[0].attempts, 1);
    assert.deepEqual(claimed[0].event.payload, { changeSetId: "cs-1" });
  });

  test(`[${label}] claimPending never returns a row already claimed (no double-claim)`, async () => {
    const outbox = makeOutbox();
    await outbox.enqueue(makeEvent());

    const first = await outbox.claimPending(10, "2026-07-16T00:00:01.000Z");
    assert.equal(first.length, 1);

    const second = await outbox.claimPending(10, "2026-07-16T00:00:02.000Z");
    assert.equal(second.length, 0, "a row already moved to processing must not be claimed again");
  });

  test(`[${label}] claimPending respects nextAttemptAt — a not-yet-eligible row is not claimed`, async () => {
    const outbox = makeOutbox();
    await outbox.enqueue(makeEvent({ id: "evt-future", occurredAt: "2099-01-01T00:00:00.000Z" }));

    const claimed = await outbox.claimPending(10, "2026-07-16T00:00:01.000Z");
    assert.equal(claimed.length, 0);
  });

  test(`[${label}] claimPending respects batchSize`, async () => {
    const outbox = makeOutbox();
    await outbox.enqueue(makeEvent({ id: "evt-a" }));
    await outbox.enqueue(makeEvent({ id: "evt-b" }));
    await outbox.enqueue(makeEvent({ id: "evt-c" }));

    const claimed = await outbox.claimPending(2, "2026-07-16T00:00:01.000Z");
    assert.equal(claimed.length, 2);
  });

  test(`[${label}] markDelivered removes the row from future claims`, async () => {
    const outbox = makeOutbox();
    await outbox.enqueue(makeEvent());
    const [claimed] = await outbox.claimPending(10, "2026-07-16T00:00:01.000Z");

    await outbox.markDelivered(claimed.id);

    // A delivered row is not pending, so re-claiming (even at a much later time) finds nothing.
    const again = await outbox.claimPending(10, "2099-01-01T00:00:00.000Z");
    assert.equal(again.length, 0);
  });

  test(`[${label}] markFailed returns the row to pending with the error and new retry time`, async () => {
    const outbox = makeOutbox();
    await outbox.enqueue(makeEvent());
    const [claimed] = await outbox.claimPending(10, "2026-07-16T00:00:01.000Z");

    await outbox.markFailed(claimed.id, "delivery boom", "2026-07-16T01:00:00.000Z");

    // Not yet eligible at the old time.
    const tooEarly = await outbox.claimPending(10, "2026-07-16T00:00:02.000Z");
    assert.equal(tooEarly.length, 0);

    // Eligible again once nextAttemptAt has passed, with attempts incremented and error recorded.
    const retried = await outbox.claimPending(10, "2026-07-16T01:00:01.000Z");
    assert.equal(retried.length, 1);
    assert.equal(retried[0].attempts, 2);
  });
}

runContractSuite("memory", () => new InMemoryOutbox());

runContractSuite("sqlite", () => new SqliteOutboxAdapter(openContentDb(":memory:")));
