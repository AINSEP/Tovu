import assert from "node:assert/strict";
import test from "node:test";

import type { DomainEvent } from "@jini-ai/cms/core";
import { FORM_DELIVERY_EVENT, FormDeliveryError } from "@jini-ai/cms/forms";
import { InMemoryEventBus, InMemoryOutbox } from "../memory-bus.js";
import { startOutboxDrainer } from "../outbox-drainer.js";
import { outboxRetryPolicyForEvent } from "../outbox-retry-policies.js";
import { processOutbox } from "../outbox-worker.js";

/**
 * @file The site's per-event outbox retry table (`outbox-retry-policies.ts`) and its pass-through in
 * both drain entry points (`processOutbox`, `startOutboxDrainer`): external form deliveries get the
 * outgoing-webhook schedule (8 attempts, minutes-to-hours backoff), honour a longer adapter
 * `retryAfterMs`, and stop at once on a non-retryable delivery error; every other event keeps the
 * outbox defaults (6 attempts, 15 s first backoff).
 */

const NOW = "2026-10-20T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);
/** Webhook backoff at attempt 1 with `random` 0: half of 5 minutes. The outbox default is 15 s. */
const FIRST_WEBHOOK_BACKOFF_MS = 150_000;

function event(name: string): DomainEvent {
  return { id: `evt-${name}`, name, occurredAt: NOW, workspaceId: "ws", payload: {} };
}

function formDeliveryPolicy() {
  const policy = outboxRetryPolicyForEvent({ event: event(FORM_DELIVERY_EVENT) });
  assert.ok(policy, "form deliveries must have their own policy");
  return policy;
}

test("every event other than a form delivery keeps the outbox defaults", () => {
  assert.equal(outboxRetryPolicyForEvent({ event: event("form.submission.received") }), undefined);
  assert.equal(outboxRetryPolicyForEvent({ event: event("entry.updated") }), undefined);
});

test("form deliveries get the outgoing-webhook cap of 8 attempts and its backoff curve", () => {
  const policy = formDeliveryPolicy();
  assert.equal(policy.maxAttempts, 8);
  const error = new Error("offline");
  assert.equal(policy.backoffMs({ attempts: 1, random: () => 0, error }), FIRST_WEBHOOK_BACKOFF_MS);
  assert.equal(policy.backoffMs({ attempts: 3, random: () => 1, error }), 20 * 60 * 1000);
});

test("a form delivery's retryAfterMs lengthens the wait but never shortens the host backoff", () => {
  const policy = formDeliveryPolicy();
  const later = new FormDeliveryError({ code: "rate-limited", retryable: true, retryAfterMs: 600_000 });
  const sooner = new FormDeliveryError({ code: "rate-limited", retryable: true, retryAfterMs: 1_000 });
  assert.equal(policy.backoffMs({ attempts: 1, random: () => 0, error: later }), 600_000);
  assert.equal(policy.backoffMs({ attempts: 1, random: () => 0, error: sooner }), FIRST_WEBHOOK_BACKOFF_MS);
});

test("only an explicit non-retryable delivery error stops form-delivery retries", () => {
  const policy = formDeliveryPolicy();
  assert.ok(policy.retryable, "the form policy classifies errors");
  assert.equal(policy.retryable({ error: new FormDeliveryError({ code: "authorization-required", retryable: false }) }), false);
  assert.equal(policy.retryable({ error: new FormDeliveryError({ code: "delivery-failed", retryable: true }) }), true);
  assert.equal(policy.retryable({ error: new Error("worker timeout") }), true);
});

/** A bus whose form-delivery handler fails with `error`, counting attempts. */
async function failingDeliveryBus(error: Error): Promise<{ bus: InMemoryEventBus; attempts: () => number }> {
  const bus = new InMemoryEventBus();
  let attempts = 0;
  await bus.subscribe({ eventName: FORM_DELIVERY_EVENT, handler: async () => { attempts += 1; throw error; } });
  return { bus, attempts: () => attempts };
}

test("processOutbox seals a form delivery at once when its error is not retryable", async () => {
  const outbox = new InMemoryOutbox();
  const { bus } = await failingDeliveryBus(new FormDeliveryError({ code: "authorization-required", retryable: false }));
  await outbox.enqueue(event(FORM_DELIVERY_EVENT));
  assert.equal(await processOutbox({ outbox, bus, clock: { nowMs: () => NOW_MS } }), 1);
  assert.deepEqual(await outbox.claimPending({ batchSize: 10, nowIso: "2099-01-01T00:00:00.000Z" }), [], "a default policy would have retried it");
});

test("processOutbox schedules a retryable form-delivery failure on the webhook backoff, not the 15 s default", async () => {
  const outbox = new InMemoryOutbox();
  const { bus } = await failingDeliveryBus(new FormDeliveryError({ code: "delivery-failed", retryable: true }));
  await outbox.enqueue(event(FORM_DELIVERY_EVENT));
  await processOutbox({ outbox, bus, clock: { nowMs: () => NOW_MS } }, { random: () => 0 });
  const [retry] = await outbox.claimPending({ batchSize: 10, nowIso: "2099-01-01T00:00:00.000Z" });
  assert.deepEqual([retry?.nextAttemptAt, retry?.lastError], [new Date(NOW_MS + FIRST_WEBHOOK_BACKOFF_MS).toISOString(), "delivery-failed"]);
});

test("the background drainer applies the same table: a non-retryable form delivery is attempted once", async (t) => {
  const outbox = new InMemoryOutbox();
  const { bus, attempts } = await failingDeliveryBus(new FormDeliveryError({ code: "configuration-invalid", retryable: false }));
  await outbox.enqueue(event(FORM_DELIVERY_EVENT));
  const drainer = startOutboxDrainer({ outbox, bus, clock: { nowMs: () => NOW_MS } }, { intervalMs: 5 });
  t.after(() => drainer.stop());
  for (let tick = 0; tick < 200 && attempts() === 0; tick += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  await drainer.stop();
  assert.equal(attempts(), 1);
  assert.deepEqual(await outbox.claimPending({ batchSize: 10, nowIso: "2099-01-01T00:00:00.000Z" }), [], "sealed, not waiting for a retry");
});
