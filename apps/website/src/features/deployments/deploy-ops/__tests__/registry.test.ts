import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { forceRemove } from "../../../agent-plugins/__tests__/fixtures/force-remove.js";
import { loadDeployOpsRegistryFromSource, parseDeployOpsFile, requirePlatform } from "../registry.js";
test("real bundled ops manifest loads both contained modules and refuses unknown ids", async () => {
  const registry = await loadDeployOpsRegistryFromSource({ pluginId: "deploy", packageRoot: path.resolve("content/agent-plugins/deploy") });
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
test("installed deploy package must be active and match the bundled digest", async () => {
  const { createHash } = await import("node:crypto");
  const { readFile } = await import("node:fs/promises");
  const { installAgentPlugin } = await import("../../../agent-plugins/install.js");
  const { resolveAgentPluginLayout } = await import("../../../agent-plugins/layout.js");
  const { recordBundledAgentPluginDigests } = await import("../../../agent-plugins/bundled-digests.js");
  const { setAgentPluginActivation } = (await import("../../../agent-plugins/activation-effects.js")).agentPluginActivations;
  const { loadDeployOpsRegistry } = await import("../registry.js");
  const root = await mkdtemp(path.join(tmpdir(), "t01-ops-installed-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = root;
  try {
    const files = Object.fromEntries(await Promise.all(["plugin.json", "tovu-deploy-ops.json", "deploy-ops/fly.mjs", "deploy-ops/github-actions.mjs"].map(async name => [name, await readFile(path.resolve("content/agent-plugins/deploy", name), "utf8")])));
    const archive = new Uint8Array(Buffer.from(JSON.stringify(files)));
    const installed = await installAgentPlugin({ archive, expectedSha256: createHash("sha256").update(archive).digest("hex"), archiveReader: { async *entries() { for (const [entryPath, content] of Object.entries(files)) { const bytes = Buffer.from(content as string); yield { kind: "file" as const, entryPath, declaredSize: bytes.length, executable: false, async *openReadStream() { yield bytes; } }; } } }, layout: resolveAgentPluginLayout(), workspaceId: "ws" });
    const workspaceRoot = resolveAgentPluginLayout().forWorkspace("ws").root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "deploy", enabled: true, actor: "test" }, { origin: "bundled" });
    const untrusted = await loadDeployOpsRegistry({ workspaceId: "ws" });
    assert.deepEqual(untrusted.list(), []);
    assert.deepEqual(untrusted.refusals, [`deploy ops from 'deploy' were not loaded: only plugins shipped with Tovu may add deploy ops (installed digest ${installed.archiveDigest.slice(0, 12)} is not the one this build shipped)`]);
    await recordBundledAgentPluginDigests({ workspaceRoot, seeded: [{ pluginId: "deploy", archiveDigest: installed.archiveDigest }] });
    assert.deepEqual((await loadDeployOpsRegistry({ workspaceId: "ws" })).list().map(p => p.descriptor.id), ["fly", "github-actions"]);
    await setAgentPluginActivation({ workspaceRoot, pluginId: "deploy", enabled: false, actor: "test" });
    assert.deepEqual((await loadDeployOpsRegistry({ workspaceId: "ws" })).list(), []);
  } finally { if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous; await forceRemove(root); }
});
