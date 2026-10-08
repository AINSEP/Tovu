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


function fixture(namespace: string, key: string, schema: SettingDefinitionRecord["schema"] = { type: "string" }) {
  const definition: SettingDefinitionRecord = {
    settingId: "setting-1", version: 1, workspaceId: namespace.startsWith("site.") ? "ws-1" : null,
    namespace, key, ownerKind: namespace.startsWith("site.") ? "site" : "core", ownerId: null,
    schema, defaultValue: schema.type === "boolean" ? false : schema.type === "number" ? 0 : "default", scopes: 6, secret: false,
    status: "active", aliasOfNamespace: null, aliasOfKey: null, coercionTag: null,
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  };
  const settingsRepo = new InMemorySettingsRepo({ definitions: [definition] });
  let allowed = true;
  const deps = {
    workspaceId: "ws-1", settingsRepo, settingsReady: Promise.resolve(), settingsUiTabsReady: Promise.resolve(),
    clock: { nowMs: () => Date.parse(definition.createdAt) }, idGen: { newId: () => "unused" },
    principalRepo: { findById: async () => null }, authorize: async () => ({ allowed, reason: allowed ? "matched" : "insufficient_permission" }),
  } as unknown as SettingsToolDeps;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => "exchange-1" }, defaultChannel: "mcp-ui" });
  const registrations = contributeSettingsTools().build(deps as never, { surfaceExchanges });
  const call = (toolId: string, input: Record<string, unknown>, extras: Partial<ToolExecutionContext> & ToolExecutionOptions = {}) => {
    const registration = registrations.find((r) => r.descriptor.id === toolId);
    assert.ok(registration, `expected '${toolId}' to be wired`);
    const { emitSurface, ...contextExtras } = extras;
    return registration.handler({ executionId: "exec-1", principal: { id: "caller" }, run: { id: "run-1" }, signal: new AbortController().signal, input, ...contextExtras }, { emitSurface });
  };
  return { settingsRepo, registrations, surfaceExchanges, call, deps, deny: () => { allowed = false; } };
}

test("normal setting runs directly and both writes are durable, not readOnly", async () => {
  const f = fixture("core.presentation", "timezone");
  assert.deepEqual(await f.call("settings_set_value", { namespace: "core.presentation", key: "timezone", value: "Pacific" }), { key: "core.presentation.timezone", scope: "workspace", previous: null, value: "Pacific", revisionSeq: 1 });
  assert.equal(f.surfaceExchanges.size(), 0);
  for (const toolId of ["settings_set_value", "settings_clear_value"]) assert.equal(f.registrations.find((r) => r.descriptor.id === toolId)!.descriptor.readOnly, false);
});

for (const [namespace, key] of [["core.execution", "localCli.permissionLevel"], ["core.execution", "mode"], ["core.execution", "byok.protocol"], ["core.execution", "byok.providerId"], ["core.execution", "byok.baseUrl"], ["core.execution", "localCli.agentId"]]) {
  for (const toolId of ["settings_set_value", "settings_clear_value"]) {
    test(`${toolId} ${namespace}.${key} refuses headless writes and model consent`, async () => {
      const f = fixture(namespace!, key!);
      const input = { namespace, key, ...(toolId === "settings_set_value" ? { value: "new" } : {}) };
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

test("visitor-facing assistant availability is an ordinary site setting and runs without a card", async () => {
  // public-assistant-settings.ts explicitly separates this switch from the admin assistant's
  // own permissions/runtime. Q5 requires cards only for the latter and privacy/instructions.
  const f = fixture("site.assistant", "public_enabled", { type: "boolean" });
  const input = { namespace: "site.assistant", key: "public_enabled" };
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


for (const [key, value] of [["byok.model", "model-a"], ["byok.maxTokens", 512], ["localCli.model", "model-a"], ["localCli.reasoning", "medium"]] as const) {
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
