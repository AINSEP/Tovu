import assert from "node:assert/strict";
import test from "node:test";

import { assistantCliPermissions, fullCliEnvLock, isHostedAssistantRuntime, resolveAssistantCliPermissions, resolveAssistantDisallowedTools, resolveFullCliAccess } from "../assistant-native-fallbacks.js";
import { ASSISTANT_CLI_CAPABILITIES, ASSISTANT_CLI_PERMISSIONS_KEY, ASSISTANT_SUBAGENTS_KEY, ASSISTANT_SUBAGENTS_NAMESPACE, CLI_CAPABILITY_KEYS } from "../assistant-subagents-policy.js";
import { evaluateHostSignals, selectCoreHostSignalDeclaration, type HostSignalDeclaration } from "../host-signals.js";

const legacy: HostSignalDeclaration = {
  signals: [
    { env: "FLY_APP_NAME", label: "Fly.io (FLY_APP_NAME)", facts: { nativeToolsRestricted: true, trustProxyHops: 1, hosted: true } },
    { env: "FLY_MACHINE_ID", facts: { nativeToolsRestricted: true } },
    { env: "FLY_ALLOC_ID", facts: { nativeToolsRestricted: true } },
  ],
};
const additional = { env: "EDGE_PROXY", label: "Edge", facts: { trustProxyHops: 2 } } as const;

test("host declarations cannot replace the security fallback with incomplete, altered, or duplicate signals", () => {
  const extended = { signals: [additional, ...legacy.signals] };
  assert.equal(selectCoreHostSignalDeclaration({ declaration: extended }), extended);
  const [app, machine, alloc] = legacy.signals;
  for (const declaration of [undefined, { signals: [app, machine] }, { signals: [...legacy.signals, alloc] },
    { signals: [{ ...app, label: "Different" }, machine, alloc] },
    { signals: [{ ...app, facts: { ...app.facts, trustProxyHops: 2 } }, machine, alloc] },
    { signals: [{ ...machine, facts: { hosted: true, nativeToolsRestricted: true } }, app, alloc] }]) {
    assert.deepEqual(selectCoreHostSignalDeclaration({ declaration }), {
      ...legacy, deploymentAdvice: "Set TOVU_RUNTIME_MODE=production (fly.toml and docker-compose.yml already do).",
    });
  }
});

test("signals retain legacy env truthiness, distinguish restrictions from hosting, and suppress conflicting proxy hops", () => {
  assert.deepEqual(evaluateHostSignals({ env: { FLY_MACHINE_ID: "0", FLY_APP_NAME: "" }, declaration: legacy }),
    { hosted: false, nativeToolsRestricted: true, trustProxyHops: undefined, labels: [] });
  const declaration = { signals: [...legacy.signals, additional], deploymentAdvice: "Check your edge." };
  const app = { hosted: true, nativeToolsRestricted: true, trustProxyHops: 1, labels: ["Fly.io (FLY_APP_NAME)"], deploymentAdvice: "Check your edge." };
  assert.deepEqual(evaluateHostSignals({ env: { FLY_APP_NAME: " " }, declaration }), app);
  assert.deepEqual(evaluateHostSignals({ env: { FLY_APP_NAME: "site", EDGE_PROXY: "enabled" }, declaration }),
    { ...app, trustProxyHops: undefined, labels: ["Fly.io (FLY_APP_NAME)", "Edge"] });
  assert.deepEqual(evaluateHostSignals({ env: {}, declaration: legacy }),
    { hosted: false, nativeToolsRestricted: false, trustProxyHops: undefined, labels: [] });
});

test("native CLI grants require an owner, a local runtime and no machine lock", () => {
  for (const env of [{ TOVU_RUNTIME_MODE: "production" }, { TOVU_HOSTED: "1" }, { TOVU_HOSTED: "true" },
    { FLY_ALLOC_ID: "alloc" }, { TOVU_PUBLIC_URL: "https://my-site.tovu.dev:8443/blog" }]) {
    assert.equal(isHostedAssistantRuntime({ env }), true);
    assert.equal(resolveFullCliAccess({ isOwner: true, setting: true, env }), false);
  }
  const local = { TOVU_PUBLIC_URL: "https://tovu.dev.example.test/blog" };
  assert.equal(resolveFullCliAccess({ isOwner: true, env: local }), true);
  assert.equal(resolveFullCliAccess({ isOwner: false, env: local, setting: true }), false);
  assert.equal(resolveFullCliAccess({ isOwner: true, env: local, setting: false }), false);
  assert.equal(resolveFullCliAccess({ isOwner: true, env: local }, {
    hostSignals: { hosted: false, nativeToolsRestricted: true, labels: ["Edge"] },
  }), false);
  for (const [env, key] of [
    [{ TOVU_AGENT_PERMISSION_MODE: "restricted", TOVU_AGENT_FORBID_BASH: "1" }, "TOVU_AGENT_PERMISSION_MODE"],
    [{ TOVU_AGENT_FORBID_BASH: "1", TOVU_AGENT_FULL_CLI_ACCESS: "0" }, "TOVU_AGENT_FORBID_BASH"],
    [{ TOVU_AGENT_FULL_CLI_ACCESS: "0", TOVU_AGENT_NATIVE_FALLBACKS: "false" }, "TOVU_AGENT_FULL_CLI_ACCESS"],
    [{ TOVU_AGENT_NATIVE_FALLBACKS: "false" }, "TOVU_AGENT_NATIVE_FALLBACKS"],
  ] as const) {
    assert.equal(fullCliEnvLock({ env }), key);
    assert.equal(resolveFullCliAccess({ isOwner: true, env }), false, key);
  }
});

test("per-agent capability choices do not leak to other agents or bypass the hosted grant gate", () => {
  const byAgent = { reviewer: { enabled: true, capabilities: { shell: false, web: true } } };
  const defaults = { shell: false, fileWrite: false, userMcp: true, subagents: false, userSettings: false, web: false, workflows: false, loginEnvironment: false };
  const settings = assistantCliPermissions({ enabled: false, capabilities: { userMcp: true }, byAgent });
  assert.deepEqual(settings, { enabled: false, capabilities: defaults, byAgent });
  assert.deepEqual(resolveAssistantCliPermissions({ isOwner: true, env: {}, settings, agentId: "reviewer" }),
    { enabled: true, capabilities: { ...defaults, web: true }, byAgent });
  assert.deepEqual(resolveAssistantCliPermissions({ isOwner: true, env: {}, settings }), settings);
  assert.deepEqual(resolveAssistantCliPermissions({ isOwner: true, env: {}, settings, agentId: "writer" }), settings);
  assert.deepEqual(resolveAssistantCliPermissions({ isOwner: true, env: { TOVU_HOSTED: "1" }, settings, agentId: "reviewer" }),
    { enabled: false, capabilities: { ...defaults, userMcp: false } });
});

test("a granted projection without per-agent choices adds no byAgent key, only the projected capabilities", () => {
  const defaults = { shell: false, fileWrite: false, userMcp: false, subagents: false, userSettings: false, web: true, workflows: false, loginEnvironment: false };
  const settings = assistantCliPermissions({ enabled: false, capabilities: { web: true } });
  const resolved = resolveAssistantCliPermissions({ isOwner: true, env: {}, settings, agentId: "reviewer" });
  assert.deepEqual(resolved, { enabled: false, capabilities: defaults });
  assert.deepEqual(Object.keys(resolved).sort(), ["capabilities", "enabled"]);
});

test("only an explicit native grant removes tool denies, and protected read paths remain denied", () => {
  const paths = ["Read(//**/.tovu/**)", "Read(~/.tovu/**)", "Read(//**/*-key*.hex)", "Read(//proc/**)"];
  assert.deepEqual(resolveAssistantDisallowedTools({ nativeToolAccess: true }), paths);
  const denied = resolveAssistantDisallowedTools({ agentId: "reviewer", subagentsEnabled: true });
  for (const tool of ["Bash", "Edit", "Agent", "Task", "Workflow", ...paths]) assert.ok(denied.includes(tool), tool);
});

test("the Full CLI settings catalog maps each unique capability to display copy and keeps persisted setting keys", () => {
  const projected = assistantCliPermissions({ enabled: true }).capabilities;
  assert.deepEqual([ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_SUBAGENTS_KEY, ASSISTANT_CLI_PERMISSIONS_KEY],
    ["core.assistant-full-cli", "enabled", "permissions"]);
  assert.deepEqual(CLI_CAPABILITY_KEYS, ["shell", "fileWrite", "userMcp", "subagents", "userSettings", "web", "workflows", "loginEnvironment"]);
  assert.deepEqual(Object.keys(projected), CLI_CAPABILITY_KEYS);
  for (const { key, label, description } of ASSISTANT_CLI_CAPABILITIES) {
    assert.equal(projected[key], true, key);
    assert.notEqual(label.trim(), "", key);
    assert.notEqual(description.trim(), "", key);
  }
});
