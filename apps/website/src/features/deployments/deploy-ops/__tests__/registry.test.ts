import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { forceRemove } from "../../../agent-plugins/__tests__/fixtures/force-remove.js";
import { bundledContributionSources } from "../../../agent-plugins/bundled-contribution-sources.js";
import { fileURLToPath } from "node:url";
import { loadDeployOpsRegistryFromSource, loadBundledDeployOpsRegistry, readBundledDeployOpsDescriptors, parseDeployOpsFile, requirePlatform } from "../registry.js";
const FIXTURE_SOURCE_ROOT = fileURLToPath(new URL("./fixtures/", import.meta.url));
test("a bundled ops manifest loads every contained module and refuses unknown ids", async () => {
  const registry = await loadBundledDeployOpsRegistry({ sourceRoot: FIXTURE_SOURCE_ROOT });
  assert.deepEqual(registry.list().map(p => ({ id: p.descriptor.id, hosts: p.descriptor.hosts })), [{ id: "example-host", hosts: ["api.example-host.dev", "logs.example-host.dev"] }, { id: "example-observer", hosts: ["api.example-host.dev"] }, { id: "example-pipeline", hosts: ["api.example-host.dev"] }]);
  assert.deepEqual(registry.refusals, []);
  assert.throws(() => requirePlatform(registry, "missing"), { message: "Unknown deployment ops platform 'missing'. Choose: example-host, example-observer, example-pipeline." });
  // Which vendors ship is each plugin's own test; core only proves the shipped tree loads without refusals.
  const shipped = await loadBundledDeployOpsRegistry({ sourceRoot: path.resolve("content/agent-plugins") });
  assert.deepEqual(shipped.refusals, []);
  assert.deepEqual(shipped.list().map(p => p.descriptor.id), readBundledDeployOpsDescriptors({ sourceRoot: path.resolve("content/agent-plugins") }).map(d => d.id));
});
test("malformed manifests and missing modules are reported refusals, never thrown", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "t01-ops-"));
  try {
    await writeFile(path.join(root, "tovu-deploy-ops.json"), "{");
    assert.deepEqual((await loadDeployOpsRegistryFromSource({ pluginId: "deploy", packageRoot: root })).refusals, ["deploy ops from 'deploy' were not loaded: tovu-deploy-ops.json is invalid: not valid JSON"]);
    await writeFile(path.join(root, "tovu-deploy-ops.json"), JSON.stringify({ schemaVersion: 1, platforms: [{ id: "example", label: "Example", hosts: ["api.example.com"], module: "missing.mjs" }] }));
    assert.deepEqual((await loadDeployOpsRegistryFromSource({ pluginId: "deploy", packageRoot: root })).refusals, ["deploy ops platform 'example' was not loaded: module could not be imported"]);
  } finally { await forceRemove(root); }
});
test("parser refuses duplicate platforms, empty hosts and escaping paths", () => {
  assert.deepEqual(parseDeployOpsFile("{}"), { ok: false, reason: "schemaVersion must be 1" });
  const entry = { id: "example", label: "Example", module: "example.mjs", hosts: ["api.example.com"] };
  assert.deepEqual(parseDeployOpsFile(JSON.stringify({ schemaVersion: 1, platforms: [entry, entry] })), { ok: false, reason: "platforms[1].id 'example' is declared twice" });
  assert.deepEqual(parseDeployOpsFile(JSON.stringify({ schemaVersion: 1, platforms: [{ ...entry, hosts: [] }] })), { ok: false, reason: "platforms[0].hosts must be a non-empty array of HTTPS hostnames" });
  assert.deepEqual(parseDeployOpsFile(JSON.stringify({ schemaVersion: 1, platforms: [{ ...entry, module: "../evil.mjs" }] })), { ok: false, reason: "platforms[0].module must be a contained relative .mjs path" });
});
test("invalid descriptor fields return exact refusals and load no platforms", async t => {
  const entry = { id: "example", label: "Example", module: "ops.mjs", hosts: ["api.example.com"] };
  for (const [name, platforms, reason] of [
    ["more than 32 platforms", Array.from({ length: 33 }, (_, i) => ({ ...entry, id: `example-${i}` })), "platforms must be an array of at most 32 entries"],
    ["non-object entry", [42], "platforms[0] must be an object"],
    ["invalid id", [{ ...entry, id: "Example" }], "platforms[0].id must be a lowercase hyphenated id"],
    ["blank label", [{ ...entry, label: "   " }], "platforms[0].label must be a non-empty string"],
  ] as const) {
    await t.test(name, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "tovu-ops-invalid-descriptor-"));
      try {
        const raw = JSON.stringify({ schemaVersion: 1, platforms });
        assert.deepEqual(parseDeployOpsFile(raw), { ok: false, reason });
        await writeFile(path.join(root, "tovu-deploy-ops.json"), raw);
        await writeFile(path.join(root, "ops.mjs"), "export default { status() {}, logs() {} };\n");
        const registry = await loadDeployOpsRegistryFromSource({ pluginId: "deploy", packageRoot: root });
        assert.deepEqual(registry.refusals, [`deploy ops from 'deploy' were not loaded: tovu-deploy-ops.json is invalid: ${reason}`]);
        assert.deepEqual(registry.list(), []);
      } finally { await forceRemove(root); }
    });
  }
});

test("invalid module and secrets-adapter shapes return exact refusals and are not registered", async t => {
  for (const [name, body, reason] of [
    ["partial secrets adapter", 'export default { status() {}, logs() {}, listSecrets() {}, setSecret() {}, secretCapabilities: { appliesOn: "next-deploy", supportsStaging: false } };', "a secrets adapter must export listSecrets(), setSecret() and unsetSecret() together"],
    ["missing secret capabilities", "export default { status() {}, logs() {}, listSecrets() {}, setSecret() {}, unsetSecret() {} };", "secretCapabilities must declare appliesOn and supportsStaging"],
    ["non-function status", "export default { status: true, logs() {} };", "module must export status() and logs()"],
  ] as const) {
    await t.test(name, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "tovu-ops-invalid-module-"));
      try {
        await writeFile(path.join(root, "tovu-deploy-ops.json"), JSON.stringify({ schemaVersion: 1, platforms: [{ id: "example", label: "Example", module: "ops.mjs", hosts: ["api.example.com"] }] }));
        await writeFile(path.join(root, "ops.mjs"), body);
        const registry = await loadDeployOpsRegistryFromSource({ pluginId: "deploy", packageRoot: root });
        assert.deepEqual(registry.refusals, [`deploy ops platform 'example' was not loaded: ${reason}`]);
        assert.deepEqual(registry.list(), []);
        assert.equal(registry.get("example"), undefined);
      } finally { await forceRemove(root); }
    });
  }
});

// The owner gate needs a package this build really ships, so the case runs once per shipped ops package
// rather than naming vendors; each package's files and platform ids come from its own manifest.
for (const { pluginId, packageRoot } of bundledContributionSources({ sourceRoot: path.resolve("content/agent-plugins"), filename: "tovu-deploy-ops.json" })) {
  test(`installed ${pluginId} package must be active and match the bundled digest`, async () => {
    const { createHash } = await import("node:crypto");
    const { readFile } = await import("node:fs/promises");
    const { installAgentPlugin, recordBundledAgentPluginDigests } = await import("../../../agent-plugins/lifecycle.js");
    const { setAgentPluginActivation } = (await import("../../../agent-plugins/activation-effects.js")).agentPluginActivations;
    const { loadDeployOpsRegistry } = await import("../registry.js");
    const root = await mkdtemp(path.join(tmpdir(), "t01-ops-installed-"));
    const layout = resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: root } });
    const lifecycle = createTovuAgentPluginLifecycle({ layout });
    try {
      const parsed = parseDeployOpsFile(await readFile(path.join(packageRoot, "tovu-deploy-ops.json"), "utf8"));
      assert.equal(parsed.ok, true);
      const descriptors = parsed.ok ? parsed.descriptors : [];
      const files = Object.fromEntries(await Promise.all(["plugin.json", "tovu-deploy-ops.json", ...descriptors.map(d => d.module)].map(async name => [name, await readFile(path.join(packageRoot, name), "utf8")])));
      const archive = new Uint8Array(Buffer.from(JSON.stringify(files)));
      const installed = await installAgentPlugin({ archive, expectedSha256: createHash("sha256").update(archive).digest("hex"), archiveReader: { async *entries() { for (const [entryPath, content] of Object.entries(files)) { const bytes = Buffer.from(content as string); yield { kind: "file" as const, entryPath, declaredSize: bytes.length, executable: false, async *openReadStream() { yield bytes; } }; } } }, layout, workspaceId: "ws" });
      const workspaceRoot = layout.forWorkspace("ws").root;
      await setAgentPluginActivation({ workspaceRoot, pluginId, enabled: true, actor: "test" }, { origin: "bundled" });
      const untrusted = await loadDeployOpsRegistry({ workspaceId: "ws" }, { loadContributions: lifecycle.loadPluginContributions });
      assert.deepEqual(untrusted.list(), []);
      assert.deepEqual(untrusted.refusals, [`deploy ops from '${pluginId}' were not loaded: only plugins shipped with Tovu may add deploy ops (installed digest ${installed.archiveDigest.slice(0, 12)} is not the one this build shipped)`]);
      await recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId, archiveDigest: installed.archiveDigest }] });
      assert.deepEqual((await loadDeployOpsRegistry({ workspaceId: "ws" }, { loadContributions: lifecycle.loadPluginContributions })).list().map(p => p.descriptor.id), descriptors.map(d => d.id));
      await setAgentPluginActivation({ workspaceRoot, pluginId, enabled: false, actor: "test" });
      assert.deepEqual((await loadDeployOpsRegistry({ workspaceId: "ws" }, { loadContributions: lifecycle.loadPluginContributions })).list(), []);
    } finally { await forceRemove(root); }
  });
}

test("bundled ops discovery unions categories, skips missing/non-package/retired sources and refuses duplicates in registry and enum", async () => {
  const sourceRoot = await mkdtemp(path.join(tmpdir(), "tovu-ops-union-"));
  try {
    for (const [pluginId, id] of [["zeta", "last"], ["alpha", "first"], ["one", "shared"], ["two", "shared"], ["tovu-deploy-fly", "retired"], ["scratch", "scratch"]]) {
      const packageRoot = path.join(sourceRoot, pluginId!);
      await mkdir(packageRoot);
      if (pluginId !== "scratch") await writeFile(path.join(packageRoot, "plugin.json"), JSON.stringify({ name: pluginId, version: "1.0.0" }));
      await writeFile(path.join(packageRoot, "tovu-deploy-ops.json"), JSON.stringify({ schemaVersion: 1, platforms: [{ id, label: id, hosts: ["api.example.com"], module: "ops.mjs" }] }));
      await writeFile(path.join(packageRoot, "ops.mjs"), "export default { status() {}, logs() {} };\n");
    }
    await mkdir(path.join(sourceRoot, "no-category"));
    await writeFile(path.join(sourceRoot, "no-category", "plugin.json"), '{"name":"no-category","version":"1.0.0"}');
    const registry = await loadBundledDeployOpsRegistry({ sourceRoot });
    assert.deepEqual(registry.list().map(item => item.descriptor.id), ["first", "last"]);
    assert.deepEqual(registry.refusals, ["deploy ops platform 'shared' was not loaded: declared more than once"]);
    assert.deepEqual(readBundledDeployOpsDescriptors({ sourceRoot }).map(item => item.id), ["first", "last"]);
  } finally { await forceRemove(sourceRoot); }
});

test("a digest-trusted package outside the ops owners cannot become a parallel ops owner", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-ops-owner-refusal-"));
  try {
    const source = path.join(root, "source");
    await mkdir(source);
    await writeFile(path.join(source, "plugin.json"), '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"example-pages","version":"1.0.0"}');
    await writeFile(path.join(source, "tovu-deploy-ops.json"), JSON.stringify({ schemaVersion: 1, platforms: [{ id: "example-actions", label: "Example Actions", module: "ops.mjs", hosts: ["api.example.com"] }] }));
    await writeFile(path.join(source, "ops.mjs"), "export default { status() {}, logs() {} };\n");
    const layout = resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: path.join(root, "state") } });
    const lifecycle = createTovuAgentPluginLifecycle({ layout });
    const packed = await lifecycle.packAgentPluginDirectory(source);
    const installed = await lifecycle.installAgentPlugin({ layout, workspaceId: "ws", archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: lifecycle.createBundledSourceArchiveReader() });
    const workspaceRoot = layout.forWorkspace("ws").root;
    await lifecycle.setAgentPluginActivation({ workspaceRoot, pluginId: "example-pages", enabled: true, actor: "test" }, { origin: "bundled" });
    await lifecycle.recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId: "example-pages", archiveDigest: installed.archiveDigest }] });
    const { loadDeployOpsRegistry } = await import("../registry.js");
    const registry = await loadDeployOpsRegistry({ workspaceId: "ws" }, { loadContributions: lifecycle.loadPluginContributions });
    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.refusals, ["deploy ops from 'example-pages' were not loaded: only bundled plugins shipping tovu-deploy-ops.json may contribute"]);
  } finally { await forceRemove(root); }
});

test("secrets fields without the secret verbs, and invalid secret capabilities, are refused by exact reason", async t => {
  const caps = 'secretCapabilities: { appliesOn: "next-deploy", supportsStaging: false }';
  for (const [name, body, reason] of [
    ["capabilities without verbs", `export default { status() {}, logs() {}, ${caps} };`, "secretCapabilities and readSecret need listSecrets(), setSecret() and unsetSecret()"],
    ["readSecret without verbs", "export default { status() {}, logs() {}, readSecret() {} };", "secretCapabilities and readSecret need listSecrets(), setSecret() and unsetSecret()"],
    ["unknown appliesOn", 'export default { status() {}, logs() {}, listSecrets() {}, setSecret() {}, unsetSecret() {}, secretCapabilities: { appliesOn: "never", supportsStaging: false } };', "secretCapabilities must declare appliesOn and supportsStaging"],
    ["non-boolean supportsStaging", 'export default { status() {}, logs() {}, listSecrets() {}, setSecret() {}, unsetSecret() {}, secretCapabilities: { appliesOn: "immediately", supportsStaging: "no" } };', "secretCapabilities must declare appliesOn and supportsStaging"],
    ["non-function optional verb", "export default { status() {}, logs() {}, deploy: 1 };", "module must export status() and logs()"],
  ] as const) {
    await t.test(name, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "tovu-ops-secret-shape-"));
      try {
        await writeFile(path.join(root, "tovu-deploy-ops.json"), JSON.stringify({ schemaVersion: 1, platforms: [{ id: "example", label: "Example", module: "ops.mjs", hosts: ["api.example.com"] }] }));
        await writeFile(path.join(root, "ops.mjs"), body);
        const registry = await loadDeployOpsRegistryFromSource({ pluginId: "deploy", packageRoot: root }, {});
        assert.deepEqual(registry.refusals, [`deploy ops platform 'example' was not loaded: ${reason}`]);
        assert.deepEqual(registry.list(), []);
      } finally { await forceRemove(root); }
    });
  }
  await t.test("a complete secrets adapter loads", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "tovu-ops-secret-ok-"));
    try {
      await writeFile(path.join(root, "tovu-deploy-ops.json"), JSON.stringify({ schemaVersion: 1, platforms: [{ id: "example", label: "Example", module: "ops.mjs", hosts: ["api.example.com"] }] }));
      await writeFile(path.join(root, "ops.mjs"), `export default { status() {}, logs() {}, listSecrets() {}, setSecret() {}, unsetSecret() {}, readSecret() {}, ${caps} };`);
      const registry = await loadDeployOpsRegistryFromSource({ pluginId: "deploy", packageRoot: root });
      assert.deepEqual(registry.refusals, []);
      assert.equal(registry.get("example")?.descriptor.label, "Example");
    } finally { await forceRemove(root); }
  });
});

test("an unreadable manifest is a refusal for the registry and is skipped by enum discovery", async () => {
  const sourceRoot = await mkdtemp(path.join(tmpdir(), "tovu-ops-unreadable-"));
  try {
    const packageRoot = path.join(sourceRoot, "broken");
    await mkdir(path.join(packageRoot, "tovu-deploy-ops.json"), { recursive: true });
    await writeFile(path.join(packageRoot, "plugin.json"), JSON.stringify({ name: "broken", version: "1.0.0" }));
    const invalidRoot = path.join(sourceRoot, "invalid");
    await mkdir(invalidRoot);
    await writeFile(path.join(invalidRoot, "plugin.json"), JSON.stringify({ name: "invalid", version: "1.0.0" }));
    await writeFile(path.join(invalidRoot, "tovu-deploy-ops.json"), "{}");
    assert.deepEqual((await loadDeployOpsRegistryFromSource({ pluginId: "broken", packageRoot })).refusals, ["deploy ops from 'broken' were not loaded: tovu-deploy-ops.json could not be read"]);
    assert.deepEqual(readBundledDeployOpsDescriptors({ sourceRoot }, {}), []);
    assert.deepEqual((await loadBundledDeployOpsRegistry({ sourceRoot }, {})).list(), []);
  } finally { await forceRemove(sourceRoot); }
});

test("a loader fault becomes one refusal, and requirePlatform names no platforms plus every refusal", async () => {
  const { loadDeployOpsRegistry } = await import("../registry.js");
  const registry = await loadDeployOpsRegistry({ workspaceId: "ws" }, { loadContributions: async () => { throw new Error("EIO"); } });
  assert.deepEqual(registry.list(), []);
  assert.deepEqual(registry.refusals, ["deploy ops were not loaded: installed plugin packages could not be read"]);
  assert.throws(() => requirePlatform(registry, "example-host"), { message: "Unknown deployment ops platform 'example-host'. Choose: (none). deploy ops were not loaded: installed plugin packages could not be read" });
});
