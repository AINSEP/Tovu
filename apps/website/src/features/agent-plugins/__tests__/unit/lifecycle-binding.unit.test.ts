import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import {
  createTovuAgentPluginLifecycle,
  explicitRootAgentPluginActivations,
  resolveAgentPluginDeliveryMode,
  unboundSiteAgentPluginLayout,
} from "../../lifecycle.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { forceRemove } from "../fixtures/force-remove.js";

/**
 * @file The Tovu binding of the Jini lifecycle owner (`lifecycle.ts`): its delivery-mode policy, the
 * import-time layout that refuses to pick a site, and the positional-ABI wrappers it exposes, each
 * driven against a real temp agent-plugins root.
 */

const WORKSPACE = "workspace-local";

async function boundLifecycle(t: TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-lifecycle-binding-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  });
  const layout = resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: dir } });
  return { dir, layout, lifecycle: createTovuAgentPluginLifecycle({ layout }) };
}

async function packedNotes(dir: string, lifecycle: ReturnType<typeof createTovuAgentPluginLifecycle>) {
  const source = path.join(dir, "source", "notes");
  await mkdir(path.join(source, "skills", "notes"), { recursive: true });
  await writeFile(path.join(source, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "notes", version: "1.0.0", description: "Keeps notes." }));
  await writeFile(path.join(source, "skills", "notes", "SKILL.md"), "---\nname: notes\ndescription: Take notes.\n---\nWrite things down.");
  return lifecycle.packAgentPluginDirectory(source);
}

test("delivery mode is pointer only when asked for exactly; unset or a typo stays inject", () => {
  assert.equal(resolveAgentPluginDeliveryMode({ TOVU_AGENT_PLUGIN_DELIVERY: "pointer" }), "pointer");
  assert.equal(resolveAgentPluginDeliveryMode({}), "inject");
  assert.equal(resolveAgentPluginDeliveryMode({ TOVU_AGENT_PLUGIN_DELIVERY: "Pointer" }), "inject");
});

test("the import-time layout never selects a site: every workspace lookup refuses", () => {
  assert.equal(unboundSiteAgentPluginLayout.root, "");
  assert.throws(() => unboundSiteAgentPluginLayout.forWorkspace(WORKSPACE), /must be supplied by the booted site binding/);
});

test("pack, bundled reader and install round-trip through the binding's positional wrappers", async t => {
  const { dir, layout, lifecycle } = await boundLifecycle(t);
  const packed = await packedNotes(dir, lifecycle);
  assert.ok(packed.files.includes("plugin.json"));
  const installed = await lifecycle.installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: lifecycle.createBundledSourceArchiveReader(), layout, workspaceId: WORKSPACE });
  assert.equal(installed.pluginId, "notes");
  assert.equal(installed.archiveDigest, packed.sha256);
  const workspace = layout.forWorkspace(WORKSPACE);
  assert.deepEqual((await lifecycle.listInstalledPlugins(workspace.root)).map(plugin => plugin.pluginId), ["notes"]);
  const packagesDir = workspace.pluginPackagesDir({ pluginId: "notes" });
  assert.equal(await lifecycle.isInstalledDigestPresent(packagesDir, packed.sha256), true);
  assert.equal(await lifecycle.isInstalledDigestPresent(packagesDir, "0".repeat(64)), false);
  const indexed = await lifecycle.indexInstalledRoot(installed.packageRoot, packed.sha256);
  assert.equal(indexed.pluginId, "notes");
  assert.deepEqual(indexed.skills.map(skill => skill.name), ["notes"]);
  const refs = await lifecycle.resolveAgentPluginRefs(["notes", "missing"], workspace, "inject");
  assert.ok(JSON.stringify(refs).includes("missing"), "an unknown ref is reported, not dropped");
});

test("pure helpers delegate unchanged: entry paths, digest ledgers, archive cap and ranking", async t => {
  const { lifecycle } = await boundLifecycle(t);
  assert.equal(lifecycle.normalizePackageEntryPath("skills/notes/SKILL.md"), "skills/notes/SKILL.md");
  assert.throws(() => lifecycle.normalizePackageEntryPath("../escape"));
  assert.ok(lifecycle.maxAgentPluginInstallArchiveBytes() > 0);
  assert.equal(lifecycle.normalizeBundledDigests("not a ledger").size, 0);
  assert.deepEqual(lifecycle.rankInstalledAgentPlugins("notes", [], 5), []);
  const bundledDigest = "b".repeat(64);
  const installed = [{ pluginId: "notes", archiveDigest: "c".repeat(64) }, { pluginId: "notes", archiveDigest: bundledDigest }, { pluginId: "other", archiveDigest: "d".repeat(64) }];
  assert.deepEqual(lifecycle.preferBundledAgentPluginDigests(installed, new Map([["notes", bundledDigest]])).map(entry => entry.archiveDigest), [bundledDigest, "d".repeat(64)]);
});

test("recordBundledAgentPluginDigests passes an injected clock through and the ledger reads back", async t => {
  const { layout, lifecycle } = await boundLifecycle(t);
  const root = layout.forWorkspace(WORKSPACE).root;
  await mkdir(root, { recursive: true });
  const digest = "a".repeat(64);
  let clockReads = 0;
  await lifecycle.recordBundledAgentPluginDigests({ workspaceRoot: root, seeded: [{ pluginId: "notes", archiveDigest: digest }], now: () => { clockReads += 1; return new Date("2026-10-22T00:00:00.000Z"); } });
  assert.ok(clockReads >= 1, "the injected clock was consulted");
  assert.equal((await lifecycle.readBundledAgentPluginDigests(root)).get("notes"), digest);
});

test("uninstall preview and uninstall go through the caller's layout", async t => {
  const { dir, layout, lifecycle } = await boundLifecycle(t);
  const packed = await packedNotes(dir, lifecycle);
  await lifecycle.installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: lifecycle.createBundledSourceArchiveReader(), layout, workspaceId: WORKSPACE });
  const preview = await lifecycle.previewAgentPluginUninstall({ layout, workspaceId: WORKSPACE, pluginId: "notes" });
  assert.equal(preview.pluginId, "notes");
  await lifecycle.uninstallAgentPlugin({ layout, workspaceId: WORKSPACE, pluginId: "notes", ...("previewToken" in preview ? { previewToken: preview.previewToken } : {}) } as Parameters<typeof lifecycle.uninstallAgentPlugin>[0]);
  assert.deepEqual(await lifecycle.listInstalledPlugins(layout.forWorkspace(WORKSPACE).root), []);
});

test("trusted-package lookup reports switched-off packages to onInactive", async t => {
  const { dir, layout, lifecycle } = await boundLifecycle(t);
  const packed = await packedNotes(dir, lifecycle);
  await lifecycle.installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: lifecycle.createBundledSourceArchiveReader(), layout, workspaceId: WORKSPACE });
  await explicitRootAgentPluginActivations.setAgentPluginActivation({ workspaceRoot: layout.forWorkspace(WORKSPACE).root, pluginId: "notes", enabled: false, actor: "owner" });
  const inactive: string[] = [];
  const verdicts = await lifecycle.findTrustedPluginPackages({ workspaceId: WORKSPACE, filename: "plugin.json", contribution: "test seams", requireActive: true, onInactive: async plugin => { inactive.push(plugin.pluginId); } });
  assert.deepEqual(inactive, ["notes"]);
  assert.equal(verdicts.some(verdict => "trusted" in verdict), false, "a switched-off package is never trusted");
});

test("a seeded bundled plugin refuses uninstall with Tovu's disable recovery, and retirement with nothing retired is a no-op", async t => {
  const { dir, layout, lifecycle } = await boundLifecycle(t);
  const sourceRoot = path.join(dir, "bundled");
  await mkdir(path.join(sourceRoot, "plain-bundled"), { recursive: true });
  await writeFile(path.join(sourceRoot, "plain-bundled", "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "plain-bundled", version: "1.0.0" }));
  const seeded = await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE, sourceRoot });
  assert.deepEqual(seeded.outcomes.map(outcome => [outcome.pluginId, outcome.status]), [["plain-bundled", "seeded"]]);
  await assert.rejects(() => lifecycle.uninstallAgentPlugin({ layout, workspaceId: WORKSPACE, pluginId: "plain-bundled" } as Parameters<typeof lifecycle.uninstallAgentPlugin>[0]),
    /cannot be uninstalled[\s\S]*disable it instead: call plugins_set_enabled with family 'agent-plugin', pluginId 'plain-bundled', enabled false/);
  const retired = await lifecycle.retireBundledAgentPlugins({ layout, workspaceId: WORKSPACE }, { retiredBundledPlugins: new Set<string>() } as Parameters<typeof lifecycle.retireBundledAgentPlugins>[1]);
  assert.ok(retired);
  assert.deepEqual((await lifecycle.listInstalledPlugins(layout.forWorkspace(WORKSPACE).root)).map(plugin => plugin.pluginId), ["plain-bundled"]);
});

test("a host archive reader's non-file entries pass through the positional adapter unchanged", async t => {
  const { dir, layout, lifecycle } = await boundLifecycle(t);
  const packed = await packedNotes(dir, lifecycle);
  const bundledReader = lifecycle.createBundledSourceArchiveReader();
  const seen: string[] = [];
  const installed = await lifecycle.installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256, layout, workspaceId: WORKSPACE, archiveReader: {
    async *entries(archive) {
      yield { kind: "directory" as const, entryPath: "skills/" };
      for await (const entry of bundledReader.entries(archive)) { seen.push(entry.entryPath); yield entry; }
    },
  } });
  assert.equal(installed.pluginId, "notes");
  assert.ok(seen.includes("plugin.json"));
});

test("a trusted bundled package's files and modules are read through the binding", async t => {
  const { dir, layout, lifecycle } = await boundLifecycle(t);
  const sourceRoot = path.join(dir, "bundled");
  const pkg = path.join(sourceRoot, "seam-bundled");
  await mkdir(pkg, { recursive: true });
  await writeFile(path.join(pkg, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "seam-bundled", version: "1.0.0" }));
  await writeFile(path.join(pkg, "seam.json"), JSON.stringify({ hello: "world" }));
  await writeFile(path.join(pkg, "seam.mjs"), "export default { answer: 42 };\n");
  await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE, sourceRoot });
  const verdicts = await lifecycle.findTrustedPluginPackages({ workspaceId: WORKSPACE, filename: "seam.json", contribution: "test seams", requireActive: false });
  const trusted = verdicts.flatMap(verdict => "trusted" in verdict ? [verdict.trusted] : []);
  assert.deepEqual(trusted.map(plugin => plugin.pluginId), ["seam-bundled"], JSON.stringify(verdicts));
  assert.equal(JSON.parse(String(await lifecycle.readTrustedPluginFile(trusted[0]!, "seam.json"))).hello, "world");
  assert.deepEqual(await lifecycle.importContainedModule(trusted[0]!, "seam.mjs"), { exported: { answer: 42 } });
  assert.match(String(await lifecycle.importContainedModule(trusted[0]!, "../escape.mjs")), /escapes the plugin root/);
});
