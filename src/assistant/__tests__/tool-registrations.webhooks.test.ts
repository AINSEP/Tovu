/**
 * @file Covers the 5 Webhooks tools (formerly published as `integrations_*`, renamed 2026-08-17 to
 * match the `src/webhooks/` module rename — see that rename's own commit for why the tool IDs moved
 * too): catalog completeness (every entry wired — subscription update and signing-secret rotation/
 * generation/reveal are absent from the catalog entirely, not merely unwired — see `agent-tools.ts`'s
 * own file header), published contracts, risk cross-check, the ADR-021 authorization half
 * (explicit-handler style — none of `createSubscription`/`pauseSubscription`/`deleteSubscription`
 * call `authorize()` themselves), and a multi-tool workflow test chaining create -> list -> remove,
 * asserting state stays consistent across the whole sequence.
 *
 * Uses the REAL in-memory `WebhookSubscriptionRepoPort`/`WebhookDeliveryRepoPort` adapters and the
 * real `createSubscription`/`pauseSubscription`/`deleteSubscription` domain functions, so "the
 * subscription is actually disabled" is asserted against real repo state, not a spy.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { getWebhooksAgentToolCatalog, type AgentToolDefinition } from "../../features/webhooks/agent-tools.js";
import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "../../features/webhooks/repo.memory.js";
import { contributeWebhooksTools } from "../../features/webhooks/tool-registrations.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";

// Webhooks (registered under the tool-contribution registry's "integrations" domain key — see
// `webhooks/tool-registrations.ts`'s own header for why that key itself was NOT part of this rename)
// moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17, Stage 2 batch 2 — see `tool-contribution-registry.ts`'s
// header), so `buildAssistantToolRegistrations` below no longer wires it unless something explicitly
// installs it first, mirroring what the real composition roots (`agent-daemon-server.ts`,
// `assistant-byok.ts`) now do via `installFirstPartyToolContributors()`. Reset first so this file's
// own registration is the only one this process's registry holds while these tests run.
resetToolContributorsForTests();
contributeWebhooksTools();

const WORKSPACE_ID = "ws-webhooks-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";

function fakeRouteDeps(options: { allow?: boolean; allowedTarget?: boolean } = {}) {
  const allow = options.allow ?? true;
  const authorizeCalls: Array<Record<string, unknown>> = [];

  const webhookSubscriptionRepo = new InMemoryWebhookSubscriptionRepo();
  const webhookDeliveryRepo = new InMemoryWebhookDeliveryRepo();

  let idCounter = 0;
  const clock = { nowIso: () => NOW };
  const idGen = { newId: () => `sub-${++idCounter}` };
  const authorize = async (params: Record<string, unknown>) => {
    authorizeCalls.push(params);
    return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
  };
  const originRegistry = { isAllowedEgressTarget: async () => options.allowedTarget ?? true };

  const deps = {
    workspaceId: WORKSPACE_ID,
    webhookSubscriptionRepo,
    webhookDeliveryRepo,
    originRegistry,
    clock,
    idGen,
    authorize,
  };

  return { deps: deps as unknown as RouteDeps, authorizeCalls, webhookSubscriptionRepo, webhookDeliveryRepo };
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function webhooksRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(buildAssistantToolRegistrations(deps).filter((r) => r.descriptor.id.startsWith("webhooks_")).map((r) => [r.descriptor.id, r]));
}

function wired(deps: RouteDeps, toolId: string): ToolRegistration {
  const found = webhooksRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = getWebhooksAgentToolCatalog().find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

const ALL_WEBHOOKS_TOOL_IDS = [
  "webhooks_list_subscriptions",
  "webhooks_get_deliveries",
  "webhooks_create_subscription",
  "webhooks_pause_subscription",
  "webhooks_delete_subscription",
];

// ---------------------------------------------------------------------------
// 1. Catalog completeness — every entry wired, subscription-update and keyring ops absent entirely
// ---------------------------------------------------------------------------

test("exactly the 5 webhooks catalog entries are registered — nothing withheld as a stub in this domain", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...webhooksRegistrations(deps).keys()].sort(), [...ALL_WEBHOOKS_TOOL_IDS].sort());
  assert.equal(getWebhooksAgentToolCatalog().length, 5, "sanity: the full webhooks catalog is still 5 entries");
});

test("no tool id across the whole assistant tool set implies a subscription can be updated or a signing secret rotated/revealed by an agent", () => {
  const { deps } = fakeRouteDeps();
  const ids = buildAssistantToolRegistrations(deps).map((r) => r.descriptor.id);
  assert.equal(ids.includes("webhooks_update_subscription"), false);
  assert.equal(ids.some((id) => id.includes("rotate") || id.includes("reveal") || id.includes("keyring")), false);
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired webhooks registration publishes its catalog entry's inputSchema and description verbatim", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of webhooksRegistrations(deps)) {
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's`);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired webhooks tool", () => {
  const { deps } = fakeRouteDeps();
  for (const [, registration] of webhooksRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined);
  }
});

// ---------------------------------------------------------------------------
// 3. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the independent risk classification agrees with the catalog for every wired webhooks tool", () => {
  const { deps } = fakeRouteDeps();
  for (const id of webhooksRegistrations(deps).keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a webhooks catalog entry cannot downgrade its own risk — declaring sideEffects:'none' for webhooks_create_subscription fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("webhooks_create_subscription", { ...catalogEntry("webhooks_create_subscription"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("the ToolPolicy layer is a pass-through 'allow' for every wired webhooks registration", () => {
  const { deps } = fakeRouteDeps();
  for (const [toolId, registration] of webhooksRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

// ---------------------------------------------------------------------------
// 4. Authorization (ADR-021 §2)
// ---------------------------------------------------------------------------

const TOOL_INPUTS: Record<string, Record<string, unknown>> = {
  webhooks_list_subscriptions: {},
  webhooks_create_subscription: { label: "My Endpoint", targetUrl: "https://example.test/hooks", topics: ["post.published"] },
};

for (const toolId of Object.keys(TOOL_INPUTS)) {
  test(`${toolId}: calls authorize() with 'admin.integrations.manage' and the run's principal`, async () => {
    const { deps, authorizeCalls } = fakeRouteDeps();
    authorizeCalls.length = 0;

    await wired(deps, toolId).handler(executionContext(TOOL_INPUTS[toolId]));

    assert.ok(authorizeCalls.length >= 1);
    assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
    assert.equal(authorizeCalls[0].permission, "admin.integrations.manage");
    assert.equal(authorizeCalls[0].workspaceId, WORKSPACE_ID);
  });

  test(`${toolId}: a denied principal is rejected and nothing is written`, async () => {
    const { deps, webhookSubscriptionRepo } = fakeRouteDeps({ allow: false });
    const before = await webhookSubscriptionRepo.listByWorkspace({ workspaceId: WORKSPACE_ID });

    await assert.rejects(
      () => wired(deps, toolId).handler(executionContext(TOOL_INPUTS[toolId])),
      (error: unknown) => {
        assert.ok(error instanceof Error, `expected an Error, got ${String(error)}`);
        assert.match((error as Error).message, /is not authorized for/);
        return true;
      },
    );

    const after = await webhookSubscriptionRepo.listByWorkspace({ workspaceId: WORKSPACE_ID });
    assert.deepEqual(after, before, "the permission gate must run ahead of any durable effect");
  });
}

test("webhooks_create_subscription: rejects a non-https target the same way the domain function does", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "webhooks_create_subscription").handler(executionContext({ label: "x", targetUrl: "http://example.test", topics: ["post.published"] })),
  );
});

test("webhooks_create_subscription: rejects a target the egress allowlist disallows", async () => {
  const { deps } = fakeRouteDeps({ allowedTarget: false });
  await assert.rejects(
    () => wired(deps, "webhooks_create_subscription").handler(executionContext({ label: "x", targetUrl: "https://example.test", topics: ["post.published"] })),
  );
});

test("webhooks_get_deliveries: an unknown subscriptionId propagates WebhookSubscriptionNotFoundError unwrapped", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "webhooks_get_deliveries").handler(executionContext({ subscriptionId: "no-such-id" })),
    /was not found/,
  );
});

// ---------------------------------------------------------------------------
// 5. Multi-tool workflow
// ---------------------------------------------------------------------------

test("workflow: create a subscription, list to confirm it appears, pause it, list again to confirm the status change, then remove it", async () => {
  const { deps } = fakeRouteDeps();

  const created = (await wired(deps, "webhooks_create_subscription").handler(
    executionContext({ label: "  My Endpoint  ", targetUrl: "https://example.test/hooks", topics: ["post.published", "post.published"] }),
  )) as { subscription: { id: string; label: string; topics: string[]; status: string; secretVersion: number } };
  assert.equal(created.subscription.label, "My Endpoint");
  assert.deepEqual(created.subscription.topics, ["post.published"]);
  assert.equal(created.subscription.status, "active");
  assert.equal(created.subscription.secretVersion, 1);

  const afterCreateList = (await wired(deps, "webhooks_list_subscriptions").handler(executionContext({}))) as {
    subscriptions: Array<{ id: string; status: string; lastDelivery: unknown }>;
  };
  assert.equal(afterCreateList.subscriptions.length, 1);
  assert.equal(afterCreateList.subscriptions[0].id, created.subscription.id);
  assert.equal(afterCreateList.subscriptions[0].status, "active");
  assert.equal(afterCreateList.subscriptions[0].lastDelivery, null, "no deliveries have fired yet");

  const paused = (await wired(deps, "webhooks_pause_subscription").handler(executionContext({ subscriptionId: created.subscription.id }))) as {
    subscription: { status: string };
  };
  assert.equal(paused.subscription.status, "paused");

  const afterPauseList = (await wired(deps, "webhooks_list_subscriptions").handler(executionContext({}))) as {
    subscriptions: Array<{ id: string; status: string }>;
  };
  assert.equal(afterPauseList.subscriptions[0].status, "paused", "list reflects the pause");

  const deliveries = (await wired(deps, "webhooks_get_deliveries").handler(executionContext({ subscriptionId: created.subscription.id }))) as {
    deliveries: unknown[];
  };
  assert.deepEqual(deliveries.deliveries, [], "no deliveries have fired yet");

  const removed = (await wired(deps, "webhooks_delete_subscription").handler(executionContext({ subscriptionId: created.subscription.id }))) as {
    subscription: { status: string; disabledAt: string | null };
  };
  assert.equal(removed.subscription.status, "disabled");
  assert.ok(removed.subscription.disabledAt);

  const afterRemoveList = (await wired(deps, "webhooks_list_subscriptions").handler(executionContext({}))) as {
    subscriptions: Array<{ id: string; status: string }>;
  };
  assert.equal(afterRemoveList.subscriptions.length, 1, "soft-delete keeps the row, for audit durability");
  assert.equal(afterRemoveList.subscriptions[0].status, "disabled");

  // A disabled subscription is terminal — resuming it is refused, not silently accepted.
  await assert.rejects(() => wired(deps, "webhooks_pause_subscription").handler(executionContext({ subscriptionId: created.subscription.id, paused: false })));
});
