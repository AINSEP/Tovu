/**
 * @file RED regression suite for the Integrations (webhooks) half of the 2026-09-16 "always say the
 * real reason" sweep. Drives the REAL delegated-tool-call transport end to end, the same seam
 * `features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts`
 * established, so the assertion is on the payload a spawned agent CLI actually receives.
 *
 * RED before the fix, for every case below: `{ ok: false, error: { code: "INTERNAL_ERROR", message:
 * "an internal error occurred" } }`. Integrations had NO reclassification of any kind — all 5 wired
 * tools sent `WebhookSubscriptionNotFoundError`, `WebhookSubscriptionValidationError` and the kit's
 * `ForbiddenError` straight into the SEC-005 redactor.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/daemon/http";

import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "../repo.memory.js";
import { buildWebhooksRegistrations, type IntegrationsToolDeps } from "../tool-registrations.js";

const WORKSPACE_ID = "ws-webhooks-errors";
const PRINCIPAL_ID = "principal-1";
const NOW = "2026-09-16T00:00:00.000Z";

function makeRouteDeps(options: { allow?: boolean; allowEgress?: boolean } = {}): IntegrationsToolDeps {
  const allow = options.allow ?? true;
  let counter = 0;
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    webhookSubscriptionRepo: new InMemoryWebhookSubscriptionRepo(),
    webhookDeliveryRepo: new InMemoryWebhookDeliveryRepo(),
    originRegistry: {
      isAllowedEgressTarget: async () => options.allowEgress ?? true,
    } as unknown as IntegrationsToolDeps["originRegistry"],
    authorize: async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  };
}

async function buildHarness(routeDeps: IntegrationsToolDeps) {
  const registry = createToolRegistry({});
  for (const registration of buildWebhooksRegistrations(routeDeps)) registry.register(registration);
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });
  return { run, lifecycle, toolExecutor, resolvePrincipal: () => ({ id: PRINCIPAL_ID }) };
}

type Harness = Awaited<ReturnType<typeof buildHarness>>;

async function call(harness: Harness, toolId: string, input: unknown) {
  return delegatedToolExecuteRoute.handle({ input: { runId: harness.run.id, toolUseId: `tu-${toolId}`, toolId, input }, deps: harness });
}

test("webhooks_get_deliveries for an unknown subscription is BAD_REQUEST with the real not-found reason, not a redacted 500", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "webhooks_get_deliveries", { subscriptionId: "nope" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "WEBHOOKS_SUBSCRIPTION_NOT_FOUND: webhook subscription 'nope' was not found",
  });
});

test("webhooks_delete_subscription for an unknown subscription says so rather than 'an internal error occurred'", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "webhooks_delete_subscription", { subscriptionId: "ghost" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "WEBHOOKS_SUBSCRIPTION_NOT_FOUND: webhook subscription 'ghost' was not found",
  });
});

test("webhooks_create_subscription with a non-https target says WHICH rule refused it", async () => {
  const harness = await buildHarness(makeRouteDeps());

  const result = await call(harness, "webhooks_create_subscription", {
    label: "My hook",
    targetUrl: "http://example.com/hook",
    topics: ["post.published"],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "WEBHOOKS_VALIDATION_FAILED: target_url must use https://",
  });
});

test("webhooks_create_subscription refused by the egress allowlist names the allowlist, not a 500", async () => {
  const harness = await buildHarness(makeRouteDeps({ allowEgress: false }));

  const result = await call(harness, "webhooks_create_subscription", {
    label: "My hook",
    targetUrl: "https://example.com/hook",
    topics: ["post.published"],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: "WEBHOOKS_VALIDATION_FAILED: target_url 'https://example.com/hook' is not an allowed egress target",
  });
});

test("every Integrations tool surfaces a denial with the permission named — the sibling-arm check", async () => {
  for (const [toolId, input] of [
    ["webhooks_list_subscriptions", {}],
    ["webhooks_get_deliveries", { subscriptionId: "s-1" }],
    ["webhooks_create_subscription", { label: "l", targetUrl: "https://example.com/h", topics: ["t"] }],
    ["webhooks_pause_subscription", { subscriptionId: "s-1", paused: true }],
    ["webhooks_delete_subscription", { subscriptionId: "s-1" }],
  ] as const) {
    const harness = await buildHarness(makeRouteDeps({ allow: false }));

    const result = await call(harness, toolId, input);

    assert.equal(result.ok, false, `${toolId}: expected a refusal`);
    if (result.ok) continue;
    assert.equal(result.error.code, "BAD_REQUEST", `${toolId}: still redacted — ${JSON.stringify(result.error)}`);
    assert.equal(
      result.error.message,
      `WEBHOOKS_FORBIDDEN: principal '${PRINCIPAL_ID}' is not authorized for 'admin.integrations.manage' (insufficient_permission)`,
      toolId
    );
  }
});

test("an unlisted repository error stays redacted through the delegated transport", async () => {
  const deps = makeRouteDeps();
  deps.webhookSubscriptionRepo.listByWorkspace = async () => {
    throw new Error("SQL failure in /private/operator/content.db: SELECT secret FROM credentials");
  };
  const harness = await buildHarness(deps);
  const result = await call(harness, "webhooks_list_subscriptions", {});
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok("requestId" in result.error);
  assert.match(String(result.error.requestId), /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
  assert.deepEqual(result.error, {
    code: "INTERNAL_ERROR", message: "an internal error occurred", requestId: result.error.requestId,
  });
});


test("webhook update uses existing egress validation, preserves lifecycle and returns no secret", async () => {
  const deps = makeRouteDeps();
  const harness = await buildHarness(deps);
  const created = await call(harness, "webhooks_create_subscription", { label: "Original", targetUrl: "https://example.com/hook", topics: ["post.published"] });
  assert.ok(created.ok);
  const before = (await deps.webhookSubscriptionRepo.listByWorkspace({ workspaceId: WORKSPACE_ID }))[0];
  const input = { subscriptionId: before.id, label: " Edited ", targetUrl: "https://example.com/next", topics: ["page.published", "page.published"] };
  const updated = await call(harness, "webhooks_update_subscription", input);
  assert.ok(updated.ok);
  if (updated.ok) assert.deepEqual(updated.value.result.output, { subscription: {
    id: before.id, label: "Edited", targetUrl: "https://example.com/next", topics: ["page.published"], status: before.status,
    secretVersion: before.secretVersion, previousSecretVersion: before.previousSecretVersion, createdAt: NOW, updatedAt: NOW, disabledAt: null, lastDelivery: null,
  } });
  const stored = await deps.webhookSubscriptionRepo.findById({ workspaceId: WORKSPACE_ID, id: before.id });
  assert.equal(stored?.ownerPrincipalId, before.ownerPrincipalId);
  assert.equal(stored?.secretVersion, before.secretVersion);
  deps.originRegistry.isAllowedEgressTarget = async () => false;
  const refused = await call(harness, "webhooks_update_subscription", { ...input, targetUrl: "https://blocked.example/hook" });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error.message, "WEBHOOKS_VALIDATION_FAILED: target_url 'https://blocked.example/hook' is not an allowed egress target");
  assert.deepEqual(await deps.webhookSubscriptionRepo.findById({ workspaceId: WORKSPACE_ID, id: before.id }), stored);
  deps.authorize = async () => ({ allowed: false, reason: "insufficient_permission" });
  const denied = await call(harness, "webhooks_update_subscription", input);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.message, "WEBHOOKS_FORBIDDEN: principal 'principal-1' is not authorized for 'admin.integrations.manage' (insufficient_permission)");
});

test("webhook update rejects a missing row and malformed topics with real reasons", async () => {
  const harness = await buildHarness(makeRouteDeps());
  for (const [input, message] of [
    [{ subscriptionId: "gone", label: "Hook", targetUrl: "https://example.com/hook", topics: ["post.published"] }, "WEBHOOKS_SUBSCRIPTION_NOT_FOUND: webhook subscription 'gone' was not found"],
    [{ subscriptionId: "gone", label: "Hook", targetUrl: "https://example.com/hook", topics: [7] }, "WEBHOOKS_VALIDATION_FAILED: topics must be an array of strings"],
  ] as const) {
    const result = await call(harness, "webhooks_update_subscription", input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.error, { code: "BAD_REQUEST", message });
  }
});

test("webhook update refuses a soft-deleted subscription with its domain reason and preserves the row", async () => {
  const deps = makeRouteDeps();
  const harness = await buildHarness(deps);
  const created = await call(harness, "webhooks_create_subscription", { label: "Original", targetUrl: "https://example.com/hook", topics: ["post.published"] });
  assert.ok(created.ok);
  const before = (await deps.webhookSubscriptionRepo.listByWorkspace({ workspaceId: WORKSPACE_ID }))[0];
  const disabled = { ...before, status: "disabled" as const, disabledAt: NOW };
  await deps.webhookSubscriptionRepo.save(disabled);
  const result = await call(harness, "webhooks_update_subscription", {
    subscriptionId: before.id, label: "Changed", targetUrl: "https://example.com/next", topics: ["page.published"],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.error, {
    code: "BAD_REQUEST",
    message: `WEBHOOKS_VALIDATION_FAILED: webhook subscription '${before.id}' is disabled (deleted) and cannot be updated`,
  });
  assert.deepEqual(await deps.webhookSubscriptionRepo.findById({ workspaceId: WORKSPACE_ID, id: before.id }), disabled);
});

test("webhook update returns the existing latest delivery rather than a fabricated empty history", async () => {
  const deps = makeRouteDeps();
  const harness = await buildHarness(deps);
  assert.ok((await call(harness, "webhooks_create_subscription", { label: "Original", targetUrl: "https://example.com/hook", topics: ["post.published"] })).ok);
  const subscription = (await deps.webhookSubscriptionRepo.listByWorkspace({ workspaceId: WORKSPACE_ID }))[0];
  const delivery = {
    id: "delivery", workspaceId: WORKSPACE_ID, subscriptionId: subscription.id, eventId: "event",
    topic: "post.published", status: "delivered" as const, attempts: 1, nextAttemptAt: NOW,
    lastResponseStatus: 204, lastError: null, signedWithVersion: 1, createdAt: NOW, deliveredAt: NOW, deadAt: null,
  };
  await deps.webhookDeliveryRepo.enqueue({ record: delivery });
  const result = await call(harness, "webhooks_update_subscription", {
    subscriptionId: subscription.id, label: "Changed", targetUrl: "https://example.com/next", topics: ["page.published"],
  });
  assert.ok(result.ok);
  if (result.ok) {
    const { workspaceId: _workspace, ...view } = delivery;
    assert.deepEqual((result.value.result.output as { subscription: { lastDelivery: unknown } }).subscription.lastDelivery, view);
  }
});
