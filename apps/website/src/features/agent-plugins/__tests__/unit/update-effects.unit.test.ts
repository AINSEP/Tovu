import assert from "node:assert/strict";
import test from "node:test";

import { AgentPluginUpdateError } from "@jini-ai/agent-plugins/lifecycle";

import { AGENT_PLUGIN_RECOVERY_ACTOR, createAgentPluginUpdateEffects, createDeferredAgentPluginUpdateEffects, type UpdateMcpDeps } from "../../update-effects.js";

/**
 * @file The Agent Plugin update's MCP effects: re-provision the candidate's servers through the
 * existing external-MCP owner (a failed server rolls the update back), then reload the roster; the
 * activation and removal ops stay with their own owner. The boot variant reads its deps only when
 * recovery calls, and provisions as the system.
 */

const deps = { workspaceId: "ws-1", agentPluginLayout: { marker: "layout" }, externalMcpServerRepo: { marker: "repo" }, siteAssistantSecretSealer: { marker: "sealer" },
  siteAssistantSecretKeyring: { marker: "keyring" }, clock: { marker: "clock" } } as unknown as UpdateMcpDeps;
const installed = { pluginId: "notes" } as Parameters<ReturnType<typeof createAgentPluginUpdateEffects>["provision"]>[0]["installed"];

function recorder(failed: string[] = []) {
  const calls: unknown[] = [];
  return {
    calls,
    optional: {
      resolveServers: (async (input: unknown) => { calls.push(["resolve", input]); return { remote: { url: "https://mcp.example" } }; }) as never,
      provisionServers: (async (storeDeps: unknown, input: unknown) => { calls.push(["provision", storeDeps, input]); return { provisioned: [], alreadyProvisioned: [], failed }; }) as never,
      notify: (async () => { calls.push(["notify"]); }) as never,
    },
  };
}

test("provision resolves the candidate's servers and provisions them as the actor through the shared store", async () => {
  const r = recorder();
  const effects = createAgentPluginUpdateEffects({ deps, actor: "owner" }, r.optional);
  await effects.provision({ workspaceId: "ws-1", installed });
  await effects.notifyRosterChanged({ workspaceId: "ws-1" });
  assert.deepEqual(r.calls, [
    ["resolve", { agentPluginLayout: deps.agentPluginLayout, workspaceId: "ws-1", pluginId: "notes" }],
    ["provision", { repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock },
      { workspaceId: "ws-1", pluginId: "notes", servers: { remote: { url: "https://mcp.example" } }, principalId: "owner" }],
    ["notify"],
  ]);
});

test("a server that fails to provision fails the effect, so the lifecycle owner rolls the update back", async () => {
  const effects = createAgentPluginUpdateEffects({ deps, actor: "owner" }, recorder(["remote"]).optional);
  await assert.rejects(effects.provision({ workspaceId: "ws-1", installed }), (error: unknown) => error instanceof AgentPluginUpdateError
    && error.code === "PLUGIN_MCP_PROVISION_FAILED" && error.message === "The new version's MCP servers could not be set up; the previous version was restored.");
});

test("activation and removal stay with their own owner", async () => {
  const effects = createAgentPluginUpdateEffects({ deps, actor: "owner" }, recorder().optional);
  await assert.rejects(effects.setEnabled({ workspaceId: "ws-1", pluginId: "notes", enabled: true }), /shared activation\/removal owner/);
  await assert.rejects(effects.remove({ workspaceId: "ws-1", pluginId: "notes" }), /shared activation\/removal owner/);
});

test("the deferred boot port reads its deps only when called, and provisions as the recovery system actor", async () => {
  let resolved = 0;
  const port = createDeferredAgentPluginUpdateEffects({ resolveDeps: () => { resolved += 1; return deps; } });
  assert.equal(resolved, 0, "building the port must not touch deps composed later");
  await assert.rejects(port.setEnabled({ workspaceId: "ws-1", pluginId: "notes", enabled: true }), /shared activation\/removal owner/);
  await assert.rejects(port.remove({ workspaceId: "ws-1", pluginId: "notes" }), /shared activation\/removal owner/);
  assert.equal(resolved, 2);
  assert.equal(AGENT_PLUGIN_RECOVERY_ACTOR, "system:agent-plugin-update-recovery");
});

test("the deferred boot port's provision and roster reload go through the real effects as the system actor", async () => {
  const r = recorder();
  const port = createDeferredAgentPluginUpdateEffects({ resolveDeps: () => deps }, r.optional);
  await port.provision({ workspaceId: "ws-1", installed });
  await port.notifyRosterChanged({ workspaceId: "ws-1" });
  assert.equal((r.calls[1] as [string, unknown, { principalId: string }])[2].principalId, AGENT_PLUGIN_RECOVERY_ACTOR);
  assert.deepEqual(r.calls[2], ["notify"]);
});
