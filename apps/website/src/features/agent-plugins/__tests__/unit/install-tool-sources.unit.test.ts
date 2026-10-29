/** Folder and bundled input contracts for the existing gated Agent Plugin install tool. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { ToolInputError } from "@jini-ai/core";
import { buildRegistrations } from "../../install-tool.js";
import type { PluginHostPort } from "../../../../contracts/headless/index.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { listInstalledPlugins, readBundledAgentPluginDigests } from "../../lifecycle.js";
import { agentPluginActivations } from "../../activation-effects.js";
import { forceRemove } from "../fixtures/force-remove.js";

const context = (input: unknown) => ({ executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input, signal: new AbortController().signal });
const bundledInput = { source: { kind: "bundled", bundledId: "ui-ux-design" } };

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), "agent-install-sources-"));
  t.after(() => forceRemove(root));
  const layout = resolveAgentPluginLayout({ env: { TOVU_AGENT_PLUGINS_DIR: path.join(root, "installed") } });
  const sourceRoot = path.join(root, "bundled");
  await mkdir(sourceRoot);
  const deps = { workspaceId: "workspace-local", authorize: async () => ({ allowed: true as const, reason: "matched" as const }), agentPluginLayout: layout, bundledAgentPluginsSourceRoot: sourceRoot };
  const tools = buildRegistrations(deps);
  const install = tools.find(tool => tool.descriptor.id === "agent_plugins_install")!;
  return { root, layout, sourceRoot, deps, install, workspaceRoot: layout.forWorkspace(deps.workspaceId).root };
}

async function writePackage(folder: string, id: string, version = "1.0.0") {
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: id, version }));
}

test("folder input installs through ZIP preview, preserves binary files, stays OFF, and deduplicates", async t => {
  const f = await fixture(t);
  const folder = path.join(f.root, "local");
  await writePackage(folder, "folder-test");
  await mkdir(path.join(folder, "images"));
  const binary = Buffer.from([0x89, 0x50, 0, 0xff, 0x80]);
  await writeFile(path.join(folder, "images", "é.png"), binary);
  const input = { source: { kind: "folder", path: folder } };
  const result = await f.install.handler(context(input), {});
  assert.deepEqual(result, { installed: true, enabled: false, alreadyInstalled: false, plugin: { id: "folder-test", version: "1.0.0" },
    warning: "Trust: local / unverified publisher. Uploaded Agent Plugin code is not trusted to run. Skills can guide the assistant. It stays OFF until you enable it.",
    note: "Installed OFF. Enable with plugins_set_enabled (family 'agent-plugin') if requested.",
  });
  const [installed] = await listInstalledPlugins(f.workspaceRoot);
  assert.deepEqual(await readFile(path.join(installed!.packageRoot, "images", "é.png")), binary);
  await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: f.workspaceRoot, pluginId: "folder-test", enabled: true, actor: "owner" });
  const again = await f.install.handler(context(input), {}) as { alreadyInstalled: boolean; enabled: boolean };
  assert.equal(again.alreadyInstalled, true);
  assert.equal(again.enabled, true);
  await writePackage(folder, "folder-test", "2.0.0");
  await assert.rejects(() => f.install.handler(context({ ...input, replace: true }), {}), { message: "PLUGIN_ENABLED: Switch off the installed plugin before replacing its version." });
});

test("bundled id re-runs the boot seeder: bundled provenance, boot's default activation, then a no-op", async t => {
  const f = await fixture(t);
  await writePackage(path.join(f.sourceRoot, "ui-ux-design"), "ui-ux-design");
  // ui-ux-design is in BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED, so boot (and this) seeds it ON.
  assert.deepEqual(await f.install.handler(context(bundledInput), {}), { installed: true, alreadyInstalled: false, enabled: true, plugin: { id: "ui-ux-design" },
    note: "Installed ON (seeded enabled by default).",
  });
  assert.deepEqual((await listInstalledPlugins(f.workspaceRoot)).map(plugin => plugin.pluginId), ["ui-ux-design"]);
  const activation = JSON.parse(await readFile(path.join(f.workspaceRoot, "activations.json"), "utf8")).plugins["ui-ux-design"];
  assert.equal(activation.origin, "bundled");
  assert.equal(activation.enabled, true);
  assert.equal((await readBundledAgentPluginDigests(f.workspaceRoot)).has("ui-ux-design"), true);
  await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: f.workspaceRoot, pluginId: "ui-ux-design", enabled: false, actor: "owner" });
  const before = await readFile(path.join(f.workspaceRoot, "activations.json"), "utf8");
  assert.deepEqual(await f.install.handler(context(bundledInput), {}), { installed: true, alreadyInstalled: true, enabled: false, plugin: { id: "ui-ux-design" },
    note: "Bundled plugin 'ui-ux-design' is already installed; activation was not changed.",
  });
  assert.equal(await readFile(path.join(f.workspaceRoot, "activations.json"), "utf8"), before);
});

test("unknown bundled id is an input error naming the bundled ids, and installs nothing", async t => {
  const f = await fixture(t);
  await writePackage(path.join(f.sourceRoot, "ui-ux-design"), "ui-ux-design");
  await assert.rejects(() => f.install.handler(context({ source: { kind: "bundled", bundledId: "missing" } }), {}),
    { name: ToolInputError.name, message: "Unknown bundled plugin id 'missing'. Bundled ids: ui-ux-design." });
  assert.deepEqual(await listInstalledPlugins(f.workspaceRoot), []);
});

test("bundled input cannot replace or grant bundled trust to an operator-installed namesake", async t => {
  const f = await fixture(t);
  const folder = path.join(f.root, "operator-package");
  await writePackage(folder, "ui-ux-design");
  await writePackage(path.join(f.sourceRoot, "ui-ux-design"), "ui-ux-design");
  await f.install.handler(context({ source: { kind: "folder", path: folder } }), {});
  const before = await listInstalledPlugins(f.workspaceRoot);
  await assert.rejects(() => f.install.handler(context(bundledInput), {}), { message: "Plugin id 'ui-ux-design' is already installed from another source; bundled plugins cannot replace it." });
  assert.deepEqual(await listInstalledPlugins(f.workspaceRoot), before);
  assert.equal((await readBundledAgentPluginDigests(f.workspaceRoot)).has("ui-ux-design"), false);
});

test("folder and bundled inputs cannot bypass permission checks", async t => {
  const f = await fixture(t);
  const tools = buildRegistrations({ ...f.deps, authorize: async () => ({ allowed: false, reason: "insufficient_permission" }) });
  const install = tools.find(tool => tool.descriptor.id === "agent_plugins_install")!;
  for (const input of [bundledInput, { source: { kind: "folder", path: path.join(f.root, "missing") } }]) {
    await assert.rejects(() => install.handler(context(input), {}), error => !(error instanceof ToolInputError));
  }
  assert.deepEqual(await listInstalledPlugins(f.workspaceRoot), []);
});

test("sources are exclusive and bundled replacement and traversal are refused", async t => {
  const f = await fixture(t);
  for (const source of [
    { kind: "bundled", bundledId: "ui-ux-design", path: "/tmp/plugin" },
    { kind: "bundled", bundledId: "ui-ux-design", attachmentRef: "attachment:agent123" },
    { kind: "bundled", bundledId: "../ui-ux-design" },
    { kind: "zip", path: "/tmp/plugin.zip", bundledId: "ui-ux-design" },
    { kind: "folder", attachmentRef: "attachment:agent123" },
  ]) await assert.rejects(() => f.install.handler(context({ source }), {}), ToolInputError);
  await assert.rejects(() => f.install.handler(context({ ...bundledInput, replace: true }), {}), { message: "Bundled plugins cannot be replaced." });
});

test("folder input keeps package validation and refuses symlinks", async t => {
  const f = await fixture(t);
  const folder = path.join(f.root, "invalid");
  await mkdir(folder);
  await writeFile(path.join(folder, "readme.txt"), "no plugin manifest");
  await assert.rejects(() => f.install.handler(context({ source: { kind: "folder", path: folder } }), {}), { message: "MANIFEST_MISSING: the archive does not contain a plugin.json at its root or inside one top-level folder" });
  await symlink(path.join(folder, "readme.txt"), path.join(folder, "link"));
  await assert.rejects(() => f.install.handler(context({ source: { kind: "folder", path: folder } }), {}), { message: "Could not read that folder. Try again." });
  assert.deepEqual(await listInstalledPlugins(f.workspaceRoot), []);
});

test("L025b bundled source pins malformed ids, extra keys and failed seeding", async t => {
  const f = await fixture(t);
  for (const source of [{ kind: "bundled" }, { kind: "bundled", bundledId: 12 }, { kind: "bundled", bundledId: "ui-ux-design", extra: false }]) {
    await assert.rejects(() => f.install.handler(context({ source }), {}), { message: "Bundled source requires only kind:'bundled' and a bundledId; no path or attachmentRef." });
  }
  await writePackage(path.join(f.sourceRoot, "ui-ux-design"), "ui-ux-design");
  await symlink(path.join(f.sourceRoot, "ui-ux-design", "plugin.json"), path.join(f.sourceRoot, "ui-ux-design", "link"));
  // why: the bundled source archive skips (never follows) symlinks by contract, so seeding fails via an
  // unreadable activation record instead; discovery still accepts the manifest.
  await mkdir(f.workspaceRoot, { recursive: true });
  await writeFile(path.join(f.workspaceRoot, "activations.json"), "{");
  await assert.rejects(() => f.install.handler(context(bundledInput), {}), /could not be installed:/);
  assert.deepEqual(await listInstalledPlugins(f.workspaceRoot), []);
  await unlink(path.join(f.workspaceRoot, "activations.json"));
  await f.install.handler(context(bundledInput), {});
  const [installed] = await listInstalledPlugins(f.workspaceRoot);
  assert.deepEqual(await readdir(installed!.packageRoot), ["plugin.json"], "the symbolic link is skipped, never followed into the package");
});

test("L025b identical uploads preserve an undetermined activation as null", async t => {
  const f = await fixture(t);
  const folder = path.join(f.root, "local");
  await writePackage(folder, "unknown-state");
  const input = { source: { kind: "folder", path: folder } };
  await f.install.handler(context(input), {});
  await writeFile(path.join(f.workspaceRoot, "activations.json"), "{");
  const result = await f.install.handler(context(input), {}) as { enabled: boolean | null; alreadyInstalled: boolean; note: string };
  assert.equal(result.enabled, null);
  assert.equal(result.alreadyInstalled, true);
  assert.equal(result.note, "These exact bytes are already installed; activation was not changed.");
});

test("a bundled plugin that boot seeds OFF is reported as installed OFF with the enable hint", async t => {
  const f = await fixture(t);
  await writePackage(path.join(f.sourceRoot, "plain-bundled"), "plain-bundled");
  const result = await f.install.handler(context({ source: { kind: "bundled", bundledId: "plain-bundled" } }), {});
  assert.deepEqual(result, { installed: true, alreadyInstalled: false, enabled: false, plugin: { id: "plain-bundled" },
    note: "Installed OFF. Enable with plugins_set_enabled (family 'agent-plugin') if requested." });
});

test("a replacing upload reports the version it upgraded from; a manifest without a version reports none", async t => {
  const f = await fixture(t);
  const folder = path.join(f.root, "local");
  await writePackage(folder, "upgrade-test", "1.0.0");
  await f.install.handler(context({ source: { kind: "folder", path: folder } }), {});
  await writePackage(folder, "upgrade-test", "2.0.0");
  const upgraded = await f.install.handler(context({ source: { kind: "folder", path: folder }, replace: true }), {}) as { plugin: unknown };
  assert.deepEqual(upgraded.plugin, { id: "upgrade-test", version: "2.0.0", upgradeFrom: ["1.0.0"] });

  const unversioned = path.join(f.root, "unversioned");
  await mkdir(unversioned, { recursive: true });
  await writeFile(path.join(unversioned, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "no-version" }));
  const result = await f.install.handler(context({ source: { kind: "folder", path: unversioned } }), {}) as { plugin: unknown };
  assert.deepEqual(result.plugin, { id: "no-version" });
});

/** Records each identity admission the install path routes through the host, then runs it. */
function recordingPluginHost(candidates: unknown[]): PluginHostPort {
  return {
    async withInstallIdentity({ candidate, run }: { candidate: unknown; run: () => Promise<unknown> }) { candidates.push(candidate); return run(); },
    getHostCapability: () => undefined,
  } as unknown as PluginHostPort;
}

test("without an injected source root, bundled ids come from the build's own bundled packages", async t => {
  const f = await fixture(t);
  const { bundledAgentPluginsSourceRoot: _root, ...deps } = f.deps;
  const install = buildRegistrations(deps).find(tool => tool.descriptor.id === "agent_plugins_install")!;
  await assert.rejects(() => install.handler(context({ source: { kind: "bundled", bundledId: "no-such-bundled-plugin" } }), {}),
    (error: unknown) => error instanceof ToolInputError && /^Unknown bundled plugin id 'no-such-bundled-plugin'\. Bundled ids: .*\bgithub\b/.test((error as Error).message));
  assert.deepEqual(await listInstalledPlugins(f.workspaceRoot), []);
});

test("an already-installed bundled plugin with an unreadable activation record reports enabled as unknown", async t => {
  const f = await fixture(t);
  await writePackage(path.join(f.sourceRoot, "plain-bundled"), "plain-bundled");
  const input = { source: { kind: "bundled", bundledId: "plain-bundled" } };
  await f.install.handler(context(input), {});
  // A well-formed file whose own entry keeps bundled provenance but carries a non-boolean `enabled`.
  const activationsPath = path.join(f.workspaceRoot, "activations.json");
  const activations = JSON.parse(await readFile(activationsPath, "utf8")) as { plugins: Record<string, Record<string, unknown>> };
  assert.equal(activations.plugins["plain-bundled"]?.origin, "bundled");
  activations.plugins["plain-bundled"]!.enabled = "sometimes";
  await writeFile(activationsPath, JSON.stringify(activations));
  assert.deepEqual(await f.install.handler(context(input), {}), { installed: true, alreadyInstalled: true, enabled: null, plugin: { id: "plain-bundled" },
    note: "Bundled plugin 'plain-bundled' is already installed; activation was not changed." });
});

test("a folder install admits its identity through the host's plugin directory when one is wired", async t => {
  const f = await fixture(t);
  const folder = path.join(f.root, "hosted");
  await writePackage(folder, "hosted-plugin");
  const candidates: unknown[] = [];
  const install = buildRegistrations({ ...f.deps, pluginHost: recordingPluginHost(candidates) }).find(tool => tool.descriptor.id === "agent_plugins_install")!;
  const result = await install.handler(context({ source: { kind: "folder", path: folder } }), {}) as { installed: boolean; plugin: { id: string } };
  assert.equal(result.installed, true);
  assert.equal(result.plugin.id, "hosted-plugin");
  assert.ok(candidates.length >= 1, "identity admission went through the host");
  assert.ok(candidates.every(candidate => (candidate as { family: string }).family === "agent-plugin"));
  assert.deepEqual((await listInstalledPlugins(f.workspaceRoot)).map(plugin => plugin.pluginId), ["hosted-plugin"]);
});
