import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";

// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
import { agentPluginActivations } from "../../activation-effects.js";
const { readAgentPluginActivations, recordBundledAgentPluginIfAbsent, setAgentPluginActivation } = agentPluginActivations;
import assert from "node:assert/strict";
import { cp, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "../fixtures/force-remove.js";

import { packAgentPluginDirectory } from "../../lifecycle.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { parseAgentPluginMcpConfig } from "../../mcp-metadata.js";
import { seedBundledAgentPlugins } from "../../lifecycle.js";
import { DEPLOY_TARGETS_FILENAME, loadDeployTargetRegistry } from "#src/features/deployments/deploy-targets/registry";

/**
 * @file The bundled `deploy` Agent Plugin's package and the hosting plugins split out of it
 * (2026-10-12): valid, installable, and — the part no other bundled plugin has — their deploy-target
 * modules actually load from the installed, frozen digest directory through the real seeder and the
 * real registry. That last test is the dev-path check for the plan's packaging risk (a module
 * imported from `<pluginId>/package/sha256/<digest>/`).
 */

const CONTENT_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");
const PACKAGE_ROOT = path.join(CONTENT_ROOT, "deploy");
const WORKSPACE_ID = "workspace-local";

/** Every publish target, the bundled plugin that ships it, and its label. Target ids are the legacy
 *  provider ids (sealed credentials bind to them); each split-out host is a plugin of the same id. */
const TARGETS: readonly { readonly id: string; readonly pluginId: string; readonly label: string }[] = [
  { id: "github-pages", pluginId: "deploy", label: "GitHub Pages" },
  { id: "vercel", pluginId: "vercel", label: "Vercel" },
  { id: "netlify", pluginId: "netlify", label: "Netlify" },
  { id: "cloudflare-pages", pluginId: "deploy", label: "Cloudflare Pages" },
  { id: "s3-compatible", pluginId: "deploy", label: "S3-compatible storage" },
];
const HOST_PLUGINS = TARGETS.filter((target) => target.pluginId !== "deploy");

async function readPackageJson(relativePath: string, packageRoot = PACKAGE_ROOT): Promise<unknown> {
  return JSON.parse(await readFile(path.join(packageRoot, relativePath), "utf8"));
}

test("plugin.json parses under the Agent Plugins v1.0.0 validator with no warnings", async () => {
  const parsed = parseAgentPluginManifest({ value: await readPackageJson("plugin.json") });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, "deploy");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
});

test("mcp.json declares ZERO servers — hosts run in-process through the deploy-target registry", async () => {
  const parsed = parseAgentPluginMcpConfig({ value: await readPackageJson("mcp.json") });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.ok ? parsed.config.serverIds : ["unreachable"], []);
});

test("the eponymous skill exists and names the host it can publish to", async () => {
  const skill = await readFile(path.join(PACKAGE_ROOT, "skills", "deploy", "SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: deploy\n/);
  assert.match(skill, /Netlify/);
});

test("each plugin's target ids are the legacy provider ids it owns (sealed credentials bind to them)", async () => {
  for (const pluginId of new Set(TARGETS.map((target) => target.pluginId))) {
    const descriptor = (await readPackageJson(DEPLOY_TARGETS_FILENAME, path.join(CONTENT_ROOT, pluginId))) as { targets: { id: string; module: string }[] };
    assert.deepEqual(
      descriptor.targets.map((target) => [target.id, target.module]),
      TARGETS.filter((target) => target.pluginId === pluginId).map((target) => [target.id, `targets/${target.id}.mjs`]),
      pluginId,
    );
  }
});

test("the package packs through the real packer with its descriptor and modules", async () => {
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);
  const modules = TARGETS.filter((target) => target.pluginId === "deploy").map((target) => `targets/${target.id}.mjs`);
  for (const file of ["plugin.json", "mcp.json", DEPLOY_TARGETS_FILENAME, ...modules, "skills/deploy/SKILL.md"]) {
    assert.ok(packed.files.includes(file), `${file} must survive packing`);
  }
});

for (const host of HOST_PLUGINS) {
  test(`${host.pluginId}: a valid hosting plugin of its own, with its skill, descriptor and module packed`, async () => {
    const packageRoot = path.join(CONTENT_ROOT, host.pluginId);
    const manifest = await readPackageJson("plugin.json", packageRoot);
    const parsed = parseAgentPluginManifest({ value: manifest });
    assert.equal(parsed.ok && parsed.manifest.name, host.pluginId);
    assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
    const tovu = (manifest as { extensions: { tovu: { id: string; displayName: string; provides: string[] } } }).extensions.tovu;
    assert.deepEqual([tovu.id, tovu.provides], [`tovu/${host.pluginId}`, [`deploy-target:${host.id}`]]);
    const mcp = parseAgentPluginMcpConfig({ value: await readPackageJson("mcp.json", packageRoot) });
    assert.deepEqual(mcp.ok ? mcp.config.serverIds : ["unreachable"], []);
    assert.match(await readFile(path.join(packageRoot, "skills", host.pluginId, "SKILL.md"), "utf8"), new RegExp(`^---\nname: ${host.pluginId}\n`));
    const packed = await packAgentPluginDirectory(packageRoot);
    for (const file of ["plugin.json", "mcp.json", DEPLOY_TARGETS_FILENAME, `targets/${host.id}.mjs`, `skills/${host.pluginId}/SKILL.md`]) {
      assert.ok(packed.files.includes(file), `${host.pluginId}: ${file} must survive packing`);
    }
  });
}

/** Runs `fn` against a temp agent-plugins dir, restoring the env and removing the frozen tree after. */
async function withAgentPluginsDir<T>(fn: (layout: ReturnType<typeof resolveAgentPluginLayout>) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-deploy-plugin-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  try {
    return await fn(resolveAgentPluginLayout());
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

test("existing site: the seeder's own earlier DISABLED deploy record is switched on at the next boot", async () => {
  await withAgentPluginsDir(async (layout) => {
    const workspaceRoot = layout.forWorkspace(WORKSPACE_ID).root;
    // What a workspace seeded by 9ee7b5d73 carries: the seeder's untouched disabled record.
    await recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId: "deploy" });

    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    assert.equal((await readAgentPluginActivations({ workspaceRoot: workspaceRoot })).plugins.deploy?.enabled, true);
    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: createTovuAgentPluginLifecycle({ layout: resolveAgentPluginLayout() }).loadPluginContributions });
    for (const target of TARGETS) assert.equal(registry.get(target.id)?.pluginId, target.pluginId, target.id);
  });
});

test("an existing site whose operator switched deploy off keeps the split-out hosting plugins off", async () => {
  await withAgentPluginsDir(async (layout) => {
    const workspaceRoot = layout.forWorkspace(WORKSPACE_ID).root;
    // A site seeded before the split: only `deploy` has a record, and an operator turned it off.
    await setAgentPluginActivation({ workspaceRoot, pluginId: "deploy", enabled: false, actor: "test:operator" }, { origin: "bundled" });

    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    const { plugins } = await readAgentPluginActivations({ workspaceRoot });
    for (const host of HOST_PLUGINS) assert.equal(plugins[host.pluginId]?.enabled, false, host.pluginId);
    assert.equal(plugins.github?.enabled, true, "other seeded-enabled plugins are unaffected");
  });
});

test("an operator who switched deploy off stays switched off across boots", async () => {
  await withAgentPluginsDir(async (layout) => {
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    const workspaceRoot = layout.forWorkspace(WORKSPACE_ID).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "deploy", enabled: false, actor: "test:operator" });

    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    assert.equal((await readAgentPluginActivations({ workspaceRoot: workspaceRoot })).plugins.deploy?.enabled, false);
  });
});

test("seeded by the real seeder, deploy is ENABLED with no user action and the registry loads Netlify from the installed digest", async () => {
  await withAgentPluginsDir(async (layout) => {
    const seeded = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    for (const pluginId of ["deploy", ...HOST_PLUGINS.map((host) => host.pluginId)]) {
      assert.equal(seeded.outcomes.find((outcome) => outcome.pluginId === pluginId)?.status, "seeded", pluginId);
    }

    const activations = await readAgentPluginActivations({ workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root });
    assert.equal(activations.plugins.deploy?.enabled, true, "publishing must keep working with zero user action");
    for (const host of HOST_PLUGINS) assert.equal(activations.plugins[host.pluginId]?.enabled, true, `${host.pluginId}: publishing must keep working with zero user action`);
    assert.equal(activations.plugins["site-compliance"]?.enabled, false, "every other bundled plugin still seeds disabled");

    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: createTovuAgentPluginLifecycle({ layout: resolveAgentPluginLayout() }).loadPluginContributions });
    assert.deepEqual(registry.refusals, []);
    // Plugin-id order (`orderByPluginId`), the order the Static site tab lists hosts in.
    assert.deepEqual(registry.list().map((target) => target.pluginId), [...TARGETS].sort((a, b) => (a.pluginId < b.pluginId ? -1 : a.pluginId > b.pluginId ? 1 : 0)).map((target) => target.pluginId));
    for (const target of TARGETS) {
      const loaded = registry.get(target.id);
      assert.equal(loaded?.pluginId, target.pluginId, target.id);
      assert.equal(loaded?.descriptor.label, target.label, target.id);
      assert.equal(typeof loaded?.module.create, "function", target.id);
    }
  });
});

test("upgrade: a site holding an OLDER bundled host digest serves the new one after the next boot, with no user action", async () => {
  const owner = TARGETS.find((target) => target.id === "netlify")!.pluginId;
  const sourceRoot = await mkdtemp(path.join(tmpdir(), "tovu-deploy-source-"));
  try {
    await cp(path.join(CONTENT_ROOT, owner), path.join(sourceRoot, owner), { recursive: true });
    await withAgentPluginsDir(async (layout) => {
      await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot });

      // The next Tovu build ships a changed hosting plugin; its digest differs from the installed one.
      const descriptorPath = path.join(sourceRoot, owner, DEPLOY_TARGETS_FILENAME);
      const descriptor = JSON.parse(await readFile(descriptorPath, "utf8")) as { targets: { id: string; label: string }[] };
      descriptor.targets.find((target) => target.id === "netlify")!.label = "Netlify (next build)";
      await writeFile(descriptorPath, JSON.stringify(descriptor));

      await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot });
      // Layout B (852d711e6): each plugin's digests live under <workspace>/<pluginId>/package/sha256.
      const packages = await readdir(layout.forWorkspace(WORKSPACE_ID).pluginPackagesDir({ pluginId: owner }));
      assert.equal(packages.length, 1, "successful publication prunes the superseded digest");

      const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: createTovuAgentPluginLifecycle({ layout: resolveAgentPluginLayout() }).loadPluginContributions });
      assert.deepEqual(registry.refusals, []);
      assert.equal(registry.get("netlify")?.descriptor.label, "Netlify (next build)");
    });
  } finally {
    await forceRemove(sourceRoot);
  }
});
