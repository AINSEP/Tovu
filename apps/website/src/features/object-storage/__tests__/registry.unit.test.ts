import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { OBJECT_STORE_CONTRACT } from "@jini-ai/core/object-store";

import type { LoadPluginContributions } from "../../agent-plugins/lifecycle.js";
import { loadBundledObjectStoreRegistry, loadObjectStoreRegistry, OBJECT_STORES_FILENAME, parseObjectStoresFile, type TovuObjectStoreProvider } from "../registry.js";

/**
 * @file Tovu's object-store provider registry: the `tovu-object-stores.json` manifest parser, the
 * installed-plugin loader (with a fake contribution loader standing in for the lifecycle owner), and
 * the bundled-source loader run against the REAL `content/agent-plugins` tree and a temp tree of
 * deliberately broken plugins.
 */

const BUNDLED_SOURCE_ROOT = path.resolve(import.meta.dirname, "../../../../../../content/agent-plugins");

const manifest = (value: unknown) => parseObjectStoresFile({ raw: JSON.stringify(value) });

// ---------------------------------------------------------------------------
// parseObjectStoresFile
// ---------------------------------------------------------------------------

test("parseObjectStoresFile: accepts entries with and without a label, keeping label only when given", () => {
  assert.deepEqual(manifest({ schemaVersion: 1, providers: [
    { id: "s3_compatible", module: "object-stores/s3.mjs", label: "S3-compatible storage" },
    { id: "plain", module: "./plain.mjs" },
  ] }), { ok: true, descriptors: [
    { id: "s3_compatible", module: "object-stores/s3.mjs", label: "S3-compatible storage" },
    { id: "plain", module: "./plain.mjs" },
  ] });
  assert.deepEqual(manifest({ schemaVersion: 1, providers: [] }), { ok: true, descriptors: [] });
});

test("parseObjectStoresFile: a label of exactly 100 characters is accepted, 101 is refused", () => {
  const ok = manifest({ schemaVersion: 1, providers: [{ id: "a", module: "a.mjs", label: "x".repeat(100) }] });
  assert.deepEqual(ok, { ok: true, descriptors: [{ id: "a", module: "a.mjs", label: "x".repeat(100) }] });
  assert.deepEqual(manifest({ schemaVersion: 1, providers: [{ id: "a", module: "a.mjs", label: "x".repeat(101) }] }), {
    ok: false, reason: "providers[0].label must be a non-empty string of at most 100 characters",
  });
});

test("parseObjectStoresFile: refuses text that is not JSON", () => {
  assert.deepEqual(parseObjectStoresFile({ raw: "{ not json" }), { ok: false, reason: "not valid JSON" });
});

test("parseObjectStoresFile: refuses a non-object root or any schemaVersion other than 1", () => {
  for (const value of [null, [], "x", 1, {}, { schemaVersion: 2, providers: [] }, { schemaVersion: "1", providers: [] }]) {
    assert.deepEqual(manifest(value), { ok: false, reason: "schemaVersion must be 1" }, JSON.stringify(value));
  }
});

test("parseObjectStoresFile: refuses providers that is not an array", () => {
  assert.deepEqual(manifest({ schemaVersion: 1 }), { ok: false, reason: "providers must be an array" });
  assert.deepEqual(manifest({ schemaVersion: 1, providers: { id: "a" } }), { ok: false, reason: "providers must be an array" });
});

test("parseObjectStoresFile: refuses an entry that is not a plain object, naming its index", () => {
  assert.deepEqual(manifest({ schemaVersion: 1, providers: [{ id: "a", module: "a.mjs" }, null] }), { ok: false, reason: "providers[1] must be an object" });
  assert.deepEqual(manifest({ schemaVersion: 1, providers: [["a"]] }), { ok: false, reason: "providers[0] must be an object" });
});

test("parseObjectStoresFile: refuses a non-string id", () => {
  assert.deepEqual(manifest({ schemaVersion: 1, providers: [{ id: 7, module: "a.mjs" }] }), { ok: false, reason: "providers[0].id must be a string" });
  assert.deepEqual(manifest({ schemaVersion: 1, providers: [{ module: "a.mjs" }] }), { ok: false, reason: "providers[0].id must be a string" });
});

test("parseObjectStoresFile: refuses a module that is not a string, not .mjs, or absolute", () => {
  const reason = "providers[0].module must be a relative path ending in .mjs";
  for (const module of [undefined, 3, "provider.js", "provider.mjs.txt", "/abs/provider.mjs"]) {
    assert.deepEqual(manifest({ schemaVersion: 1, providers: [{ id: "a", module }] }), { ok: false, reason }, String(module));
  }
});

test("parseObjectStoresFile: refuses a label that is non-string or blank", () => {
  const reason = "providers[0].label must be a non-empty string of at most 100 characters";
  for (const label of [5, null, "", "   "]) {
    assert.deepEqual(manifest({ schemaVersion: 1, providers: [{ id: "a", module: "a.mjs", label }] }), { ok: false, reason }, JSON.stringify(label));
  }
});

test("parseObjectStoresFile: refuses an id declared twice in one file", () => {
  assert.deepEqual(manifest({ schemaVersion: 1, providers: [{ id: "a", module: "a.mjs" }, { id: "b", module: "b.mjs" }, { id: "a", module: "c.mjs" }] }), {
    ok: false, reason: "providers[2].id 'a' is declared twice",
  });
});

// ---------------------------------------------------------------------------
// loadObjectStoreRegistry (installed plugins, fake loader)
// ---------------------------------------------------------------------------

const fakeProvider = (): TovuObjectStoreProvider => ({ create: () => { throw new Error("not called"); } });

test("loadObjectStoreRegistry: local is seeded and default; plugin items are contributed; loader and registry refusals merge in order", async (t) => {
  const uploadsDir = await mkdtemp(path.join(tmpdir(), "tovu-object-store-registry-"));
  t.after(() => rm(uploadsDir, { recursive: true, force: true }));
  const pluginProvider = fakeProvider();
  const calls: Array<{ workspaceId: string; filename: string; contribution: string; options: unknown }> = [];
  const loadContributions = (async (input: { workspaceId: string; definition: { filename: string; contribution: string } }, options?: unknown) => {
    calls.push({ workspaceId: input.workspaceId, filename: input.definition.filename, contribution: input.definition.contribution, options });
    return {
      items: [
        { contract: OBJECT_STORE_CONTRACT, pluginId: "gcs", definition: { id: "gcs_bucket", provider: pluginProvider, label: "GCS" } },
        { contract: OBJECT_STORE_CONTRACT, pluginId: "rogue", definition: { id: "local", provider: fakeProvider() } },
      ],
      refusals: ["object_store providers from 'broken' were not loaded: tovu-object-stores.json is invalid: not valid JSON"],
    };
  }) as unknown as LoadPluginContributions;

  const { registry, refusals } = await loadObjectStoreRegistry({ workspaceId: "ws-1", uploadsDir, loadContributions });

  assert.deepEqual(calls, [{ workspaceId: "ws-1", filename: OBJECT_STORES_FILENAME, contribution: "object_store providers", options: { orderByPluginId: true } }]);
  assert.equal(registry.getDefault()?.id, "local");
  assert.equal(registry.get({ id: "local" })?.origin, "core");
  assert.equal(registry.get({ id: "local" })?.label, "This server's disk");
  assert.equal(registry.get({ id: "gcs_bucket" })?.provider, pluginProvider);
  assert.equal(registry.get({ id: "gcs_bucket" })?.pluginId, "gcs");
  assert.deepEqual(registry.list().map((entry) => entry.id), ["local", "gcs_bucket"]);
  assert.equal(refusals.length, 2);
  assert.equal(refusals[0], "object_store providers from 'broken' were not loaded: tovu-object-stores.json is invalid: not valid JSON");
  assert.match(refusals[1]!, /local/);
  assert.match(refusals[1]!, /rogue/);
});

test("loadObjectStoreRegistry: the seeded local provider writes under uploadsDir", async (t) => {
  const uploadsDir = await mkdtemp(path.join(tmpdir(), "tovu-object-store-registry-"));
  t.after(() => rm(uploadsDir, { recursive: true, force: true }));
  const loadContributions = (async () => ({ items: [], refusals: [] })) as unknown as LoadPluginContributions;
  const { registry, refusals } = await loadObjectStoreRegistry({ workspaceId: "ws-1", uploadsDir, loadContributions });
  assert.deepEqual(refusals, []);
  const created = registry.get({ id: "local" })!.provider.create({ settings: {}, host: { createSigV4Client: () => { throw new Error("unused"); } } });
  assert.equal(created.status, "ok");
  if (created.status !== "ok") return;
  await created.value.put({ key: "ws/a/blobs/ab/abc", bytes: new Uint8Array([1, 2, 3]) });
  assert.deepEqual(await created.value.head({ key: "ws/a/blobs/ab/abc" }), { size: 3 });
  assert.deepEqual(new Uint8Array(await readFile(path.join(uploadsDir, "ws/a/blobs/ab/abc"))), new Uint8Array([1, 2, 3]));
});

// ---------------------------------------------------------------------------
// loadBundledObjectStoreRegistry
// ---------------------------------------------------------------------------

test("loadBundledObjectStoreRegistry: the real bundled source contributes s3_compatible from the s3-compatible plugin, with no refusals", async () => {
  const { registry, refusals } = await loadBundledObjectStoreRegistry({ uploadsDir: "/nonexistent-uploads", sourceRoot: BUNDLED_SOURCE_ROOT });
  assert.deepEqual(refusals, []);
  assert.equal(registry.getDefault()?.id, "local");
  const s3 = registry.get({ id: "s3_compatible" });
  assert.ok(s3, "s3_compatible must be contributed");
  assert.equal(s3.origin, "plugin");
  assert.equal(s3.pluginId, "s3-compatible");
  assert.equal(s3.label, "S3-compatible storage");
  assert.equal(typeof s3.provider.create, "function");
});

async function writePlugin(root: string, pluginId: string, files: Record<string, string>): Promise<void> {
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, pluginId, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
}

async function tempSourceRoot(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-object-store-source-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("loadBundledObjectStoreRegistry: a bad manifest and a non-provider module become refusal lines; good plugins still load", async (t) => {
  const root = await tempSourceRoot(t);
  const pluginJson = JSON.stringify({ name: "x", version: "0.0.0" });
  await writePlugin(root, "a-bad-manifest", { "plugin.json": pluginJson, [OBJECT_STORES_FILENAME]: "{ nope" });
  await writePlugin(root, "b-not-a-provider", {
    "plugin.json": pluginJson,
    [OBJECT_STORES_FILENAME]: JSON.stringify({ schemaVersion: 1, providers: [{ id: "broken_store", module: "store.mjs" }] }),
    "store.mjs": "export default { notCreate: true };\n",
  });
  await writePlugin(root, "c-good", {
    "plugin.json": pluginJson,
    [OBJECT_STORES_FILENAME]: JSON.stringify({ schemaVersion: 1, providers: [{ id: "good_store", module: "store.mjs", label: "Good" }] }),
    "store.mjs": "export default { create: () => ({ status: 'ok', value: null }) };\n",
  });
  // No plugin.json: not a package, never read (its manifest would otherwise be a refusal).
  await writePlugin(root, "d-not-a-package", { [OBJECT_STORES_FILENAME]: "{ nope" });

  const { registry, refusals } = await loadBundledObjectStoreRegistry({ uploadsDir: "/nonexistent-uploads", sourceRoot: root });

  assert.deepEqual(refusals, [
    "object_store providers from 'a-bad-manifest' were not loaded: tovu-object-stores.json is invalid: not valid JSON",
    "object_store provider 'broken_store' from 'b-not-a-provider' was not loaded: an object-store provider must define create()",
  ]);
  assert.deepEqual(registry.list().map((entry) => entry.id), ["local", "good_store"]);
  assert.equal(registry.get({ id: "good_store" })?.label, "Good");
});

test("loadBundledObjectStoreRegistry: an empty source root yields only local", async (t) => {
  const root = await tempSourceRoot(t);
  const { registry, refusals } = await loadBundledObjectStoreRegistry({ uploadsDir: "/nonexistent-uploads", sourceRoot: root });
  assert.deepEqual(refusals, []);
  assert.deepEqual(registry.list().map((entry) => entry.id), ["local"]);
  assert.equal(registry.get({ id: "local" })!.provider.create({ settings: {}, host: { createSigV4Client: () => { throw new Error("unused"); } } }).status, "ok");
});
