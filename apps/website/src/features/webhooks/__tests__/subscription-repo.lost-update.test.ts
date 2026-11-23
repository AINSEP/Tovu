import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { RecordVersionConflictError } from "@jini-ai/core/optimistic-concurrency";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { SqlWebhookSubscriptionRepo } from "@jini-ai/integrations/webhooks/sql";
import { webhookSubscriptionsOn } from "#src/platform/db/__tests__/webhook-adapters";
import { InMemoryWebhookSubscriptionRepo } from "../repo.memory.js";

const record = { id: "sub", workspaceId: "ws", ownerPrincipalId: "owner", label: "Original",
  targetUrl: "https://example.com/hook", topics: ["post.created"], secretVersion: 1,
  previousSecretVersion: null, status: "active" as const, createdByPrincipalId: "owner", createdByPluginId: null,
  createdAt: "t0", updatedAt: "t0", disabledAt: null, version: 1 };

function cases(make: () => SqlWebhookSubscriptionRepo | InMemoryWebhookSubscriptionRepo): void {
  test("a stale save is refused and the first editor's change survives", async () => {
    const repo = make();
    await repo.save(record);
    await repo.save({ ...record, label: "First", version: 2 }, { expectedVersion: 1 });
    await assert.rejects(repo.save({ ...record, label: "Second", version: 2 }, { expectedVersion: 1 }),
      (error: unknown) => error instanceof RecordVersionConflictError && error.currentVersion === 2);
    const saved = await repo.findById({ workspaceId: "ws", id: "sub" });
    assert.equal(saved?.label, "First");
    assert.equal(saved?.version, 2);
  });

  test("a conditional save cannot create a missing subscription", async () => {
    const repo = make();
    await assert.rejects(repo.save({ ...record, version: 2 }, { expectedVersion: 1 }),
      (error: unknown) => error instanceof RecordVersionConflictError && error.currentVersion === null);
  });
}

describeEachDialect("webhook subscription lost update", { tables: ["webhook_subscriptions"], make: (kernel) => webhookSubscriptionsOn({ kernel }) }, (make) => cases(make));
describe("webhook subscription lost update — memory", () => cases(() => new InMemoryWebhookSubscriptionRepo()));
