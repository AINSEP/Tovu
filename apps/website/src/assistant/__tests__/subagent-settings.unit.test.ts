import assert from "node:assert/strict";
import test from "node:test";
import { readAssistantCliPermissions, readAssistantSubagentsEnabled } from "../subagent-settings.js";
import { ASSISTANT_CLI_PERMISSIONS_KEY, ASSISTANT_SUBAGENTS_KEY } from "../../contracts/headless/index.js";
import { assistantCliPermissions } from "../assistant-subagents-policy.js";

type CliRequired = Parameters<typeof readAssistantCliPermissions>[0];
type Effective = Awaited<ReturnType<CliRequired["getEffective"]>>;
const SAFE_WARNING = "[agent-daemon] Full CLI access settings unavailable; access remains OFF.";
const DENIED = assistantCliPermissions({ enabled: false });

/** Builds typed fake ports answering the owner snapshot and legacy boolean keys independently. */
function cliRequired(answers: { snapshot?: Effective | Error; legacy?: Effective | Error }): CliRequired {
  return {
    settingsRepo: {} as CliRequired["settingsRepo"], settingsReady: Promise.resolve(), workspaceId: "site", principalId: "owner",
    getEffective: async (_deps, input) => {
      const answer = input.key === ASSISTANT_CLI_PERMISSIONS_KEY ? answers.snapshot : answers.legacy;
      if (answer instanceof Error) throw answer;
      return answer ?? null;
    },
  };
}
const userLayer = (value: NonNullable<Effective>["value"]): Effective => ({ value, sourceLayer: "user", defVersion: 1 });

for (const userMcp of [false, true]) test(`a valid owner snapshot preserves personal MCP ${userMcp}`, async () => {
  const stored = assistantCliPermissions({ enabled: true, capabilities: { web: false, userMcp } });
  assert.deepEqual(await readAssistantCliPermissions(cliRequired({ snapshot: userLayer({ enabled: stored.enabled, capabilities: { ...stored.capabilities } }) })), stored);
});

test("a snapshot from the definition default inherits the legacy boolean", async () => {
  const result = await readAssistantCliPermissions(cliRequired({
    snapshot: { value: { enabled: false, capabilities: {} }, sourceLayer: "default", defVersion: 1 }, legacy: userLayer(true) }));
  assert.deepEqual(result, assistantCliPermissions({ enabled: true }));
});

test("a snapshot with a null value inherits the legacy boolean", async () => {
  const result = await readAssistantCliPermissions(cliRequired({ snapshot: userLayer(null), legacy: userLayer(false) }));
  assert.deepEqual(result, DENIED);
});

test("no snapshot and no legacy value defaults full CLI access ON with personal MCP OFF", async () => {
  const settings = await readAssistantCliPermissions(cliRequired({}));
  assert.equal(settings.enabled, true);
  assert.equal(settings.capabilities.userMcp, false);
  assert.equal(settings.capabilities.shell, true);
});

for (const [name, value] of [
  ["a non-boolean enabled flag", { enabled: "yes", capabilities: assistantCliPermissions({ enabled: true }).capabilities }],
  ["missing capabilities", { enabled: true }],
  ["a non-boolean capability", { enabled: true, capabilities: { ...assistantCliPermissions({ enabled: true }).capabilities, shell: 1 } }],
  ["a missing capability", { enabled: true, capabilities: { shell: true } }],
] as const) {
  test(`a snapshot with ${name} denies all access and logs only the safe warning`, async () => {
    const warnings: string[] = [];
    const result = await readAssistantCliPermissions(cliRequired({ snapshot: userLayer(value) }), { warn: message => warnings.push(message) });
    assert.deepEqual(result, DENIED);
    assert.deepEqual(warnings, [SAFE_WARNING]);
  });
}

test("a malformed snapshot rethrows the validation error when the caller opts into propagation", async () => {
  await assert.rejects(readAssistantCliPermissions(cliRequired({ snapshot: userLayer({ enabled: true }) }), { readFailure: "throw" }),
    { message: "Invalid CLI permissions" });
});

test("a failed legacy fallback denies all access instead of defaulting ON", async () => {
  const warnings: string[] = [];
  const result = await readAssistantCliPermissions(cliRequired({ legacy: new Error("secret-db-detail") }), { warn: message => warnings.push(message) });
  assert.deepEqual(result, DENIED);
  assert.deepEqual(warnings, [SAFE_WARNING]);
});

test("a settings-ready failure rethrows the original error when propagation is requested", async () => {
  const failure = new Error("settings boot failed");
  await assert.rejects(readAssistantCliPermissions({ ...cliRequired({}), settingsReady: Promise.reject(failure) }, { readFailure: "throw" }),
    error => error === failure);
});

test("without a warn port the CLI permissions denial is logged through console.warn", async t => {
  const warn = t.mock.method(console, "warn", () => {});
  assert.deepEqual(await readAssistantCliPermissions(cliRequired({ snapshot: new Error("down") })), DENIED);
  assert.deepEqual(warn.mock.calls.map(call => call.arguments), [[SAFE_WARNING]]);
});

test("the legacy boolean reads the workspace-scoped enabled key", async () => {
  const inputs: unknown[] = [];
  const required = { ...cliRequired({}), getEffective: async (_deps: unknown, input: unknown) => { inputs.push(input); return null; } };
  assert.equal(await readAssistantSubagentsEnabled(required), true);
  assert.deepEqual(inputs, [{ namespace: "core.assistant-full-cli", key: ASSISTANT_SUBAGENTS_KEY, scopeContext: { workspaceId: "site" } }]);
});

for (const [value, expected] of [[true, true], [false, false], ["true", false]] as const) {
  test(`the legacy boolean value ${JSON.stringify(value)} reads as ${expected}`, async () => {
    assert.equal(await readAssistantSubagentsEnabled(cliRequired({ legacy: userLayer(value) })), expected);
  });
}

test("a failed legacy read denies access with the safe warning and no storage detail", async () => {
  const warnings: string[] = [];
  assert.equal(await readAssistantSubagentsEnabled(cliRequired({ legacy: new Error("secret-db-detail") }), { warn: message => warnings.push(message) }), false);
  assert.deepEqual(warnings, [SAFE_WARNING]);
});

test("a failed legacy read rethrows the original error when propagation is requested", async () => {
  const failure = new Error("down");
  await assert.rejects(readAssistantSubagentsEnabled(cliRequired({ legacy: failure }), { readFailure: "throw" }), error => error === failure);
});

test("without a warn port the legacy denial is logged through console.warn", async t => {
  const warn = t.mock.method(console, "warn", () => {});
  assert.equal(await readAssistantSubagentsEnabled(cliRequired({ legacy: new Error("down") })), false);
  assert.deepEqual(warn.mock.calls.map(call => call.arguments), [[SAFE_WARNING]]);
});
