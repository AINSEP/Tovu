import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteOutboxAdapter } from "#src/platform/db/sqlite/outbox-repo.sqlite";
import { InMemoryOutbox } from "../memory-bus.js";
import { MAX_OUTBOX_ATTEMPTS } from "../outbox-worker.js";
import type { DomainEvent, OutboxPort } from "@jini-ai/cms/core";

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

type OutboxOptions = { claimLeaseMs?: number };

function runContractSuite(label: string, makeOutbox: (options?: OutboxOptions) => OutboxPort) {
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

    await outbox.markFailed(claimed.id, "delivery boom", "2026-07-16T01:00:00.000Z", "pending");

    // Not yet eligible at the old time.
    const tooEarly = await outbox.claimPending(10, "2026-07-16T00:00:02.000Z");
    assert.equal(tooEarly.length, 0);

    // Eligible again once nextAttemptAt has passed, with attempts incremented and error recorded.
    const retried = await outbox.claimPending(10, "2026-07-16T01:00:01.000Z");
    assert.equal(retried.length, 1);
    assert.equal(retried[0].attempts, 2);
  });

  test(`[${label}] markFailed permanently excludes a row once the CALLER passes nextStatus="failed" (2026-09-06 fix)`, async () => {
    const outbox = makeOutbox();
    await outbox.enqueue(makeEvent());

    let nowIso = "2026-07-16T00:00:01.000Z";
    for (let attempt = 1; attempt <= MAX_OUTBOX_ATTEMPTS; attempt++) {
      const [claimed] = await outbox.claimPending(10, nowIso);
      assert.equal(claimed.attempts, attempt);

      nowIso = new Date(Date.parse(nowIso) + 60 * 60 * 1000).toISOString();
      // The caller (mirroring processOutbox) decides nextStatus from the row it already has —
      // the adapter is not consulted about the cap at all.
      const nextStatus = attempt >= MAX_OUTBOX_ATTEMPTS ? "failed" : "pending";
      await outbox.markFailed(claimed.id, `boom #${attempt}`, nowIso, nextStatus);
    }

    // The caller's last decision was "failed": the next claim attempt, at any future time, must
    // find nothing -- proving the row is sealed, not merely waiting out a delay.
    const final = await outbox.claimPending(10, "2099-01-01T00:00:00.000Z");
    assert.equal(final.length, 0);
  });

  test(`[${label}] markFailed honors the caller's nextStatus rather than re-deriving it from persisted attempts (2026-09-06 seam)`, async () => {
    const outbox = makeOutbox();
    await outbox.enqueue(makeEvent());
    const [claimed] = await outbox.claimPending(10, "2026-07-16T00:00:01.000Z");
    assert.equal(claimed.attempts, 1, "well below MAX_OUTBOX_ATTEMPTS");

    // The caller declares this row terminal on its VERY FIRST attempt -- something the old
    // attempts-based adapter logic could never produce on its own. If the adapter still computed
    // the decision itself instead of trusting the caller, this row would come back as retryable.
    await outbox.markFailed(claimed.id, "caller decided terminal early", "2026-07-16T01:00:00.000Z", "failed");

    const final = await outbox.claimPending(10, "2099-01-01T00:00:00.000Z");
    assert.equal(final.length, 0, "adapter must honor an early terminal decision from the caller, not recompute it");
  });

  // 2026-09-14: a claimer that dies between claimPending and markDelivered/markFailed used to leave
  // the row `processing` forever. A claim is now a lease; once it expires the row is claimable again.
  test(`[${label}] a row left in processing is claimed again once its claim lease has expired`, async () => {
    const outbox = makeOutbox({ claimLeaseMs: 60_000 });
    await outbox.enqueue(makeEvent());
    const [first] = await outbox.claimPending(10, "2026-07-16T00:00:01.000Z");
    assert.equal(first.attempts, 1);
    // The claimer dies here: neither markDelivered nor markFailed ever runs.

    const insideLease = await outbox.claimPending(10, "2026-07-16T00:01:00.999Z");
    assert.equal(insideLease.length, 0, "a live claim must not be taken over before its lease ends");

    const afterLease = await outbox.claimPending(10, "2026-07-16T00:01:01.000Z");
    assert.deepEqual(
      afterLease.map((row) => [row.id, row.status, row.attempts]),
      [["evt-1", "processing", 2]]
    );
  });

  test(`[${label}] a reclaimed row holds a fresh lease, so no third claimer takes it back straight away`, async () => {
    const outbox = makeOutbox({ claimLeaseMs: 60_000 });
    await outbox.enqueue(makeEvent());
    await outbox.claimPending(10, "2026-07-16T00:00:01.000Z");

    const reclaimed = await outbox.claimPending(10, "2026-07-16T00:01:01.000Z");
    assert.equal(reclaimed.length, 1);

    const insideNewLease = await outbox.claimPending(10, "2026-07-16T00:02:00.999Z");
    assert.equal(insideNewLease.length, 0, "the reclaim must start a new lease, not reuse the expired one");

    const afterNewLease = await outbox.claimPending(10, "2026-07-16T00:02:01.000Z");
    assert.deepEqual(afterNewLease.map((row) => row.attempts), [3]);
  });

  test(`[${label}] a delivered or terminally failed row is never reclaimed, however old its claim`, async () => {
    const outbox = makeOutbox({ claimLeaseMs: 60_000 });
    await outbox.enqueue(makeEvent({ id: "evt-delivered" }));
    await outbox.enqueue(makeEvent({ id: "evt-dead" }));
    await outbox.claimPending(10, "2026-07-16T00:00:01.000Z");
    await outbox.markDelivered("evt-delivered");
    await outbox.markFailed("evt-dead", "poison", "2026-07-16T00:00:02.000Z", "failed");

    const later = await outbox.claimPending(10, "2099-01-01T00:00:00.000Z");
    assert.equal(later.length, 0);
  });
}

runContractSuite("memory", (options) => new InMemoryOutbox(options));

runContractSuite("sqlite", (options) => new SqliteOutboxAdapter(openContentDb(":memory:"), options));
