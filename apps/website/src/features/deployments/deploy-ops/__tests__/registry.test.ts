import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { forceRemove } from "../../../agent-plugins/__tests__/fixtures/force-remove.js";
import { loadDeployOpsRegistryFromSource, loadBundledDeployOpsRegistry, readBundledDeployOpsDescriptors, parseDeployOpsFile, requirePlatform } from "../registry.js";
test("real bundled ops manifest loads both contained modules and refuses unknown ids", async () => {
  const registry = await loadBundledDeployOpsRegistry({ sourceRoot: path.resolve("content/agent-plugins") });
  assert.deepEqual(registry.list().map(p => ({ id: p.descriptor.id, hosts: p.descriptor.hosts })), [{ id: "fly", hosts: ["api.machines.dev", "api.fly.io"] }, { id: "github-actions", hosts: ["api.github.com"] }]);
  assert.deepEqual(registry.refusals, []);
  assert.throws(() => requirePlatform(registry, "missing"), { message: "Unknown deployment ops platform 'missing'. Choose: fly, github-actions." });
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
for (const [pluginId, moduleName] of [["fly", "fly"], ["github", "github-actions"]] as const) {
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
      const files = Object.fromEntries(await Promise.all(["plugin.json", "tovu-deploy-ops.json", `deploy-ops/${moduleName}.mjs`].map(async name => [name, await readFile(path.resolve("content/agent-plugins", pluginId, name), "utf8")])));
      const archive = new Uint8Array(Buffer.from(JSON.stringify(files)));
      const installed = await installAgentPlugin({ archive, expectedSha256: createHash("sha256").update(archive).digest("hex"), archiveReader: { async *entries() { for (const [entryPath, content] of Object.entries(files)) { const bytes = Buffer.from(content as string); yield { kind: "file" as const, entryPath, declaredSize: bytes.length, executable: false, async *openReadStream() { yield bytes; } }; } } }, layout, workspaceId: "ws" });
      const workspaceRoot = layout.forWorkspace("ws").root;
      await setAgentPluginActivation({ workspaceRoot, pluginId, enabled: true, actor: "test" }, { origin: "bundled" });
      const untrusted = await loadDeployOpsRegistry({ workspaceId: "ws" }, { loadContributions: lifecycle.loadPluginContributions });
      assert.deepEqual(untrusted.list(), []);
      assert.deepEqual(untrusted.refusals, [`deploy ops from '${pluginId}' were not loaded: only plugins shipped with Tovu may add deploy ops (installed digest ${installed.archiveDigest.slice(0, 12)} is not the one this build shipped)`]);
      await recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId, archiveDigest: installed.archiveDigest }] });
      assert.deepEqual((await loadDeployOpsRegistry({ workspaceId: "ws" }, { loadContributions: lifecycle.loadPluginContributions })).list().map(p => p.descriptor.id), [moduleName]);
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
    await writeFile(path.join(source, "plugin.json"), '{"name":"github-pages","version":"1.0.0"}');
    await writeFile(path.join(source, "tovu-deploy-ops.json"), JSON.stringify({ schemaVersion: 1, platforms: [{ id: "github-actions", label: "GitHub Actions", module: "ops.mjs", hosts: ["api.github.com"] }] }));
    await writeFile(path.join(source, "ops.mjs"), "export default { status() {}, logs() {} };\n");
    const layout = resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: path.join(root, "state") } });
    const lifecycle = createTovuAgentPluginLifecycle({ layout });
    const packed = await lifecycle.packAgentPluginDirectory(source);
    const installed = await lifecycle.installAgentPlugin({ layout, workspaceId: "ws", archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: lifecycle.createBundledSourceArchiveReader() });
    const workspaceRoot = layout.forWorkspace("ws").root;
    await lifecycle.setAgentPluginActivation({ workspaceRoot, pluginId: "github-pages", enabled: true, actor: "test" }, { origin: "bundled" });
    await lifecycle.recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId: "github-pages", archiveDigest: installed.archiveDigest }] });
    const { loadDeployOpsRegistry } = await import("../registry.js");
    const registry = await loadDeployOpsRegistry({ workspaceId: "ws" }, { loadContributions: lifecycle.loadPluginContributions });
    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.refusals, ["deploy ops from 'github-pages' were not loaded: only the bundled deploy, fly and github plugins may contribute"]);
  } finally { await forceRemove(root); }
});
