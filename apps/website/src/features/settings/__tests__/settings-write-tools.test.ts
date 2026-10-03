import assert from "node:assert/strict";
import test from "node:test";
import type { Express, Request, Response } from "express";
import type { ToolExecutionContext } from "@jini-ai/core";
import type { ToolExecutor } from "@jini-ai/daemon";
import { InMemorySettingsRepo, type SettingDefinitionRecord, type SettingsToolDeps } from "@jini-ai/cms/settings";
import { contributeSettingsTools } from "../tool-registrations.js";
import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "#src/assistant/mcp-ui-tool-calls-route";
import { RUN_PRINCIPAL_HEADER } from "#src/assistant/run-ownership";

function fixture(namespace: string, key: string, schema: SettingDefinitionRecord["schema"] = { type: "string" }) {
  const definition: SettingDefinitionRecord = {
    settingId: "setting-1", version: 1, workspaceId: namespace.startsWith("site.") ? "ws-1" : null,
    namespace, key, ownerKind: namespace.startsWith("site.") ? "site" : "core", ownerId: null,
    schema, defaultValue: schema.type === "boolean" ? false : schema.type === "number" ? 0 : "default", scopes: 6, secret: false,
    status: "active", aliasOfNamespace: null, aliasOfKey: null, coercionTag: null,
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  };
  const settingsRepo = new InMemorySettingsRepo({ definitions: [definition] });
  const deps = {
    workspaceId: "ws-1", settingsRepo, settingsReady: Promise.resolve(), settingsUiTabsReady: Promise.resolve(),
    clock: { nowIso: () => definition.createdAt }, idGen: { newId: () => "unused" },
    principalRepo: { findById: async () => null }, authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as SettingsToolDeps;
  const surfaceExchanges = createSurfaceExchangeStore({ newExchangeId: () => "exchange-1" });
  const registrations = contributeSettingsTools().build(deps as never, { surfaceExchanges });
  const call = (toolId: string, input: Record<string, unknown>, extras: Partial<ToolExecutionContext> = {}) => {
    const registration = registrations.find((r) => r.descriptor.id === toolId);
    assert.ok(registration, `expected '${toolId}' to be wired`);
    return registration.handler({ executionId: "exec-1", principal: { id: "caller" }, run: { id: "run-1" }, signal: new AbortController().signal, input, ...extras });
  };
  return { settingsRepo, registrations, surfaceExchanges, call, deps };
}

test("normal setting runs directly and both writes are durable, not readOnly", async () => {
  const f = fixture("core.presentation", "timezone");
  assert.deepEqual(await f.call("settings_set_value", { namespace: "core.presentation", key: "timezone", value: "Pacific" }), { key: "core.presentation.timezone", scope: "workspace", previous: null, value: "Pacific", revisionSeq: 1 });
  assert.equal(f.surfaceExchanges.size(), 0);
  for (const toolId of ["settings_set_value", "settings_clear_value"]) assert.equal(f.registrations.find((r) => r.descriptor.id === toolId)!.descriptor.readOnly, false);
});

for (const [namespace, key] of [["core.privacy", "telemetry.metrics"], ["core.instructions", "custom"], ["core.execution", "localCli.permissionLevel"], ["core.execution", "mode"], ["core.execution", "byok.protocol"], ["core.execution", "byok.providerId"], ["core.execution", "byok.baseUrl"], ["core.execution", "localCli.agentId"]]) {
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
  test(`real card ${decision} reaches the held call; only confirm mutates privacy`, async () => {
    const f = fixture("core.privacy", "telemetry.metrics", { type: "boolean" });
    const emitSurface: NonNullable<ToolExecutionContext["emitSurface"]> = async (emission) => {
      assert.equal(emission.channel, "mcp-ui");
      assert.equal((await f.settingsRepo.listRevisions({ settingId: "setting-1" })).length, 0);
      assert.deepEqual(f.surfaceExchanges.deliver({ exchangeId: "exchange-1", toolId: "settings_clear_value", principalId: "caller", params: { decision: "confirm" } }), { ok: false, reason: "binding-mismatch" });
      assert.deepEqual(f.surfaceExchanges.deliver({ exchangeId: "exchange-1", toolId: "settings_set_value", principalId: "other", params: { decision: "confirm" } }), { ok: false, reason: "binding-mismatch" });
      assert.deepEqual(f.surfaceExchanges.deliver({ exchangeId: "exchange-1", toolId: "settings_set_value", principalId: "caller", params: decision === "typed" ? { __typedAnswer: "yes" } : { decision } }), { ok: true });
    };
    const operation = () => f.call("settings_set_value", { namespace: "core.privacy", key: "telemetry.metrics", value: true }, { emitSurface });
    if (decision === "confirm") {
      assert.deepEqual(await operation(), { key: "core.privacy.telemetry.metrics", scope: "workspace", previous: null, value: true, revisionSeq: 1 });
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
  const emitSurface = async () => { f.surfaceExchanges.deliver({ exchangeId: "exchange-1", toolId: "settings_set_value", principalId: "caller", params: { decision: "confirm" } }); };
  await f.call("settings_set_value", { namespace: "core.execution", key: "mode", value: "local-cli" }, { emitSurface });
  const clearSurface = async () => { f.surfaceExchanges.deliver({ exchangeId: "exchange-1", toolId: "settings_clear_value", principalId: "caller", params: { decision: "confirm" } }); };
  assert.deepEqual(await f.call("settings_clear_value", { namespace: "core.execution", key: "mode" }, { emitSurface: clearSurface }), { key: "core.execution.mode", scope: "workspace", previous: "local-cli", effective: "default" });
});

test("host site-title validation is honored by generic writes", async () => {
  const f = fixture("core.site", "title");
  await assert.rejects(() => f.call("settings_set_value", { namespace: "core.site", key: "title", value: " " }), { name: "ToolInputError", message: "settings_set_value: value for 'core.site.title' must be 1..200 characters after trimming. Call settings_list_definitions and use a value matching the setting's schema." });
  assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: "setting-1" }), []);
});

for (const [namespace, key] of [["core.instructions", "custom"], ["core.execution", "localCli.permissionLevel"]] as const) {
  test(`${namespace}.${key} is writable after a human click`, async () => {
    const f = fixture(namespace, key);
    const emitSurface = async () => { f.surfaceExchanges.deliver({ exchangeId: "exchange-1", toolId: "settings_set_value", principalId: "caller", params: { decision: "confirm" } }); };
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
  const f = fixture("core.instructions", "custom");
  const controller = new AbortController();
  await assert.rejects(() => f.call("settings_set_value", { namespace: "core.instructions", key: "custom", value: "new" }, { signal: controller.signal, emitSurface: async () => { controller.abort(); } }), { name: "ToolInputError", message: "settings_set_value: the human did not confirm the change. Nothing was changed." });
  assert.equal(f.surfaceExchanges.size(), 0);
  assert.deepEqual(await f.settingsRepo.listRevisions({ settingId: "setting-1" }), []);
});

for (const toolId of ["settings_set_value", "settings_clear_value"] as const) {
  for (const decision of ["confirm", "cancel", "typed"] as const) {
    test(`${toolId}: real callback route delivers ${decision} to the held card without executing again`, async () => {
      const f = fixture("core.instructions", "custom");
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
      const input = { namespace: "core.instructions", key: "custom", ...(toolId === "settings_set_value" ? { value: "new" } : {}) };
      const operation = () => f.call(toolId, input, { emitSurface });
      if (decision === "confirm") {
        assert.deepEqual(await operation(), toolId === "settings_set_value"
          ? { key: "core.instructions.custom", scope: "workspace", previous: null, value: "new", revisionSeq: 1 }
          : { key: "core.instructions.custom", scope: "workspace", previous: null, effective: "default" });
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
