import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, ToolPermissionDeniedError } from "@jini-ai/core";
import { AgentPluginActivationsBusyError, AgentPluginHostIncompatibleError, AgentPluginUpdateError } from "@jini-ai/agent-plugins/lifecycle";
import type { PluginActivationRecord } from "@jini-ai/plugins/host";
import type { PluginDiscoveryRecord } from "@jini-ai/plugins/host/node";

import { InMemoryChangeSetRepo } from "../../../../contracts/core/commands/index.js";
import { ABANDONED_NOTE, CAPABILITIES, PLUGIN_ID, PRINCIPAL_ID, WORKSPACE_ID, answerCard, context, harness, installedAgentPlugin, noDialog, siteRecord } from "../fixtures/plugins-tool-harness.js";

/**
 * @file Pins every branch of `plugins_set_enabled`'s consent path — which inputs reach the source
 * policy, when a card is raised, what it lists, the stale-approval and abort refusals, and that the
 * owner's approval is recorded BEFORE the activation write. Ports are typed fakes; the approval
 * transport, `executeCommand` and `setPluginEnabled` are the real modules.
 */

const ENABLE = { family: "site-runtime", pluginId: PLUGIN_ID, enabled: true } as const;
const DISABLE = { family: "site-runtime", pluginId: PLUGIN_ID, enabled: false } as const;
const NO_CHANNEL = (error: unknown) => error instanceof ToolInputError && /^PLUGINS_NO_CONFIRMATION_CHANNEL/.test(error.message);

// ---------------------------------------------------------------------------
// Parse and authorize
// ---------------------------------------------------------------------------

test("a non-boolean 'enabled' is refused with the exact input message before any authorization", async () => {
  const h = harness();
  await assert.rejects(h.tool("plugins_set_enabled").handler(context({ family: "site-runtime", pluginId: PLUGIN_ID, enabled: "yes" }), {}),
    (error: unknown) => error instanceof ToolInputError && error.message === "'enabled' (boolean) is required — true to turn the plugin on, false to turn it off");
  assert.deepEqual(h.authorizeCalls, []);
});

test("a denied principal is refused before the policy, discovery or source are consulted", async () => {
  const h = harness({ authorize: () => false, confirmEnable: () => true });
  await assert.rejects(h.tool("plugins_set_enabled").handler(context(ENABLE), {}),
    (error: unknown) => error instanceof ToolPermissionDeniedError && error.message === `principal '${PRINCIPAL_ID}' is not authorized for 'admin.plugins.enable' (insufficient_permission)`);
  assert.deepEqual(h.events, []);
  assert.deepEqual(h.policyCalls, []);
});

test("authorization names the entity per family: 'plugin' for site-runtime, 'agent-plugin' for Agent Plugins", async () => {
  const h = harness({ confirmEnable: () => true });
  await h.tool("plugins_set_enabled").handler(context(DISABLE), {});
  await h.tool("plugins_set_enabled").handler(context({ family: "agent-plugin", pluginId: "higgsfield", enabled: false }), {});
  assert.deepEqual(h.authorizeCalls.filter((call) => call.permission === "admin.plugins.enable").map(({ entityType, entityId }) => [entityType, entityId]),
    [["plugin", PLUGIN_ID], ["plugin", PLUGIN_ID], ["plugin-activation", PLUGIN_ID], ["agent-plugin", "higgsfield"], ["agent-plugin", "higgsfield"]],
    "checked before the card and again before the write; the site write's executeCommand adds its own check");
});

// ---------------------------------------------------------------------------
// What reaches the source policy, and when a card is raised
// ---------------------------------------------------------------------------

test("disabling consults the policy with sealedHere:false and nothing added, never asks, and reads discovery once", async () => {
  const h = harness({ confirmEnable: () => true });
  const result = await h.tool("plugins_set_enabled").handler(context(DISABLE), { emitSurface: noDialog }) as { changed: boolean };
  assert.equal(result.changed, true);
  assert.deepEqual(h.policyCalls, [{ sealedHere: false, added: [] }]);
  assert.deepEqual(h.events, ["discover", "save:false", "onDisabled:site-rules"]);
});

test("a built-in package never reaches the source port; the policy alone decides and may skip the card", async () => {
  const h = harness({ discovery: () => [siteRecord({ source: "built-in" })], confirmEnable: () => false });
  const result = await h.tool("plugins_set_enabled").handler(context(ENABLE), { emitSurface: noDialog }) as { changed: boolean };
  assert.equal(result.changed, true);
  assert.deepEqual(h.policyCalls, [{ sealedHere: false, added: [] }]);
  assert.deepEqual(h.events, ["discover", "discover", "save:true", "onEnabled:site-rules"], "no isSealedHere, readApproval or recordApproval for a built-in");
});

test("without a source policy every enable asks (fails closed with no channel)", async () => {
  const h = harness({ discovery: () => [siteRecord({ source: "built-in" })] });
  await assert.rejects(h.tool("plugins_set_enabled").handler(context(ENABLE), {}), NO_CHANNEL);
  assert.deepEqual(h.events, ["discover"]);
});

test("a site package sealed here whose capabilities match the last approval skips the card and records no new approval", async () => {
  const h = harness({ source: { isSealedHere: async () => true, readApproval: async () => [...CAPABILITIES] }, confirmEnable: ({ sealedHere, added }) => !sealedHere || added.length > 0 });
  const result = await h.tool("plugins_set_enabled").handler(context(ENABLE), { emitSurface: noDialog }) as { changed: boolean };
  assert.equal(result.changed, true);
  assert.deepEqual(h.policyCalls, [{ sealedHere: true, added: [] }]);
  assert.deepEqual(h.events, ["discover", "isSealedHere:site-rules@1.0.0", "readApproval:site-rules", "discover", "save:true", "onEnabled:site-rules"]);
});

test("a site package not sealed here passes sealedHere:false and only the capabilities beyond the last approval", async () => {
  const h = harness({ source: { isSealedHere: async () => false, readApproval: async () => ["tier:tier-3"] }, confirmEnable: () => true });
  await assert.rejects(h.tool("plugins_set_enabled").handler(context(ENABLE), {}), NO_CHANNEL);
  assert.deepEqual(h.policyCalls, [{ sealedHere: false, added: ["capability:hooks.attach", "hook:content.entry.beforeSave"] }]);
});

test("a site package sealed here with no validated manifest always asks, without consulting the policy", async () => {
  const h = harness({ discovery: () => [siteRecord({ manifest: undefined })], source: { isSealedHere: async () => true }, confirmEnable: () => false });
  await assert.rejects(h.tool("plugins_set_enabled").handler(context(ENABLE), {}), NO_CHANNEL);
  assert.deepEqual(h.policyCalls, []);
  assert.deepEqual(h.events, ["discover", "isSealedHere:site-rules@1.0.0"], "no manifest means no capability set, so no approval read");
});

test("with no source port a site package is never sealed here and every declared capability counts as added", async () => {
  const h = harness({ source: false, confirmEnable: () => true });
  await assert.rejects(h.tool("plugins_set_enabled").handler(context(ENABLE), {}), NO_CHANNEL);
  assert.deepEqual(h.policyCalls, [{ sealedHere: false, added: [...CAPABILITIES] }]);
});

test("an Agent Plugin enable reaches the policy with sealedHere:false and nothing added; the policy may skip the card", async () => {
  const h = harness({ confirmEnable: () => false });
  const result = await h.tool("plugins_set_enabled").handler(context({ family: "agent-plugin", pluginId: "higgsfield", enabled: true }), { emitSurface: noDialog }) as { changed: boolean };
  assert.equal(result.changed, true);
  assert.deepEqual(h.policyCalls, [{ sealedHere: false, added: [] }]);
  assert.deepEqual(h.events, ["assertWritable", "listInstalled", "listInstalled", "listInstalled", "setEnabled:true", "provisionMcp:higgsfield"],
    "pre-flight host check, identity before the card, identity again before the write");
});

test("an unwritable Agent Plugin activation record is returned before identity, card or write", async () => {
  const h = harness({ confirmEnable: () => true, agentHost: { assertWritable: async () => { throw new AgentPluginActivationsBusyError({ lockPath: "/fake/lock", holder: undefined, lost: false }); } } });
  const result = await h.tool("plugins_set_enabled").handler(context({ family: "agent-plugin", pluginId: "higgsfield", enabled: true }), { emitSurface: noDialog }) as { changed: boolean; reason: string };
  assert.deepEqual([result.changed, result.reason], [false, "activations-busy"]);
  assert.deepEqual(h.events, ["assertWritable"]);
  assert.deepEqual(h.policyCalls, [{ sealedHere: false, added: [] }]);
});

test("an Agent Plugin this host cannot run is a nothing-changed result naming PLUGIN_HOST_INCOMPATIBLE, with no MCP provisioning", async () => {
  const h = harness({ confirmEnable: () => false, agentHost: { setEnabled: async () => { throw new AgentPluginHostIncompatibleError({ pluginId: "higgsfield" }); } } });
  const result = await h.tool("plugins_set_enabled").handler(context({ family: "agent-plugin", pluginId: "higgsfield", enabled: true }), { emitSurface: noDialog }) as Record<string, unknown>;
  assert.deepEqual({ ...result, note: undefined }, {
    changed: false, cancelled: false, family: "agent-plugin", pluginId: "higgsfield", restartRequired: false,
    reason: "host-incompatible", code: "PLUGIN_HOST_INCOMPATIBLE", note: undefined,
  });
  assert.match(String(result.note), /^Nothing changed: 'higgsfield' is not made for this Tovu version/);
  assert.equal(h.events.includes("provisionMcp:higgsfield"), false);
});

test("an Agent Plugin whose installed revision this host cannot run is refused before identity, card or write", async () => {
  const h = harness({ confirmEnable: () => true, agentHost: { listInstalled: async () => [installedAgentPlugin(), installedAgentPlugin({ archiveDigest: "b".repeat(64), version: "2.0.0", hostRange: ">=99" })] } });
  const result = await h.tool("plugins_set_enabled").handler(context({ family: "agent-plugin", pluginId: "higgsfield", enabled: true }), {}) as Record<string, unknown>;
  assert.deepEqual([result.changed, result.cancelled, result.reason, result.code, result.restartRequired], [false, false, "host-incompatible", "PLUGIN_HOST_INCOMPATIBLE", false]);
  assert.match(String(result.note), /^Nothing changed: 'higgsfield' is not made for this Tovu version/);
  assert.deepEqual(h.events, ["assertWritable", "listInstalled"], "no card was raised (no emitSurface, yet no NO_CHANNEL refusal) and nothing was written");
});

test("an Agent Plugin whose host range this host satisfies passes the pre-flight", async () => {
  const h = harness({ confirmEnable: () => false, agentHost: { listInstalled: async () => [installedAgentPlugin({ hostRange: "^1.0.0" }), installedAgentPlugin({ pluginId: "other", hostRange: ">=99" })] } });
  const result = await h.tool("plugins_set_enabled").handler(context({ family: "agent-plugin", pluginId: "higgsfield", enabled: true }), { emitSurface: noDialog }) as { changed: boolean };
  assert.equal(result.changed, true, "another plugin's incompatible range does not block this one");
});

test("an Agent Plugin whose interrupted update awaits recovery is a nothing-changed update-pending result", async () => {
  const h = harness({ confirmEnable: () => false, agentHost: { setEnabled: async () => { throw new AgentPluginUpdateError({ code: "PLUGIN_UPDATE_PENDING", message: "pending" }); } } });
  for (const enabled of [true, false]) {
    const result = await h.tool("plugins_set_enabled").handler(context({ family: "agent-plugin", pluginId: "higgsfield", enabled }), { emitSurface: noDialog }) as Record<string, unknown>;
    assert.deepEqual([result.changed, result.reason, result.code, result.restartRequired], [false, "update-pending", "PLUGIN_UPDATE_PENDING", false]);
    assert.match(String(result.note), new RegExp(`was NOT ${enabled ? "enabled" : "disabled"}\\. Tell the user to restart Tovu`));
  }
  assert.equal(h.events.includes("provisionMcp:higgsfield"), false);
});

test("an Agent Plugin update refusal other than PLUGIN_UPDATE_PENDING asks for manual repair, not a restart", async () => {
  const h = harness({ confirmEnable: () => false, agentHost: { setEnabled: async () => { throw new AgentPluginUpdateError({ code: "PLUGIN_UPDATE_PATH_UNSAFE", message: "unsafe" }); } } });
  const result = await h.tool("plugins_set_enabled").handler(context({ family: "agent-plugin", pluginId: "higgsfield", enabled: false }), { emitSurface: noDialog }) as Record<string, unknown>;
  assert.deepEqual([result.changed, result.code], [false, "PLUGIN_UPDATE_PATH_UNSAFE"]);
  assert.match(String(result.note), /was NOT disabled\. Its update recovery record needs manual repair \(PLUGIN_UPDATE_PATH_UNSAFE\); restarting Tovu will not fix it/);
});

test("Agent Plugin warnings (an unmet requirement, a dependent losing a capability) reach the model", async () => {
  const h = harness({ confirmEnable: () => false, agentHost: { setEnabled: async (input) => ({ pluginId: input.pluginId, enabled: input.enabled, warnings: ["Needs x:y"] }) } });
  const result = await h.tool("plugins_set_enabled").handler(context({ family: "agent-plugin", pluginId: "higgsfield", enabled: true }), { emitSurface: noDialog }) as { changed: boolean; warnings: string[] };
  assert.equal(result.changed, true);
  assert.deepEqual(result.warnings, ["Needs x:y"]);
  // A lifecycle result without warnings reports an empty list, never an absent one.
  const quiet = await harness({ confirmEnable: () => false }).tool("plugins_set_enabled").handler(context({ family: "agent-plugin", pluginId: "higgsfield", enabled: false }), { emitSurface: noDialog }) as { warnings: string[] };
  assert.deepEqual(quiet.warnings, []);
});

// ---------------------------------------------------------------------------
// The card, the recorded approval, and the post-approval refusals
// ---------------------------------------------------------------------------

test("a confirmed widening lists the added capabilities on the card and records the approval BEFORE the activation write", async () => {
  const h = harness({ source: { isSealedHere: async () => true, readApproval: async () => undefined }, confirmEnable: () => true });
  const { html, outcome } = await answerCard({ tool: h.tool("plugins_set_enabled"), surfaceExchanges: h.surfaceExchanges, input: ENABLE, decision: "confirm" });
  assert.ok(html.includes(CAPABILITIES.join(", ")), "the card must name exactly what this version adds");
  assert.equal((await outcome as { changed: boolean }).changed, true);
  assert.deepEqual(h.events, ["discover", "isSealedHere:site-rules@1.0.0", "readApproval:site-rules", "discover", `recordApproval:${CAPABILITIES.join("|")}`, "save:true", "onEnabled:site-rules"]);
});

test("a failed approval record leaves the plugin off and propagates the failure", async () => {
  const h = harness({ source: { isSealedHere: async () => false, readApproval: async () => undefined, recordApproval: async () => { throw new Error("approval store unavailable"); } }, confirmEnable: () => true });
  const { outcome } = await answerCard({ tool: h.tool("plugins_set_enabled"), surfaceExchanges: h.surfaceExchanges, input: ENABLE, decision: "confirm" });
  await assert.rejects(outcome, /^Error: approval store unavailable$/);
  assert.equal(h.events.some((event) => event.startsWith("save:")), false);
  assert.equal(await h.activationRepo.getActivation({ workspaceId: WORKSPACE_ID, pluginId: PLUGIN_ID }), null);
});

test("a confirmed enable with no source port writes without recording an approval", async () => {
  const h = harness({ source: false, confirmEnable: () => true });
  const { outcome } = await answerCard({ tool: h.tool("plugins_set_enabled"), surfaceExchanges: h.surfaceExchanges, input: ENABLE, decision: "confirm" });
  assert.equal((await outcome as { changed: boolean }).changed, true);
  assert.deepEqual(h.events, ["discover", "discover", "save:true", "onEnabled:site-rules"]);
});

test("a declined card writes and records nothing", async () => {
  const h = harness({ source: { isSealedHere: async () => false }, confirmEnable: () => true });
  const { outcome } = await answerCard({ tool: h.tool("plugins_set_enabled"), surfaceExchanges: h.surfaceExchanges, input: ENABLE, decision: "cancel" });
  assert.deepEqual(await outcome, { changed: false, family: "site-runtime", pluginId: PLUGIN_ID, restartRequired: false, cancelled: true, note: "The user cancelled. Nothing was changed." });
  assert.deepEqual(h.events, ["discover", "isSealedHere:site-rules@1.0.0", "readApproval:site-rules"]);
});

test("a version changed while the card was open is refused as PLUGINS_STALE_APPROVAL with no record or write", async () => {
  let reads = 0;
  const h = harness({ discovery: () => [siteRecord({ version: ++reads === 1 ? "1.0.0" : "1.0.1" })], source: { isSealedHere: async () => false }, confirmEnable: () => true });
  const { outcome } = await answerCard({ tool: h.tool("plugins_set_enabled"), surfaceExchanges: h.surfaceExchanges, input: ENABLE, decision: "confirm" });
  await assert.rejects(outcome, (error: unknown) => error instanceof ToolInputError && error.message === "PLUGINS_STALE_APPROVAL: The plugin version or digest changed. Review and approve it again. Nothing was changed.");
  assert.deepEqual(h.events, ["discover", "isSealedHere:site-rules@1.0.0", "readApproval:site-rules", "discover"]);
});

test("a principal whose grant is revoked while the card was open is refused at the write", async () => {
  const h = harness({ authorize: (call) => call === 1, source: { isSealedHere: async () => false }, confirmEnable: () => true });
  const { outcome } = await answerCard({ tool: h.tool("plugins_set_enabled"), surfaceExchanges: h.surfaceExchanges, input: ENABLE, decision: "confirm" });
  await assert.rejects(outcome, (error: unknown) => error instanceof ToolPermissionDeniedError && /admin\.plugins\.enable/.test(error.message));
  assert.equal(h.events.some((event) => event.startsWith("save:") || event.startsWith("recordApproval")), false);
});

test("a run cancelled during the post-approval re-check returns abandoned and grants nothing", async () => {
  const controller = new AbortController();
  const h = harness({ authorize: (call) => { if (call === 2) controller.abort(); return true; }, source: { isSealedHere: async () => false }, confirmEnable: () => true });
  const { outcome } = await answerCard({ tool: h.tool("plugins_set_enabled"), surfaceExchanges: h.surfaceExchanges, input: ENABLE, decision: "confirm", signal: controller.signal });
  assert.deepEqual(await outcome, { changed: false, cancelled: false, reason: "abandoned", note: ABANDONED_NOTE });
  assert.equal(h.events.some((event) => event.startsWith("save:") || event.startsWith("recordApproval")), false);
});

// ---------------------------------------------------------------------------
// Site-runtime write: rollback and the post-write projection
// ---------------------------------------------------------------------------

class FailingChangeSetRepo extends InMemoryChangeSetRepo {
  override async insert(): Promise<void> { throw new Error("injected change-set persist failure"); }
}
const prior = (enabled: boolean): PluginActivationRecord => ({ pluginId: PLUGIN_ID, workspaceId: WORKSPACE_ID, version: "1.0.0", enabled, updatedAt: "2026-10-01T00:00:00.000Z" });

test("rollback with no prior activation deletes the row and re-applies the disabled state", async () => {
  const h = harness({ changeSets: new FailingChangeSetRepo(), confirmEnable: () => true });
  await assert.rejects(h.tool("plugins_set_enabled").handler(context(DISABLE), {}), /^Error: injected change-set persist failure$/);
  assert.deepEqual(h.events.slice(-2), ["deleteActivation", "onDisabled:site-rules"]);
  assert.equal(await h.activationRepo.getActivation({ workspaceId: WORKSPACE_ID, pluginId: PLUGIN_ID }), null);
});

test("rollback restores an enabled prior activation verbatim and re-applies the enabled state", async () => {
  const h = harness({ changeSets: new FailingChangeSetRepo(), confirmEnable: () => true, initialRows: [prior(true)] });
  await assert.rejects(h.tool("plugins_set_enabled").handler(context(DISABLE), {}), /^Error: injected change-set persist failure$/);
  assert.deepEqual(h.events.slice(-2), ["save:true", "onEnabled:site-rules"]);
  assert.deepEqual(await h.activationRepo.getActivation({ workspaceId: WORKSPACE_ID, pluginId: PLUGIN_ID }), prior(true));
});

test("rollback restores a disabled prior activation and re-applies the disabled state", async () => {
  const h = harness({ changeSets: new FailingChangeSetRepo(), confirmEnable: () => true, initialRows: [prior(false)] });
  await assert.rejects(h.tool("plugins_set_enabled").handler(context(DISABLE), {}), /^Error: injected change-set persist failure$/);
  assert.deepEqual(h.events.slice(-2), ["save:false", "onDisabled:site-rules"]);
});

test("a discovery snapshot that loses the plugin during the write is refused as not found", async () => {
  const snapshot: PluginDiscoveryRecord[] = [siteRecord()];
  const h = harness({ discovery: () => snapshot, confirmEnable: () => true, onPluginDisabled: () => { snapshot.length = 0; } });
  await assert.rejects(h.tool("plugins_set_enabled").handler(context(DISABLE), {}),
    (error: unknown) => error instanceof ToolInputError && error.message === `plugin '${PLUGIN_ID}' was not found in the current discovery snapshot`);
});
