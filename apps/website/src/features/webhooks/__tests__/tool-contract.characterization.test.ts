/**
 * @file Characterization of the Webhooks agent-tool contract, built THROUGH THE HOST CONTRIBUTOR
 * (`contributeWebhooksTools().build(deps, surfaces)`), so it pins what the assistant's composition
 * root receives regardless of which package the catalog and handlers live in. It must stay green,
 * unedited, across the move of the tool catalog and handlers into `@jini-ai/integrations`.
 *
 * Pinned: registration ids and their order (saved in permissions and audit rows), every descriptor
 * against a committed golden (including `metadata`: the host's search vocabulary and approval
 * policy), the derived-risk map, the per-tool permission refusal, one success view per tool, the
 * three confirmation paths of the delete (confirmed, declined, expired), that no view exposes
 * signing material, and that a stale version reaches the model as the same conflict envelope.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";

import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "../repo.memory.js";
import { contributeWebhooksTools, type IntegrationsToolDeps } from "../tool-registrations.js";
import type { WebhookDeliveryRecord, WebhookSubscriptionRecord } from "@jini-ai/integrations/webhooks";

const WORKSPACE_ID = "ws-webhooks-contract";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-11-17T00:00:00.000Z";
const PERMISSION = "admin.integrations.manage";
const SECRET_MARKERS = ["MARKER-SIGNING-SECRET-1", "MARKER-PREVIOUS-SECRET-2", "MARKER-SEALED-BLOB-3", "MARKER-DELIVERY-SIGNATURE-4"] as const;

const TOOL_IDS = [
  "webhooks_list_subscriptions",
  "webhooks_get_deliveries",
  "webhooks_create_subscription",
  "webhooks_update_subscription",
  "webhooks_pause_subscription",
  "webhooks_delete_subscription",
] as const;

const DERIVED_RISK: ReadonlyArray<readonly [string, string]> = [
  ["webhooks_list_subscriptions", "none"],
  ["webhooks_get_deliveries", "none"],
  ["webhooks_create_subscription", "mutates-durable-state"],
  ["webhooks_update_subscription", "mutates-durable-state"],
  ["webhooks_pause_subscription", "mutates-durable-state"],
  ["webhooks_delete_subscription", "deletes-durable-state"],
];

const GOLDEN = JSON.parse(readFileSync(new URL("./tool-contract.characterization.golden.json", import.meta.url), "utf8")) as Record<string, unknown>;

interface Fixture {
  deps: IntegrationsToolDeps;
  repo: InMemoryWebhookSubscriptionRepo;
  deliveries: InMemoryWebhookDeliveryRepo;
  saves: { count: number };
  allow: { value: boolean };
}

/** A stored record that also carries every secret-bearing field a real row could ever hold. */
function seededRecord(id: string): WebhookSubscriptionRecord {
  return {
    id, workspaceId: WORKSPACE_ID, ownerPrincipalId: "owner-1", label: `Hook ${id}`, targetUrl: "https://example.test/hooks/orders",
    topics: ["order.created"], secretVersion: 3, previousSecretVersion: 2, status: "active", createdByPrincipalId: "creator-1",
    createdByPluginId: "plugin-1", createdAt: NOW, updatedAt: NOW, disabledAt: null, version: 1,
    signingSecret: SECRET_MARKERS[0], previousSecret: SECRET_MARKERS[1], sealedSecret: SECRET_MARKERS[2],
  } as WebhookSubscriptionRecord;
}

function seededDelivery(id: string, subscriptionId: string, createdAt: string): WebhookDeliveryRecord {
  return {
    id, workspaceId: WORKSPACE_ID, subscriptionId, eventId: `evt-${id}`, topic: "order.created", status: "delivered", attempts: 1,
    nextAttemptAt: createdAt, lastResponseStatus: 200, lastError: null, signedWithVersion: 3, createdAt, deliveredAt: createdAt, deadAt: null,
    signature: SECRET_MARKERS[3],
  } as WebhookDeliveryRecord;
}

async function makeFixture(): Promise<Fixture> {
  let counter = 0;
  const repo = new InMemoryWebhookSubscriptionRepo();
  const deliveries = new InMemoryWebhookDeliveryRepo();
  const saves = { count: 0 };
  const originalSave = repo.save.bind(repo);
  repo.save = async (...args: Parameters<typeof repo.save>) => { saves.count += 1; return originalSave(...args); };
  const allow = { value: true };
  const deps: IntegrationsToolDeps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    webhookSubscriptionRepo: repo,
    webhookDeliveryRepo: deliveries,
    originRegistry: { isAllowedEgressTarget: async () => true } as unknown as IntegrationsToolDeps["originRegistry"],
    authorize: async () => (allow.value ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  };
  await repo.insert(seededRecord("sub-1"));
  return { deps, repo, deliveries, saves, allow };
}

function newExchanges(options: { idleTtlMs?: number } = {}): SurfaceExchangeStore {
  return createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }, options);
}

function buildThroughContributor(deps: IntegrationsToolDeps, surfaceExchanges: SurfaceExchangeStore = newExchanges()): ToolRegistration[] {
  // The delete is a permanent-delete tool: its chat grant is the host's `assertChatDeleteAllowed` port.
  const surfaces = { surfaceExchanges, assertChatDeleteAllowed: async () => {} };
  return contributeWebhooksTools().build(deps, surfaces);
}

function ctx(input: unknown, signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal };
}

function caller(registrations: ToolRegistration[]) {
  return (id: string, input: unknown): Promise<unknown> => {
    const found = registrations.find((registration) => registration.descriptor.id === id);
    assert.ok(found, `expected '${id}' to be wired`);
    return Promise.resolve(found.handler(ctx(input)));
  };
}

test("(a) registration ids, in order, are the six webhooks tools", async () => {
  const ids = buildThroughContributor((await makeFixture()).deps).map((registration) => registration.descriptor.id);
  assert.deepEqual(ids, [...TOOL_IDS]);
});

test("(b) every descriptor equals the committed golden, metadata included", async () => {
  for (const registration of buildThroughContributor((await makeFixture()).deps)) {
    const descriptor = JSON.parse(JSON.stringify(registration.descriptor));
    assert.deepStrictEqual(descriptor, GOLDEN[registration.descriptor.id], registration.descriptor.id);
  }
  assert.deepEqual(Object.keys(GOLDEN), [...TOOL_IDS]);
});

test("(c) the contributor's derived-risk map is the six authored entries", () => {
  assert.deepEqual([...contributeWebhooksTools().risk.entries()], DERIVED_RISK.map(([id, risk]) => [id, risk]));
});

const REFUSAL_INPUTS: Record<(typeof TOOL_IDS)[number], unknown> = {
  webhooks_list_subscriptions: {},
  webhooks_get_deliveries: { subscriptionId: "sub-1" },
  webhooks_create_subscription: { label: "L", targetUrl: "https://example.test/h", topics: ["a"] },
  webhooks_update_subscription: { subscriptionId: "sub-1", expectedVersion: 1, label: "L", targetUrl: "https://example.test/h", topics: ["a"] },
  webhooks_pause_subscription: { subscriptionId: "sub-1" },
  webhooks_delete_subscription: { subscriptionId: "sub-1" },
};

for (const toolId of TOOL_IDS) {
  test(`(d) ${toolId}: a principal without the permission is refused with the model-facing forbidden error`, async () => {
    const fixture = await makeFixture();
    const call = caller(buildThroughContributor(fixture.deps));
    fixture.allow.value = false;
    await assert.rejects(call(toolId, REFUSAL_INPUTS[toolId]), (error: unknown) => {
      assert.ok(error instanceof ToolInputError, `got ${(error as Error)?.constructor?.name}`);
      assert.equal(error.message, `WEBHOOKS_FORBIDDEN: principal '${PRINCIPAL_ID}' is not authorized for '${PERMISSION}' (insufficient_permission)`);
      return true;
    });
    assert.equal(fixture.saves.count, 0, "a refused call writes nothing");
  });
}

test("(e) one success call per non-delete tool returns the model-facing view", async () => {
  const fixture = await makeFixture();
  const call = caller(buildThroughContributor(fixture.deps));
  await fixture.deliveries.enqueue({ record: seededDelivery("d-old", "sub-1", "2026-11-01T00:00:00.000Z") });
  await fixture.deliveries.enqueue({ record: seededDelivery("d-new", "sub-1", "2026-11-02T00:00:00.000Z") });
  const deliveryView = (id: string, createdAt: string) => ({
    id, subscriptionId: "sub-1", eventId: `evt-${id}`, topic: "order.created", status: "delivered", attempts: 1, nextAttemptAt: createdAt,
    lastResponseStatus: 200, lastError: null, signedWithVersion: 3, createdAt, deliveredAt: createdAt, deadAt: null,
  });
  const view = (over: Record<string, unknown>) => ({
    id: "sub-1", label: "Hook sub-1", targetUrl: "https://example.test/hooks/orders", topics: ["order.created"], status: "active", secretVersion: 3,
    previousSecretVersion: 2, createdAt: NOW, updatedAt: NOW, disabledAt: null, version: 1, lastDelivery: null, ...over,
  });

  assert.deepEqual(await call("webhooks_list_subscriptions", {}), { subscriptions: [view({ lastDelivery: deliveryView("d-new", "2026-11-02T00:00:00.000Z") })] });
  assert.deepEqual(await call("webhooks_get_deliveries", { subscriptionId: "sub-1" }), {
    deliveries: [deliveryView("d-new", "2026-11-02T00:00:00.000Z"), deliveryView("d-old", "2026-11-01T00:00:00.000Z")],
  });
  const created = (await call("webhooks_create_subscription", { label: "  New hook  ", targetUrl: "https://example.test/new", topics: ["a", "a", " b "] })) as { subscription: { id: string } };
  assert.deepEqual(created, { subscription: view({ id: created.subscription.id, label: "New hook", targetUrl: "https://example.test/new", topics: ["a", "b"], secretVersion: 1, previousSecretVersion: null }) });
  const updated = await call("webhooks_update_subscription", { subscriptionId: "sub-1", expectedVersion: 1, label: "Renamed", targetUrl: "https://example.test/renamed", topics: ["c"] });
  assert.deepEqual(updated, { subscription: view({ label: "Renamed", targetUrl: "https://example.test/renamed", topics: ["c"], version: 2, lastDelivery: deliveryView("d-new", "2026-11-02T00:00:00.000Z") }) });
  assert.deepEqual(await call("webhooks_pause_subscription", { subscriptionId: "sub-1" }), {
    subscription: view({ label: "Renamed", targetUrl: "https://example.test/renamed", topics: ["c"], status: "paused", version: 2 }),
  });
});

/** Raises the delete's dialog and returns the exchange id plus the still-pending call. */
async function raiseDeleteDialog(registrations: ToolRegistration[], subscriptionId: string) {
  const deleteTool = registrations.find((registration) => registration.descriptor.id === "webhooks_delete_subscription");
  assert.ok(deleteTool);
  const emitted: unknown[] = [];
  const pending = Promise.resolve(deleteTool.handler(ctx({ subscriptionId }), { emitSurface: async (surface) => void emitted.push(surface) }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog is emitted before the call parks");
  const html = (emitted[0] as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface carries its exchange id");
  return { pending, exchangeId: match[1]!, html };
}

const DELETE_VIEW = {
  id: "sub-1", label: "Hook sub-1", targetUrl: "https://example.test/hooks/orders", topics: ["order.created"], secretVersion: 3, previousSecretVersion: 2,
  createdAt: NOW, updatedAt: NOW, version: 1, lastDelivery: null,
};

test("(e) delete confirmed: the dialog names the subscription, the human's confirm soft-deletes it once", async () => {
  const fixture = await makeFixture();
  const exchanges = newExchanges();
  const { pending, exchangeId, html } = await raiseDeleteDialog(buildThroughContributor(fixture.deps, exchanges), "sub-1");
  assert.match(html, /Hook sub-1/);
  assert.match(html, /<dt>Target origin<\/dt>\s*<dd>https:\/\/example.test<\/dd>/);
  assert.deepEqual(exchanges.deliver({ exchangeId, principalId: PRINCIPAL_ID, params: { decision: "confirm" } }, { toolId: "webhooks_delete_subscription" }), { ok: true });
  assert.deepEqual(await pending, { deleted: true, cancelled: false, subscription: { ...DELETE_VIEW, status: "disabled", disabledAt: NOW } });
  assert.equal(fixture.saves.count, 1, "the soft delete writes exactly once");
  assert.equal((await fixture.repo.findById({ workspaceId: WORKSPACE_ID, id: "sub-1" }))?.status, "disabled");
});

test("(e)/(g) delete declined: the same not-confirmed result and NO write on the repo", async () => {
  const fixture = await makeFixture();
  const exchanges = newExchanges();
  const { pending, exchangeId } = await raiseDeleteDialog(buildThroughContributor(fixture.deps, exchanges), "sub-1");
  exchanges.deliver({ exchangeId, principalId: PRINCIPAL_ID, params: { decision: "cancel" } }, { toolId: "webhooks_delete_subscription" });
  assert.deepEqual(await pending, { deleted: false, cancelled: true, subscription: { ...DELETE_VIEW, status: "active", disabledAt: null } });
  assert.equal(fixture.saves.count, 0);
  assert.equal((await fixture.repo.findById({ workspaceId: WORKSPACE_ID, id: "sub-1" }))?.status, "active");
});

test("(e) delete expired: reports 'expired' with the same note and writes nothing", async () => {
  const fixture = await makeFixture();
  const registrations = buildThroughContributor(fixture.deps, newExchanges({ idleTtlMs: 1 }));
  const deleteTool = registrations.find((registration) => registration.descriptor.id === "webhooks_delete_subscription");
  assert.ok(deleteTool);
  const result = await deleteTool.handler(ctx({ subscriptionId: "sub-1" }), { emitSurface: async () => undefined });
  assert.deepEqual(result, { deleted: false, cancelled: false, reason: "expired", note: "The user did not respond to the confirmation dialog before it expired. Nothing was deleted." });
  assert.equal(fixture.saves.count, 0);
});

test("(f) no tool result exposes signing material; the numeric secret versions stay public", async () => {
  const fixture = await makeFixture();
  const exchanges = newExchanges();
  const registrations = buildThroughContributor(fixture.deps, exchanges);
  const call = caller(registrations);
  await fixture.deliveries.enqueue({ record: seededDelivery("d-1", "sub-1", "2026-11-01T00:00:00.000Z") });
  const results: unknown[] = [
    await call("webhooks_list_subscriptions", {}),
    await call("webhooks_get_deliveries", { subscriptionId: "sub-1" }),
    await call("webhooks_create_subscription", { label: "N", targetUrl: "https://example.test/n", topics: ["a"] }),
    await call("webhooks_update_subscription", { subscriptionId: "sub-1", expectedVersion: 1, label: "R", targetUrl: "https://example.test/r", topics: ["c"] }),
    await call("webhooks_pause_subscription", { subscriptionId: "sub-1" }),
  ];
  const { pending, exchangeId } = await raiseDeleteDialog(registrations, "sub-1");
  exchanges.deliver({ exchangeId, principalId: PRINCIPAL_ID, params: { decision: "cancel" } }, { toolId: "webhooks_delete_subscription" });
  results.push(await pending);
  for (const result of results) {
    const text = JSON.stringify(result);
    for (const marker of SECRET_MARKERS) assert.equal(text.includes(marker), false, `a result leaked ${marker}`);
  }
  const listed = (await call("webhooks_list_subscriptions", {})) as { subscriptions: Array<{ id: string; secretVersion: number; previousSecretVersion: number | null }> };
  const seeded = listed.subscriptions.find((item) => item.id === "sub-1");
  assert.deepEqual([seeded?.secretVersion, seeded?.previousSecretVersion], [3, 2]);
});

test("(g) update with a stale expectedVersion reaches the model as the conflict envelope and saves nothing", async () => {
  const fixture = await makeFixture();
  const call = caller(buildThroughContributor(fixture.deps));
  await call("webhooks_update_subscription", { subscriptionId: "sub-1", expectedVersion: 1, label: "First", targetUrl: "https://example.test/r", topics: ["c"] });
  const savesBefore = fixture.saves.count;
  await assert.rejects(
    call("webhooks_update_subscription", { subscriptionId: "sub-1", expectedVersion: 1, label: "Second", targetUrl: "https://example.test/r", topics: ["c"] }),
    (error: unknown) => {
      assert.ok(error instanceof ToolInputError, `got ${(error as Error)?.constructor?.name}`);
      assert.match(error.message, /NOT applied/);
      assert.match(error.message, /content_read\.webhook_subscription/);
      return true;
    },
  );
  assert.equal(fixture.saves.count, savesBefore + 1, "the stale write reached the repo's compare-and-set and was refused there");
  assert.equal((await fixture.repo.findById({ workspaceId: WORKSPACE_ID, id: "sub-1" }))?.label, "First");
});
