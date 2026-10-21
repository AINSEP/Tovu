import assert from "node:assert/strict";
import test from "node:test";

import { createFederatedMcpPresetRegistry } from "@jini-ai/mcp/federation";

import { listFederatedMcpPresets, registerFederatedMcpPreset, resetFederatedMcpPresetsForTests } from "../presets.js";

test("listed presets keep registration order and resolve through the host's env-only resolver", () => {
  const registry = createFederatedMcpPresetRegistry({});
  const seen: Array<{ presetId: string; env: NodeJS.ProcessEnv }> = [];
  registerFederatedMcpPreset({ presetId: "vendor-a", resolve: (env) => { seen.push({ presetId: "vendor-a", env }); return null; } }, { registry });
  registerFederatedMcpPreset({ presetId: "vendor-b", resolve: (env) => { seen.push({ presetId: "vendor-b", env }); return null; } }, { registry });

  const presets = listFederatedMcpPresets({ registry });
  assert.deepEqual(presets.map((preset) => preset.presetId), ["vendor-a", "vendor-b"]);
  const env = { VENDOR_B_TOKEN_NAME: "present" };
  assert.equal(presets[1]!.resolve(env), null);
  assert.deepEqual(seen, [{ presetId: "vendor-b", env }]);
});

test("resetting the registry empties the listing", () => {
  const registry = createFederatedMcpPresetRegistry({});
  registerFederatedMcpPreset({ presetId: "vendor-a", resolve: () => null }, { registry });
  resetFederatedMcpPresetsForTests({ registry });
  assert.deepEqual(listFederatedMcpPresets({ registry }), []);
});
