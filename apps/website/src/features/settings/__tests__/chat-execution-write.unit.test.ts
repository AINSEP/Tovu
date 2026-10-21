import assert from "node:assert/strict";
import test from "node:test";
import { InMemorySettingsRepo, type SettingDefinitionRecord } from "@jini-ai/core/settings";
import type { DetectedAgent } from "@jini-ai/agent-runtime";
import { CHAT_EXECUTION_KEYS, prepareChatExecutionWrite } from "../chat-execution-write.js";

type Write = Parameters<typeof prepareChatExecutionWrite>[0];
const agent: DetectedAgent = {
  id: "fixture", name: "Fixture", bin: "fixture", versionArgs: [], streamFormat: "plain",
  available: true, authStatus: "ok", modelsSource: "live",
  models: [{ id: "model-a", label: "A", reasoning: [{ id: "medium", label: "Medium" }] }],
  defaultModelResolution: { status: "resolved", id: "model-a", source: "cli", resolvedAt: "now", launchFingerprint: "fixture" },
};
function fixture({ defaults = ["fixture", "", ""] }: { defaults?: string[] } = {}, _options = {}) {
  const definitions: SettingDefinitionRecord[] = CHAT_EXECUTION_KEYS.map((key, index) => ({
    settingId: key, version: 1, workspaceId: null, namespace: "core.execution", key, ownerKind: "core", ownerId: null,
    schema: { type: "string" }, defaultValue: defaults[index] ?? "", scopes: 6, secret: false,
    status: "active", aliasOfNamespace: null, aliasOfKey: null, coercionTag: null, createdAt: "now", updatedAt: "now",
  }));
  const calls: string[] = [];
  const deps: Write["deps"] = {
    settingsRepo: new InMemorySettingsRepo({ definitions }), workspaceId: "workspace",
    authorize: async ({ principalId, workspaceId, permission }) => {
      calls.push(`${principalId}:${workspaceId}:${permission}`);
      return { allowed: true, reason: "fixture" };
    },
    assistantAgentInventory: {
      listAssistantAgents: async (_required, options) => { assert.equal(options?.waitForProbe, true); calls.push("probe"); return []; },
      listDetectedAssistantAgents: async () => { calls.push("detected"); return [agent]; },
    },
  };
  const request: Write["request"] = { namespace: "core.execution", key: "localCli.model", scope: "user", value: "model-a", ctx: { principal: { id: "person" } }, toolId: "settings_set_value" };
  return { deps, request, calls };
}

test("unrelated and missing definitions bypass chat authorization", async () => {
  const f = fixture();
  for (const coordinate of [{ namespace: "missing", key: "missing" }, { namespace: "core.execution", key: "missing" }]) {
    assert.equal(await prepareChatExecutionWrite({ deps: f.deps, request: { ...f.request, ...coordinate } }), null);
  }
  assert.deepEqual(f.calls, []);
});

test("chat scope and entitlement fail before discovery", async () => {
  const f = fixture();
  await assert.rejects(prepareChatExecutionWrite({ ...f, request: { ...f.request, scope: "workspace" } }), /require scope='user'/);
  assert.deepEqual(f.calls, []);
  f.deps.authorize = async () => ({ allowed: false, reason: "denied" });
  await assert.rejects(prepareChatExecutionWrite(f), /admin.assistant.use/);
  assert.deepEqual(f.calls, []);
});

for (const key of ["localCli.model", "localCli.reasoning"]) test(`empty ${key} repairs an axis without inventory or a valid sibling`, async () => {
  const f = fixture({ defaults: ["removed", "stale-model", "stale-effort"] });
  delete f.deps.assistantAgentInventory;
  assert.equal(await prepareChatExecutionWrite({ ...f, request: { ...f.request, key, value: "" } }),
    JSON.stringify({ previous: key === "localCli.model" ? "stale-model" : "stale-effort", selection: { [key]: "" } }));
});

for (const value of ["", null, 42]) test(`agent ${String(value)} is rejected before inventory`, async () => {
  const f = fixture();
  await assert.rejects(prepareChatExecutionWrite({ ...f, request: { ...f.request, key: "localCli.agentId", value } }), /Set core.execution localCli.agentId/);
  assert.equal(f.calls.includes("probe"), false);
});

test("missing inventory and runtime refusals propagate", async () => {
  const f = fixture();
  const inventory = f.deps.assistantAgentInventory;
  delete f.deps.assistantAgentInventory;
  await assert.rejects(prepareChatExecutionWrite(f), /inventory is unavailable/);
  f.deps.assistantAgentInventory = inventory;
  await assert.rejects(prepareChatExecutionWrite({ ...f, request: { ...f.request, value: "missing" } }), /Unknown model/);
  assert.deepEqual(f.calls.slice(-2), ["probe", "detected"]);
});

for (const model of ["default", "model-a"]) test(`snapshot binds model ${JSON.stringify(model)} and only binds concrete Default for default choices`, async () => {
  const f = fixture();
  assert.equal(await prepareChatExecutionWrite({ ...f, request: { ...f.request, value: model } }), JSON.stringify({
    previous: ["fixture", "", ""], selection: { agentId: "fixture", modelId: model, effort: "" },
    resolvedDefaultModel: model === "model-a" ? null : "model-a",
  }));
  assert.deepEqual(f.calls, ["person:workspace:admin.assistant.use", "probe", "detected"]);
});

test("clear validates inherited defaults and binds unresolved Default as null", async () => {
  const f = fixture();
  f.deps.assistantAgentInventory = { listAssistantAgents: async () => [], listDetectedAssistantAgents: async () => [{ ...agent, defaultModelResolution: undefined }] };
  assert.equal(await prepareChatExecutionWrite({ ...f, request: { ...f.request, toolId: "settings_clear_value" } }), JSON.stringify({
    previous: ["fixture", "", ""], selection: { agentId: "fixture", modelId: "", effort: "" }, resolvedDefaultModel: null,
  }));
});

test("canonical aliases bind the chat axis while registered unrelated settings bypass it", async () => {
  const f = fixture();
  const definition = await f.deps.settingsRepo.findActiveDefinition({ namespace: "core.execution", key: "localCli.model", workspaceId: null });
  assert.ok(definition);
  await f.deps.settingsRepo.saveDefinition({ ...definition, settingId: "alias", namespace: "core.alias", key: "model", status: "alias",
    aliasOfNamespace: "core.execution", aliasOfKey: "localCli.model" });
  assert.equal(await prepareChatExecutionWrite({ ...f, request: { ...f.request, namespace: "core.alias", key: "model" } }),
    JSON.stringify({ previous: ["fixture", "", ""], selection: { agentId: "fixture", modelId: "model-a", effort: "" }, resolvedDefaultModel: null }));
  await f.deps.settingsRepo.saveDefinition({ ...definition, settingId: "other", namespace: "core.other" });
  assert.equal(await prepareChatExecutionWrite({ ...f, request: { ...f.request, namespace: "core.other" } }), null);
});

test("a chat axis with no registered definition reads as empty in the bound snapshot", async () => {
  const f = fixture();
  const reasoning = await f.deps.settingsRepo.findActiveDefinition({ namespace: "core.execution", key: "localCli.reasoning", workspaceId: null });
  assert.ok(reasoning);
  await f.deps.settingsRepo.saveDefinition({ ...reasoning, status: "tombstone" });
  assert.equal(await prepareChatExecutionWrite(f), JSON.stringify({
    previous: ["fixture", "", ""], selection: { agentId: "fixture", modelId: "model-a", effort: "" }, resolvedDefaultModel: null,
  }));
});

test("clearing an axis whose inherited default is null binds it as empty", async () => {
  const f = fixture();
  const model = await f.deps.settingsRepo.findActiveDefinition({ namespace: "core.execution", key: "localCli.model", workspaceId: null });
  assert.ok(model);
  await f.deps.settingsRepo.saveDefinition({ ...model, defaultValue: null });
  assert.equal(await prepareChatExecutionWrite({ ...f, request: { ...f.request, toolId: "settings_clear_value" } }), JSON.stringify({
    previous: ["fixture", "", ""], selection: { agentId: "fixture", modelId: "", effort: "" }, resolvedDefaultModel: "model-a",
  }));
});
