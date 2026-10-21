import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError } from "@jini-ai/core";
import { AgentPluginActivationsUnreadableError, AgentPluginNotInstalledError } from "@jini-ai/agent-plugins/lifecycle";
import type { PluginConflict } from "@jini-ai/plugins/host";

import type { AgentPluginLayout } from "../../../../contracts/headless/plugin-host.js";
import type { AssistantToolRegistryDeps } from "../../../../assistant/tool-registrations.js";
import { toAssistantRegistryDeps } from "../../../../assistant/__tests__/fixtures/registry-deps.js";
import { createRouteDeps } from "../../../../server/runtime/composition/app.js";
import { contributePluginsTools, pluginApprovalIdentity, pluginsDerivedRisk, type PluginsToolDeps } from "../../tool-registrations.js";
import { ABANDONED_NOTE, PLUGIN_ID, WORKSPACE_ID, answerCard, context, harness, installedAgentPlugin, siteRecord } from "../fixtures/plugins-tool-harness.js";

/**
 * @file The Plugins tool handlers' remaining boundaries: `plugins_list`'s per-plugin conflicts, the
 * uninstall run cancelled after approval, the Agent Plugin approval identity's order independence,
 * and the contributor seam's host binding.
 */

test("plugins_list attaches each plugin's own conflicts and an empty list to plugins without one", async () => {
  const conflict: PluginConflict = { kind: "hook", key: "content.entry.beforeSave", heldBy: "other", heldByName: "Other", heldKey: "content.entry.beforeSave" };
  const h = harness({
    discovery: () => [siteRecord(), siteRecord({ id: "quiet", name: "Quiet" })],
    listPluginConflicts: async () => new Map([[PLUGIN_ID, [conflict]]]),
  });
  const result = await h.tool("plugins_list").handler(context({}), {}) as { plugins: Array<{ id: string; conflicts: readonly PluginConflict[] }> };
  assert.deepEqual(result.plugins.map(({ id, conflicts }) => [id, conflicts]), [[PLUGIN_ID, [conflict]], ["quiet", []]]);
});

test("plugins_uninstall: a run cancelled during the post-approval re-check returns abandoned and removes nothing", async () => {
  const controller = new AbortController();
  const removed: string[] = [];
  const h = harness({
    authorize: (call) => { if (call === 2) controller.abort(); return true; },
    removePlugin: async ({ id }) => { removed.push(id); return { ok: true, version: null }; },
  });
  const { outcome } = await answerCard({ tool: h.tool("plugins_uninstall"), surfaceExchanges: h.surfaceExchanges, input: { family: "site-runtime", pluginId: PLUGIN_ID }, decision: "confirm", signal: controller.signal });
  assert.deepEqual(await outcome, { uninstalled: false, cancelled: false, reason: "abandoned", note: ABANDONED_NOTE });
  assert.deepEqual(removed, []);
});

test("an Agent Plugin's approval identity covers every installed digest, independent of listing order", async () => {
  const older = installedAgentPlugin({ version: "1.0.0", archiveDigest: "b".repeat(64) });
  const newer = installedAgentPlugin({ version: "2.0.0", archiveDigest: "c".repeat(64) });
  const unrelated = installedAgentPlugin({ pluginId: "other", version: "9.0.0" });
  const identity = async (installed: readonly ReturnType<typeof installedAgentPlugin>[]) =>
    pluginApprovalIdentity({ deps: harness({ agentHost: { listInstalled: async () => installed } }).deps, request: { family: "agent-plugin", pluginId: "higgsfield" } });
  const forward = await identity([older, unrelated, newer]);
  const reversed = await identity([newer, older]);
  const onlyOlder = await identity([older]);
  assert.equal(forward.key, reversed.key);
  assert.notEqual(forward.key, onlyOlder.key, "a new digest is a new identity");
  assert.deepEqual([forward.version, forward.label, forward.discovery], ["1.0.0, 2.0.0", "higgsfield", undefined]);
});

test("an unversioned Agent Plugin digest still changes the identity but is left out of the shown version", async () => {
  const versioned = installedAgentPlugin({ version: "1.0.0", archiveDigest: "b".repeat(64) });
  const unversioned = installedAgentPlugin({ version: undefined, archiveDigest: "d".repeat(64) });
  const identity = async (installed: readonly ReturnType<typeof installedAgentPlugin>[]) =>
    pluginApprovalIdentity({ deps: harness({ agentHost: { listInstalled: async () => installed } }).deps, request: { family: "agent-plugin", pluginId: "higgsfield" } });
  const both = await identity([versioned, unversioned]);
  assert.notEqual(both.key, (await identity([versioned])).key);
  assert.equal(both.version, "1.0.0");
});

test("approval identity refuses an Agent Plugin that is not installed and a site plugin missing from discovery, by name", async () => {
  const agent = pluginApprovalIdentity({ deps: harness({ agentHost: { listInstalled: async () => [installedAgentPlugin({ pluginId: "other" })] } }).deps, request: { family: "agent-plugin", pluginId: "higgsfield" } });
  await assert.rejects(agent, (error: unknown) => error instanceof ToolInputError && error.message === "Agent Plugin 'higgsfield' is not installed");
  const site = pluginApprovalIdentity({ deps: harness({ discovery: () => [siteRecord({ id: "quiet", name: "Quiet" })] }).deps, request: { family: "site-runtime", pluginId: "ghost-plugin" } });
  await assert.rejects(site, (error: unknown) => error instanceof ToolInputError && error.message === "plugin 'ghost-plugin' was not found in the current discovery snapshot");
});

/** The composed assistant registry deps with this harness's Plugins ports laid over them, minus any
 *  bound host. The composed clock is kept: other domains in the registry need its `nowIso`. */
function registryDepsWithoutHost(deps: PluginsToolDeps): Omit<AssistantToolRegistryDeps, "pluginHost"> {
  const base = toAssistantRegistryDeps({ routeDeps: createRouteDeps() });
  const { pluginHost: _composedHost, ...composed } = { ...base, ...deps, clock: base.clock };
  return composed;
}

test("the contributor builds through the injected host factory only when the deps carry no host", () => {
  const { deps, surfaceExchanges } = harness();
  const host = deps.pluginHost;
  assert.ok(host);
  const created: PluginsToolDeps[] = [];
  const contributor = contributePluginsTools({ createPluginHost: ({ deps: received }) => { created.push(received); return host; } });
  assert.deepEqual([contributor.domain, contributor.risk], ["plugins", pluginsDerivedRisk]);
  const withoutHost = registryDepsWithoutHost(deps);
  const ids = contributor.build(withoutHost, { surfaceExchanges }).map((registration) => registration.descriptor.id);
  assert.deepEqual(ids.sort(), ["plugins_list", "plugins_set_enabled", "plugins_uninstall"]);
  assert.deepEqual(created, [withoutHost]);
  contributor.build({ ...withoutHost, pluginHost: host }, { surfaceExchanges });
  assert.equal(created.length, 1, "a bound host is used as-is");
});

test("with no host bound and no factory, an Agent Plugin operation is an explicit refusal", async () => {
  const { deps, surfaceExchanges } = harness();
  const uninstall = contributePluginsTools().build(registryDepsWithoutHost(deps), { surfaceExchanges }).find((registration) => registration.descriptor.id === "plugins_uninstall");
  assert.ok(uninstall);
  await assert.rejects(uninstall.handler(context({ family: "agent-plugin", pluginId: "higgsfield" }), {}),
    (error: unknown) => error instanceof ToolInputError && error.message === "The host does not provide agent-plugin lifecycle operations.");
});

/** A layout whose only reachable member is this workspace's root. */
function layoutAt(root: string): AgentPluginLayout {
  const unread = (): string => assert.fail("only the workspace root is read");
  return {
    root: "/fake", workspacesDir: "/fake/ws",
    forWorkspace: (workspaceId) => ({ root: `${root}/${workspaceId}`, packages: "", staging: "", pluginRootDir: unread, pluginPackagesDir: unread, pluginMemoryDir: unread, pluginDataDir: unread }),
  };
}

test("injected Agent Plugin owners are used in place of the host capability, scoped to this workspace's root and layout", async () => {
  const calls: unknown[] = [];
  const layout = layoutAt("/ws-root");
  const h = harness({
    layout,
    confirmEnable: () => false,
    injected: {
      assertAgentPluginActivationsWritable: async (required) => { calls.push(["assert", required]); },
      listInstalledAgentPlugins: async (workspaceRoot) => { calls.push(["list", workspaceRoot]); return [installedAgentPlugin()]; },
      setAgentPluginEnabled: async (required) => { calls.push(["set", required.enabled, required.agentPluginLayout === layout]); return { pluginId: required.pluginId, enabled: required.enabled }; },
    },
  });
  const result = await h.tool("plugins_set_enabled").handler(context({ family: "agent-plugin", pluginId: "higgsfield", enabled: true }), {}) as { changed: boolean };
  assert.equal(result.changed, true);
  const root = `/ws-root/${WORKSPACE_ID}`;
  assert.deepEqual(calls, [["assert", { workspaceRoot: root }], ["list", root], ["list", root], ["list", root], ["set", true, true]], "host-compatibility pre-flight, identity, identity re-check");
  assert.deepEqual(h.events, ["provisionMcp:higgsfield"], "only MCP provisioning still goes through the host");
});

test("an unreadable activation record found by the injected pre-flight is a not-changed result naming the reason", async (t) => {
  const warn = t.mock.method(console, "warn", () => undefined);
  const h = harness({
    layout: layoutAt("/ws-root"),
    injected: { assertAgentPluginActivationsWritable: async () => { throw new AgentPluginActivationsUnreadableError({ filePath: "/ws-root/activations.json", reason: "not JSON" }); } },
  });
  const result = await h.tool("plugins_set_enabled").handler(context({ family: "agent-plugin", pluginId: "higgsfield", enabled: true }), {});
  assert.deepEqual(result, {
    changed: false, cancelled: false, family: "agent-plugin", pluginId: "higgsfield", restartRequired: false, reason: "activations-unreadable",
    note: "Nothing changed: this workspace's Agent Plugin activation record could not be read, so 'higgsfield' was NOT enabled. Tell the user an operator has to repair activations.json first (the server log names the file and the fault); until then every Agent Plugin tool call in this workspace is refused.",
  });
  assert.equal(warn.mock.callCount(), 1);
});

const AGENT_ENABLE = { family: "agent-plugin", pluginId: "higgsfield", enabled: true } as const;

test("any other pre-flight failure propagates unchanged, before identity or card", async () => {
  const h = harness({ confirmEnable: () => true, agentHost: { assertWritable: async () => { throw new Error("activation store offline"); } } });
  await assert.rejects(h.tool("plugins_set_enabled").handler(context(AGENT_ENABLE), {}), /^Error: activation store offline$/);
  assert.deepEqual(h.events, ["assertWritable"]);
});

test("an Agent Plugin missing at the write is a ToolInputError carrying the lifecycle's message", async () => {
  const h = harness({ confirmEnable: () => false, agentHost: { setEnabled: async ({ pluginId }) => { throw new AgentPluginNotInstalledError({ pluginId }); } } });
  await assert.rejects(h.tool("plugins_set_enabled").handler(context(AGENT_ENABLE), {}),
    (error: unknown) => error instanceof ToolInputError && error.message === "agent plugin 'higgsfield' is not installed in this workspace");
});

test("any other Agent Plugin write failure propagates unchanged and provisions nothing", async () => {
  const h = harness({ confirmEnable: () => false, agentHost: { setEnabled: async () => { throw new Error("disk full"); } } });
  await assert.rejects(h.tool("plugins_set_enabled").handler(context(AGENT_ENABLE), {}), /^Error: disk full$/);
  assert.equal(h.events.includes("provisionMcp:higgsfield"), false);
});
