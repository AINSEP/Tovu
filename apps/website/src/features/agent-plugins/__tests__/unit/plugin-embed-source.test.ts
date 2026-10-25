/** OPUS-REVIEW T1: catalog admission delegates to Jini; declared identities are never reconstructed. */
import assert from "node:assert/strict";
import test from "node:test";
import { createPluginExportSource } from "../../exports/source.js";
import type { TovuAgentPluginLifecycle } from "../../lifecycle.js";
import { definition, owner, workspaceId } from "../fixtures/plugin-exports.js";

test("T1: inactive metadata is admitted only through the bundled digest gate; active set stays separate", async () => {
  const calls: { workspaceId: string; requireActive: boolean }[] = [];
  const other = { pluginId: "third-party", packageRoot: "/third-party" };
  const read: string[] = [];
  const lifecycle = {
    findTrustedPluginPackages: async (input: { workspaceId: string; requireActive: boolean }) => {
      calls.push(input);
      return input.requireActive ? [] : [{ trusted: owner.plugin }, { refusal: "untrusted" }];
    },
    readTrustedPluginFile: async (plugin: { pluginId: string }) => {
      read.push(plugin.pluginId);
      assert.notEqual(plugin.pluginId, other.pluginId);
      return JSON.stringify({ name: "demo", extensions: { tovu: { id: "publisher/canonical-demo", renamedFrom: ["tovu/old-demo"], provides: ["member-login:demo"], exports: { button: definition } } } });
    },
  } as unknown as TovuAgentPluginLifecycle;
  const packages = await createPluginExportSource({ lifecycle }).list({ workspaceId });
  assert.deepEqual(read, ["demo"]);
  assert.equal(packages[0]!.id, "publisher/canonical-demo");
  assert.equal(packages[0]!.enabled, false);
  assert.deepEqual(calls.map(call => [call.workspaceId, call.requireActive]), [[workspaceId, false], [workspaceId, true]]);
});
