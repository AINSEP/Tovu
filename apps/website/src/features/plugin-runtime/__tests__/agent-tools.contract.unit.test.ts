import assert from "node:assert/strict";
import test from "node:test";

import Ajv from "ajv";

import { pluginAgentToolCatalog } from "../agent-tools.js";

/**
 * @file Inline contract for the plugin-runtime agent-tool catalog (Stryker lane L14: 28.6 %, AP5).
 * Enabling a plugin changes what the assistant can do next, so the permission and the closed
 * `family` enum are security-relevant: both are pinned exactly.
 */

function stripDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDescriptions);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== "description").map(([k, v]) => [k, stripDescriptions(v)]));
  }
  return value;
}

const FAMILY = { type: "string", enum: ["site-runtime", "agent-plugin"] };
const PLUGIN_ID = { type: "string", minLength: 1 };

test("plugin-runtime catalog matches the inline contract, in order", () => {
  assert.deepEqual(stripDescriptions(pluginAgentToolCatalog), [
    { name: "plugins_list", sideEffects: "none", authorization: { permission: "admin.plugins.read" },
      inputSchema: { type: "object", additionalProperties: false, required: [], properties: {} } },
    { name: "plugins_set_enabled", sideEffects: "mutates-durable-state", authorization: { permission: "admin.plugins.enable" },
      inputSchema: { type: "object", additionalProperties: false, required: ["family", "pluginId", "enabled"], properties: { family: FAMILY, pluginId: PLUGIN_ID, enabled: { type: "boolean" } } } },
    { name: "plugins_uninstall", sideEffects: "deletes-durable-state", authorization: { permission: "admin.plugins.enable" },
      inputSchema: { type: "object", additionalProperties: false, required: ["family", "pluginId"], properties: { family: FAMILY, pluginId: PLUGIN_ID } } },
  ]);
  for (const tool of pluginAgentToolCatalog) assert.ok(tool.description.trim().length > 20, tool.name);
});

test("plugin-runtime schemas: good input passes; extra key, unknown family, empty id and string boolean are refused", () => {
  const ajv = new Ajv();
  const [list, setEnabled, uninstall] = pluginAgentToolCatalog.map((t) => ajv.compile(t.inputSchema));
  assert.equal(list!({}), true);
  assert.equal(list!({ x: 1 }), false);
  const ok = { family: "agent-plugin", pluginId: "img", enabled: true };
  assert.equal(setEnabled!(ok), true);
  assert.deepEqual(
    [{ ...ok, extra: 1 }, { ...ok, family: "both" }, { ...ok, family: "Agent-Plugin" }, { ...ok, pluginId: "" }, { ...ok, enabled: "true" }, { family: "site-runtime", pluginId: "x" }].map((i) => setEnabled!(i)),
    [false, false, false, false, false, false],
  );
  assert.equal(uninstall!({ family: "site-runtime", pluginId: "x" }), true);
  assert.equal(uninstall!({ family: "site-runtime", pluginId: "x", enabled: false }), false);
});
