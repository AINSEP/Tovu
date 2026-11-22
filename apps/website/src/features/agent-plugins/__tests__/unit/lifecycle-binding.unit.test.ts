import { bundledAgentPluginsDir } from "#src/server/runtime/composition/site-paths";
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import {
  createTovuAgentPluginLifecycle,
  PackagePathViolation,
  explicitRootAgentPluginActivations,
  resolveAgentPluginDeliveryMode,
  unboundSiteAgentPluginLayout,
} from "../../lifecycle.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { forceRemove } from "../fixtures/force-remove.js";
import { selectedPluginSourceRoot } from "../fixtures/bundled-source-root.js";

/**
 * @file The Tovu binding of the Jini lifecycle owner (`lifecycle.ts`): its delivery-mode policy, the
 * import-time layout that refuses to pick a site, and the positional-ABI wrappers it exposes, each
 * driven against a real temp agent-plugins root.
 */

const WORKSPACE = "workspace-local";

async function boundLifecycle(t: TestContext, optional: { hostOverlaysDir?: string } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-lifecycle-binding-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  });
  const layout = resolveAgentPluginLayout({ siteDir: process.cwd() }, { env: { TOVU_AGENT_PLUGINS_DIR: dir } });
  return { dir, layout, lifecycle: createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: bundledAgentPluginsDir(), ...optional }) };
}

async function packedNotes(dir: string, lifecycle: ReturnType<typeof createTovuAgentPluginLifecycle>, maturity?: 'untested' | 'soon') {
  const source = path.join(dir, "source", "notes");
  await mkdir(path.join(source, "skills", "notes"), { recursive: true });
  await writeFile(path.join(source, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "notes", version: "1.0.0", description: "Keeps notes.", extensions: { tovu: { maturity } } }));
  await writeFile(path.join(source, "skills", "notes", "SKILL.md"), "---\nname: notes\ndescription: Take notes.\n---\nWrite things down.");
  return lifecycle.packAgentPluginDirectory({ sourceDir: source });
}

test("delivery mode is pointer only when asked for exactly; unset or a typo stays inject", () => {
  assert.equal(resolveAgentPluginDeliveryMode({ TOVU_AGENT_PLUGIN_DELIVERY: "pointer" }), "pointer");
  assert.equal(resolveAgentPluginDeliveryMode({}), "inject");
  assert.equal(resolveAgentPluginDeliveryMode({ TOVU_AGENT_PLUGIN_DELIVERY: "Pointer" }), "inject");
});

test("the import-time layout never selects a site: every workspace lookup refuses", () => {
  assert.equal(unboundSiteAgentPluginLayout.root, "");
  assert.throws(() => unboundSiteAgentPluginLayout.forWorkspace({ workspaceId: WORKSPACE }), /must be supplied by the booted site binding/);
});

test("pack, bundled reader and install round-trip through the binding's positional wrappers", async t => {
  const { dir, layout, lifecycle } = await boundLifecycle(t);
  const packed = await packedNotes(dir, lifecycle);
  assert.ok(packed.files.includes("plugin.json"));
  const installed = await lifecycle.installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: lifecycle.createBundledSourceArchiveReader(), layout, workspaceId: WORKSPACE });
  assert.equal(installed.pluginId, "notes");
  assert.equal(installed.archiveDigest, packed.sha256);
  const workspace = layout.forWorkspace({ workspaceId: WORKSPACE });
  assert.deepEqual((await lifecycle.listInstalledPlugins({ workspaceRoot: workspace.root })).map(plugin => plugin.pluginId), ["notes"]);
  const packagesDir = workspace.pluginPackagesDir({ pluginId: "notes" });
  assert.equal(await lifecycle.isInstalledDigestPresent({ packagesDir, archiveDigest: packed.sha256 }), true);
  assert.equal(await lifecycle.isInstalledDigestPresent({ packagesDir, archiveDigest: "0".repeat(64) }), false);
  const indexed = await lifecycle.indexInstalledRoot({ packageRoot: installed.packageRoot, archiveDigest: packed.sha256 });
  assert.equal(indexed.pluginId, "notes");
  assert.deepEqual(indexed.skills.map(skill => skill.name), ["notes"]);
  const refs = await lifecycle.resolveAgentPluginRefs({ pluginRefIds: ["notes", "missing"], workspaceLayout: workspace }, { deliveryMode: "inject" });
  assert.ok(JSON.stringify(refs).includes("missing"), "an unknown ref is reported, not dropped");
});

for (const maturity of ['untested', 'soon', undefined] as const) {
  for (const deliveryMode of ['inject', 'pointer'] as const) {
    test(`${deliveryMode} pinned guidance discloses maturity ${maturity ?? '(absent)'}`, async t => {
      const { dir, layout, lifecycle } = await boundLifecycle(t);
      const packed = await packedNotes(dir, lifecycle, maturity);
      await lifecycle.installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: lifecycle.createBundledSourceArchiveReader(), layout, workspaceId: WORKSPACE });
      const result = await lifecycle.resolveAgentPluginRefs({ pluginRefIds: ['notes'], workspaceLayout: layout.forWorkspace({ workspaceId: WORKSPACE }) }, { deliveryMode: deliveryMode });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.promptPrefix.includes("Before saving keys or acting with this plugin"), maturity !== undefined);
      if (deliveryMode === 'inject') assert.match(result.promptPrefix, /Write things down/);
    });
  }
}

/** Tovu's overlay for `notes` (plan 2026-11-02 §6, seam 2) under its own temp dir. */
async function notesOverlay(t: TestContext): Promise<string> {
  const overlaysDir = await mkdtemp(path.join(tmpdir(), "tovu-lifecycle-overlays-"));
  t.after(() => forceRemove(overlaysDir));
  await mkdir(path.join(overlaysDir, "notes", "host"), { recursive: true });
  await writeFile(path.join(overlaysDir, "notes", "GUIDANCE.md"), "HOST RULES");
  await writeFile(path.join(overlaysDir, "notes", "host", "filing.md"), "FILING");
  return overlaysDir;
}

async function installedNotes(t: TestContext, optional: { maturity?: 'untested'; overlay?: boolean } = {}) {
  const hostOverlaysDir = optional.overlay === false ? path.join(tmpdir(), "tovu-no-overlays-for-this-test") : await notesOverlay(t);
  const { dir, layout, lifecycle } = await boundLifecycle(t, { hostOverlaysDir });
  const packed = await packedNotes(dir, lifecycle, optional.maturity);
  await lifecycle.installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: lifecycle.createBundledSourceArchiveReader(), layout, workspaceId: WORKSPACE });
  return { layout, lifecycle, workspace: layout.forWorkspace({ workspaceId: WORKSPACE }) };
}

test("inject run references put maturity first, then the overlay GUIDANCE, then the plugin's section", async t => {
  const { lifecycle, workspace } = await installedNotes(t, { maturity: 'untested' });
  const result = await lifecycle.resolveAgentPluginRefs({ pluginRefIds: ['notes'], workspaceLayout: workspace }, { deliveryMode: 'inject' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const caution = result.promptPrefix.indexOf("Before saving keys or acting with this plugin");
  const host = result.promptPrefix.indexOf("HOST RULES");
  const skill = result.promptPrefix.indexOf("Write things down");
  assert.ok(caution >= 0 && caution < host && host < skill, result.promptPrefix);
});

test("pointer run references add no overlay guidance (the tool call carries it); a selected skill in pointer mode does", async t => {
  const { lifecycle, workspace } = await installedNotes(t);
  const pointer = await lifecycle.resolveAgentPluginRefs({ pluginRefIds: ['notes'], workspaceLayout: workspace }, { deliveryMode: 'pointer' });
  assert.equal(pointer.ok, true);
  assert.equal(pointer.ok && pointer.promptPrefix.includes("HOST RULES"), false);
  const skill = await lifecycle.resolveAgentPluginGuidance({ pluginRefIds: ['notes'], workspaceLayout: workspace }, { deliveryMode: 'pointer', skill: 'notes' });
  assert.equal(skill.ok && skill.promptPrefix.includes("HOST RULES"), true);
});

test("a host/ file is appended after the owner's default section, and a missing one refuses like a missing plugin file", async t => {
  const { lifecycle, workspace } = await installedNotes(t);
  const result = await lifecycle.resolveAgentPluginGuidance({ pluginRefIds: ['notes'], workspaceLayout: workspace }, { deliveryMode: 'inject', file: 'host/filing.md' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.promptPrefix.indexOf("Write things down") < result.promptPrefix.indexOf("Host file host/filing.md for Agent Plugin 'notes':\nFILING"), result.promptPrefix);
  for (const file of ['host/missing.md', 'host/../GUIDANCE.md']) {
    const refused = await lifecycle.resolveAgentPluginGuidance({ pluginRefIds: ['notes'], workspaceLayout: workspace }, { deliveryMode: 'inject', file });
    assert.equal(refused.ok, false, file);
    assert.equal(!refused.ok && refused.reason.includes('../'), false);
  }
});

test("a disabled plugin gets the owner's refusal and no overlay", async t => {
  const { lifecycle, workspace } = await installedNotes(t);
  await explicitRootAgentPluginActivations.setAgentPluginActivation({ workspaceRoot: workspace.root, pluginId: "notes", enabled: false, actor: "owner" });
  for (const file of [undefined, 'host/filing.md']) {
    const refused = await lifecycle.resolveAgentPluginGuidance({ pluginRefIds: ['notes'], workspaceLayout: workspace }, { deliveryMode: 'inject', ...(file ? { file } : {}) });
    assert.equal(refused.ok, false);
    assert.doesNotMatch(JSON.stringify(refused), /HOST RULES|FILING/);
  }
});

test('explicit read-only discovery loads an off plugin and its host guidance while pinned runs stay refused', async t => {
  const { lifecycle, workspace } = await installedNotes(t);
  await explicitRootAgentPluginActivations.setAgentPluginActivation({ workspaceRoot: workspace.root, pluginId: 'notes', enabled: false, actor: 'owner' });
  const result = await lifecycle.resolveAgentPluginGuidance({ pluginRefIds: ['notes'], workspaceLayout: workspace },
    { deliveryMode: 'inject', allowInactiveGuidance: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.promptPrefix, /installed, off/);
  assert.match(result.promptPrefix, /tools are unavailable/);
  assert.match(result.promptPrefix, /HOST RULES/);
  assert.match(result.promptPrefix, /Write things down/);
  assert.equal((await lifecycle.resolveAgentPluginRefs({ pluginRefIds: ['notes'], workspaceLayout: workspace }, { deliveryMode: 'inject' })).ok, false);
});

test("a plugin without an overlay keeps the owner's prefix unchanged", async t => {
  const bare = await installedNotes(t, { overlay: false });
  const result = await bare.lifecycle.resolveAgentPluginRefs({ pluginRefIds: ['notes'], workspaceLayout: bare.workspace }, { deliveryMode: 'inject' });
  assert.equal(result.ok, true);
  if (result.ok) assert.match(result.promptPrefix, /^<<AGENT_PLUGIN pluginId="notes">>\n---\nname: notes/);
});

test("pure helpers delegate unchanged: entry paths, digest ledgers, archive cap and ranking", async t => {
  const { lifecycle } = await boundLifecycle(t);
  assert.equal(lifecycle.normalizePackageEntryPath({ rawEntryPath: "skills/notes/SKILL.md" }), "skills/notes/SKILL.md");
  assert.throws(() => lifecycle.normalizePackageEntryPath({ rawEntryPath: "../escape" }), { name: "Error", message: "package entry path escapes the package root: '../escape'", constructor: PackagePathViolation });
  assert.ok(lifecycle.maxAgentPluginInstallArchiveBytes() > 0);
  assert.equal(lifecycle.normalizeBundledDigests({ value: "not a ledger" }).size, 0);
  assert.deepEqual(lifecycle.rankInstalledAgentPlugins({ query: "notes", candidates: [], limit: 5 }), []);
  const bundledDigest = "b".repeat(64);
  const installed = [{ pluginId: "notes", archiveDigest: "c".repeat(64) }, { pluginId: "notes", archiveDigest: bundledDigest }, { pluginId: "other", archiveDigest: "d".repeat(64) }];
  assert.deepEqual(lifecycle.preferBundledAgentPluginDigests(installed, new Map([["notes", bundledDigest]])).map(entry => entry.archiveDigest), [bundledDigest, "d".repeat(64)]);
});

test("recordBundledAgentPluginDigests passes an injected clock through and the ledger reads back", async t => {
  const { layout, lifecycle } = await boundLifecycle(t);
  const root = layout.forWorkspace({ workspaceId: WORKSPACE }).root;
  await mkdir(root, { recursive: true });
  const digest = "a".repeat(64);
  let clockReads = 0;
  await lifecycle.recordBundledAgentPluginDigests({ workspaceRoot: root, seeded: [{ pluginId: "notes", archiveDigest: digest }] }, { now: () => { clockReads += 1; return new Date("2026-10-22T00:00:00.000Z"); } });
  assert.ok(clockReads >= 1, "the injected clock was consulted");
  assert.equal((await lifecycle.readBundledAgentPluginDigests({ workspaceRoot: root })).get("notes"), digest);
});

test("uninstall preview and uninstall go through the caller's layout", async t => {
  const { dir, layout, lifecycle } = await boundLifecycle(t);
  const packed = await packedNotes(dir, lifecycle);
  await lifecycle.installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: lifecycle.createBundledSourceArchiveReader(), layout, workspaceId: WORKSPACE });
  const preview = await lifecycle.previewAgentPluginUninstall({ layout, workspaceId: WORKSPACE, pluginId: "notes" });
  assert.equal(preview.pluginId, "notes");
  await lifecycle.uninstallAgentPlugin({ layout, workspaceId: WORKSPACE, pluginId: "notes", ...("previewToken" in preview ? { previewToken: preview.previewToken } : {}) } as Parameters<typeof lifecycle.uninstallAgentPlugin>[0]);
  assert.deepEqual(await lifecycle.listInstalledPlugins({ workspaceRoot: layout.forWorkspace({ workspaceId: WORKSPACE }).root }), []);
});

test("trusted-package lookup reports switched-off packages to onInactive", async t => {
  const { dir, layout, lifecycle } = await boundLifecycle(t);
  const packed = await packedNotes(dir, lifecycle);
  await lifecycle.installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256, archiveReader: lifecycle.createBundledSourceArchiveReader(), layout, workspaceId: WORKSPACE });
  await explicitRootAgentPluginActivations.setAgentPluginActivation({ workspaceRoot: layout.forWorkspace({ workspaceId: WORKSPACE }).root, pluginId: "notes", enabled: false, actor: "owner" });
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
  assert.deepEqual((await lifecycle.listInstalledPlugins({ workspaceRoot: layout.forWorkspace({ workspaceId: WORKSPACE }).root })).map(plugin => plugin.pluginId), ["plain-bundled"]);
});

test("the seeded Cloudflare plugin keeps its qualified identity and starts inactive", async t => {
  const { layout, lifecycle } = await boundLifecycle(t);
  const source = await selectedPluginSourceRoot({ pluginIds: ["cloudflare"] });
  t.after(() => source.dispose());
  await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE, sourceRoot: source.root });
  const workspaceRoot = layout.forWorkspace({ workspaceId: WORKSPACE }).root;
  const installed = (await lifecycle.listInstalledPlugins({ workspaceRoot })).find(plugin => plugin.pluginId === "cloudflare");
  assert.ok(installed, "the shipped Cloudflare plugin is installed under its manifest name");
  assert.equal(installed.id, "jini/cloudflare", "the installed Cloudflare record preserves its qualified manifest identity");
  const activation = await explicitRootAgentPluginActivations.resolveAgentPluginActivation({ workspaceRoot, pluginId: installed.pluginId });
  assert.equal(activation.verdict, "inactive", "the seeded hosting plugin starts disabled under its storage identity");
});

test("a host archive reader's non-file entries pass through the positional adapter unchanged", async t => {
  const { dir, layout, lifecycle } = await boundLifecycle(t);
  const packed = await packedNotes(dir, lifecycle);
  const bundledReader = lifecycle.createBundledSourceArchiveReader();
  const seen: string[] = [];
  const installed = await lifecycle.installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256, layout, workspaceId: WORKSPACE, archiveReader: {
    async *entries({ archive }) {
      yield { kind: "directory" as const, entryPath: "skills/" };
      for await (const entry of bundledReader.entries({ archive })) { seen.push(entry.entryPath); yield entry; }
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
  assert.equal(JSON.parse(String(await lifecycle.readTrustedPluginFile({ plugin: trusted[0]!, filename: "seam.json" }))).hello, "world");
  assert.deepEqual(await lifecycle.importContainedModule({ plugin: trusted[0]!, modulePath: "seam.mjs" }), { exported: { answer: 42 } });
  assert.match(String(await lifecycle.importContainedModule({ plugin: trusted[0]!, modulePath: "../escape.mjs" })), /escapes the plugin root/);
});

/** Seeds three bundled packages that all ship `seam.json`: a successor whose manifest carries
 *  `extraManifest`, a package it may supersede wholesale, and one it may supersede one descriptor of. */
async function seededSupersessionFixture(t: TestContext, extraManifest: Record<string, unknown>, optional: Parameters<typeof createTovuAgentPluginLifecycle>[1] = {}) {
  const { dir, layout } = await boundLifecycle(t);
  const lifecycle = createTovuAgentPluginLifecycle({ layout }, optional);
  const sourceRoot = path.join(dir, "bundled");
  for (const [name, manifest] of [["successor", extraManifest], ["old-pkg", {}], ["shared-pkg", {}]] as const) {
    await mkdir(path.join(sourceRoot, name), { recursive: true });
    await writeFile(path.join(sourceRoot, name, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name, version: "1.0.0", ...manifest }));
    await writeFile(path.join(sourceRoot, name, "seam.json"), JSON.stringify([{ id: "moved" }, { id: `${name}-own` }]));
  }
  await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE, sourceRoot });
  return { lifecycle, sourceRoot };
}
function seamDefinition() {
  return {
    filename: "seam.json", contribution: "test seams", kind: "data" as const,
    parse: ({ raw }: { readonly raw: string }) => ({ ok: true as const, descriptors: JSON.parse(raw) as readonly { readonly id: string }[] }),
    load: ({ plugin, descriptor }: { readonly plugin: { readonly pluginId: string }; readonly descriptor: { readonly id: string } }) => ({ loaded: `${plugin.pluginId}:${descriptor.id}` }),
  };
}
const SUPERSEDES = { extensions: { tovu: { supersedes: {
  packages: ["old-pkg"],
  contributions: [{ fromPlugins: ["shared-pkg", "old-pkg"], descriptorId: "moved", label: "test seam" }],
} } } };

test("a trusted plugin's own supersedes declaration refuses the packages and descriptors it names", async t => {
  const { lifecycle } = await seededSupersessionFixture(t, SUPERSEDES);
  const result = await lifecycle.loadPluginContributions({ workspaceId: WORKSPACE, definition: seamDefinition() }, { requireActive: false, packageRefusal: () => undefined });
  assert.deepEqual(result.items.map(item => item.loaded).sort(), ["shared-pkg:shared-pkg-own", "successor:moved", "successor:successor-own"]);
  assert.ok(result.refusals.includes("contributions from 'old-pkg' were superseded by trusted 'successor'"), JSON.stringify(result.refusals));
  assert.ok(result.refusals.includes("test seam 'moved' is provided by the trusted 'successor' replacement"), JSON.stringify(result.refusals));
});

test("without any supersedes declaration every package contributes and the caller's packageRefusal still applies", async t => {
  const { lifecycle } = await seededSupersessionFixture(t, {});
  const result = await lifecycle.loadPluginContributions({ workspaceId: WORKSPACE, definition: seamDefinition() },
    { requireActive: false, packageRefusal: ({ plugin }) => plugin.pluginId === "shared-pkg" ? "caller refused shared-pkg" : undefined });
  assert.deepEqual(result.items.map(item => item.loaded).sort(), ["old-pkg:moved", "old-pkg:old-pkg-own", "successor:moved", "successor:successor-own"]);
  assert.deepEqual(result.refusals, ["caller refused shared-pkg"]);
});

test("an installed successor that predates its declaration is superseded through the build's bundled source manifest", async t => {
  const reads: string[] = [];
  const { lifecycle } = await seededSupersessionFixture(t, {}, { supersessionManifests: {
    readInstalled: async ({ plugin }) => { reads.push(`installed:${plugin.pluginId}`); return JSON.stringify({ name: plugin.pluginId }); },
    readBundledSource: async ({ pluginId }) => { reads.push(`source:${pluginId}`); return JSON.stringify(pluginId === "successor" ? SUPERSEDES : {}); },
  } });
  const result = await lifecycle.loadPluginContributions({ workspaceId: WORKSPACE, definition: seamDefinition() }, { requireActive: false });
  assert.deepEqual(result.items.map(item => item.loaded).sort(), ["shared-pkg:shared-pkg-own", "successor:moved", "successor:successor-own"]);
  assert.ok(reads.includes("installed:successor") && reads.includes("source:successor"), reads.join());
});
