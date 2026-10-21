import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventBus } from "#src/contracts/core/events/index";
import { InMemoryDeliveryEnvelopeStore, InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "#src/features/webhooks/index";
import { RecordingHttpClient } from "#src/features/webhooks/http.memory";
import { createFixedSecretSigner } from "#src/features/webhooks/signing";
import { createNoopObservabilityPort } from "#src/platform/observability/index";
import { createIntegrationsModule, webhookEnvelopeStoreFor } from "../modules/integrations.js";
import {
  describeWebhookTickError,
  nodeWebhookDeliveryScheduler,
  startServingWebhookDeliveryWorker,
  startWebhookDeliveryWorker,
  WEBHOOK_DELIVERY_FAILED_LINE,
  WEBHOOK_DELIVERY_INTERVAL_MS,
  WEBHOOK_DELIVERY_STOP_GRACE_MS,
  WEBHOOK_DELIVERY_STOP_LATE_LINE,
  type WebhookDeliveryScheduler,
} from "../webhook-delivery-worker.js";

/**
 * @file The webhook delivery loop (`webhook-delivery-worker.ts`) on a fake scheduler: when it ticks,
 * that ticks never overlap, that `stop` cancels and bounds its wait, that a failed tick is logged
 * without secrets and the loop keeps going — and, end to end over the in-memory repos, that a
 * delivery the integrations module enqueued is actually POSTed (the bug: nothing ever sent one).
 */

/** Manual scheduler: records each timer and lets the test fire it. */
function fakeScheduler() {
  const intervals: { ms: number; run: () => void; cancelled: boolean }[] = [];
  const timeouts: { ms: number; run: () => void; cancelled: boolean }[] = [];
  const scheduler: WebhookDeliveryScheduler = {
    every: ({ ms, run }) => {
      const timer = { ms, run, cancelled: false };
      intervals.push(timer);
      return { cancel: () => { timer.cancelled = true; } };
    },
    after: ({ ms, run }) => {
      const timer = { ms, run, cancelled: false };
      timeouts.push(timer);
      return { cancel: () => { timer.cancelled = true; } };
    },
  };
  /** Fires the interval like the real clock would (skipped once cancelled). */
  const fire = () => { for (const timer of intervals) if (!timer.cancelled) timer.run(); };
  return { scheduler, intervals, timeouts, fire };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("starts one interval at the default 15 s and does not tick until it fires", async () => {
  const clock = fakeScheduler();
  let calls = 0;
  startWebhookDeliveryWorker({ processDue: async () => { calls += 1; } }, { scheduler: clock.scheduler, log: () => {} });
  assert.equal(WEBHOOK_DELIVERY_INTERVAL_MS, 15_000);
  assert.deepEqual(clock.intervals.map((timer) => timer.ms), [15_000]);
  await flush();
  assert.equal(calls, 0);

  clock.fire();
  await flush();
  assert.equal(calls, 1);
  clock.fire();
  await flush();
  assert.equal(calls, 2);
});

test("uses an injected interval", () => {
  const clock = fakeScheduler();
  startWebhookDeliveryWorker({ processDue: async () => {} }, { intervalMs: 250, scheduler: clock.scheduler });
  assert.deepEqual(clock.intervals.map((timer) => timer.ms), [250]);
});

test("refuses an interval that is not a positive finite number", () => {
  for (const intervalMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => startWebhookDeliveryWorker({ processDue: async () => {} }, { intervalMs, scheduler: fakeScheduler().scheduler }),
      RangeError,
    );
  }
});

test("a tick never overlaps a tick that is still running", async () => {
  const clock = fakeScheduler();
  const pending = deferred();
  let calls = 0;
  const worker = startWebhookDeliveryWorker(
    { processDue: () => { calls += 1; return calls === 1 ? pending.promise : Promise.resolve(); } },
    { scheduler: clock.scheduler, log: () => {} },
  );

  clock.fire();
  const first = worker.tick();
  clock.fire();
  const second = worker.tick();
  await flush();
  assert.equal(calls, 1, "the interval and tick() both found the first pass still running");
  assert.equal(first, second, "an overlapping tick() returns the running pass");

  pending.resolve();
  await first;
  clock.fire();
  await flush();
  assert.equal(calls, 2, "the next interval after the pass settled runs a new one");
});

test("a failed tick is logged with name, scrubbed message and code only, and the loop continues", async () => {
  const clock = fakeScheduler();
  const lines: string[] = [];
  let calls = 0;
  const failure = Object.assign(new Error("POST https://user:hunter2@hooks.example.com/in?token=abc refused"), {
    name: "WebhookRepoError",
    code: "ECONNRESET",
    headers: { authorization: "Bearer sk-live-123" },
    payload: { email: "person@example.com" },
    cause: new Error("signing secret 0xdeadbeef"),
  });
  const worker = startWebhookDeliveryWorker(
    { processDue: async () => { calls += 1; if (calls === 1) throw failure; } },
    { scheduler: clock.scheduler, log: (line) => lines.push(line) },
  );

  clock.fire();
  await worker.tick();
  assert.deepEqual(lines, [`${WEBHOOK_DELIVERY_FAILED_LINE}: WebhookRepoError: POST [url] refused (code ECONNRESET)`]);
  for (const secret of ["hunter2", "token=abc", "sk-live-123", "person@example.com", "deadbeef", "hooks.example.com"]) {
    assert.ok(!lines[0].includes(secret), `the log line must not carry ${secret}`);
  }

  clock.fire();
  await worker.tick();
  assert.equal(calls, 2, "the loop ticks again after a failure");
  assert.equal(lines.length, 1);
});

test("the default log writes the failure line to console.error", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const worker = startWebhookDeliveryWorker({ processDue: async () => { throw new Error("db closed"); } }, { scheduler: fakeScheduler().scheduler });
  await worker.tick();
  assert.deepEqual(errors.mock.calls.map((call) => call.arguments), [[`${WEBHOOK_DELIVERY_FAILED_LINE}: Error: db closed`]]);
});

test("describeWebhookTickError never stringifies a non-Error, keeps numeric codes, drops other codes and caps the message", () => {
  assert.equal(describeWebhookTickError({ error: { secret: "x" } }), `${WEBHOOK_DELIVERY_FAILED_LINE}: a non-Error value was thrown`);
  assert.equal(describeWebhookTickError({ error: Object.assign(new Error("busy"), { code: 5 }) }), `${WEBHOOK_DELIVERY_FAILED_LINE}: Error: busy (code 5)`);
  assert.equal(describeWebhookTickError({ error: Object.assign(new Error("odd"), { code: { secret: "x" } }) }), `${WEBHOOK_DELIVERY_FAILED_LINE}: Error: odd`);
  const long = describeWebhookTickError({ error: new Error("a".repeat(500)) });
  assert.equal(long, `${WEBHOOK_DELIVERY_FAILED_LINE}: Error: ${"a".repeat(200)}`);
});

test("stop cancels the interval, is idempotent, and no tick runs afterwards", async () => {
  const clock = fakeScheduler();
  let calls = 0;
  const worker = startWebhookDeliveryWorker({ processDue: async () => { calls += 1; } }, { scheduler: clock.scheduler });

  await worker.stop();
  await worker.stop();
  assert.equal(clock.intervals[0].cancelled, true);
  assert.equal(clock.timeouts.length, 0, "nothing was running, so no grace timer");
  clock.intervals[0].run();
  await worker.tick();
  assert.equal(calls, 0);
});

test("stop waits for a running tick that finishes within the grace", async () => {
  const clock = fakeScheduler();
  const pending = deferred();
  const lines: string[] = [];
  const worker = startWebhookDeliveryWorker({ processDue: () => pending.promise }, { scheduler: clock.scheduler, log: (line) => lines.push(line) });
  clock.fire();

  let stopped = false;
  const stopping = worker.stop().then(() => { stopped = true; });
  await flush();
  assert.equal(stopped, false, "stop must wait for the running tick");
  assert.deepEqual(clock.timeouts.map((timer) => timer.ms), [WEBHOOK_DELIVERY_STOP_GRACE_MS]);

  pending.resolve();
  await stopping;
  assert.equal(clock.timeouts[0].cancelled, true, "the grace timer is cleared");
  assert.deepEqual(lines, []);
});

test("stop abandons a tick still running when the grace runs out", async () => {
  const clock = fakeScheduler();
  const lines: string[] = [];
  const worker = startWebhookDeliveryWorker({ processDue: () => new Promise(() => {}) }, { scheduler: clock.scheduler, log: (line) => lines.push(line) });
  clock.fire();

  const stopping = worker.stop();
  await flush();
  clock.timeouts[0].run();
  await stopping;
  assert.deepEqual(lines, [WEBHOOK_DELIVERY_STOP_LATE_LINE]);
});

test("the node scheduler fires its interval and timeout and cancels them", async () => {
  let ticks = 0;
  const interval = nodeWebhookDeliveryScheduler.every({ ms: 1, run: () => { ticks += 1; } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  interval.cancel();
  const seen = ticks;
  assert.ok(seen >= 1);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(ticks, seen, "no tick after cancel");

  let fired = 0;
  nodeWebhookDeliveryScheduler.after({ ms: 1, run: () => { fired += 1; } });
  const cancelled = nodeWebhookDeliveryScheduler.after({ ms: 1, run: () => { fired += 10; } });
  cancelled.cancel();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(fired, 1);
});

test("webhookEnvelopeStoreFor: a co-persisting repo is its own store; any other repo gets one cached in-memory store", () => {
  const coPersisting = Object.assign(new InMemoryWebhookDeliveryRepo(), { find: async () => null, save: async () => {} });
  assert.equal(webhookEnvelopeStoreFor({ deliveryRepo: coPersisting }), coPersisting);

  const findOnly = Object.assign(new InMemoryWebhookDeliveryRepo(), { find: async () => null });
  const memoryRepo = new InMemoryWebhookDeliveryRepo();
  const store = webhookEnvelopeStoreFor({ deliveryRepo: memoryRepo });
  assert.ok(store instanceof InMemoryDeliveryEnvelopeStore);
  assert.equal(webhookEnvelopeStoreFor({ deliveryRepo: memoryRepo }), store, "cached per repo");
  const other = webhookEnvelopeStoreFor({ deliveryRepo: findOnly });
  assert.ok(other instanceof InMemoryDeliveryEnvelopeStore, "half a store is not a store");
  assert.notEqual(other, store);
});

async function servingRig() {
  const nowIso = "2026-10-21T00:00:00.000Z";
  const clock = { nowMs: () => Date.parse(nowIso), nowIso: () => nowIso };
  const webhookSubscriptionRepo = new InMemoryWebhookSubscriptionRepo();
  const webhookDeliveryRepo = new InMemoryWebhookDeliveryRepo();
  await webhookSubscriptionRepo.save({
    id: "sub-1", workspaceId: "workspace-1", ownerPrincipalId: "principal-1", label: "Endpoint",
    targetUrl: "https://example.com/hooks", topics: ["form.submission.received"], secretVersion: 1,
    previousSecretVersion: null, status: "active", createdByPrincipalId: "principal-1", createdByPluginId: null,
    createdAt: nowIso, updatedAt: nowIso, disabledAt: null,
  });
  const deps = {
    webhookSubscriptionRepo,
    webhookDeliveryRepo,
    webhookSigner: createFixedSecretSigner(new Map([["sub-1", Buffer.from("shared-secret")]])),
    clock,
    observability: createNoopObservabilityPort({}),
  };
  return { deps, nowIso };
}

test("end to end: a delivery the integrations module enqueued is signed and POSTed on the next tick", async () => {
  const { deps, nowIso } = await servingRig();
  const bus = new InMemoryEventBus();
  createIntegrationsModule({ bus, ...deps, idGen: { newId: () => "delivery-1" } }).start?.();
  await bus.publish({
    id: "evt-1", name: "form.submission.received", workspaceId: "workspace-1", occurredAt: nowIso,
    payload: { workspaceId: "workspace-1", formDefinitionId: "def-1", submissionId: "s-1" },
  });

  const clock = fakeScheduler();
  const httpClient = new RecordingHttpClient({ responses: [{ status: 200, headers: {}, bodyText: "ok" }] });
  const worker = startServingWebhookDeliveryWorker({ deps }, { httpClient, scheduler: clock.scheduler, intervalMs: 1_000 });
  assert.deepEqual(clock.intervals.map((timer) => timer.ms), [1_000]);
  clock.fire();
  await worker.tick();

  assert.equal(httpClient.calls.length, 1);
  assert.equal(httpClient.calls[0].request.url, "https://example.com/hooks");
  assert.equal(httpClient.calls[0].request.headers["tovu-delivery-id"], "delivery-1");
  assert.match(httpClient.calls[0].request.headers["tovu-signature"], /^t=\d+,v1=[0-9a-f]{64}$/);
  const [row] = await deps.webhookDeliveryRepo.listBySubscription({ workspaceId: "workspace-1", subscriptionId: "sub-1", limit: 10 });
  assert.equal(row.status, "delivered");
  await worker.stop();
});

test("the serving worker builds its own guarded client when none is injected", async () => {
  const { deps } = await servingRig();
  const lines: string[] = [];
  const worker = startServingWebhookDeliveryWorker({ deps }, { scheduler: fakeScheduler().scheduler, log: (line) => lines.push(line) });
  await worker.tick();
  assert.deepEqual(lines, [], "an empty queue is a quiet, successful pass");
  await worker.stop();
});
