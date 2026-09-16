import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry, type Principal, type ToolRegistry } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { setPluginEnabled, type PluginActivationRecord, type PluginActivationRepoPort } from "../../activation.js";
import { WORD_COUNT_MANIFEST } from "../../built-ins/word-count/index.js";
import { registerEnabledPluginCapabilityTools } from "../../capability-tool-registrations.js";
import type { PluginDiscoveryRecord } from "../../discovery.js";
import { InMemoryPluginActivationRepo } from "../../repo.memory.js";
import { uninstallPlugin } from "../../uninstall.js";
import { InMemoryPostRepo } from "#src/features/post/repo.memory";
import type { PostRecord } from "#src/features/post/post";

/**
 * @file REVOCATION for `plugin_capability_<id>` tools — t91 F1.2. Mirrors `features/agent-plugins/
 * __tests__/integration/agent-plugin-tool-revocation.integration.test.ts`'s own reasoning for why this
 * is asserted through `@jini-ai/daemon`'s `createToolExecutor` rather than by calling
 * `registration.handler` directly: the handler is reachable only after the registration's `ToolPolicy`
 * authorizes the call, and calling the handler directly would skip exactly the gate under test.
 *
 * R1-R4 failed at this commit's parent with `status: "completed"` (or, for R4, no denial and no log
 * line) — the loader's activation gate ran once at boot and nothing re-checked it per call.
 */

const WORKSPACE = "ws-1";
const PLUGIN_ID = "word-count";
const TOOL_ID = "plugin_capability_word_count";
const PRINCIPAL: Principal = { id: "principal-1" };
const NOW = "2026-09-16T00:00:00.000Z";

const RECORD: PluginDiscoveryRecord = {
  id: WORD_COUNT_MANIFEST.id,
  name: WORD_COUNT_MANIFEST.name,
  version: WORD_COUNT_MANIFEST.version,
  source: "site",
  tier: WORD_COUNT_MANIFEST.tier,
  status: "valid",
  errors: [],
  manifest: WORD_COUNT_MANIFEST,
};

function activation(enabled: boolean): PluginActivationRecord {
  return { pluginId: PLUGIN_ID, workspaceId: WORKSPACE, version: WORD_COUNT_MANIFEST.version, enabled, updatedAt: NOW };
}

function post(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE,
    title: "Hello",
    slug: "hello",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: NOW,
    version: 1,
    ext: { "word-count": { count: 42 } },
    ...overrides,
  };
}

/** Boots the tool surface the way `agent-daemon-server.ts` does: register once, then keep the same
 *  registry for the rest of the process's life. */
async function bootDaemonToolSurface(repo: PluginActivationRepoPort): Promise<ToolRegistry> {
  const registry = createToolRegistry();
  await registerEnabledPluginCapabilityTools(registry, {
    authorize: async () => ({ allowed: true }) as never,
    workspaceId: WORKSPACE,
    postRepo: new InMemoryPostRepo([post()]),
    discoverPlugins: async () => [RECORD],
    pluginActivationRepo: repo,
  });
  assert.equal(registry.has(TOOL_ID), true, "precondition: an enabled plugin must register its tool at boot");
  return registry;
}

/** The one real invocation path — the same `ToolExecutor` `assistant/tool-executor-stack.ts` wraps. */
async function callCapabilityTool(registry: ToolRegistry) {
  const executor = createToolExecutor({ registry });
  return executor.execute(PRINCIPAL, { id: "run-1" }, TOOL_ID, { postId: "post-1" });
}

test("a site plugin disabled through setPluginEnabled — the composition both the admin route and plugins_set_enabled use — is refused in the already-running daemon, with no restart", async () => {
  const repo = new InMemoryPluginActivationRepo([activation(true)]);
  const registry = await bootDaemonToolSurface(repo);

  const before = await callCapabilityTool(registry);
  assert.equal(before.status, "completed", "precondition: while enabled, the tool answers");
  assert.match(JSON.stringify(before.output), /"count":42/, "precondition: it really serves the plugin's stored field");

  await setPluginEnabled({
    deps: { clock: { nowIso: () => NOW }, repo, discovery: [RECORD], onEnabled: async () => undefined, onDisabled: () => undefined },
    input: { workspaceId: WORKSPACE, pluginId: PLUGIN_ID, enabled: false },
  });

  const after = await callCapabilityTool(registry);
  assert.equal(after.status, "denied", "a disabled plugin's capability tool must be refused, not merely stay listed");
  assert.doesNotMatch(JSON.stringify(after.output ?? null), /"count":42/, "no part of a revoked plugin's data may still reach the model");
});

test("any writer of the activation row revokes the tool, and re-enabling restores the already-registered tool", async () => {
  const repo = new InMemoryPluginActivationRepo([activation(true)]);
  const registry = await bootDaemonToolSurface(repo);

  await repo.save(activation(false));
  const denied = await callCapabilityTool(registry);
  assert.equal(denied.status, "denied");

  await repo.save(activation(true));
  const completed = await callCapabilityTool(registry);
  assert.equal(completed.status, "completed", "re-enabling must restore the already-registered tool");
});

test("uninstall — which deletes every activation row — leaves the tool refused, not re-admitted", async () => {
  const repo = new InMemoryPluginActivationRepo([activation(true)]);
  const registry = await bootDaemonToolSurface(repo);

  await repo.save(activation(false));
  await uninstallPlugin({ deps: { repo, discovery: [RECORD], onUninstall: async () => undefined }, input: { pluginId: PLUGIN_ID } });

  assert.equal(
    await repo.getActivation({ workspaceId: WORKSPACE, pluginId: PLUGIN_ID }),
    null,
    "precondition: uninstall really does delete the row",
  );
  const after = await callCapabilityTool(registry);
  assert.equal(after.status, "denied", "an absent activation row must not be read as re-admitting a previously revoked tool");
});

test("an activation read that throws DENIES and says why in the server log — it never completes", async (t) => {
  const inner = new InMemoryPluginActivationRepo([activation(true)]);
  let failReads = false;
  const flaky: PluginActivationRepoPort = {
    getActivation: async (required) => {
      if (failReads) throw new Error("database is locked");
      return inner.getActivation(required);
    },
    save: (record) => inner.save(record),
    deleteActivation: (required) => inner.deleteActivation(required),
    listAll: () => inner.listAll(),
  };
  const registry = await bootDaemonToolSurface(flaky);
  failReads = true;
  const warn = t.mock.method(console, "warn", () => undefined);

  const result = await callCapabilityTool(registry);

  assert.equal(result.status, "denied");
  const matched = warn.mock.calls.filter(
    (call) => call.arguments[0] === "[plugin-runtime] 'word-count': capability tool call denied — its activation record could not be read (database is locked)",
  );
  assert.equal(matched.length, 1, `expected exactly one matching warn call, got: ${JSON.stringify(warn.mock.calls.map((c) => c.arguments))}`);
});
