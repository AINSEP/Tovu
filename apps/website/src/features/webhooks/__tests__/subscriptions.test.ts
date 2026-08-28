import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryWebhookSubscriptionRepo } from "../repo.memory.js";
import {
  createSubscription,
  deleteSubscription,
  pauseSubscription,
  updateSubscription,
  WebhookSubscriptionNotFoundError,
  WebhookSubscriptionValidationError,
} from "../subscriptions.js";
import type { WebhookSubscriptionDeps } from "../subscriptions.js";

function makeDeps(overrides: Partial<WebhookSubscriptionDeps> = {}): WebhookSubscriptionDeps {
  let counter = 0;
  return {
    clock: { nowIso: () => "2026-07-10T00:00:00.000Z" },
    repo: new InMemoryWebhookSubscriptionRepo(),
    idGenerator: { newId: () => `sub-${++counter}` },
    isAllowedTarget: async () => true,
    ...overrides,
  };
}

const baseInput = {
  workspaceId: "workspace-1",
  ownerPrincipalId: "principal-1",
  label: "  My Endpoint  ",
  targetUrl: "https://example.com/hooks",
  topics: ["post.published", "post.published", "  "],
  createdByPrincipalId: "principal-1",
};

test("createSubscription trims label, de-dupes topics, and starts active at secretVersion 1", async () => {
  const deps = makeDeps();

  const { subscription } = await createSubscription({ deps, input: baseInput });

  assert.equal(subscription.label, "My Endpoint");
  assert.deepEqual(subscription.topics, ["post.published"]);
  assert.equal(subscription.status, "active");
  assert.equal(subscription.secretVersion, 1);
  assert.equal(subscription.previousSecretVersion, null);
  assert.equal(subscription.disabledAt, null);
});

test("createSubscription rejects a non-https target_url", async () => {
  const deps = makeDeps();

  await assert.rejects(
    () => createSubscription({ deps, input: { ...baseInput, targetUrl: "http://example.com/hooks" } }),
    WebhookSubscriptionValidationError
  );
});

test("createSubscription rejects a target the injected allowlist check disallows", async () => {
  const deps = makeDeps({ isAllowedTarget: async () => false });

  await assert.rejects(
    () => createSubscription({ deps, input: baseInput }),
    WebhookSubscriptionValidationError
  );
});

test("createSubscription rejects an empty topic list after normalization", async () => {
  const deps = makeDeps();

  await assert.rejects(
    () => createSubscription({ deps, input: { ...baseInput, topics: ["   ", ""] } }),
    WebhookSubscriptionValidationError
  );
});

test("updateSubscription overwrites label/targetUrl/topics and bumps updatedAt", async () => {
  const repo = new InMemoryWebhookSubscriptionRepo();
  const deps = makeDeps({ repo });
  const { subscription: created } = await createSubscription({ deps, input: baseInput });

  const laterDeps = { ...deps, clock: { nowIso: () => "2026-07-10T01:00:00.000Z" } };
  const { subscription: updated } = await updateSubscription({
    deps: laterDeps,
    input: {
      workspaceId: "workspace-1",
      id: created.id,
      label: "Renamed",
      targetUrl: "https://example.com/hooks/v2",
      topics: ["post.*"],
    },
  });

  assert.equal(updated.label, "Renamed");
  assert.equal(updated.targetUrl, "https://example.com/hooks/v2");
  assert.deepEqual(updated.topics, ["post.*"]);
  assert.equal(updated.updatedAt, "2026-07-10T01:00:00.000Z");
  assert.equal(updated.createdAt, created.createdAt);
});

test("updateSubscription on an unknown id throws WebhookSubscriptionNotFoundError", async () => {
  const deps = makeDeps();

  await assert.rejects(
    () =>
      updateSubscription({
        deps,
        input: { workspaceId: "workspace-1", id: "missing", label: "x", targetUrl: "https://x.test", topics: ["*"] },
      }),
    WebhookSubscriptionNotFoundError
  );
});

test("pauseSubscription toggles active <-> paused", async () => {
  const repo = new InMemoryWebhookSubscriptionRepo();
  const deps = makeDeps({ repo });
  const { subscription: created } = await createSubscription({ deps, input: baseInput });

  const { subscription: paused } = await pauseSubscription({
    deps,
    input: { workspaceId: "workspace-1", id: created.id },
  });
  assert.equal(paused.status, "paused");

  const { subscription: resumed } = await pauseSubscription(
    { deps, input: { workspaceId: "workspace-1", id: created.id } },
    { paused: false }
  );
  assert.equal(resumed.status, "active");
});

test("pauseSubscription rejects a disabled subscription", async () => {
  const repo = new InMemoryWebhookSubscriptionRepo();
  const deps = makeDeps({ repo });
  const { subscription: created } = await createSubscription({ deps, input: baseInput });
  await deleteSubscription({ deps, input: { workspaceId: "workspace-1", id: created.id } });

  await assert.rejects(
    () => pauseSubscription({ deps, input: { workspaceId: "workspace-1", id: created.id } }),
    WebhookSubscriptionValidationError
  );
});

test("deleteSubscription soft-disables rather than removing the row", async () => {
  const repo = new InMemoryWebhookSubscriptionRepo();
  const deps = makeDeps({ repo });
  const { subscription: created } = await createSubscription({ deps, input: baseInput });

  const { subscription: deleted } = await deleteSubscription({
    deps,
    input: { workspaceId: "workspace-1", id: created.id },
  });

  assert.equal(deleted.status, "disabled");
  assert.equal(deleted.disabledAt, "2026-07-10T00:00:00.000Z");

  const stillThere = await repo.findById({ workspaceId: "workspace-1", id: created.id });
  assert.ok(stillThere, "row must still exist after 'delete'");
  assert.equal(stillThere?.status, "disabled");
});
