import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { PluginManifest } from "@jini-ai/plugins/host";
import { createPluginModuleSnapshotLifecycle, PluginSnapshotIntegrityError } from "@jini-ai/plugins/host/node";
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

test("the runtime owner retains a site's late dynamic imports until host disposal", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-snapshot-lifecycle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packageRoot = path.join(root, "plugins", manifest.id, manifest.version);
  await mkdir(path.join(packageRoot, "server"), { recursive: true });
  const modulePath = path.join(packageRoot, "server", "index.mjs");
  const latePath = path.join(packageRoot, "late.mjs");
  await writeFile(modulePath, 'export default async () => (await import("../late.mjs")).value;');
  await writeFile(latePath, 'export const value = "retained";');
  const pinned = { ...manifest, integrity: {
    "server/index.mjs": await pluginHostBinding.verifyDigest({ absoluteFilePath: modulePath }),
    "late.mjs": await pluginHostBinding.verifyDigest({ absoluteFilePath: latePath }),
  } };
  const runtimeRoot = path.join(root, "plugins-runtime");
  const snapshots = createPluginModuleSnapshotLifecycle({ runtimeRoot });
  const importer = createPluginModuleImporter({ manifest: pinned, source: "site" }, { snapshots });
  const result = await importer({ plugin: { pluginId: manifest.id, packageRoot }, modulePath });
  assert.notEqual(typeof result, "string");
  assert.equal(await (result as { exported: () => Promise<string> }).exported(), "retained");
  assert.equal((await readdir(runtimeRoot)).length, 1);
  await snapshots.dispose({});
  assert.deepEqual(await readdir(runtimeRoot), []);
});

for (const filename of ["jini.plugin.json", "tovu.plugin.json"]) { // legacy alias
  test(`tier policy accepts declarative ${filename} packages while refusing executable files`, () => {
    const files = new Map([[filename, Buffer.from("{}")]]);
    const declarative = { ...manifest, tier: "tier-1" as const };
    assert.doesNotThrow(() => pluginHostBinding.tierPolicy.checkInstall({ manifest: declarative, files }));
    files.set("server/index.mjs", Buffer.from("export {}"));
    assert.throws(() => pluginHostBinding.tierPolicy.checkInstall({ manifest: declarative, files }), /must not ship code/);
  });
}

test("a built-in source with no injected seam imports its entry directly, without a site snapshot", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-host-builtin-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const modulePath = path.join(root, "entry.mjs");
  await writeFile(modulePath, 'export default { origin: "compiled-in" };');
  const importer = createPluginModuleImporter({ manifest, source: "built-in" });
  assert.deepEqual(await importer({ plugin: { pluginId: manifest.id, packageRoot: root }, modulePath }), { exported: { origin: "compiled-in" } });
});

test("the SDK binding's definePlugin produces a definition its readDefinedPlugin reads back as a module default export", () => {
  const setup = () => {};
  const binding = pluginHostBinding.pluginSdkBinding;
  const defined = binding.definePlugin({ setup });
  const read = binding.readDefinedPlugin({ moduleValue: { default: defined } });
  assert.equal(binding.readDefinedPlugin({ moduleValue: defined }), null, "a bare definition is not a module namespace");
  assert.ok(read, "the wrapped definition is recognised as a defined plugin");
  assert.equal(read.definition.setup, setup);
});

test("site errors refuse a self-declared tier-2 manifest and ignore anything else", () => {
  const { siteErrors } = pluginHostBinding.tierPolicy;
  const errors = siteErrors({ manifestValue: { ...manifest, tier: "tier-2" } });
  assert.equal(errors.length, 1);
  assert.equal(errors[0]!.code, "TIER_NOT_ALLOWED");
  assert.match(errors[0]!.message, /cannot declare tier-2/);
  for (const manifestValue of [{ ...manifest, tier: "tier-3" }, null, "tier-2", 7]) assert.deepEqual(siteErrors({ manifestValue }), []);
});

test("an executable install needs server/index.mjs and a tier-3 declaration", () => {
  const { checkInstall } = pluginHostBinding.tierPolicy;
  const withEntry = new Map([["tovu.plugin.json", Buffer.from("{}")], ["server/index.mjs", Buffer.from("export {}")]]);
  assert.doesNotThrow(() => checkInstall({ manifest, files: withEntry }));
  assert.throws(() => checkInstall({ manifest, files: new Map([["tovu.plugin.json", Buffer.from("{}")]]) }), /server\/index\.mjs is required/);
  assert.throws(() => checkInstall({ manifest: { ...manifest, tier: "tier-2" }, files: withEntry }), /must declare tier-3/);
});
