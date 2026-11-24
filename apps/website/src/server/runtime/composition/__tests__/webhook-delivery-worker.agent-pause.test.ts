import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "@jini-ai/integrations/webhooks/site/repo.memory";
import type { WebhookDeliveryRecord } from "@jini-ai/integrations/webhooks";
import { assertVersionedWrite } from "@jini-ai/core/optimistic-concurrency";
import { createFixedSecretSigner } from "@jini-ai/integrations/webhooks/site/signing";
import { createNoopObservabilityPort } from "@jini-ai/core/contracts/observability";
import type { HttpClientPort } from "#src/platform/http/ports";
import { webhookEnvelopeStoreFor } from "../modules/integrations.js";
import { startServingWebhookDeliveryWorker, type ServingWebhookDeliveryDeps, type WebhookDeliveryScheduler } from "../webhook-delivery-worker.js";

/**
 * @file The serving webhook worker honours the admin assistant's off switch (`TOVU_ADMIN_ASSISTANT=off`,
 * carried on `RouteDeps.adminAssistantEnabled`): deliveries for subscriptions the agent created are
 * held (left `pending`, attempt not charged) while person-created and unattributed (pre-attribution)
 * subscriptions keep delivering. Pausing never deletes or disables anything, and the held delivery
 * goes out once the switch is back on. (bt2-todos G11·P10-H4.)
 */

const T0 = "2026-11-24T00:00:00.000Z";
const LATER = "2026-11-24T00:05:00.000Z";
const idleScheduler: WebhookDeliveryScheduler = { every: () => ({ cancel: () => {} }), after: ({ ms, run }) => { const handle = setTimeout(run, ms); return { cancel: () => clearTimeout(handle) }; } };
const SUBSCRIPTIONS = [
  { id: "sub-agent", createdByKind: "agent" as const },
  { id: "sub-person", createdByKind: "person" as const },
  { id: "sub-legacy", createdByKind: undefined },
];

function delivery(id: string, subscriptionId: string): WebhookDeliveryRecord {
  return {
    id, workspaceId: "workspace-1", subscriptionId, eventId: `event-${id}`, topic: "form.submission.received",
    status: "pending", attempts: 0, nextAttemptAt: T0, lastResponseStatus: null, lastError: null,
    signedWithVersion: null, createdAt: T0, deliveredAt: null, deadAt: null,
  };
}

/** One subscription per creator kind, each with one due delivery `d-<subscription id>`. */
async function rig(adminAssistantEnabled: boolean) {
  let now = T0;
  const deps: ServingWebhookDeliveryDeps = {
    webhookSubscriptionRepo: new InMemoryWebhookSubscriptionRepo({ assertVersionedWrite }),
    webhookDeliveryRepo: new InMemoryWebhookDeliveryRepo(),
    webhookSigner: createFixedSecretSigner({ secrets: new Map(SUBSCRIPTIONS.map(({ id }) => [id, Buffer.from("shared-secret")])) }),
    clock: { nowIso: () => now },
    observability: createNoopObservabilityPort({}),
    adminAssistantEnabled,
  };
  for (const { id, createdByKind } of SUBSCRIPTIONS) {
    await deps.webhookSubscriptionRepo.save({
      id, workspaceId: "workspace-1", ownerPrincipalId: "principal-1", label: id,
      targetUrl: `https://example.com/${id}`, topics: ["form.submission.received"], secretVersion: 1,
      previousSecretVersion: null, status: "active", createdByPrincipalId: "principal-1", createdByPluginId: null,
      ...(createdByKind ? { createdByKind } : {}),
      createdAt: T0, updatedAt: T0, disabledAt: null, version: 1,
    });
    const record = delivery(`d-${id}`, id);
    const envelope = { deliveryId: record.id, eventId: record.eventId, topic: record.topic, workspaceId: "workspace-1", occurredAt: T0, data: {} };
    await deps.webhookDeliveryRepo.enqueue({ record }, { envelope });
    await webhookEnvelopeStoreFor({ deliveryRepo: deps.webhookDeliveryRepo }).save({ deliveryId: record.id, envelope });
  }
  const posted: string[] = [];
  const httpClient: HttpClientPort = { send: async (request) => { posted.push(request.url); return { status: 200, headers: {}, bodyText: "ok" }; } };
  const row = (subscriptionId: string) => deps.webhookDeliveryRepo.findById({ workspaceId: "workspace-1", id: `d-${subscriptionId}` });
  return { deps, posted, httpClient, row, setNow: (iso: string) => { now = iso; } };
}

test("assistant off: agent-created webhook deliveries are held, person-created and unattributed ones still go out", async () => {
  const site = await rig(false);
  const worker = startServingWebhookDeliveryWorker({ deps: site.deps }, { httpClient: site.httpClient, scheduler: idleScheduler, log: () => {} });
  await worker.tick();
  await worker.stop();

  assert.deepEqual(site.posted.sort(), ["https://example.com/sub-legacy", "https://example.com/sub-person"]);
  const held = await site.row("sub-agent");
  assert.equal(held?.status, "pending");
  assert.equal(held?.attempts, 0, "a held delivery is not charged an attempt");
  assert.equal((await site.row("sub-person"))?.status, "delivered");
});

test("adversarial: pausing deletes and disables nothing, and the held delivery goes out once the assistant is back on", async () => {
  const site = await rig(false);
  const worker = startServingWebhookDeliveryWorker({ deps: site.deps }, { httpClient: site.httpClient, scheduler: idleScheduler, log: () => {} });
  await worker.tick();
  await worker.tick();

  for (const { id } of SUBSCRIPTIONS) {
    const subscription = await site.deps.webhookSubscriptionRepo.findById({ workspaceId: "workspace-1", id });
    assert.equal(subscription?.status, "active", `${id} stays active while paused`);
    assert.ok(await site.row(id), `${id}'s delivery row still exists`);
  }
  assert.equal((await site.row("sub-agent"))?.status, "pending");
  assert.equal(site.posted.length, 2, "person-created deliveries went out once, the agent one not at all");

  site.deps.adminAssistantEnabled = true;
  site.setNow(LATER);
  await worker.tick();
  await worker.stop();
  assert.equal((await site.row("sub-agent"))?.status, "delivered");
  assert.deepEqual(site.posted.filter((url) => url.endsWith("sub-agent")), ["https://example.com/sub-agent"]);
});

test("a composition that does not carry the switch (absent) delivers everything, as before", async () => {
  const site = await rig(true);
  const { adminAssistantEnabled: _omitted, ...withoutSwitch } = site.deps;
  const worker = startServingWebhookDeliveryWorker({ deps: withoutSwitch }, { httpClient: site.httpClient, scheduler: idleScheduler, log: () => {} });
  await worker.tick();
  await worker.stop();
  assert.equal(site.posted.length, 3);
});
