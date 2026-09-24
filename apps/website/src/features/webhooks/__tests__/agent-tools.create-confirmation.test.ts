import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import type { UIResource } from "#src/assistant/index";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "../repo.memory.js";
import { buildWebhooksRegistrations, type IntegrationsToolDeps } from "../tool-registrations.js";

/**
 * @file `webhooks_create_subscription` asks the human before site events start leaving for an
 * address the model chose (2026-09-24 tool-design audit, F3). The dialog names the address and the
 * events; nothing is stored until the confirm click.
 */

const WORKSPACE_ID = "ws-webhooks-create-confirm";
const PRINCIPAL_ID = "principal-under-test";
const TOOL_ID = "webhooks_create_subscription";
const INPUT = { label: "Order events", targetUrl: "https://example.test/hooks/orders", topics: ["order.created", "order.paid"] };

function makeDeps(options: { allow?: boolean } = {}): IntegrationsToolDeps {
  const allow = options.allow ?? true;
  let idCounter = 0;
  return {
    workspaceId: WORKSPACE_ID,
    webhookSubscriptionRepo: new InMemoryWebhookSubscriptionRepo(),
    webhookDeliveryRepo: new InMemoryWebhookDeliveryRepo(),
    originRegistry: { isAllowedEgressTarget: async () => true },
    clock: { nowIso: () => "2026-09-24T00:00:00.000Z" },
    idGen: { newId: () => `sub-${++idCounter}` },
    authorize: async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  } as unknown as IntegrationsToolDeps;
}

function createTool(deps: IntegrationsToolDeps, surfaceExchanges: SurfaceExchangeStore): ToolRegistration {
  const found = buildWebhooksRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === TOOL_ID);
  assert.ok(found);
  return found;
}

function call(registration: ToolRegistration, input: unknown, emitSurface?: SurfaceEmitter) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
    ...(emitSurface ? { emitSurface } : {}),
  };
  return registration.handler(ctx);
}

async function raiseDialog(registration: ToolRegistration, input: unknown = INPUT) {
  const emitted: unknown[] = [];
  const pending = call(registration, input, async (s) => void emitted.push(s));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match);
  return { pending, html, exchangeId: match[1]! };
}

async function subscriptionCount(deps: IntegrationsToolDeps): Promise<number> {
  return (await deps.webhookSubscriptionRepo.listByWorkspace({ workspaceId: WORKSPACE_ID })).length;
}

test("the dialog names the address and the events, and nothing is stored while it is open", async () => {
  const deps = makeDeps();
  const store = createSurfaceExchangeStore();
  const { html, exchangeId, pending } = await raiseDialog(createTool(deps, store));

  assert.match(html, /Send site events to this address\?/);
  assert.match(html, /https:\/\/example\.test\/hooks\/orders/);
  assert.match(html, /order\.created, order\.paid/);
  assert.match(html, /leaves your site for this address until you pause or delete the webhook/);
  assert.equal(await subscriptionCount(deps), 0);

  store.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("confirm: the subscription is created and the same call reports it", async () => {
  const deps = makeDeps();
  const store = createSurfaceExchangeStore();
  const { exchangeId, pending } = await raiseDialog(createTool(deps, store));

  store.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  const result = (await pending) as { created: boolean; subscription: { targetUrl: string } };

  assert.equal(result.created, true);
  assert.equal(result.subscription.targetUrl, INPUT.targetUrl);
  assert.equal(await subscriptionCount(deps), 1);
});

test("cancel: nothing is created and the model is told the user cancelled", async () => {
  const deps = makeDeps();
  const store = createSurfaceExchangeStore();
  const { exchangeId, pending } = await raiseDialog(createTool(deps, store));

  store.deliver({ exchangeId, toolId: TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });

  assert.deepEqual(await pending, { created: false, cancelled: true, note: "The user cancelled. Nothing was changed." });
  assert.equal(await subscriptionCount(deps), 0);
});

test("with no emitSurface the create is refused and nothing is stored", async () => {
  const deps = makeDeps();
  await assert.rejects(() => call(createTool(deps, createSurfaceExchangeStore()), INPUT), {
    name: "ToolInputError",
    message:
      "WEBHOOKS_NO_CONFIRMATION_CHANNEL: webhooks_create_subscription: this execution context has no interactive " +
      "confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed.",
  });
  assert.equal(await subscriptionCount(deps), 0);
});

test("a non-https address is refused before any dialog is shown", async () => {
  const deps = makeDeps();
  const emitted: unknown[] = [];
  await assert.rejects(
    () => call(createTool(deps, createSurfaceExchangeStore()), { ...INPUT, targetUrl: "http://example.test/h" }, async (s) => void emitted.push(s)),
    { message: "WEBHOOKS_VALIDATION_FAILED: target_url must use https://" },
  );
  assert.equal(emitted.length, 0);
});
