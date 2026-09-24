import assert from "node:assert/strict";
import { test } from "node:test";

import { reconcilePluginActivationsOnce, type PluginActivationPollDeps } from "../agent-daemon-deps.js";
import { InMemoryPluginActivationRepo } from "#src/features/plugin-runtime/repo.memory";

/**
 * @file P0b (hooks v2 plan, 2026-09-23) — the agent daemon and the admin process each build their
 * own `composePluginRuntime()`, so each has its own in-memory hook registry. Enabling a plugin
 * through the admin HTTP path never reaches an already-running daemon's registry on its own.
 * `reconcilePluginActivationsOnce` is the one reconciliation pass `startPluginActivationPolling`
 * runs on a timer; these tests exercise it directly, without any real timer.
 */

const WORKSPACE = "ws-1";

function record(pluginId: string, enabled: boolean) {
  return { pluginId, workspaceId: WORKSPACE, version: "1.0.0", enabled, updatedAt: "2026-09-23T00:00:00.000Z" };
}

test("a plugin newly enabled in the durable repo is attached, and its id is added to attachedIds", async () => {
  const repo = new InMemoryPluginActivationRepo([record("word-count", true)]);
  const enabledCalls: string[] = [];
  const deps: PluginActivationPollDeps = {
    workspaceId: WORKSPACE,
    pluginActivationRepo: repo,
    onPluginEnabled: async (pluginId) => {
      enabledCalls.push(pluginId);
    },
    onPluginDisabled: () => assert.fail("must not disable a plugin this pass never attached"),
  };
  const attachedIds = new Set<string>();

  await reconcilePluginActivationsOnce(deps, attachedIds);

  assert.deepEqual(enabledCalls, ["word-count"]);
  assert.ok(attachedIds.has("word-count"));
});

test("an already-attached plugin is NOT re-attached on a later pass — no redundant reload, no reset quarantine counter", async () => {
  const repo = new InMemoryPluginActivationRepo([record("word-count", true)]);
  let enabledCallCount = 0;
  const deps: PluginActivationPollDeps = {
    workspaceId: WORKSPACE,
    pluginActivationRepo: repo,
    onPluginEnabled: async () => {
      enabledCallCount += 1;
    },
    onPluginDisabled: () => assert.fail("must not disable a plugin that is still enabled"),
  };
  const attachedIds = new Set(["word-count"]);

  await reconcilePluginActivationsOnce(deps, attachedIds);

  assert.equal(enabledCallCount, 0, "word-count was already in attachedIds — this pass must not call onPluginEnabled again");
});

test("a plugin disabled elsewhere (no longer in the durable enabled set) is detached and dropped from attachedIds", async () => {
  const repo = new InMemoryPluginActivationRepo([record("word-count", false)]);
  const disabledCalls: string[] = [];
  const deps: PluginActivationPollDeps = {
    workspaceId: WORKSPACE,
    pluginActivationRepo: repo,
    onPluginEnabled: async () => assert.fail("must not attach a plugin the durable repo marks disabled"),
    onPluginDisabled: (pluginId) => {
      disabledCalls.push(pluginId);
    },
  };
  const attachedIds = new Set(["word-count"]);

  await reconcilePluginActivationsOnce(deps, attachedIds);

  assert.deepEqual(disabledCalls, ["word-count"]);
  assert.ok(!attachedIds.has("word-count"));
});

test("a workspace this daemon does not serve is ignored, even if enabled there", async () => {
  const repo = new InMemoryPluginActivationRepo([{ ...record("word-count", true), workspaceId: "some-other-workspace" }]);
  const deps: PluginActivationPollDeps = {
    workspaceId: WORKSPACE,
    pluginActivationRepo: repo,
    onPluginEnabled: async () => assert.fail("must not attach a plugin enabled for a different workspace"),
    onPluginDisabled: () => assert.fail("must not touch attachedIds over a different workspace's row"),
  };
  await reconcilePluginActivationsOnce(deps, new Set());
});

test("one plugin's attach failure is logged and skipped, never blocking reconciliation of the rest", async () => {
  const repo = new InMemoryPluginActivationRepo([record("broken-plugin", true), record("word-count", true)]);
  const enabledCalls: string[] = [];
  const deps: PluginActivationPollDeps = {
    workspaceId: WORKSPACE,
    pluginActivationRepo: repo,
    onPluginEnabled: async (pluginId) => {
      if (pluginId === "broken-plugin") throw new Error("package missing from disk");
      enabledCalls.push(pluginId);
    },
    onPluginDisabled: () => assert.fail("must not disable anything on this pass"),
  };
  const attachedIds = new Set<string>();

  await reconcilePluginActivationsOnce(deps, attachedIds);

  assert.deepEqual(enabledCalls, ["word-count"], "the working plugin must still attach despite the broken one throwing");
  assert.ok(!attachedIds.has("broken-plugin"), "a failed attach must not be recorded as attached");
  assert.ok(attachedIds.has("word-count"));
});
