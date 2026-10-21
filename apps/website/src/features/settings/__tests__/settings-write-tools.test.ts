import { ASSISTANT_PERMANENT_DELETES_NAMESPACE, ASSISTANT_PERMANENT_DELETES_WRITE_REASON } from "../../../contracts/headless/assistant-permanent-deletes-policy.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { Express, Request, Response } from "express";
import type { ToolExecutionContext, ToolExecutionOptions } from "@jini-ai/core";
import type { ToolExecutor } from "@jini-ai/daemon";
import { InMemorySettingsRepo, type SettingDefinitionRecord } from "@jini-ai/core/settings";
import { createNativeApprovalMemory } from "../../../contracts/core/native-approval-memory.js";
import { createInMemoryConversationToolApprovalStore } from "../../../assistant/external-mcp-tool-approval-adapters.js";
import type { SettingsToolDeps } from "../tool-registrations.js";
import { contributeSettingsTools } from "../tool-registrations.js";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "#src/assistant/mcp-ui-tool-calls-route";
import { RUN_PRINCIPAL_HEADER } from "#src/assistant/daemon-access";
import { createSystemClock } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_SUBAGENTS_WRITE_REASON } from "../../../contracts/headless/assistant-subagents-policy.js";
import { set } from "../site-title-write.js";
import type { DetectedAgent } from "@jini-ai/agent-runtime";

const pickerAgents: DetectedAgent[] = [{
  id: "new", name: "Fixture Agent", bin: "fixture-agent", versionArgs: ["--version"], streamFormat: "plain",
  available: true, authStatus: "ok", modelsSource: "live",
  defaultModelResolution: {
    status: "resolved", id: "model-a", source: "cli",
    resolvedAt: "2026-10-01T00:00:00.000Z", launchFingerprint: "fixture-launch",
  },
  models: [{ id: "model-a", label: "Model A", reasoning: [{ id: "medium", label: "Medium" }] }],
  reasoningOptions: [{ id: "medium", label: "Medium" }],
}];


function fixture(namespace: string, key: string, schema: SettingDefinitionRecord["schema"] = { type: "string" }) {
  const definition: SettingDefinitionRecord = {
    settingId: "setting-1", version: 1, workspaceId: namespace.startsWith("site.") ? "ws-1" : null,
    namespace, key, ownerKind: namespace.startsWith("site.") ? "site" : "core", ownerId: null,
    schema, defaultValue: schema.type === "boolean" ? false : schema.type === "number" ? 0 : key === "localCli.agentId" ? "new" : "default", scopes: 6, secret: false,
    status: "active", aliasOfNamespace: null, aliasOfKey: null, coercionTag: null,
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  };
  const settingsRepo = new InMemorySettingsRepo({ definitions: [definition] });
  let allowed = true;
  let visitorReady = false;
  const deps = {
    workspaceId: "ws-1", settingsRepo, settingsReady: Promise.resolve(), settingsUiTabsReady: Promise.resolve(),
    clock: { nowMs: () => Date.parse(definition.createdAt) }, idGen: { newId: () => "unused" },
    principalRepo: { findById: async () => null }, authorize: async () => ({ allowed, reason: allowed ? "matched" : "insufficient_permission" }),
    set: (required: Parameters<typeof set>[0]) => set(required, { canEnablePublicAssistant: async () => visitorReady }),
    assistantAgentInventory: { listAssistantAgents: async () => [], listDetectedAssistantAgents: async () => pickerAgents },
  } as unknown as SettingsToolDeps;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => "exchange-1" }, defaultChannel: "mcp-ui" });
  const registrations = contributeSettingsTools().build(deps as never, { surfaceExchanges });
  const call = (toolId: string, input: Record<string, unknown>, extras: Partial<ToolExecutionContext> & ToolExecutionOptions = {}) => {
    const registration = registrations.find((r) => r.descriptor.id === toolId);
    assert.ok(registration, `expected '${toolId}' to be wired`);
    const { emitSurface, ...contextExtras } = extras;
    return registration.handler({ executionId: "exec-1", principal: { id: "caller" }, run: { id: "run-1" }, signal: new AbortController().signal, input, ...contextExtras }, { emitSurface });
  };
  return { settingsRepo, registrations, surfaceExchanges, call, deps, deny: () => { allowed = false; }, visitorReady: () => { visitorReady = true; } };
}

for (const toolId of ["settings_set_value", "settings_clear_value"]) {
  test(`${toolId} cannot change the assistant's subagent grant, even with full settings permissions`, async () => {
    const f = fixture(ASSISTANT_SUBAGENTS_NAMESPACE, "enabled", { type: "boolean" });
    await assert.rejects(f.call(toolId, { namespace: ASSISTANT_SUBAGENTS_NAMESPACE, key: "enabled", ...(toolId === "settings_set_value" ? { value: true } : {}) }),
      (error: Error) => error.message.includes(ASSISTANT_SUBAGENTS_WRITE_REASON));
    assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: "setting-1" }), []);
    assert.equal(f.surfaceExchanges.size(), 0);
    const listed = await f.call("settings_list_definitions", {}) as { data: { agentWritable: boolean }[] };
    assert.equal(listed.data[0]!.agentWritable, false);
  });
}

test("normal setting runs directly and both writes are durable, not readOnly", async () => {
  const f = fixture("core.presentation", "timezone");
  assert.deepEqual(await f.call("settings_set_value", { namespace: "core.presentation", key: "timezone", value: "Pacific" }), { key: "core.presentation.timezone", scope: "workspace", previous: null, value: "Pacific", revisionSeq: 1 });
  assert.equal(f.surfaceExchanges.size(), 0);
  for (const toolId of ["settings_set_value", "settings_clear_value"]) assert.equal(f.registrations.find((r) => r.descriptor.id === toolId)!.descriptor.readOnly, false);
});

/** All three real ledger definitions and the same injected inventory as the UI route. */
async function chatFixture() {
  const f = fixture("core.execution", "localCli.agentId");
  const original = await f.settingsRepo.findActiveDefinition({ namespace: "core.execution", key: "localCli.agentId", workspaceId: null });
  assert.ok(original);
  for (const [key, settingId, defaultValue] of [["localCli.agentId", "setting-1", "new"], ["localCli.model", "model-setting", ""], ["localCli.reasoning", "effort-setting", ""]]) {
    await f.settingsRepo.saveDefinition({ ...original, key: key!, settingId: settingId!, defaultValue: defaultValue! });
  }
  f.deps.approvalIdentityForRun = async () => ({ key: "saved-plugin", label: "Example" });
  f.deps.nativeApprovalMemory = { has: async () => assert.fail("picker changes always ask"), grant: async () => assert.fail("picker approval must not be remembered") };
  let cards = 0;
  const answer = (decision: "confirm" | "cancel" | "typed" = "confirm", toolId = "settings_set_value") => ({ emitSurface: async () => {
    cards++;
    f.surfaceExchanges.deliver({ exchangeId: "exchange-1", principalId: "caller", params: decision === "typed" ? { __typedAnswer: "yes" } : { decision } }, { toolId });
  } });
  return { ...f, answer, cards: () => cards };
}

test("chat selection refuses a missing composed inventory before confirmation or writing", async () => {
  const f = await chatFixture();
  delete f.deps.assistantAgentInventory;
  await assert.rejects(f.call("settings_set_value", {
    namespace: "core.execution", key: "localCli.agentId", scope: "user", value: "new",
  }, f.answer()), /Chat agent inventory is unavailable/);
  assert.equal(f.cards(), 0);
  assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: "setting-1" }), []);
});

/** Seed through the same ledger writer; no mocked effective-value payloads. */
async function seedChat(f: Awaited<ReturnType<typeof chatFixture>>, key: string, value: string, scope: "user" | "workspace" = "user") {
  await set({ deps: { repo: f.settingsRepo, clock: f.deps.clock, ids: f.deps.idGen, principals: f.deps.principalRepo, authorize: f.deps.authorize },
    input: { namespace: "core.execution", key, scope, value, workspaceId: "ws-1", authWorkspaceId: "ws-1", callerPrincipalId: "caller" } });
}

for (const status of ["missing", "unknown", undefined] as const) {
  for (const toolId of ["settings_set_value", "settings_clear_value"]) for (const afterCard of [false, true]) test(`${toolId} refuses credential status ${status} ${afterCard ? "after" : "before"} confirmation`, async () => {
    const f = await chatFixture();
    const revoke = () => { f.deps.assistantAgentInventory = { ...f.deps.assistantAgentInventory!, listDetectedAssistantAgents: async () => [{ ...pickerAgents[0]!, authStatus: status }] }; };
    if (!afterCard) revoke();
    await assert.rejects(f.call(toolId, { namespace: "core.execution", key: "localCli.model", scope: "user", ...(toolId === "settings_set_value" ? { value: "model-a" } : {}) }, {
      emitSurface: async () => { revoke(); await f.answer("confirm", toolId).emitSurface(); },
    }), /Credentials.*not ready/);
    assert.equal(f.cards(), afterCard ? 1 : 0);
    assert.equal(await f.settingsRepo.maxRevisionSeq(), 0);
  });
}
for (const toolId of ["settings_set_value", "settings_clear_value"]) for (const afterCard of [false, true]) test(`${toolId} runtime entitlement is checked ${afterCard ? "after" : "before"} confirmation`, async () => {
  const f = await chatFixture();
  let entitled = afterCard;
  f.deps.authorize = async ({ principalId, permission }) => {
    assert.equal(principalId, "caller");
    return { allowed: permission !== "admin.assistant.use" || entitled, reason: "test" };
  };
  await assert.rejects(f.call(toolId, { namespace: "core.execution", key: "localCli.model", scope: "user", ...(toolId === "settings_set_value" ? { value: "model-a" } : {}) }, {
    emitSurface: async () => { entitled = false; await f.answer("confirm", toolId).emitSurface(); },
  }), /admin.assistant.use/);
  assert.equal(f.cards(), afterCard ? 1 : 0);
  assert.equal(await f.settingsRepo.maxRevisionSeq(), 0);
});

test("chat clear validates the inherited model before opening a card", async () => {
  const f = await chatFixture();
  await seedChat(f, "localCli.model", "stale-workspace-model", "workspace");
  await seedChat(f, "localCli.model", "model-a");
  await assert.rejects(f.call("settings_clear_value", { namespace: "core.execution", key: "localCli.model", scope: "user" }, f.answer("confirm", "settings_clear_value")), /Unknown model.*stale-workspace-model/);
  assert.equal(f.cards(), 0);
  assert.equal((await f.settingsRepo.getUserValue({ workspaceId: "ws-1", settingId: "model-setting", principalId: "caller" }))?.valueJson, "model-a");
});

test("chat clear binds the inherited result even if both inherited choices are valid", async () => {
  const f = await chatFixture();
  f.deps.assistantAgentInventory = { ...f.deps.assistantAgentInventory!, listDetectedAssistantAgents: async () => [{ ...pickerAgents[0]!, models: [...pickerAgents[0]!.models, { id: "model-b", label: "Model B" }] }] };
  await seedChat(f, "localCli.model", "model-a", "workspace");
  await seedChat(f, "localCli.model", "model-a");
  await assert.rejects(f.call("settings_clear_value", { namespace: "core.execution", key: "localCli.model", scope: "user" }, {
    emitSurface: async () => { await seedChat(f, "localCli.model", "model-b", "workspace"); await f.answer("confirm", "settings_clear_value").emitSurface(); },
  }), /human did not confirm/);
  assert.equal((await f.settingsRepo.getUserValue({ workspaceId: "ws-1", settingId: "model-setting", principalId: "caller" }))?.state, "set");
});

test("chat Default consent is invalidated when its concrete model changes", async () => {
  const f = await chatFixture();
  await assert.rejects(f.call("settings_set_value", { namespace: "core.execution", key: "localCli.agentId", scope: "user", value: "new" }, {
    emitSurface: async () => {
      f.deps.assistantAgentInventory = { ...f.deps.assistantAgentInventory!, listDetectedAssistantAgents: async () => [{ ...pickerAgents[0]!, defaultModelResolution: { status: "resolved", id: "model-b", source: "cli", resolvedAt: "now", launchFingerprint: "changed" } }] };
      await f.answer().emitSurface();
    },
  }), /human did not confirm/);
});

for (const key of ["localCli.model", "localCli.reasoning"]) test(`chat confirmed empty ${key} resets independently of stale sibling axes`, async () => {
  const f = await chatFixture();
  await seedChat(f, "localCli.agentId", "removed-agent");
  await seedChat(f, "localCli.model", "stale-model", "workspace");
  await seedChat(f, "localCli.reasoning", "stale-effort", "workspace");
  const input = { namespace: "core.execution", key, scope: "user", value: "" };
  await assert.rejects(f.call("settings_set_value", input, f.answer("cancel")), /human did not confirm/);
  await f.call("settings_set_value", input, f.answer());
  const effective = await f.call("settings_get_effective", { namespace: "core.execution" }) as { data: { key: string; value: unknown; sourceLayer: string }[] };
  assert.equal(effective.data.find(row => row.key === key)?.value, "");
  assert.equal(effective.data.find(row => row.key === key)?.sourceLayer, "user");
  assert.equal(f.cards(), 2);
});

test("chat agent/model/effort writes wait for cards, persist only for the caller and are readable after reload", async () => {
  const f = await chatFixture();
  const input = { namespace: "core.execution", scope: "user" };
  for (const [key, value, settingId] of [["localCli.agentId", "new", "setting-1"], ["localCli.model", "model-a", "model-setting"], ["localCli.reasoning", "medium", "effort-setting"]]) {
    await set({ deps: { repo: f.settingsRepo, clock: f.deps.clock, ids: f.deps.idGen, principals: f.deps.principalRepo, authorize: f.deps.authorize },
      input: { namespace: "core.execution", key: key!, scope: "user", value: `other-${value}`, workspaceId: "ws-1", authWorkspaceId: "ws-1", callerPrincipalId: "other" } });
    await f.call("settings_set_value", { ...input, key, value }, { emitSurface: async () => {
      assert.equal(await f.settingsRepo.getUserValue({ workspaceId: "ws-1", settingId: settingId!, principalId: "caller" }), null, "nothing written before consent");
      await f.answer().emitSurface();
    } });
    assert.equal((await f.settingsRepo.getUserValue({ workspaceId: "ws-1", settingId: settingId!, principalId: "caller" }))?.valueJson, value);
    assert.equal((await f.settingsRepo.getUserValue({ workspaceId: "ws-1", settingId: settingId!, principalId: "other" }))?.valueJson, `other-${value}`);
    assert.equal(await f.settingsRepo.getWorkspaceValue({ workspaceId: "ws-1", settingId: settingId! }), null);
  }
  const effective = await f.call("settings_get_effective", { namespace: "core.execution" }) as { data: { key: string; value: unknown; sourceLayer: string }[] };
  assert.deepEqual(effective.data.map(row => [row.key, row.value, row.sourceLayer]).sort(), [["localCli.agentId", "new", "user"], ["localCli.model", "model-a", "user"], ["localCli.reasoning", "medium", "user"]]);
  assert.equal(f.cards(), 3);
});

test("chat refuses unknown ids with the dynamic list and never opens a card or writes", async () => {
  const f = await chatFixture();
  await assert.rejects(f.call("settings_set_value", { namespace: "core.execution", key: "localCli.model", scope: "user", value: "missing" }, f.answer()), /Unknown model.*Available models: model-a/);
  assert.equal(f.cards(), 0);
  assert.equal(await f.settingsRepo.maxRevisionSeq(), 0);
});

for (const decision of ["cancel", "typed"] as const) test(`chat ${decision} cannot approve a model change`, async () => {
  const f = await chatFixture();
  await assert.rejects(f.call("settings_set_value", { namespace: "core.execution", key: "localCli.model", scope: "user", value: "model-a" }, f.answer(decision)), /human did not confirm/);
  assert.equal(await f.settingsRepo.maxRevisionSeq(), 0);
});

test("chat refuses workspace selection edits and headless user edits", async () => {
  const f = await chatFixture();
  const input = { namespace: "core.execution", key: "localCli.model", value: "model-a" };
  await assert.rejects(f.call("settings_set_value", input, f.answer()), /scope='user'/);
  await assert.rejects(f.call("settings_set_value", { ...input, scope: "user" }), /NO_CONFIRMATION_CHANNEL/);
  assert.equal(await f.settingsRepo.maxRevisionSeq(), 0);
});

test("chat rejects a dependent runtime change while its model card is open", async () => {
  const f = await chatFixture();
  await assert.rejects(f.call("settings_set_value", { namespace: "core.execution", key: "localCli.model", scope: "user", value: "model-a" }, {
    emitSurface: async () => {
      await set({ deps: { repo: f.settingsRepo, clock: f.deps.clock, ids: f.deps.idGen, principals: f.deps.principalRepo, authorize: f.deps.authorize },
        input: { namespace: "core.execution", key: "localCli.agentId", scope: "user", value: "unavailable", workspaceId: "ws-1", authWorkspaceId: "ws-1", callerPrincipalId: "caller" } });
      await f.answer().emitSurface();
    },
  }), /Unknown or unavailable agent/);
  assert.equal(await f.settingsRepo.maxRevisionSeq(), 1, "only the independent runtime change was written");
});

test("chat model clear asks every time and only clears the caller's layer", async () => {
  const f = await chatFixture();
  const input = { namespace: "core.execution", key: "localCli.model", scope: "user" };
  await f.call("settings_set_value", { ...input, value: "model-a" }, f.answer());
  await assert.rejects(f.call("settings_clear_value", input, f.answer("cancel", "settings_clear_value")), /human did not confirm/);
  assert.equal((await f.settingsRepo.getUserValue({ workspaceId: "ws-1", settingId: "model-setting", principalId: "caller" }))?.valueJson, "model-a");
  await f.call("settings_clear_value", input, f.answer("confirm", "settings_clear_value"));
  assert.equal((await f.settingsRepo.getUserValue({ workspaceId: "ws-1", settingId: "model-setting", principalId: "caller" }))?.state, "cleared");
  assert.equal(f.cards(), 3);
});

test("chat revalidates the live catalog after confirmation", async () => {
  const f = await chatFixture();
  await assert.rejects(f.call("settings_set_value", { namespace: "core.execution", key: "localCli.model", scope: "user", value: "model-a" }, {
    emitSurface: async () => {
      // Default moves too: a resolved default stays a picker choice even outside the listed models.
      f.deps.assistantAgentInventory = { ...f.deps.assistantAgentInventory!, listDetectedAssistantAgents: async () => [{ ...pickerAgents[0]!, defaultModelResolution: { status: "resolved", id: "model-b", source: "cli", resolvedAt: "2026-10-01T00:00:00.000Z", launchFingerprint: "fixture-launch" }, models: [{ id: "model-b", label: "Model B" }] }] };
      await f.answer().emitSurface();
    },
  }), /Unknown model.*Available models: model-b/);
  assert.equal(await f.settingsRepo.maxRevisionSeq(), 0);
});

test("a protected alias cannot bypass chat catalog checks or use a remembered grant", async () => {
  const f = await chatFixture();
  const model = await f.settingsRepo.findActiveDefinition({ namespace: "core.execution", key: "localCli.model", workspaceId: null });
  assert.ok(model);
  await f.settingsRepo.saveDefinition({ ...model, settingId: "alias-setting", key: "mode", status: "alias", aliasOfNamespace: "core.execution", aliasOfKey: "localCli.model" });
  await assert.rejects(f.call("settings_set_value", { namespace: "core.execution", key: "mode", scope: "user", value: "missing" }, f.answer()), /Unknown model.*Available models: model-a/);
  assert.equal(f.cards(), 0);
  assert.equal(await f.settingsRepo.maxRevisionSeq(), 0);
  await f.call("settings_set_value", { namespace: "core.execution", key: "mode", scope: "user", value: "model-a" }, f.answer());
  assert.equal(f.cards(), 1);
  assert.equal((await f.settingsRepo.getUserValue({ workspaceId: "ws-1", settingId: "model-setting", principalId: "caller" }))?.valueJson, "model-a");
});

for (const [namespace, key] of [["core.execution", "localCli.permissionLevel"], ["core.execution", "mode"], ["core.execution", "byok.protocol"], ["core.execution", "byok.providerId"], ["core.execution", "byok.baseUrl"], ["core.execution", "localCli.agentId"]]) {
  for (const toolId of ["settings_set_value", "settings_clear_value"]) {
    test(`${toolId} ${namespace}.${key} refuses headless writes and model consent`, async () => {
      const f = fixture(namespace!, key!);
      const input = { namespace, key, ...(key === "localCli.agentId" ? { scope: "user" } : {}), ...(toolId === "settings_set_value" ? { value: "new" } : {}) };
      await assert.rejects(() => f.call(toolId, input), { name: "ToolInputError", message: `SETTINGS_NO_CONFIRMATION_CHANNEL: ${toolId}: this execution context has no interactive confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed.` });
      await assert.rejects(() => f.call(toolId, { ...input, confirmed: true }), /unexpected input 'confirmed'/);
      assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: "setting-1" }), []);
    });
  }
}

for (const decision of ["confirm", "cancel", "typed"] as const) {
  test(`real card ${decision} reaches the held call; only confirm mutates execution settings`, async () => {
    const f = fixture("core.execution", "mode", { type: "boolean" });
    const emitSurface: NonNullable<ToolExecutionOptions["emitSurface"]> = async (emission) => {
      assert.equal(emission.channel, "mcp-ui");
      assert.equal((await f.settingsRepo.listRevisions({ settingId: "setting-1" })).length, 0);
      assert.deepEqual(f.surfaceExchanges.deliver({ exchangeId: "exchange-1", principalId: "caller", params: { decision: "confirm" } }, { toolId: "settings_clear_value" }), { ok: false, reason: "binding-mismatch" });
      assert.deepEqual(f.surfaceExchanges.deliver({ exchangeId: "exchange-1", principalId: "other", params: { decision: "confirm" } }, { toolId: "settings_set_value" }), { ok: false, reason: "binding-mismatch" });
      assert.deepEqual(f.surfaceExchanges.deliver({ exchangeId: "exchange-1", principalId: "caller", params: decision === "typed" ? { __typedAnswer: "yes" } : { decision } }, { toolId: "settings_set_value" }), { ok: true });
    };
    const operation = () => f.call("settings_set_value", { namespace: "core.execution", key: "mode", value: true }, { emitSurface });
    if (decision === "confirm") {
      assert.deepEqual(await operation(), { key: "core.execution.mode", scope: "workspace", previous: null, value: true, revisionSeq: 1 });
      assert.equal((await f.settingsRepo.getWorkspaceValue({ workspaceId: "ws-1", settingId: "setting-1" }))?.valueJson, true);
    } else {
      await assert.rejects(operation, { name: "ToolInputError", message: "settings_set_value: the human did not confirm the change. Nothing was changed." });
      assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: "setting-1" }), []);
    }
    assert.equal(f.surfaceExchanges.size(), 0);
  });
}

test("clear runtime override waits for a human and falls back to default", async () => {
  const f = fixture("core.execution", "mode");
  const emitSurface = async () => { f.surfaceExchanges.deliver({ exchangeId: "exchange-1", principalId: "caller", params: { decision: "confirm" } }, { toolId: "settings_set_value" }); };
  await f.call("settings_set_value", { namespace: "core.execution", key: "mode", value: "local-cli" }, { emitSurface });
  const clearSurface = async () => { f.surfaceExchanges.deliver({ exchangeId: "exchange-1", principalId: "caller", params: { decision: "confirm" } }, { toolId: "settings_clear_value" }); };
  assert.deepEqual(await f.call("settings_clear_value", { namespace: "core.execution", key: "mode" }, { emitSurface: clearSurface }), { key: "core.execution.mode", scope: "workspace", previous: "local-cli", effective: "default" });
});

test("host site-title validation is honored by generic writes", async () => {
  const f = fixture("core.site", "title");
  await assert.rejects(() => f.call("settings_set_value", { namespace: "core.site", key: "title", value: " " }), { name: "ToolInputError", message: "settings_set_value: value for 'core.site.title' must be 1..200 characters after trimming. Call settings_list_definitions and use a value matching the setting's schema." });
  assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: "setting-1" }), []);
});

for (const [namespace, key] of [["core.execution", "byok.protocol"], ["core.execution", "localCli.permissionLevel"]] as const) {
  test(`${namespace}.${key} is writable after a human click`, async () => {
    const f = fixture(namespace, key);
    const emitSurface = async () => { f.surfaceExchanges.deliver({ exchangeId: "exchange-1", principalId: "caller", params: { decision: "confirm" } }, { toolId: "settings_set_value" }); };
    assert.deepEqual(await f.call("settings_set_value", { namespace, key, value: "new" }, { emitSurface }), { key: `${namespace}.${key}`, scope: "workspace", previous: null, value: "new", revisionSeq: 1 });
    assert.equal((await f.settingsRepo.getWorkspaceValue({ workspaceId: "ws-1", settingId: "setting-1" }))?.valueJson, "new");
  });
}

test("visitor-facing assistant requires saved credential readiness before its ordinary site-setting write", async () => {
  // public-assistant-settings.ts explicitly separates this switch from the admin assistant's
  // own permissions/runtime. Q5 requires cards only for the latter and privacy/instructions.
  const f = fixture("site.assistant", "public_enabled", { type: "boolean" });
  const input = { namespace: "site.assistant", key: "public_enabled" };
  await assert.rejects(() => f.call("settings_set_value", { ...input, value: true }), /usable provider key and a model/);
  assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: "setting-1" }), []);
  f.visitorReady();
  assert.deepEqual(await f.call("settings_set_value", { ...input, value: true }), { key: "site.assistant.public_enabled", scope: "workspace", previous: null, value: true, revisionSeq: 1 });
  assert.deepEqual(await f.call("settings_clear_value", input), { key: "site.assistant.public_enabled", scope: "workspace", previous: true, effective: false });
  assert.equal(f.surfaceExchanges.size(), 0);
  assert.equal((await f.settingsRepo.listRevisions({ settingId: "setting-1" })).length, 2);
});

test("aborting a held card closes it without a write", async () => {
  const f = fixture("core.execution", "byok.protocol");
  const controller = new AbortController();
  await assert.rejects(() => f.call("settings_set_value", { namespace: "core.execution", key: "byok.protocol", value: "new" }, { signal: controller.signal, emitSurface: async () => { controller.abort(); } }), { name: "ToolInputError", message: "settings_set_value: the human did not confirm the change. Nothing was changed." });
  assert.equal(f.surfaceExchanges.size(), 0);
  assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: "setting-1" }), []);
});

for (const toolId of ["settings_set_value", "settings_clear_value"] as const) {
  for (const decision of ["confirm", "cancel", "typed"] as const) {
    test(`${toolId}: real callback route delivers ${decision} to the held card without executing again`, async () => {
      const f = fixture("core.execution", "byok.protocol");
      let callback!: (req: Request, res: Response) => Promise<void>;
      let executions = 0;
      // Only the HTTP transport is replaced. The route's allowlist, identity parsing,
      // exchange delivery, card classification and settings write remain real.
      const app = { post: (path: string, handler: typeof callback) => { assert.equal(path, MCP_UI_TOOL_CALLS_PATH); callback = handler; } } as unknown as Express;
      const toolExecutor = { execute: async () => { executions++; throw new Error("a reply must not start another tool call"); } } as unknown as ToolExecutor;
      registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges: f.surfaceExchanges });
      const reply = async (toolName: string, principalId: string | undefined, params: Record<string, unknown>) => {
        const response = { statusCode: 200, body: undefined as unknown,
          status(code: number) { this.statusCode = code; return this; },
          json(body: unknown) { this.body = body; return this; },
        };
        const request = { get: (header: string) => header === RUN_PRINCIPAL_HEADER ? principalId : undefined, body: { toolName, exchangeId: "exchange-1", params } } as unknown as Request;
        await callback(request, response as unknown as Response);
        return { status: response.statusCode, body: response.body };
      };
      const emitSurface = async () => {
        assert.deepEqual(await reply(toolId, undefined, { decision: "confirm" }), { status: 401, body: { error: `${RUN_PRINCIPAL_HEADER} is required`, code: "UNAUTHENTICATED" } });
        const mismatch = { status: 409, body: { error: "that dialog is no longer waiting for an answer", code: "SURFACE_NOT_PENDING", reason: "binding-mismatch" } };
        assert.deepEqual(await reply(toolId, "other", { decision: "confirm" }), mismatch);
        assert.deepEqual(await reply(toolId === "settings_set_value" ? "settings_clear_value" : "settings_set_value", "caller", { decision: "confirm" }), mismatch);
        assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: "setting-1" }), []);
        assert.deepEqual(await reply(toolId, "caller", decision === "typed" ? { __typedAnswer: "yes" } : { decision }), { status: 202, body: { delivered: true } });
      };
      const input = { namespace: "core.execution", key: "byok.protocol", ...(toolId === "settings_set_value" ? { value: "new" } : {}) };
      const operation = () => f.call(toolId, input, { emitSurface });
      if (decision === "confirm") {
        assert.deepEqual(await operation(), toolId === "settings_set_value"
          ? { key: "core.execution.byok.protocol", scope: "workspace", previous: null, value: "new", revisionSeq: 1 }
          : { key: "core.execution.byok.protocol", scope: "workspace", previous: null, effective: "default" });
        assert.equal((await f.settingsRepo.listRevisions({ settingId: "setting-1" })).length, 1);
      } else {
        await assert.rejects(operation, { name: "ToolInputError", message: `${toolId}: the human did not confirm the change. Nothing was changed.` });
        assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: "setting-1" }), []);
      }
      assert.equal(executions, 0);
      assert.equal(f.surfaceExchanges.size(), 0);
    });
  }
}


for (const [key, value] of [["byok.model", "model-a"], ["byok.maxTokens", 512]] as const) {
  test(`ordinary execution preference ${key} sets and clears without a confirmation channel`, async () => {
    const f = fixture("core.execution", key, typeof value === "number" ? { type: "number" } : { type: "string" });
    const input = { namespace: "core.execution", key };
    assert.deepEqual(await f.call("settings_set_value", { ...input, value }), { key: `core.execution.${key}`, scope: "workspace", previous: null, value, revisionSeq: 1 });
    assert.equal((await f.settingsRepo.getWorkspaceValue({ workspaceId: "ws-1", settingId: "setting-1" }))?.valueJson, value);
    assert.deepEqual(await f.call("settings_clear_value", input), { key: `core.execution.${key}`, scope: "workspace", previous: value, effective: typeof value === "number" ? 0 : "default" });
    assert.equal(f.surfaceExchanges.size(), 0);
    assert.equal((await f.settingsRepo.listRevisions({ settingId: "setting-1" })).length, 2);
  });
}

for (const [namespace, key] of [["core.privacy", "telemetry.metrics"], ["core.instructions", "custom"]]) {
  test(`${namespace}.${key} is an ordinary edit without a card`, async () => {
    const f = fixture(namespace!, key!);
    await f.call("settings_set_value", { namespace, key, value: "new" }, { emitSurface: async () => assert.fail("ordinary edit asked") });
    assert.equal((await f.settingsRepo.listRevisions({ settingId: "setting-1" })).length, 1);
    assert.equal(f.surfaceExchanges.size(), 0);
  });
}

test("execution escalation asks once per plugin digest and saved grants do not bypass current authorization", async () => {
  const f = fixture("core.execution", "mode");
  let identity = "plugin@1/digest1", cards = 0;
  f.deps.approvalIdentityForRun = async () => ({ key: identity, label: "Example Plugin", version: identity });
  f.deps.nativeApprovalMemory = createNativeApprovalMemory({ store: createInMemoryConversationToolApprovalStore(), workspaceId: "ws-1", clock: { nowMs: () => 0 }, conversationIdForRun: () => "chat-1" });
  const write = (value: string) => f.call("settings_set_value", { namespace: "core.execution", key: "mode", value }, { emitSurface: async () => {
    cards++; f.surfaceExchanges.deliver({ exchangeId: "exchange-1", principalId: "caller", params: { decision: "confirm" } }, { toolId: "settings_set_value" });
  } });
  await write("first"); await write("second"); assert.equal(cards, 1);
  identity = "plugin@2/digest2"; await write("third"); assert.equal(cards, 2);
  f.deny();
  await assert.rejects(write("fourth"), {
    name: "ToolInputError",
    message: "settings_set_value: permission 'settings.workspace.write' is required. Ask the owner to grant it before retrying.",
  });
  assert.equal(cards, 2);
  assert.equal((await f.settingsRepo.getWorkspaceValue({ workspaceId: "ws-1", settingId: "setting-1" }))?.valueJson, "third");
});

test("a plugin identity changed during the human wait cannot change execution settings", async () => {
  const f = fixture("core.execution", "mode");
  let identity = "plugin@1/digest1";
  f.deps.approvalIdentityForRun = async () => ({ key: identity, label: "Example Plugin", version: identity });
  await assert.rejects(f.call("settings_set_value", { namespace: "core.execution", key: "mode", value: "new" }, { emitSurface: async () => {
    identity = "plugin@2/digest2";
    f.surfaceExchanges.deliver({ exchangeId: "exchange-1", principalId: "caller", params: { decision: "confirm" } }, { toolId: "settings_set_value" });
  } }), { message: "settings_set_value: the human did not confirm the change. Nothing was changed." });
  assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: "setting-1" }), []);
});

test("the invoking plugin's saved enable grant also covers execution settings without another ask", async () => {
  const f = fixture("core.execution", "mode");
  const memory = createNativeApprovalMemory({ store: createInMemoryConversationToolApprovalStore(), workspaceId: "ws-1", clock: { nowMs: () => 0 }, conversationIdForRun: () => "chat-1" });
  f.deps.nativeApprovalMemory = memory;
  f.deps.approvalIdentityForRun = async () => ({ key: "canonical-plugin-enable-key", label: "Example", version: "1" });
  await memory.grant({ ctx: { executionId: "exec", principal: { id: "caller" }, run: { id: "run-1" }, input: {}, signal: new AbortController().signal }, key: "canonical-plugin-enable-key", confirmer: { id: "caller", kind: "user" } });
  await f.call("settings_set_value", { namespace: "core.execution", key: "mode", value: "new" }, { emitSurface: async () => assert.fail("the same identity asked twice") });
  assert.equal(f.surfaceExchanges.size(), 0);
  assert.equal((await f.settingsRepo.getWorkspaceValue({ workspaceId: "ws-1", settingId: "setting-1" }))?.valueJson, "new");
});

for (const toolId of ["settings_set_value", "settings_clear_value"]) {
  for (const key of ["policy", "riskAcknowledgment"]) test(`${toolId} cannot widen permanent-delete access or forge its acknowledgment`, async () => {
    const f = fixture(ASSISTANT_PERMANENT_DELETES_NAMESPACE, key, { type: "json" });
    await assert.rejects(f.call(toolId, { namespace: ASSISTANT_PERMANENT_DELETES_NAMESPACE, key, ...(toolId === "settings_set_value" ? { value: { enabled: true, allowedToolIds: ["trash_empty"] } } : {}) }), (error: Error) => error.message.includes(ASSISTANT_PERMANENT_DELETES_WRITE_REASON));
    assert.equal((await f.settingsRepo.listRevisions({ settingId: "setting-1" })).length, 0);
    assert.equal(f.surfaceExchanges.size(), 0);
  });
}

test('normalization: registered dotted core.site.title succeeds; two registered splits fail without writing', async () => {
  const { executeRegisteredTool } = await import('../../../assistant/__tests__/fixtures/execute-registered-tool.js');
  const f = fixture('core.site', 'title');
  const registration = f.registrations.find(r => r.descriptor.id === 'settings_set_value')!;
  const input = { key: 'core.site.title', value: 'Mingjie Zhai' };
  const result = await executeRegisteredTool({ registration, input });
  assert.equal(result.status, 'completed');
  assert.equal((result.output as { value: string }).value, 'Mingjie Zhai');
  const definition = await f.settingsRepo.findActiveDefinition({ namespace: 'core.site', key: 'title', workspaceId: null });
  assert.ok(definition);
  await f.settingsRepo.saveDefinition({ ...definition, settingId: 'other-setting', namespace: 'core', key: 'site.title' });
  const ambiguous = await executeRegisteredTool({ registration, input: { ...input, value: 'must not write' } });
  assert.equal(ambiguous.errorKind, 'validation');
  assert.match(ambiguous.error!, /dotted key is ambiguous.*namespace=core.*namespace=core.site.*Send namespace and key explicitly/);
  assert.equal((await f.settingsRepo.listRevisions({ settingId: 'setting-1' })).length, 1);
});

test('delegated normalization: dotted settings persist once and an ambiguous registered split refuses without a revision', async () => {
  const { executeDelegatedRegisteredTool, delegatedText } = await import('../../../assistant/__tests__/fixtures/execute-registered-tool.js');
  const f = fixture('core.site', 'title');
  const registration = f.registrations.find(r => r.descriptor.id === 'settings_set_value')!;
  const reply = await executeDelegatedRegisteredTool({ registration, input: { key: 'core.site.title', value: 'Mingjie Zhai' } });
  const visible = JSON.parse(delegatedText(reply));
  assert.equal(visible.status, 'completed');
  assert.equal(visible.output.value, 'Mingjie Zhai');
  const before = await f.settingsRepo.listRevisions({ settingId: 'setting-1' });
  assert.equal(before.length, 1);
  const definition = await f.settingsRepo.findActiveDefinition({ namespace: 'core.site', key: 'title', workspaceId: null });
  assert.ok(definition);
  await f.settingsRepo.saveDefinition({ ...definition, settingId: 'other-setting', namespace: 'core', key: 'site.title' });
  const refused = await executeDelegatedRegisteredTool({ registration, input: { key: 'core.site.title', value: 'bad' } });
  assert.equal(refused.isError, true);
  assert.match(delegatedText(refused), /dotted key is ambiguous/);
  assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: 'setting-1' }), before);
});

for (const scope of ['user', 'workspace'] as const) {
  test(`Agent plugins ${scope} writes and clears always ask, even with a saved plugin grant`, async () => {
    const f = fixture('core.interface', 'chatAgentPlugins', { type: 'enum', values: ['auto', 'ask', 'off'] });
    f.deps.approvalIdentityForRun = async () => ({ key: 'already-approved-plugin', label: 'Example' });
    f.deps.nativeApprovalMemory = {
      has: async () => assert.fail('Agent plugins must not consult saved grants'),
      grant: async () => assert.fail('Agent plugins must not save approval grants'),
    };
    const input = { namespace: 'core.interface', key: 'chatAgentPlugins', scope };
    let cards = 0;
    const answer = (toolId: string, decision: 'confirm' | 'cancel') => ({ emitSurface: async () => {
      cards++;
      assert.deepEqual(f.surfaceExchanges.deliver({ exchangeId: 'exchange-1', principalId: 'other', params: { decision: 'confirm' } }, { toolId }), { ok: false, reason: 'binding-mismatch' });
      assert.deepEqual(f.surfaceExchanges.deliver({ exchangeId: 'exchange-1', principalId: 'caller', params: { decision } }, { toolId }), { ok: true });
    } });
    const read = () => scope === 'user'
      ? f.settingsRepo.getUserValue({ workspaceId: 'ws-1', settingId: 'setting-1', principalId: 'caller' })
      : f.settingsRepo.getWorkspaceValue({ workspaceId: 'ws-1', settingId: 'setting-1' });
    for (const value of ['auto', 'ask', 'off']) {
      await f.call('settings_set_value', { ...input, value }, answer('settings_set_value', 'confirm'));
      assert.equal((await read())?.valueJson, value);
    }
    assert.equal(cards, 3);
    await assert.rejects(f.call('settings_set_value', { ...input, value: 'auto' }, answer('settings_set_value', 'cancel')), /human did not confirm/);
    await assert.rejects(f.call('settings_clear_value', input, answer('settings_clear_value', 'cancel')), /human did not confirm/);
    assert.equal((await read())?.valueJson, 'off');
    assert.equal((await f.settingsRepo.listRevisions({ settingId: 'setting-1' })).length, 3);
    await assert.rejects(f.call('settings_set_value', { ...input, value: 'auto' }), /NO_CONFIRMATION_CHANNEL/);
    await assert.rejects(f.call('settings_set_value', { ...input, value: 'invalid' }), /does not match/);
    for (const toolId of ['settings_set_value', 'settings_clear_value']) {
      await assert.rejects(f.call(toolId, { ...input, ...(toolId === 'settings_set_value' ? { value: 'auto' } : {}), principalId: 'other' }), /unexpected input 'principalId'/);
    }
    assert.equal(await f.settingsRepo.getUserValue({ workspaceId: 'ws-1', settingId: 'setting-1', principalId: 'other' }), null);
    await f.call('settings_clear_value', input, answer('settings_clear_value', 'confirm'));
    assert.equal((await read())?.state, 'cleared');
    assert.equal(cards, 6);
    assert.equal(f.surfaceExchanges.size(), 0);
    const listed = await f.call('settings_list_definitions', {}) as { data: { agentWritable: boolean; confirmationRequired: boolean }[] };
    assert.equal(listed.data[0]!.agentWritable, true);
    assert.equal(listed.data[0]!.confirmationRequired, true);
  });
}

// Delivery bindings route every new submission's answers to outside destinations, and the receiver
// decides where a static site's visitors submit: an agent must never change either without a human,
// and a plugin's saved escalation grant does not cover them.
for (const [key, schema, value, reason] of [
  ["deliveryBindings", { type: "json" }, [], "Changes where new form submissions are sent"],
  ["receiver", { type: "string" }, "none", "Changes which receiver collects your published site's form submissions"],
] as const) {
  test(`core.forms.${key} asks a human every time and writes nothing on decline`, async () => {
    const f = fixture("core.forms", key, schema as SettingDefinitionRecord["schema"]);
    f.deps.approvalIdentityForRun = async () => ({ key: "already-approved-plugin", label: "Example" });
    f.deps.nativeApprovalMemory = { has: async () => true, grant: async () => undefined };
    const cards: string[] = [];
    const answer = (decision: "confirm" | "cancel") => ({ emitSurface: async (emission: unknown) => {
      cards.push(JSON.stringify(emission));
      assert.deepEqual(f.surfaceExchanges.deliver({ exchangeId: "exchange-1", principalId: "caller", params: { decision } }, { toolId: "settings_set_value" }), { ok: true });
    } });
    await assert.rejects(f.call("settings_set_value", { namespace: "core.forms", key, value }), /SETTINGS_NO_CONFIRMATION_CHANNEL/);
    await assert.rejects(f.call("settings_set_value", { namespace: "core.forms", key, value }, answer("cancel")), { message: "settings_set_value: the human did not confirm the change. Nothing was changed." });
    assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: "setting-1" }), []);
    await f.call("settings_set_value", { namespace: "core.forms", key, value }, answer("confirm"));
    assert.equal(cards.length, 2);
    assert.ok(cards[0]!.includes(reason), "the card says what the change does");
    assert.deepEqual((await f.settingsRepo.getWorkspaceValue({ workspaceId: "ws-1", settingId: "setting-1" }))?.valueJson, value);
  });
}

test("core.forms.receiver cleared by an agent asks a human every time, even with a saved plugin grant", async () => {
  const f = fixture("core.forms", "receiver");
  f.deps.approvalIdentityForRun = async () => ({ key: "already-approved-plugin", label: "Example" });
  f.deps.nativeApprovalMemory = { has: async () => true, grant: async () => undefined };
  await assert.rejects(f.call("settings_clear_value", { namespace: "core.forms", key: "receiver" }), /SETTINGS_NO_CONFIRMATION_CHANNEL/);
});

test("a confirmed agent write of delivery bindings with a secret in config is still refused by the host chokepoint, and nothing is stored", async () => {
  const f = fixture("core.forms", "deliveryBindings", { type: "json" });
  const secretConfig = [{ bindingId: "b1", adapterId: "rows", connectionRef: "conn-1", enabled: true, config: { apiKey: "k".repeat(12) } }];
  const confirm = { emitSurface: async () => {
    assert.deepEqual(f.surfaceExchanges.deliver({ exchangeId: "exchange-1", principalId: "caller", params: { decision: "confirm" } }, { toolId: "settings_set_value" }), { ok: true });
  } };
  await assert.rejects(f.call("settings_set_value", { namespace: "core.forms", key: "deliveryBindings", value: secretConfig }, confirm),
    /"config\.apiKey" is named like a secret/);
  assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: "setting-1" }), []);
});

for (const toolId of ['settings_set_value', 'settings_clear_value']) test(`${toolId} cannot bypass cookie consent confirmation through legacy scalar settings`, async () => {
  const f = fixture('core.consent', 'enabled', { type: 'boolean' });
  // why: strict tool schemas — settings_clear_value takes no 'value', so only the setter sends one.
  const input = toolId === 'settings_set_value' ? { namespace: 'core.consent', key: 'enabled', value: true } : { namespace: 'core.consent', key: 'enabled' };
  await assert.rejects(f.call(toolId, input), /consent_update_settings|consent_publish_settings/);
  assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: 'setting-1' }), []);
});

for (const key of ['provider', 'testMode']) for (const toolId of ['settings_set_value', 'settings_clear_value']) test(`${toolId} cannot change core.mail.${key}; only the approval-gated mail tool can`, async () => {
  const f = fixture('core.mail', key, { type: 'json' });
  const input = toolId === 'settings_set_value' ? { namespace: 'core.mail', key, value: { transactional: 'smtp', bulk: 'smtp' } } : { namespace: 'core.mail', key };
  await assert.rejects(f.call(toolId, input), key === 'provider' ? /mail_set_provider/ : /test mode/);
  assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: 'setting-1' }), []);
});

test("a host's extra denied namespace is refused, and with no injected writer the host settings chokepoint stores the value", async () => {
  const f = fixture("core.site", "title");
  const { set: _injected, ...withoutWriter } = f.deps;
  const deps = { ...withoutWriter, extraDeniedSettings: [{ namespace: "core.locked", reason: "Locked by the host for this test." }] } as SettingsToolDeps;
  const registrations = contributeSettingsTools().build(deps as never, { surfaceExchanges: f.surfaceExchanges });
  const handler = (toolId: string, input: Record<string, unknown>) =>
    registrations.find((r) => r.descriptor.id === toolId)!.handler({ executionId: "exec-2", principal: { id: "caller" }, run: { id: "run-2" }, signal: new AbortController().signal, input }, {});

  await assert.rejects(handler("settings_set_value", { namespace: "core.locked", key: "anything", value: "x" }),
    (error: Error) => error.message.includes("Locked by the host for this test."));
  assert.deepEqual(await handler("settings_set_value", { namespace: "core.site", key: "title", value: "  Trimmed title  " }),
    { key: "core.site.title", scope: "workspace", previous: null, value: "Trimmed title", revisionSeq: 1 });
});
