import { bundledAgentPluginsDir } from "#src/server/runtime/composition/site-paths";
import { resolveSiteRoot } from "#src/platform/site-dir/index";
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
const WORKSPACE_ID = "workspace-local";

/** Every publish target, the bundled plugin that ships it, and its label. Target ids are the legacy
 *  provider ids (sealed credentials bind to them); each split-out host is a plugin of the same id. */
const TARGETS: readonly { readonly id: string; readonly pluginId: string; readonly label: string }[] = [
  { id: "github-pages", pluginId: "github-pages", label: "GitHub Pages" },
  { id: "vercel", pluginId: "vercel", label: "Vercel" },
  { id: "netlify", pluginId: "netlify", label: "Netlify" },
  { id: "cloudflare-workers", pluginId: "cloudflare", label: "Cloudflare Workers" },
  { id: "cloudflare-pages", pluginId: "cloudflare", label: "Cloudflare Pages" },
  { id: "s3-compatible", pluginId: "s3-compatible", label: "S3-compatible storage" },
];
const HOST_PLUGINS = TARGETS.filter((target) => target.pluginId !== "deploy");

async function readPackageJson(relativePath: string, packageRoot: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(packageRoot, relativePath), "utf8"));
}

// The Fly package's own manifest/mcp/skill/packing tests moved to
// content/agent-plugins/fly/__tests__/package-manifest.test.mjs (vendor tests live with the vendor).

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

/** Capabilities a hosting plugin provides beyond its deploy targets (other contribution categories). */
const EXTRA_PROVIDES: Readonly<Record<string, readonly string[]>> = { cloudflare: ["form-destination:cloudflare-d1"] };

for (const host of HOST_PLUGINS) {
  test(`${host.pluginId}: a valid hosting plugin of its own, with its skill, descriptor and module packed`, async () => {
    const packageRoot = path.join(CONTENT_ROOT, host.pluginId);
    const manifest = await readPackageJson("plugin.json", packageRoot);
    const parsed = parseAgentPluginManifest({ value: manifest });
    assert.equal(parsed.ok && parsed.manifest.name, host.pluginId);
    assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
    const tovu = (manifest as { extensions: { tovu: { id: string; displayName: string; provides: string[] } } }).extensions.tovu;
    assert.deepEqual([tovu.id, tovu.provides], [`tovu/${host.pluginId}`, [...TARGETS.filter(target => target.pluginId === host.pluginId).map(target => `deploy-target:${target.id}`), ...(EXTRA_PROVIDES[host.pluginId] ?? [])]]);
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
    return await fn(resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }));
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
}

test("existing site: an earlier explicitly ENABLED deploy record is retired at the next boot, and every host is on", async () => {
  await withAgentPluginsDir(async (layout) => {
    const workspaceRoot = layout.forWorkspace(WORKSPACE_ID).root;
    // Retirement preserves existing consent to deploy when moving to the split host plugins.
    await setAgentPluginActivation({ workspaceRoot, pluginId: "deploy", enabled: true, actor: "test:operator" }, { origin: "bundled" });

    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    // `deploy` is retired (Phase B7): its record goes once every successor is seeded.
    const { plugins } = await readAgentPluginActivations({ workspaceRoot: workspaceRoot });
    assert.equal(Object.hasOwn(plugins, "deploy"), false);
    for (const host of HOST_PLUGINS) assert.equal(plugins[host.pluginId]?.enabled, true, host.pluginId);
    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: createTovuAgentPluginLifecycle({ layout: resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }) }, { bundledSourceRoot: bundledAgentPluginsDir() }).loadPluginContributions });
    for (const target of TARGETS) assert.equal(registry.get(target.id)?.pluginId, target.pluginId, target.id);
  });
});

test("an untouched disabled deploy seed retires without enabling opt-in hosts", async () => {
  await withAgentPluginsDir(async (layout) => {
    const workspaceRoot = layout.forWorkspace(WORKSPACE_ID).root;
    await recordBundledAgentPluginIfAbsent({ workspaceRoot, pluginId: "deploy" });
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    const { plugins } = await readAgentPluginActivations({ workspaceRoot });
    assert.equal(Object.hasOwn(plugins, "deploy"), false);
    for (const pluginId of ["fly", "render", "railway", ...HOST_PLUGINS.map(host => host.pluginId)]) {
      assert.equal(plugins[pluginId]?.enabled, false, pluginId);
    }
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

test("an operator who switched fly (deploy's server successor) off stays switched off across boots", async () => {
  await withAgentPluginsDir(async (layout) => {
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    const workspaceRoot = layout.forWorkspace(WORKSPACE_ID).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "fly", enabled: false, actor: "test:operator" });

    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    assert.equal((await readAgentPluginActivations({ workspaceRoot: workspaceRoot })).plugins.fly?.enabled, false);
  });
});

test("seeded by the real seeder, hosts start disabled, explicit enable loads targets, deploy is never seeded, and the registry loads Netlify from the installed digest", async () => {
  await withAgentPluginsDir(async (layout) => {
    const seeded = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    for (const pluginId of ["fly", ...HOST_PLUGINS.map((host) => host.pluginId)]) {
      assert.equal(seeded.outcomes.find((outcome) => outcome.pluginId === pluginId)?.status, "seeded", pluginId);
    }
    assert.equal(seeded.outcomes.some((outcome) => outcome.pluginId === "deploy"), false, "deploy is retired (Phase B7)");

    const activations = await readAgentPluginActivations({ workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root });
    assert.equal(activations.plugins.fly?.enabled, false, "server hosting requires explicit enable");
    for (const host of HOST_PLUGINS) assert.equal(activations.plugins[host.pluginId]?.enabled, false, `${host.pluginId}: hosting requires explicit enable`);
    assert.equal(activations.plugins["site-compliance"]?.enabled, false, "every other bundled plugin still seeds disabled");
    const inactive = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: bundledAgentPluginsDir() }).loadPluginContributions });
    assert.deepEqual(inactive.list(), []);
    for (const host of HOST_PLUGINS) {
      await setAgentPluginActivation({ workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root, pluginId: host.pluginId, enabled: true, actor: "test:operator" }, { origin: "bundled" });
    }

    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: createTovuAgentPluginLifecycle({ layout: resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }) }, { bundledSourceRoot: bundledAgentPluginsDir() }).loadPluginContributions });
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
      await setAgentPluginActivation({ workspaceRoot: layout.forWorkspace(WORKSPACE_ID).root, pluginId: owner, enabled: true, actor: "test:operator" }, { origin: "bundled" });

      // The next Tovu build ships a changed hosting plugin; its digest differs from the installed one.
      const descriptorPath = path.join(sourceRoot, owner, DEPLOY_TARGETS_FILENAME);
      const descriptor = JSON.parse(await readFile(descriptorPath, "utf8")) as { targets: { id: string; label: string }[] };
      descriptor.targets.find((target) => target.id === "netlify")!.label = "Netlify (next build)";
      await writeFile(descriptorPath, JSON.stringify(descriptor));

      await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot });
      // Layout B (852d711e6): each plugin's digests live under <workspace>/<pluginId>/package/sha256.
      const packages = await readdir(layout.forWorkspace(WORKSPACE_ID).pluginPackagesDir({ pluginId: owner }));
      assert.equal(packages.length, 1, "successful publication prunes the superseded digest");

      const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: createTovuAgentPluginLifecycle({ layout: resolveAgentPluginLayout({ siteDir: process.env.TOVU_AGENT_PLUGINS_DIR ?? resolveSiteRoot() }) }, { bundledSourceRoot: bundledAgentPluginsDir() }).loadPluginContributions });
      assert.deepEqual(registry.refusals, []);
      assert.equal(registry.get("netlify")?.descriptor.label, "Netlify (next build)");
    });
  } finally {
    await forceRemove(sourceRoot);
  }
});
