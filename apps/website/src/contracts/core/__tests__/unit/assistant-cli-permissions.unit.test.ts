import assert from "node:assert/strict";
import test from "node:test";
import { resolveAssistantCliPermissions } from "../../assistant-native-fallbacks.js";
import { ASSISTANT_CLI_CAPABILITIES, assistantCliPermissions } from "../../../headless/assistant-subagents-policy.js";

test("every local owner capability defaults on, and each explicit off survives independently", () => {
  for (const { key } of ASSISTANT_CLI_CAPABILITIES) {
    const settings = assistantCliPermissions({ enabled: true, capabilities: { [key]: false } });
    const actual = resolveAssistantCliPermissions({ isOwner: true, env: {}, settings });
    assert.equal(actual.capabilities[key], false);
    for (const other of ASSISTANT_CLI_CAPABILITIES.filter(item => item.key !== key)) assert.equal(actual.capabilities[other.key], true);
  }
});
test("the master resets all capabilities and individual switches can override its off default", () => {
  const settings = assistantCliPermissions({ enabled: false, capabilities: { shell: true } });
  assert.deepEqual(resolveAssistantCliPermissions({ isOwner: true, env: {}, settings }), settings);
  assert.ok(Object.values(assistantCliPermissions({ enabled: false }).capabilities).every(value => !value));
  assert.ok(Object.values(assistantCliPermissions({ enabled: true }).capabilities).every(Boolean));
});
for (const env of [{ TOVU_HOSTED: "1" }, { TOVU_RUNTIME_MODE: "production" }, { TOVU_PUBLIC_URL: "https://tovu.dev" }]) {
  test(`host restrictions override every individual grant: ${JSON.stringify(env)}`, () => {
    const settings = assistantCliPermissions({ enabled: true });
    const actual = resolveAssistantCliPermissions({ isOwner: true, env, settings });
    assert.ok(Object.values(actual.capabilities).every(value => !value));
  });
}
test("non-owners cannot establish an individual grant", () => {
  const actual = resolveAssistantCliPermissions({ isOwner: false, env: {}, settings: assistantCliPermissions({ enabled: true }) });
  assert.ok(Object.values(actual.capabilities).every(value => !value));
});
