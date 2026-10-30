import assert from "node:assert/strict";
import test from "node:test";
import { readAssistantCliPermissions } from "../subagent-settings.js";
import { ASSISTANT_CLI_PERMISSIONS_KEY } from "../../contracts/headless/index.js";
import { assistantCliPermissions } from "../assistant-subagents-policy.js";

test("launch permissions are read per site/owner and freshly on every turn", async () => {
  let saved = assistantCliPermissions({ enabled: true, capabilities: { shell: false } });
  const calls: unknown[] = [];
  const required = { settingsRepo: {} as Parameters<typeof readAssistantCliPermissions>[0]["settingsRepo"], settingsReady: Promise.resolve(), workspaceId: "site-a", principalId: "owner-a",
    getEffective: async (_deps: unknown, input: unknown) => { calls.push(input); return { value: { enabled: saved.enabled, capabilities: { ...saved.capabilities } }, sourceLayer: "user" as const, defVersion: 1 }; } };
  assert.equal((await readAssistantCliPermissions(required)).capabilities.shell, false);
  assert.deepEqual(calls[0], { namespace: "core.assistant-full-cli", key: ASSISTANT_CLI_PERMISSIONS_KEY,
    scopeContext: { workspaceId: "site-a", principalId: "owner-a" } });
  saved = assistantCliPermissions({ enabled: true });
  assert.equal((await readAssistantCliPermissions(required)).capabilities.shell, true);
  assert.equal(calls.length, 2);
});
test("a missing owner snapshot preserves the existing boolean; failures and malformed snapshots deny all", async () => {
  const required = { settingsRepo: {} as Parameters<typeof readAssistantCliPermissions>[0]["settingsRepo"], settingsReady: Promise.resolve(), workspaceId: "site", principalId: "owner",
    getEffective: async (_deps: unknown, input: { key: string }) => input.key === ASSISTANT_CLI_PERMISSIONS_KEY ? null : { value: false, sourceLayer: "workspace" as const, defVersion: 1 } };
  assert.ok(Object.values((await readAssistantCliPermissions(required)).capabilities).every(value => !value));
  for (const getEffective of [async () => { throw new Error("unavailable"); }, async () => ({ value: { enabled: true }, sourceLayer: "user" as const, defVersion: 1 })]) {
    const denied = await readAssistantCliPermissions({ ...required, getEffective }, { warn: () => {} });
    assert.ok(Object.values(denied.capabilities).every(value => !value));
  }
});
