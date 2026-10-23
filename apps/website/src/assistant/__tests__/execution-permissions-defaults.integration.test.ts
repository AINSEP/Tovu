import assert from "node:assert/strict";
import test from "node:test";
import { InMemorySettingsRepo, ensureSettingDefinitions, getEffective, set } from "@jini-ai/core/settings";
import { ensureExecutionSettingDefinitions } from "../execution-mode-settings.js";
import { readAssistantCliPermissions } from "../subagent-settings.js";
import { resolveAssistantCliPermissions } from "../../contracts/core/assistant-native-fallbacks.js";

const localDefaults = {
  shell: true, fileWrite: true, userMcp: false, subagents: true,
  userSettings: true, web: true, workflows: true, loginEnvironment: true,
};

async function bootDefinitions() {
  let nextId = 0;
  const deps = {
    settingsRepo: new InMemorySettingsRepo(),
    clock: { nowMs: () => Date.parse("2026-10-17T00:00:00Z") },
    ids: { newId: () => `execution-default-${++nextId}` },
    principals: { findActiveById: async ({ id }: { id: string }) => ({ id }) },
    ensureSettingDefinitions,
  };
  // A6: use the real registrar/validation/ledger, not a callback that accepts any default.
  await ensureExecutionSettingDefinitions(deps, { systemPrincipalId: "boot" });
  const read = () => readAssistantCliPermissions({ ...deps, getEffective, settingsReady: Promise.resolve(), workspaceId: "site-a", principalId: "owner-a" });
  return { deps, read };
}

test("A4/A6: untouched local owner permissions default personal MCP OFF and other capabilities ON", async () => {
  const { deps, read } = await bootDefinitions();
  assert.deepEqual(await getEffective({ repo: deps.settingsRepo }, {
    namespace: "core.assistant-full-cli", key: "permissions", scopeContext: { workspaceId: "site-a", principalId: "owner-a" },
  }), { value: {}, sourceLayer: "default", defVersion: 1 });
  const settings = await read();
  assert.deepEqual(settings, { enabled: true, capabilities: localDefaults });
  assert.deepEqual(resolveAssistantCliPermissions({ isOwner: true, env: {}, settings }), settings);
});

test("A6: empty definition default inherits a persisted legacy OFF, including after another boot", async () => {
  const { deps, read } = await bootDefinitions();
  assert.deepEqual((await read()).capabilities, localDefaults);
  await set({ deps: { ...deps, repo: deps.settingsRepo, authorize: async () => ({ allowed: true, reason: "fixture" }) }, input: {
    namespace: "core.assistant-full-cli", key: "enabled", scope: "workspace", workspaceId: "site-a",
    value: false, callerPrincipalId: "owner-a", authWorkspaceId: "site-a",
  } });
  await ensureExecutionSettingDefinitions(deps, { systemPrincipalId: "boot" });
  assert.deepEqual(await read(), { enabled: false, capabilities: {
    shell: false, fileWrite: false, userMcp: false, subagents: false,
    userSettings: false, web: false, workflows: false, loginEnvironment: false,
  } });
});
