import assert from "node:assert/strict";
import test from "node:test";

import {
  computeBackoffMs,
  enqueueDelivery,
  MAX_DELIVERY_ATTEMPTS,
  processDueDeliveries,
} from "../delivery.js";
import { RecordingHttpClient } from "../http.memory.js";
import {
  InMemoryDeliveryEnvelopeStore,
  InMemoryWebhookDeliveryRepo,
  InMemoryWebhookSubscriptionRepo,
} from "../repo.memory.js";
import { createFixedSecretSigner } from "../signing.js";
import { createSubscription, pauseSubscription } from "../subscriptions.js";
import type { WebhookBeforeDispatchHook } from "../types.js";

/** Builds a full delivery-worker test rig: repos, envelope store, id/clock, signer, http double. */
function makeRig(options: { nowIso?: string } = {}) {
  let time = Date.parse(options.nowIso ?? "2026-07-10T00:00:00.000Z");
  const clock = { nowIso: () => new Date(time).toISOString() };
  const advanceHours = (hours: number) => {
    time += hours * 60 * 60 * 1000;
  };

  let idCounter = 0;
  const idGenerator = { newId: () => `id-${++idCounter}` };

  const subscriptionRepo = new InMemoryWebhookSubscriptionRepo();
  const deliveryRepo = new InMemoryWebhookDeliveryRepo();
  const envelopeStore = new InMemoryDeliveryEnvelopeStore();

  return { clock, advanceHours, idGenerator, subscriptionRepo, deliveryRepo, envelopeStore };
}

async function seedActiveSubscription(rig: ReturnType<typeof makeRig>, secret: Buffer) {
  const { subscription } = await createSubscription({
    deps: {
      clock: rig.clock,
      repo: rig.subscriptionRepo,
      idGenerator: rig.idGenerator,
      isAllowedTarget: async () => true,
    },
    input: {
      workspaceId: "workspace-1",
      ownerPrincipalId: "principal-1",
      label: "Endpoint",
      targetUrl: "https://example.com/hooks",
      topics: ["post.published"],
      createdByPrincipalId: "principal-1",
    },
  });

  const signer = createFixedSecretSigner(new Map([[subscription.id, secret]]));
  return { subscription, signer };
}

test("enqueueDelivery enqueues one row per matching active subscription and is idempotent per (event, subscription)", async () => {
  const rig = makeRig();
  const { subscription: subA } = await seedActiveSubscription(rig, Buffer.from("secret-a"));
  await createSubscription({
    deps: {
      clock: rig.clock,
      repo: rig.subscriptionRepo,
      idGenerator: rig.idGenerator,
      isAllowedTarget: async () => true,
    },
    input: {
      workspaceId: "workspace-1",
      ownerPrincipalId: "principal-1",
      label: "Second endpoint",
      targetUrl: "https://example.com/other-hooks",
      topics: ["comment.created"],
      createdByPrincipalId: "principal-1",
    },
  });

  const event = {
    id: "event-1",
    name: "post.published",
    workspaceId: "workspace-1",
    occurredAt: "2026-07-10T00:00:00.000Z",
    payload: { id: "post-1", title: "Hello" },
  };

  const first = await enqueueDelivery({
    deps: {
      subscriptionRepo: rig.subscriptionRepo,
      deliveryRepo: rig.deliveryRepo,
      envelopeStore: rig.envelopeStore,
      idGenerator: rig.idGenerator,
      clock: rig.clock,
    },
    input: { event },
  });

  assert.equal(first.enqueued.length, 1);
  assert.equal(first.enqueued[0].subscriptionId, subA.id);

  // Re-delivering the same event (outbox retry) must not double-enqueue.
  const second = await enqueueDelivery({
    deps: {
      subscriptionRepo: rig.subscriptionRepo,
      deliveryRepo: rig.deliveryRepo,
      envelopeStore: rig.envelopeStore,
      idGenerator: rig.idGenerator,
      clock: rig.clock,
    },
    input: { event },
  });
  assert.equal(second.enqueued.length, 0);

  const all = await rig.deliveryRepo.listBySubscription({
    workspaceId: "workspace-1",
    subscriptionId: subA.id,
    limit: 100,
  });
  assert.equal(all.length, 1);
});

test("processDueDeliveries signs, POSTs, and marks a successful attempt delivered", async () => {
  const rig = makeRig();
  const secret = Buffer.from("shared-secret");
  const { subscription, signer } = await seedActiveSubscription(rig, secret);

  await enqueueDelivery({
    deps: {
      subscriptionRepo: rig.subscriptionRepo,
      deliveryRepo: rig.deliveryRepo,
      envelopeStore: rig.envelopeStore,
      idGenerator: rig.idGenerator,
      clock: rig.clock,
    },
    input: {
      event: {
        id: "event-1",
        name: "post.published",
        workspaceId: "workspace-1",
        occurredAt: "2026-07-10T00:00:00.000Z",
        payload: { id: "post-1" },
      },
    },
  });

  const httpClient = new RecordingHttpClient({ responses: [{ status: 200, headers: {}, bodyText: "ok" }] });

  const result = await processDueDeliveries({
    deps: {
      deliveryRepo: rig.deliveryRepo,
      subscriptionRepo: rig.subscriptionRepo,
      envelopeStore: rig.envelopeStore,
      httpClient,
      signer,
      clock: rig.clock,
    },
  });

  assert.equal(result.delivered, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.dead, 0);
  assert.equal(httpClient.calls.length, 1);
  assert.equal(httpClient.calls[0].request.url, subscription.targetUrl);
  assert.match(httpClient.calls[0].request.headers["tovu-signature"], /^t=\d+,v1=[0-9a-f]{64}$/);

  const deliveries = await rig.deliveryRepo.listBySubscription({
    workspaceId: "workspace-1",
    subscriptionId: subscription.id,
    limit: 10,
  });
  assert.equal(deliveries[0].status, "delivered");
  assert.equal(deliveries[0].lastResponseStatus, 200);
});

test("a non-2xx response schedules a backoff retry rather than dead-lettering immediately", async () => {
  const rig = makeRig();
  const secret = Buffer.from("shared-secret");
  const { subscription, signer } = await seedActiveSubscription(rig, secret);

  await enqueueDelivery({
    deps: {
      subscriptionRepo: rig.subscriptionRepo,
      deliveryRepo: rig.deliveryRepo,
      envelopeStore: rig.envelopeStore,
      idGenerator: rig.idGenerator,
      clock: rig.clock,
    },
    input: {
      event: {
        id: "event-1",
        name: "post.published",
        workspaceId: "workspace-1",
        occurredAt: "2026-07-10T00:00:00.000Z",
        payload: { id: "post-1" },
      },
    },
  });

  const httpClient = new RecordingHttpClient({ responses: [{ status: 500, headers: {}, bodyText: "boom" }] });

  const result = await processDueDeliveries({
    deps: {
      deliveryRepo: rig.deliveryRepo,
      subscriptionRepo: rig.subscriptionRepo,
      envelopeStore: rig.envelopeStore,
      httpClient,
      signer,
      clock: rig.clock,
    },
  });

  assert.equal(result.delivered, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.dead, 0);

  const deliveries = await rig.deliveryRepo.listBySubscription({
    workspaceId: "workspace-1",
    subscriptionId: subscription.id,
    limit: 10,
  });
  assert.equal(deliveries[0].status, "pending");
  assert.equal(deliveries[0].attempts, 1);
  assert.equal(deliveries[0].lastResponseStatus, 500);
  assert.ok(deliveries[0].nextAttemptAt > "2026-07-10T00:00:00.000Z");
});

test("repeated failures exhaust maxAttempts and transition the delivery to dead", async () => {
  const rig = makeRig();
  const secret = Buffer.from("shared-secret");
  const { subscription, signer } = await seedActiveSubscription(rig, secret);

  await enqueueDelivery({
    deps: {
      subscriptionRepo: rig.subscriptionRepo,
      deliveryRepo: rig.deliveryRepo,
      envelopeStore: rig.envelopeStore,
      idGenerator: rig.idGenerator,
      clock: rig.clock,
    },
    input: {
      event: {
        id: "event-1",
        name: "post.published",
        workspaceId: "workspace-1",
        occurredAt: "2026-07-10T00:00:00.000Z",
        payload: { id: "post-1" },
      },
    },
  });

  const httpClient = new RecordingHttpClient({ responses: [{ status: 503, headers: {}, bodyText: "down" }] });
  const maxAttempts = 3;

  let lastResult;
  for (let i = 0; i < maxAttempts; i += 1) {
    lastResult = await processDueDeliveries(
      {
        deps: {
          deliveryRepo: rig.deliveryRepo,
          subscriptionRepo: rig.subscriptionRepo,
          envelopeStore: rig.envelopeStore,
          httpClient,
          signer,
          clock: rig.clock,
        },
      },
      { maxAttempts }
    );
    // Advance well past the largest possible backoff step so the row is due again next loop.
    rig.advanceHours(7);
  }

  assert.equal(httpClient.calls.length, maxAttempts);
  assert.equal(lastResult?.dead, 1);
  assert.equal(lastResult?.failed, 0);

  const deliveries = await rig.deliveryRepo.listBySubscription({
    workspaceId: "workspace-1",
    subscriptionId: subscription.id,
    limit: 10,
  });
  assert.equal(deliveries[0].status, "dead");
  assert.equal(deliveries[0].attempts, maxAttempts);
  assert.ok(deliveries[0].deadAt);
});

test("MAX_DELIVERY_ATTEMPTS default is 8 per ADR-036 §4", () => {
  assert.equal(MAX_DELIVERY_ATTEMPTS, 8);
});

test("a throwing beforeDispatch hook fails the attempt (retry) and never reaches the HTTP client", async () => {
  const rig = makeRig();
  const secret = Buffer.from("shared-secret");
  const { subscription, signer } = await seedActiveSubscription(rig, secret);

  await enqueueDelivery({
    deps: {
      subscriptionRepo: rig.subscriptionRepo,
      deliveryRepo: rig.deliveryRepo,
      envelopeStore: rig.envelopeStore,
      idGenerator: rig.idGenerator,
      clock: rig.clock,
    },
    input: {
      event: {
        id: "event-1",
        name: "post.published",
        workspaceId: "workspace-1",
        occurredAt: "2026-07-10T00:00:00.000Z",
        payload: { id: "post-1", email: "user@example.com" },
      },
    },
  });

  const httpClient = new RecordingHttpClient();
  const throwingHook: WebhookBeforeDispatchHook = {
    priority: 0,
    handle: async () => {
      throw new Error("redaction filter crashed");
    },
  };

  const result = await processDueDeliveries(
    {
      deps: {
        deliveryRepo: rig.deliveryRepo,
        subscriptionRepo: rig.subscriptionRepo,
        envelopeStore: rig.envelopeStore,
        httpClient,
        signer,
        clock: rig.clock,
      },
    },
    { hooks: [throwingHook] }
  );

  // The whole point of the Round-3 fail-closed fix: a throwing hook must NOT result in a raw,
  // unfiltered dispatch. The HTTP client must never have been called.
  assert.equal(httpClient.calls.length, 0);
  assert.equal(result.delivered, 0);
  assert.equal(result.failed, 1);

  const deliveries = await rig.deliveryRepo.listBySubscription({
    workspaceId: "workspace-1",
    subscriptionId: subscription.id,
    limit: 10,
  });
  assert.equal(deliveries[0].status, "pending");
  assert.match(deliveries[0].lastError ?? "", /redaction filter crashed/);
});

test("an explicit beforeDispatch veto (send: false) also fails closed without dispatching", async () => {
  const rig = makeRig();
  const secret = Buffer.from("shared-secret");
  const { subscription, signer } = await seedActiveSubscription(rig, secret);

  await enqueueDelivery({
    deps: {
      subscriptionRepo: rig.subscriptionRepo,
      deliveryRepo: rig.deliveryRepo,
      envelopeStore: rig.envelopeStore,
      idGenerator: rig.idGenerator,
      clock: rig.clock,
    },
    input: {
      event: {
        id: "event-1",
        name: "post.published",
        workspaceId: "workspace-1",
        occurredAt: "2026-07-10T00:00:00.000Z",
        payload: { id: "post-1" },
      },
    },
  });

  const httpClient = new RecordingHttpClient();
  const vetoingHook: WebhookBeforeDispatchHook = {
    priority: 0,
    handle: async () => ({ send: false }),
  };

  const result = await processDueDeliveries(
    {
      deps: {
        deliveryRepo: rig.deliveryRepo,
        subscriptionRepo: rig.subscriptionRepo,
        envelopeStore: rig.envelopeStore,
        httpClient,
        signer,
        clock: rig.clock,
      },
    },
    { hooks: [vetoingHook] }
  );

  assert.equal(httpClient.calls.length, 0);
  assert.equal(result.delivered, 0);
  assert.equal(result.failed, 1);

  const deliveries = await rig.deliveryRepo.listBySubscription({
    workspaceId: "workspace-1",
    subscriptionId: subscription.id,
    limit: 10,
  });
  assert.match(deliveries[0].lastError ?? "", /vetoed/);
});

test("hooks run in priority order and a later hook sees an earlier hook's redacted envelope", async () => {
  const rig = makeRig();
  const secret = Buffer.from("shared-secret");
  const { signer } = await seedActiveSubscription(rig, secret);

  await enqueueDelivery({
    deps: {
      subscriptionRepo: rig.subscriptionRepo,
      deliveryRepo: rig.deliveryRepo,
      envelopeStore: rig.envelopeStore,
      idGenerator: rig.idGenerator,
      clock: rig.clock,
    },
    input: {
      event: {
        id: "event-1",
        name: "post.published",
        workspaceId: "workspace-1",
        occurredAt: "2026-07-10T00:00:00.000Z",
        payload: { id: "post-1", email: "user@example.com" },
      },
    },
  });

  const seenBySecondHook: unknown[] = [];
  const redactingHook: WebhookBeforeDispatchHook = {
    priority: 0,
    handle: async ({ envelope }) => ({
      send: true,
      envelope: { ...envelope, data: { ...envelope.data, email: "[redacted]" } },
    }),
  };
  const observingHook: WebhookBeforeDispatchHook = {
    priority: 10,
    handle: async ({ envelope }) => {
      seenBySecondHook.push(envelope.data.email);
      return { send: true };
    },
  };

  const httpClient = new RecordingHttpClient();

  await processDueDeliveries(
    {
      deps: {
        deliveryRepo: rig.deliveryRepo,
        subscriptionRepo: rig.subscriptionRepo,
        envelopeStore: rig.envelopeStore,
        httpClient,
        signer,
        clock: rig.clock,
      },
    },
    // Registered out of priority order on purpose — execution must still be priority-ordered.
    { hooks: [observingHook, redactingHook] }
  );

  assert.deepEqual(seenBySecondHook, ["[redacted]"]);
  assert.match(httpClient.calls[0].request.body ?? "", /\[redacted\]/);
  assert.doesNotMatch(httpClient.calls[0].request.body ?? "", /user@example\.com/);
});

test("computeBackoffMs stays within [half, full] of the exponential step and respects the cap", () => {
  const lower = computeBackoffMs(1, { random: () => 0 });
  const upper = computeBackoffMs(1, { random: () => 1 });
  assert.equal(lower, 150_000); // half of 5 minutes
  assert.equal(upper, 300_000); // full 5 minutes

  // At high attempt counts the step is capped at 6 hours regardless of the exponent.
  const cappedLower = computeBackoffMs(20, { random: () => 0 });
  const cappedUpper = computeBackoffMs(20, { random: () => 1 });
  assert.equal(cappedLower, 10_800_000); // half of 6 hours
  assert.equal(cappedUpper, 21_600_000); // full 6 hours
});

test("a subscription paused after enqueue fails the attempt without dispatching", async () => {
  const rig = makeRig();
  const secret = Buffer.from("shared-secret");
  const { subscription, signer } = await seedActiveSubscription(rig, secret);

  await enqueueDelivery({
    deps: {
      subscriptionRepo: rig.subscriptionRepo,
      deliveryRepo: rig.deliveryRepo,
      envelopeStore: rig.envelopeStore,
      idGenerator: rig.idGenerator,
      clock: rig.clock,
    },
    input: {
      event: {
        id: "event-1",
        name: "post.published",
        workspaceId: "workspace-1",
        occurredAt: "2026-07-10T00:00:00.000Z",
        payload: { id: "post-1" },
      },
    },
  });

  await pauseSubscription({
    deps: {
      clock: rig.clock,
      repo: rig.subscriptionRepo,
      idGenerator: rig.idGenerator,
      isAllowedTarget: async () => true,
    },
    input: { workspaceId: "workspace-1", id: subscription.id },
  });

  const httpClient = new RecordingHttpClient();

  const result = await processDueDeliveries({
    deps: {
      deliveryRepo: rig.deliveryRepo,
      subscriptionRepo: rig.subscriptionRepo,
      envelopeStore: rig.envelopeStore,
      httpClient,
      signer,
      clock: rig.clock,
    },
  });

  assert.equal(httpClient.calls.length, 0);
  assert.equal(result.failed, 1);

  const deliveries = await rig.deliveryRepo.listBySubscription({
    workspaceId: "workspace-1",
    subscriptionId: subscription.id,
    limit: 10,
  });
  assert.match(deliveries[0].lastError ?? "", /is 'paused', not active/);
});

test("a claimed row whose subscription was hard-removed from the repo fails (subscription not found)", async () => {
  const rig = makeRig();
  const secret = Buffer.from("shared-secret");
  const { subscription, signer } = await seedActiveSubscription(rig, secret);

  await enqueueDelivery({
    deps: {
      subscriptionRepo: rig.subscriptionRepo,
      deliveryRepo: rig.deliveryRepo,
      envelopeStore: rig.envelopeStore,
      idGenerator: rig.idGenerator,
      clock: rig.clock,
    },
    input: {
      event: {
        id: "event-1",
        name: "post.published",
        workspaceId: "workspace-1",
        occurredAt: "2026-07-10T00:00:00.000Z",
        payload: { id: "post-1" },
      },
    },
  });

  // Simulate the subscription row being gone by pointing a fresh, empty subscription repo at
  // the same delivery row (the port surface has no hard-delete, so this is the only way to
  // exercise the "not found" branch without reaching into repo internals).
  const emptySubscriptionRepo = new InMemoryWebhookSubscriptionRepo();
  const httpClient = new RecordingHttpClient();

  const result = await processDueDeliveries({
    deps: {
      deliveryRepo: rig.deliveryRepo,
      subscriptionRepo: emptySubscriptionRepo,
      envelopeStore: rig.envelopeStore,
      httpClient,
      signer,
      clock: rig.clock,
    },
  });

  assert.equal(httpClient.calls.length, 0);
  assert.equal(result.failed, 1);

  const deliveries = await rig.deliveryRepo.listBySubscription({
    workspaceId: "workspace-1",
    subscriptionId: subscription.id,
    limit: 10,
  });
  assert.match(deliveries[0].lastError ?? "", /was not found/);
});

test("a claimed row with no recorded envelope fails (envelope-store gap)", async () => {
  const rig = makeRig();
  const secret = Buffer.from("shared-secret");
  const { subscription, signer } = await seedActiveSubscription(rig, secret);

  // Enqueue the delivery row directly, bypassing enqueueDelivery, so no envelope is ever saved —
  // exercises the "no envelope recorded" defensive branch in attemptOneDelivery.
  await rig.deliveryRepo.enqueue({
    id: "delivery-no-envelope",
    workspaceId: "workspace-1",
    subscriptionId: subscription.id,
    eventId: "event-1",
    topic: "post.published",
    status: "pending",
    attempts: 0,
    nextAttemptAt: "2026-07-10T00:00:00.000Z",
    lastResponseStatus: null,
    lastError: null,
    signedWithVersion: null,
    createdAt: "2026-07-10T00:00:00.000Z",
    deliveredAt: null,
    deadAt: null,
  });

  const httpClient = new RecordingHttpClient();

  const result = await processDueDeliveries({
    deps: {
      deliveryRepo: rig.deliveryRepo,
      subscriptionRepo: rig.subscriptionRepo,
      envelopeStore: rig.envelopeStore,
      httpClient,
      signer,
      clock: rig.clock,
    },
  });

  assert.equal(httpClient.calls.length, 0);
  assert.equal(result.failed, 1);

  const delivery = await rig.deliveryRepo.findById({
    workspaceId: "workspace-1",
    id: "delivery-no-envelope",
  });
  assert.match(delivery?.lastError ?? "", /no envelope recorded/);
});
