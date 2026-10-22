import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED, readManifestSeededEnabledPluginIds } from "../../bundled-catalog.js";

/** Core discovers seeded-enabled vendor plugins from their manifests; it never names them. */
const ROOT = "/bundled";
function files(entries: Record<string, string>) {
  return {
    readDir: () => Object.keys(entries),
    readFile: (file: string) => {
      const dir = path.basename(path.dirname(file));
      if (!(dir in entries)) throw new Error("ENOENT");
      return entries[dir];
    },
  };
}

test("a manifest declaring extensions.tovu.seededEnabled: true contributes its name; nothing else does", () => {
  const ids = readManifestSeededEnabledPluginIds({ sourceRoot: ROOT }, files({
    on: JSON.stringify({ name: "host-a", extensions: { tovu: { seededEnabled: true } } }),
    off: JSON.stringify({ name: "host-b", extensions: { tovu: { seededEnabled: false } } }),
    truthy: JSON.stringify({ name: "host-c", extensions: { tovu: { seededEnabled: "yes" } } }),
    nameless: JSON.stringify({ extensions: { tovu: { seededEnabled: true } } }),
    plain: JSON.stringify({ name: "plain" }),
    broken: "{not json",
    nulled: "null",
  }));
  assert.deepEqual(ids, ["host-a"]);
});

test("an unresolvable or unreadable bundled root contributes nothing instead of failing module load", () => {
  assert.deepEqual(readManifestSeededEnabledPluginIds({ sourceRoot: null }), []);
  assert.deepEqual(readManifestSeededEnabledPluginIds({ sourceRoot: ROOT }, { readDir: () => { throw new Error("ENOENT"); } }), []);
});

test("the real bundled tree's opted-in plugins are all in the seeded-enabled set", () => {
  const bundled = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");
  const optedIn = readManifestSeededEnabledPluginIds({ sourceRoot: bundled });
  assert.ok(optedIn.length > 0, "at least one bundled plugin opts in from its manifest");
  for (const id of optedIn) assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has(id), true, id);
});
