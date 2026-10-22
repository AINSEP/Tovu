import assert from "node:assert/strict";
import test from "node:test";

import type { ToolRegistration } from "@jini-ai/core";
import type { WebhookDeliveryRecord } from "@jini-ai/integrations/webhooks";

import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "../repo.memory.js";
import { buildWebhooksRegistrations, type IntegrationsToolDeps } from "../tool-registrations.js";

/**
 * @file The non-delete webhooks tool handlers, called through their registrations against the
 * in-memory subscription repo and a hand-written delivery repo (so the returned order and the
 * requested limit are observable): list's most-recent-delivery summary, get_deliveries' limit
 * clamp and newest-first order, create's topic defaulting, update's topic validation and pause's
 * `paused` default.
 */

const WORKSPACE_ID = "ws-webhooks-handlers";
const PRINCIPAL = { id: "principal-1", kind: "user" as const };
const NOW = "2026-09-16T00:00:00.000Z";

function delivery(id: string, createdAt: string, subscriptionId: string): WebhookDeliveryRecord {
  return {
    id, workspaceId: WORKSPACE_ID, subscriptionId, eventId: `evt-${id}`, topic: "post.published", status: "delivered", attempts: 1,
    nextAttemptAt: createdAt, lastResponseStatus: 200, lastError: null, signedWithVersion: 1, createdAt, deliveredAt: createdAt, deadAt: null,
  } as WebhookDeliveryRecord;
}

/** Returns its rows in the given (deliberately unsorted) order and records every requested limit. */
class RecordingDeliveryRepo extends InMemoryWebhookDeliveryRepo {
  readonly limits: number[] = [];
  rows: WebhookDeliveryRecord[] = [];
  override async listBySubscription(required: { workspaceId: string; subscriptionId: string; limit: number }): Promise<WebhookDeliveryRecord[]> {
    this.limits.push(required.limit);
    return this.rows.filter(row => row.subscriptionId === required.subscriptionId);
  }
}

interface SubscriptionView { id: string; label: string; topics: string[]; status: string; lastDelivery: { id: string } | null }
interface ToolResult { subscription: SubscriptionView; subscriptions: SubscriptionView[]; deliveries: Array<{ id: string }> }

function makeHarness() {
  let counter = 0;
  const deliveries = new RecordingDeliveryRepo();
  const deps: IntegrationsToolDeps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    webhookSubscriptionRepo: new InMemoryWebhookSubscriptionRepo(),
    webhookDeliveryRepo: deliveries,
    originRegistry: { isAllowedEgressTarget: async () => true } as unknown as IntegrationsToolDeps["originRegistry"],
    authorize: async () => ({ allowed: true, reason: "matched" }),
  };
  // The default `surfaces` argument is exercised here: no delete exchange is opened in this file.
  const tools = new Map<string, ToolRegistration>(buildWebhooksRegistrations(deps).map(r => [r.descriptor.id, r]));
  const call = async (toolId: string, input: unknown): Promise<ToolResult> =>
    (await tools.get(toolId)!.handler({ principal: PRINCIPAL, signal: new AbortController().signal, input } as never)) as ToolResult;
  return { deliveries, call };
}

async function created(call: ReturnType<typeof makeHarness>["call"], topics: unknown) {
  const result = await call("webhooks_create_subscription", { label: "Posts", targetUrl: "https://example.test/hooks", topics });
  return result.subscription;
}

test("create: a non-array topics value becomes an empty topic list; an array is stringified", async () => {
  const { call } = makeHarness();
  assert.deepEqual((await created(call, "post.published")).topics, []);
  assert.deepEqual((await created(call, ["post.published"])).topics, ["post.published"]);
});

test("list: each row summarises its most recent delivery by createdAt, whatever order the repo returns", async () => {
  const { call, deliveries } = makeHarness();
  const withDeliveries = await created(call, ["post.published"]);
  const without = await created(call, ["post.published"]);
  deliveries.rows = [
    delivery("d-mid", "2026-09-02T00:00:00.000Z", withDeliveries.id),
    delivery("d-new", "2026-09-03T00:00:00.000Z", withDeliveries.id),
    delivery("d-old", "2026-09-01T00:00:00.000Z", withDeliveries.id),
  ];
  const { subscriptions } = await call("webhooks_list_subscriptions", undefined);
  const byId = new Map(subscriptions.map(s => [s.id, s]));
  assert.equal(byId.get(withDeliveries.id)?.lastDelivery?.id, "d-new");
  assert.equal(byId.get(without.id)?.lastDelivery, null);
  assert.deepEqual(deliveries.limits, [50, 50]);
});

test("get_deliveries: limit is defaulted, floored and capped, and rows come back newest first", async () => {
  const { call, deliveries } = makeHarness();
  const subscription = await created(call, ["post.published"]);
  deliveries.rows = [
    delivery("d-old", "2026-09-01T00:00:00.000Z", subscription.id),
    delivery("d-new", "2026-09-03T00:00:00.000Z", subscription.id),
  ];
  const first = await call("webhooks_get_deliveries", { subscriptionId: subscription.id });
  assert.deepEqual(first.deliveries.map(d => d.id), ["d-new", "d-old"]);
  assert.equal(Object.hasOwn(first.deliveries[0]!, "workspaceId"), false, "the delivery view drops workspaceId");
  for (const limit of [0, -5, 7.9, 999]) await call("webhooks_get_deliveries", { subscriptionId: subscription.id, limit });
  assert.deepEqual(deliveries.limits, [50, 50, 50, 7, 200]);
});

test("update: topics must be an array of strings; a valid update reports the latest delivery", async () => {
  const { call, deliveries } = makeHarness();
  const subscription = await created(call, ["post.published"]);
  for (const topics of [undefined, "post.published", ["post.published", 3]]) {
    await assert.rejects(
      call("webhooks_update_subscription", { subscriptionId: subscription.id, label: "Renamed", targetUrl: "https://example.test/hooks", topics }),
      /topics must be an array of strings/,
    );
  }
  deliveries.rows = [delivery("d-1", "2026-09-01T00:00:00.000Z", subscription.id)];
  const updated = await call("webhooks_update_subscription", { subscriptionId: subscription.id, label: "Renamed", targetUrl: "https://example.test/hooks", topics: ["post.published"] });
  assert.equal(updated.subscription.label, "Renamed");
  assert.equal(updated.subscription.lastDelivery?.id, "d-1");
  assert.equal(deliveries.limits.at(-1), 1);
});

test("pause: an omitted 'paused' pauses; paused:false resumes", async () => {
  const { call } = makeHarness();
  const subscription = await created(call, ["post.published"]);
  assert.equal((await call("webhooks_pause_subscription", { subscriptionId: subscription.id })).subscription.status, "paused");
  assert.equal((await call("webhooks_pause_subscription", { subscriptionId: subscription.id, paused: false })).subscription.status, "active");
});
