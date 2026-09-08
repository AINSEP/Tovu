import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { MCP_UI_MIME_TYPE, type UIResource } from "#src/assistant/index";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "../repo.memory.js";
import { createSubscription } from "../subscriptions.js";
import { buildWebhooksRegistrations, type IntegrationsToolDeps } from "../tool-registrations.js";

/**
 * @file Certification of `webhooks_delete_subscription`'s confirmation gate — migrated onto the
 * shared MCP-UI held-open exchange (2026-09-08, ADS-memory/reports/
 * 2026-09-08-delete-confirmation-build.md). Modeled on
 * `features/post/__tests__/agent-tools.delete-confirmation.test.ts`, scoped to this domain's own
 * result shape. `deleteSubscription` performs its own fresh existence lookup at write time (no
 * `expectedVersion` field anywhere in its input), so there is no separate staleness re-check to
 * certify here.
 */

const WORKSPACE_ID = "ws-webhooks-delete-confirm";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";
const DELETE_TOOL_ID = "webhooks_delete_subscription";

function makeDeps(options: { allow?: boolean } = {}): IntegrationsToolDeps {
  const allow = options.allow ?? true;
  let idCounter = 0;
  return {
    workspaceId: WORKSPACE_ID,
    webhookSubscriptionRepo: new InMemoryWebhookSubscriptionRepo(),
    webhookDeliveryRepo: new InMemoryWebhookDeliveryRepo(),
    originRegistry: { isAllowedEgressTarget: async () => true },
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `sub-${++idCounter}` },
    authorize: async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  } as unknown as IntegrationsToolDeps;
}

async function seedSubscription(deps: IntegrationsToolDeps, overrides: { label?: string; targetUrl?: string } = {}) {
  const { subscription } = await createSubscription({
    deps: {
      clock: deps.clock,
      repo: deps.webhookSubscriptionRepo,
      idGenerator: deps.idGen,
      isAllowedTarget: (url: string) => deps.originRegistry.isAllowedEgressTarget({ workspaceId: deps.workspaceId }, url),
    },
    input: {
      workspaceId: WORKSPACE_ID,
      ownerPrincipalId: PRINCIPAL_ID,
      createdByPrincipalId: PRINCIPAL_ID,
      label: overrides.label ?? "Order events",
      targetUrl: overrides.targetUrl ?? "https://example.test/hooks/orders",
      topics: ["order.created"],
    },
  });
  return subscription;
}

function buildRegistrations(deps: IntegrationsToolDeps, surfaceExchanges: SurfaceExchangeStore): Map<string, ToolRegistration> {
  return new Map(buildWebhooksRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
}

function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

interface CallOptions {
  input?: unknown;
  emitSurface?: SurfaceEmitter;
  signal?: AbortSignal;
}

function call(registration: ToolRegistration, options: CallOptions = {}) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: options.input ?? {},
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return registration.handler(ctx);
}

async function raiseDialog(deleteTool: ToolRegistration, subscriptionId: string) {
  const emitted: unknown[] = [];
  const pending = call(deleteTool, { input: { subscriptionId }, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
  const html = ui.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id");
  return { pending, ui, exchangeId: match[1]! };
}

// ---------------------------------------------------------------------------
// 1. The call parks, the dialog names the subscription, nothing changes while pending
// ---------------------------------------------------------------------------

test("the call stays open after the dialog is shown, and nothing is deleted while it is pending", async () => {
  const deps = makeDeps();
  const subscription = await seedSubscription(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), DELETE_TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(deleteTool, subscription.id);

  assert.equal(ui.type, "resource");
  assert.equal(ui.resource.mimeType, MCP_UI_MIME_TYPE);
  assert.equal(surfaceExchanges.size(), 1);
  assert.equal(
    await Promise.race([pending, Promise.resolve("still-waiting" as const)]),
    "still-waiting",
    "the agent's call must not return before the human answers",
  );

  const row = await deps.webhookSubscriptionRepo.findById({ workspaceId: WORKSPACE_ID, id: subscription.id });
  assert.equal(row?.status, "active", "the subscription must be unchanged while the dialog is open");

  surfaceExchanges.deliver({ exchangeId, toolId: DELETE_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("the dialog names the label, target URL, and current status, and warns there is no un-delete", async () => {
  const deps = makeDeps();
  const subscription = await seedSubscription(deps, { label: "Payments webhook", targetUrl: "https://example.test/hooks/payments" });
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), DELETE_TOOL_ID);

  const { ui, exchangeId, pending } = await raiseDialog(deleteTool, subscription.id);

  assert.match(ui.resource.text, /Payments webhook/);
  assert.match(ui.resource.text, /example\.test\/hooks\/payments/);
  assert.match(ui.resource.text, /no un-delete/i);

  surfaceExchanges.deliver({ exchangeId, toolId: DELETE_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

// ---------------------------------------------------------------------------
// 2. Confirm / cancel / fail-closed decision
// ---------------------------------------------------------------------------

test("confirm: the human's click disables the subscription and the SAME call reports it to the agent", async () => {
  const deps = makeDeps();
  const subscription = await seedSubscription(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), DELETE_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(deleteTool, subscription.id);
  const delivered = surfaceExchanges.deliver({ exchangeId, toolId: DELETE_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  assert.deepEqual(delivered, { ok: true });

  const result = (await pending) as { deleted: boolean; cancelled: boolean; subscription: { status: string; disabledAt: string | null } };
  assert.equal(result.deleted, true);
  assert.equal(result.cancelled, false);
  assert.equal(result.subscription.status, "disabled");
  assert.ok(result.subscription.disabledAt);

  const row = await deps.webhookSubscriptionRepo.findById({ workspaceId: WORKSPACE_ID, id: subscription.id });
  assert.equal(row?.status, "disabled");
  assert.ok(row, "soft-delete keeps the row, for audit durability");
});

test("cancel: nothing is deleted, and the SAME call reports the cancellation", async () => {
  const deps = makeDeps();
  const subscription = await seedSubscription(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), DELETE_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(deleteTool, subscription.id);
  surfaceExchanges.deliver({ exchangeId, toolId: DELETE_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });

  const result = (await pending) as { deleted: boolean; cancelled: boolean; subscription: { status: string } };
  assert.equal(result.deleted, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.subscription.status, "active");

  const row = await deps.webhookSubscriptionRepo.findById({ workspaceId: WORKSPACE_ID, id: subscription.id });
  assert.equal(row?.status, "active");
});

test("an answer with no 'decision' field at all is NOT confirm — nothing is deleted (fail-closed)", async () => {
  const deps = makeDeps();
  const subscription = await seedSubscription(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), DELETE_TOOL_ID);

  const { exchangeId, pending } = await raiseDialog(deleteTool, subscription.id);
  surfaceExchanges.deliver({ exchangeId, toolId: DELETE_TOOL_ID, principalId: PRINCIPAL_ID, params: {} });

  const result = (await pending) as { deleted: boolean; cancelled: boolean };
  assert.equal(result.deleted, false);
  assert.equal(result.cancelled, true);
});

test("an unanswered dialog expires and reports 'expired', not a hang or a throw", async () => {
  const deps = makeDeps();
  const subscription = await seedSubscription(deps);
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), DELETE_TOOL_ID);

  const result = (await call(deleteTool, { input: { subscriptionId: subscription.id }, emitSurface: async () => undefined })) as {
    deleted: boolean;
    cancelled: boolean;
    reason: string;
    note: string;
  };

  assert.equal(result.deleted, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.reason, "expired");
  assert.match(result.note, /did not respond/);
});

// ---------------------------------------------------------------------------
// 3. No emit seam, authorization, not-found
// ---------------------------------------------------------------------------

test("with no emitSurface, the delete is refused outright — there is no fallback second call", async () => {
  const deps = makeDeps();
  const subscription = await seedSubscription(deps);
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), DELETE_TOOL_ID);

  await assert.rejects(() => call(deleteTool, { input: { subscriptionId: subscription.id } }), /no interactive confirmation channel/);
  assert.equal(surfaceExchanges.size(), 0, "no emit seam means no exchange was ever opened");
});

test("admin.integrations.manage is checked before any dialog is raised, and a denied principal never sees one", async () => {
  const deps = makeDeps({ allow: false });
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), DELETE_TOOL_ID);

  await assert.rejects(() => call(deleteTool, { input: { subscriptionId: "whatever" } }), /not authorized/);
  assert.equal(surfaceExchanges.size(), 0, "a denied principal must never get a dialog opened for them");
});

test("a nonexistent subscription id is refused before any dialog is raised", async () => {
  const deps = makeDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const deleteTool = tool(buildRegistrations(deps, surfaceExchanges), DELETE_TOOL_ID);

  await assert.rejects(() => call(deleteTool, { input: { subscriptionId: "nope" } }), /was not found/);
  assert.equal(surfaceExchanges.size(), 0);
});
