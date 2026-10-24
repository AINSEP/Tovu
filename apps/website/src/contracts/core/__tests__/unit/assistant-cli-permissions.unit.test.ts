import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssistantCliPermissions } from "../../assistant-native-fallbacks.js";
import { ASSISTANT_CLI_CAPABILITIES, assistantCliPermissions } from "../../../headless/assistant-subagents-policy.js";

test("local owner capabilities default on except personal MCP, and explicit off choices survive", () => {
  for (const { key } of ASSISTANT_CLI_CAPABILITIES) {
    const settings = assistantCliPermissions({ enabled: true, capabilities: { [key]: false } });
    const actual = resolveAssistantCliPermissions({ isOwner: true, env: {}, settings });
    assert.equal(actual.capabilities[key], false);
    for (const other of ASSISTANT_CLI_CAPABILITIES.filter(item => item.key !== key)) assert.equal(actual.capabilities[other.key], other.key !== "userMcp");
  }
});
test("the master resets capability defaults with personal MCP off, and individual switches can override", () => {
  const settings = assistantCliPermissions({ enabled: false, capabilities: { shell: true } });
  assert.deepEqual(resolveAssistantCliPermissions({ isOwner: true, env: {}, settings }), settings);
  assert.ok(Object.values(assistantCliPermissions({ enabled: false }).capabilities).every(value => !value));
  const defaults = assistantCliPermissions({ enabled: true }).capabilities;
  for (const { key } of ASSISTANT_CLI_CAPABILITIES) assert.equal(defaults[key], key !== "userMcp");
});
for (const enabled of [false, true]) test(`personal MCP honors explicit owner choices with master ${enabled}`, () => {
  for (const userMcp of [true, false]) {
    const settings = assistantCliPermissions({ enabled, capabilities: { userMcp } });
    const actual = resolveAssistantCliPermissions({ isOwner: true, env: {}, settings });
    assert.equal(actual.capabilities.userMcp, userMcp);
    for (const { key } of ASSISTANT_CLI_CAPABILITIES.filter(item => item.key !== "userMcp")) assert.equal(actual.capabilities[key], enabled);
  }
});
for (const env of [{ TOVU_HOSTED: "1" }, { TOVU_RUNTIME_MODE: "production" }, { TOVU_PUBLIC_URL: "https://tovu.dev" }]) {
  test(`host restrictions override every individual grant: ${JSON.stringify(env)}`, () => {
    const settings = assistantCliPermissions({ enabled: true, capabilities: { userMcp: true } });
    const actual = resolveAssistantCliPermissions({ isOwner: true, env, settings });
    assert.ok(Object.values(actual.capabilities).every(value => !value));
  });
}
test("non-owners cannot establish an individual grant", () => {
  const actual = resolveAssistantCliPermissions({ isOwner: false, env: {}, settings: assistantCliPermissions({ enabled: true, capabilities: { userMcp: true } }) });
  assert.ok(Object.values(actual.capabilities).every(value => !value));
});
