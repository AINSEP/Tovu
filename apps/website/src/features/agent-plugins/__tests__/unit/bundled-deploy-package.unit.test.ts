import assert from "node:assert/strict";
import { cp, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { forceRemove } from "../fixtures/force-remove.js";
import { readAgentPluginActivations, recordBundledAgentPluginIfAbsent, setAgentPluginActivation } from "../../activation.js";
import { packAgentPluginDirectory } from "../../bundled-source-archive.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { parseAgentPluginManifest, parseAgentPluginMcpConfig } from "../../manifest.js";
import { seedBundledAgentPlugins } from "../../seed-bundled.js";
import { DEPLOY_TARGETS_FILENAME, loadDeployTargetRegistry } from "#src/features/deployments/deploy-targets/registry";

/**
 * @file The bundled `deploy` Agent Plugin's package: valid, installable, and — the part no other
 * bundled plugin has — its deploy-target modules actually load from the installed, frozen digest
 * directory through the real seeder and the real registry. That last test is the dev-path check for
 * the plan's packaging risk (a module imported from `packages/sha256/<digest>/`).
 */

const CONTENT_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");
const PACKAGE_ROOT = path.join(CONTENT_ROOT, "deploy");
const WORKSPACE_ID = "workspace-local";

async function readPackageJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(PACKAGE_ROOT, relativePath), "utf8"));
}

test("plugin.json parses under the Agent Plugins v1.0.0 validator with no warnings", async () => {
  const parsed = parseAgentPluginManifest(await readPackageJson("plugin.json"));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, "deploy");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
});

test("mcp.json declares ZERO servers — hosts run in-process through the deploy-target registry", async () => {
  const parsed = parseAgentPluginMcpConfig(await readPackageJson("mcp.json"));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.ok ? parsed.config.serverIds : ["unreachable"], []);
});

test("the eponymous skill exists and names the host it can publish to", async () => {
  const skill = await readFile(path.join(PACKAGE_ROOT, "skills", "deploy", "SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: deploy\n/);
  assert.match(skill, /Netlify/);
});

test("target ids are byte-identical to the legacy provider ids (sealed credentials bind to them)", async () => {
  const descriptor = (await readPackageJson(DEPLOY_TARGETS_FILENAME)) as { targets: { id: string; module: string }[] };
  const legacyIds = new Set(["github-pages", "vercel", "netlify", "cloudflare-pages", "s3-compatible"]);
  for (const target of descriptor.targets) assert.ok(legacyIds.has(target.id), `'${target.id}' is not a legacy provider id`);
  assert.deepEqual(
    descriptor.targets.map((target) => [target.id, target.module]),
    // Listed in the admin's display order (ecf8e7b7e); the registry, and so every host picker, keeps it.
    [
      ["github-pages", "targets/github-pages.mjs"],
      ["vercel", "targets/vercel.mjs"],
      ["netlify", "targets/netlify.mjs"],
      ["cloudflare-pages", "targets/cloudflare-pages.mjs"],
      ["s3-compatible", "targets/s3-compatible.mjs"],
    ],
  );
});

test("the package packs through the real packer with its descriptor and modules", async () => {
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);
  for (const file of ["plugin.json", "mcp.json", DEPLOY_TARGETS_FILENAME, "targets/netlify.mjs", "targets/cloudflare-pages.mjs", "targets/vercel.mjs", "targets/github-pages.mjs", "targets/s3-compatible.mjs", "skills/deploy/SKILL.md"]) {
    assert.ok(packed.files.includes(file), `${file} must survive packing`);
  }
});

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
    assert.equal((await readAgentPluginActivations(workspaceRoot)).plugins.deploy?.enabled, true);
    assert.equal((await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID })).get("netlify")?.pluginId, "deploy");
  });
});

test("an operator who switched deploy off stays switched off across boots", async () => {
  await withAgentPluginsDir(async (layout) => {
    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    const workspaceRoot = layout.forWorkspace(WORKSPACE_ID).root;
    await setAgentPluginActivation({ workspaceRoot, pluginId: "deploy", enabled: false, actor: "test:operator" });

    await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    assert.equal((await readAgentPluginActivations(workspaceRoot)).plugins.deploy?.enabled, false);
  });
});

test("seeded by the real seeder, deploy is ENABLED with no user action and the registry loads Netlify from the installed digest", async () => {
  await withAgentPluginsDir(async (layout) => {
    const seeded = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: CONTENT_ROOT });
    assert.equal(seeded.outcomes.find((outcome) => outcome.pluginId === "deploy")?.status, "seeded");

    const activations = await readAgentPluginActivations(layout.forWorkspace(WORKSPACE_ID).root);
    assert.equal(activations.plugins.deploy?.enabled, true, "publishing must keep working with zero user action");
    assert.equal(activations.plugins["site-compliance"]?.enabled, false, "every other bundled plugin still seeds disabled");

    const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID });
    assert.deepEqual(registry.refusals, []);
    const netlify = registry.get("netlify");
    assert.equal(netlify?.pluginId, "deploy");
    assert.equal(netlify?.descriptor.label, "Netlify");
    assert.equal(typeof netlify?.module.create, "function");
    assert.equal(registry.get("cloudflare-pages")?.descriptor.label, "Cloudflare Pages");
    assert.equal(registry.get("vercel")?.descriptor.label, "Vercel");
    assert.equal(registry.get("github-pages")?.descriptor.label, "GitHub Pages");
    assert.equal(registry.get("s3-compatible")?.descriptor.label, "S3-compatible storage");
  });
});

test("upgrade: a site holding an OLDER bundled deploy digest serves the new one after the next boot, with no user action", async () => {
  const sourceRoot = await mkdtemp(path.join(tmpdir(), "tovu-deploy-source-"));
  try {
    await cp(PACKAGE_ROOT, path.join(sourceRoot, "deploy"), { recursive: true });
    await withAgentPluginsDir(async (layout) => {
      await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot });

      // The next Tovu build ships a changed deploy plugin; its digest differs from the installed one.
      const descriptorPath = path.join(sourceRoot, "deploy", DEPLOY_TARGETS_FILENAME);
      const descriptor = JSON.parse(await readFile(descriptorPath, "utf8")) as { targets: { id: string; label: string }[] };
      descriptor.targets.find((target) => target.id === "netlify")!.label = "Netlify (next build)";
      await writeFile(descriptorPath, JSON.stringify(descriptor));

      await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot });
      const packages = await readdir(layout.forWorkspace(WORKSPACE_ID).packages);
      assert.equal(packages.length, 2, "the superseded digest stays on disk; the registry must still pick one");

      const registry = await loadDeployTargetRegistry({ workspaceId: WORKSPACE_ID });
      assert.deepEqual(registry.refusals, []);
      assert.equal(registry.get("netlify")?.descriptor.label, "Netlify (next build)");
    });
  } finally {
    await forceRemove(sourceRoot);
  }
});
