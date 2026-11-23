import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { RecordVersionConflictError } from "@jini-ai/core/optimistic-concurrency";
import { InMemoryWebhookDeliveryRepo, InMemoryWebhookSubscriptionRepo } from "@jini-ai/integrations/webhooks/site/repo.memory";
import { assertVersionedWrite } from "@jini-ai/core/optimistic-concurrency";
import { buildWebhooksRegistrations, type IntegrationsToolDeps } from "../tool-registrations.js";

test("webhook tools expose a version and report stale updates with recovery guidance", async () => {
  const repo = new InMemoryWebhookSubscriptionRepo({ assertVersionedWrite });
  await repo.insert({ id: "sub", workspaceId: "ws", ownerPrincipalId: "owner", label: "Original",
    targetUrl: "https://example.com/hook", topics: ["post.created"], secretVersion: 1,
    previousSecretVersion: null, status: "active", createdByPrincipalId: "owner", createdByPluginId: null,
    createdAt: "t0", updatedAt: "t0", disabledAt: null, version: 1 });
  const deps: IntegrationsToolDeps = { workspaceId: "ws", clock: { nowIso: () => "2026-11-13T00:00:00.000Z" }, idGen: { newId: () => "id" },
    webhookSubscriptionRepo: repo, webhookDeliveryRepo: new InMemoryWebhookDeliveryRepo(),
    originRegistry: { canonicalOrigin: async () => { throw new Error("unused: this fixture never resolves a canonical origin"); }, isAllowedRedirectTarget: async () => true, isAllowedEgressTarget: async () => true },
    authorize: async () => ({ allowed: true, reason: "test" }) };
  const registrations = buildWebhooksRegistrations(deps);
  const read = registrations.find(item => item.descriptor.id === "webhooks_list_subscriptions");
  const write = registrations.find(item => item.descriptor.id === "webhooks_update_subscription");
  assert.ok(read && write);
  const context = (input: unknown) => ({ executionId: "exec", principal: { id: "editor" }, run: { id: "run" }, input, signal: new AbortController().signal }) as ToolExecutionContext;
  const result = await read.handler(context({}));
  assert.ok(result && typeof result === "object" && "subscriptions" in result && Array.isArray(result.subscriptions));
  assert.equal(result.subscriptions[0].version, 1);
  const input = { subscriptionId: "sub", label: "Edit", targetUrl: "https://example.com/hook", topics: ["post.created"] };
  await assert.rejects(write.handler(context(input)), /content_read\.webhook_subscription/);
  repo.save = async () => { throw new RecordVersionConflictError({ recordKind: "webhook subscription", recordId: "sub", expectedVersion: 1, currentVersion: 2 }); };
  await assert.rejects(write.handler(context({ ...input, expectedVersion: 1 })), /NOT applied/);
});
