import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { PluginManifest } from "@jini-ai/plugins/host";
import { PluginSnapshotIntegrityError } from "@jini-ai/plugins/host/node";
import { createPluginModuleImporter, pluginHostBinding } from "../../host-binding.js";

/** Exercises Tovu's required import port: existing built-in ABI, immutable site bytes, and
 * containment before executable import. Generic loader/registry behavior is tested by Jini. */
const manifest: PluginManifest = {
  id: "binding-fixture", name: "Binding fixture", version: "1.0.0", sdkRange: "^0.1.0",
  engine: 1, tier: "tier-3", capabilities: [], hooks: [], fields: [], integrity: {},
};

test("built-in seam receives its original entry and projects the default without running setup", async () => {
  let entry: string | undefined;
  let setupCalls = 0;
  const exported = { definition: { setup: () => { setupCalls++; } } };
  const importer = createPluginModuleImporter({ manifest, source: "built-in" }, {
    importModule: async (entryPath) => { entry = entryPath; return { default: exported }; },
  });
  assert.deepEqual(await importer({ plugin: { pluginId: manifest.id, packageRoot: "/built-in" }, modulePath: "compiled-in-entry" }), { exported });
  assert.equal(entry, "compiled-in-entry");
  assert.equal(setupCalls, 0);
});

test("non-object module seams remain invalid even when they carry a default property", async () => {
  const invalidModule = Object.assign(() => {}, { default: { definition: { setup() {} } } });
  const importer = createPluginModuleImporter({ manifest, source: "built-in" }, { importModule: async () => invalidModule });
  assert.deepEqual(await importer({ plugin: { pluginId: manifest.id, packageRoot: "/built-in" }, modulePath: "compiled-in-entry" }), { exported: undefined });
});

test("site import retains verified helpers and refuses changed bytes before evaluation", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-host-binding-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packageRoot = path.join(root, "plugins", manifest.id, manifest.version);
  await mkdir(path.join(packageRoot, "server"), { recursive: true });
  const modulePath = path.join(packageRoot, "server", "index.mjs");
  await writeFile(modulePath, 'import { value } from "../helper.mjs"; export default { value };');
  const helper = path.join(packageRoot, "helper.mjs");
  await writeFile(helper, 'export const value = "reviewed";');
  const pinned = { ...manifest, integrity: {
    "server/index.mjs": await pluginHostBinding.verifyDigest({ absoluteFilePath: modulePath }),
    "helper.mjs": await pluginHostBinding.verifyDigest({ absoluteFilePath: helper }),
  } };
  await writeFile(path.join(packageRoot, "tovu.plugin.json"), JSON.stringify(pinned));
  const importer = createPluginModuleImporter({ manifest: pinned, source: "site" });
  const input = { plugin: { pluginId: manifest.id, packageRoot }, modulePath };
  assert.deepEqual(await importer(input), { exported: { value: "reviewed" } });
  await writeFile(helper, 'export const value = "swapped";');
  await assert.rejects(importer(input), PluginSnapshotIntegrityError);
});

test("site entry outside its real package root is refused without importing it", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-host-containment-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packageRoot = path.join(root, "package");
  await mkdir(packageRoot);
  const modulePath = path.join(root, "outside.mjs");
  await writeFile(modulePath, 'throw new Error("outside entry was evaluated");');
  const importer = createPluginModuleImporter({ manifest, source: "site" });
  assert.equal(await importer({ plugin: { pluginId: manifest.id, packageRoot }, modulePath }), `module path '${modulePath}' escapes the plugin root`);
});
