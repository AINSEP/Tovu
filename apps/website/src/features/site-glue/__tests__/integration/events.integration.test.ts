import assert from "node:assert/strict";
import test from "node:test";

import { subscribeGlueEvent } from "../../attachment-points/events.js";
import type { GlueHostPort } from "../../ports.js";
import { InMemoryEventBus, InMemoryOutbox, processOutbox } from "#src/contracts/core/events/index";

/**
 * @file Events attachment point, exercised against a REAL outbox + event bus — SPEC-048 REQ-5/
 * REQ-8; ADR-057 Decision 2/4.
 *
 * This is the dedicated coverage the TDD dispatch requires: proof that a glue module's subscribed
 * handler receives a REAL outbox event, delivered through the actual `enqueue -> claimPending ->
 * publish` pipeline (`core/events`), not a bare direct function call. The `GlueHostPort.
 * subscribeEvent` implementation below is a worked example of what Tovu's real composition-root
 * adapter is expected to do: register the handler on a live `EventBusPort`. Site-glue's own product
 * code (`events.ts`) never imports `core/events` directly — only this test does, to prove the
 * composition works end to end.
 */

function makeRealHostPort(bus: InMemoryEventBus): Pick<GlueHostPort, "subscribeEvent"> {
  return {
    subscribeEvent(_moduleId, eventName, handler) {
      // Fire-and-forget: InMemoryEventBus.subscribe() registers its handler synchronously (no
      // `await` precedes the registration inside it), so the subscription is live before this
      // call returns even though `subscribeEvent`'s own contract is `void`, not `Promise<void>`.
      void bus.subscribe(eventName, handler);
    },
  };
}

test("ADR-057 Decision 2: a glue module's handler receives a REAL outbox event, delivered through enqueue -> processOutbox -> publish, not a bare direct call", async () => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const hostPort = makeRealHostPort(bus);
  const clock = { nowIso: () => new Date().toISOString() };

  const received: unknown[] = [];
  subscribeGlueEvent({
    moduleId: "site-glue-example",
    eventName: "content.entry.published",
    handler: async (event) => {
      received.push(event);
    },
    hostPort,
  });

  await outbox.enqueue({
    id: "evt-1",
    name: "content.entry.published",
    occurredAt: clock.nowIso(),
    workspaceId: "ws-1",
    payload: { entryId: "entry-1" },
  });

  const delivered = await processOutbox({ outbox, bus, clock });

  assert.equal(delivered, 1, "processOutbox must claim and deliver exactly the one enqueued row");
  assert.equal(received.length, 1);
  assert.deepEqual((received[0] as { payload: unknown }).payload, { entryId: "entry-1" });
});

test("ADR-057 Decision 4/REQ-8: a glue module subscribed to a DIFFERENT event name never receives an unrelated outbox event — no new containment needed, ordinary name-scoped delivery", async () => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const hostPort = makeRealHostPort(bus);
  const clock = { nowIso: () => new Date().toISOString() };

  let calls = 0;
  subscribeGlueEvent({
    moduleId: "site-glue-example",
    eventName: "content.entry.published",
    handler: async () => {
      calls += 1;
    },
    hostPort,
  });

  await outbox.enqueue({
    id: "evt-2",
    name: "member.registered",
    occurredAt: clock.nowIso(),
    workspaceId: "ws-1",
    payload: {},
  });

  await processOutbox({ outbox, bus, clock });

  assert.equal(calls, 0);
});

test("REQ-8: a throwing glue handler is contained by the outbox's existing retry semantics — the row is marked failed for retry, not delivered, and does not crash the worker", async () => {
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const hostPort = makeRealHostPort(bus);
  const clock = { nowIso: () => new Date().toISOString() };

  subscribeGlueEvent({
    moduleId: "broken-glue-module",
    eventName: "content.entry.published",
    handler: async () => {
      throw new Error("glue handler exploded");
    },
    hostPort,
  });

  await outbox.enqueue({
    id: "evt-3",
    name: "content.entry.published",
    occurredAt: clock.nowIso(),
    workspaceId: "ws-1",
    payload: {},
  });

  await assert.doesNotReject(() => processOutbox({ outbox, bus, clock }));

  // 2026-09-06 fix: a failed row is no longer immediately reclaimable at the same instant (that
  // was the bug — see outbox-worker.ts's header doc) — it becomes eligible again once its
  // computed backoff elapses (at most 30 minutes with the current constants). +1h is comfortably
  // past that, so this still proves the row is retryable, not silently dropped or "delivered".
  const oneHourLater = new Date(Date.parse(clock.nowIso()) + 60 * 60 * 1000).toISOString();
  const pending = await outbox.claimPending(10, oneHourLater);
  assert.equal(pending.length, 1, "a failed delivery must remain pending for retry, per the outbox's existing dead-letter/retry semantics");
});
