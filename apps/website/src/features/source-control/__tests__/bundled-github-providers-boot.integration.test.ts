import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { forceRemove } from "#src/features/agent-plugins/__tests__/fixtures/force-remove";
import { agentPluginActivations } from "#src/features/agent-plugins/activation-effects";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { createTovuAgentPluginLifecycle, seedBundledAgentPlugins } from "#src/features/agent-plugins/lifecycle";
import { loadSourceControlProviderRegistry } from "#src/features/source-control/provider-registry";
import { bundledAgentPluginsDir } from "#src/platform/site-dir/product-root";

/**
 * @file Bug 1 (combine-23): the admin Source Control providers list read empty although the bundled
 * `github` plugin was enabled. This pins the exact server path the `GET .../source-control/providers`
 * route takes: boot seeding from the composed bundled root (`bundledAgentPluginsDir()`, as
 * `bootstrap.ts` does), then `loadSourceControlProviderRegistry` through a lifecycle built the way
 * `agent-plugin-bootstrap.ts` builds it, so the digest trust gate (`bundled-digests.json`) is real.
 * A reseed after the plugin's bytes change (a file move inside the package) must keep it trusted.
 */

const WORKSPACE_ID = "workspace-local";
const dirs: string[] = [];
after(async () => { for (const dir of dirs) await forceRemove(dir); });

async function seededSite(): Promise<ReturnType<typeof resolveAgentPluginLayout>> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-sc-boot-"));
  dirs.push(dir);
  const layout = resolveAgentPluginLayout({ siteDir: dir });
  await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: bundledAgentPluginsDir() });
  return layout;
}

async function providerIds(layout: ReturnType<typeof resolveAgentPluginLayout>, sourceRoot: string) {
  const lifecycle = createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: sourceRoot });
  const registry = await loadSourceControlProviderRegistry({ workspaceId: WORKSPACE_ID }, { loadContributions: lifecycle.loadPluginContributions });
  return { ids: registry.list().map((provider) => provider.descriptor.id), refusals: registry.refusals };
}

test("boot-seeded, enabled bundled github: the providers list carries github and no refusal", async () => {
  const layout = await seededSite();
  const activations = await agentPluginActivations.readAgentPluginActivations({ workspaceRoot: layout.forWorkspace({ workspaceId: WORKSPACE_ID }).root });
  assert.equal(activations.plugins.github?.enabled, true);
  assert.deepEqual(await providerIds(layout, bundledAgentPluginsDir()), { ids: ["github"], refusals: [] });
});

test("a reseed after github's bytes move keeps its digest trusted: the list is still non-empty", async () => {
  const layout = await seededSite();
  const { cp, writeFile } = await import("node:fs/promises");
  const moved = await mkdtemp(path.join(tmpdir(), "tovu-sc-moved-"));
  dirs.push(moved);
  await cp(bundledAgentPluginsDir(), moved, { recursive: true });
  await writeFile(path.join(moved, "github", "MOVED.md"), "a file that moved into the package");
  await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: moved });
  assert.deepEqual(await providerIds(layout, moved), { ids: ["github"], refusals: [] });
});

/** The bundle a pre-rename build shipped: github as `tovu/github`, its contributions under `tovu-*.json`. */
async function preRenameBundle(): Promise<string> {
  const { cp, readFile, rename, writeFile } = await import("node:fs/promises");
  const root = await mkdtemp(path.join(tmpdir(), "tovu-sc-prerename-"));
  dirs.push(root);
  await cp(bundledAgentPluginsDir(), root, { recursive: true });
  const github = path.join(root, "github");
  for (const kind of ["source-control", "deploy-ops"]) await rename(path.join(github, `jini-${kind}.json`), path.join(github, `tovu-${kind}.json`));
  const manifest = path.join(github, "plugin.json");
  await writeFile(manifest, (await readFile(manifest, "utf8")).replace('"jini/github"', '"tovu/github"'));
  return root;
}

/** Seeds the pre-rename bundle, makes the publisher-ID upgrade hold github (`ledger`: the ledger no
 * longer names the installed copy; `edited`: the installed copy was changed after install, so its
 * re-pack no longer reproduces its digest), reseeds this build and lists the providers. */
async function heldPreRenameProviders(hold: "ledger" | "edited") {
  const { readFile, writeFile, readdir } = await import("node:fs/promises");
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-sc-held-"));
  dirs.push(dir);
  const layout = resolveAgentPluginLayout({ siteDir: dir });
  await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: await preRenameBundle() });
  const workspaceRoot = layout.forWorkspace({ workspaceId: WORKSPACE_ID }).root;
  if (hold === "ledger") {
    const ledgerFile = path.join(workspaceRoot, "bundled-digests.json");
    const ledger = JSON.parse(await readFile(ledgerFile, "utf8"));
    ledger.plugins.github.archiveDigest = "0".repeat(64);
    await writeFile(ledgerFile, JSON.stringify(ledger));
  } else {
    const revisions = path.join(workspaceRoot, "github", "package", "sha256");
    const [revision] = await readdir(revisions);
    const skill = path.join(revisions, revision!, "skills");
    const [skillDir] = await readdir(skill);
    await writeFile(path.join(skill, skillDir!, "SKILL.md"), "edited after install", { flag: "a" });
  }
  const reseed = await seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE_ID, sourceRoot: bundledAgentPluginsDir() });
  assert.equal(reseed.idUpgrades?.find((upgrade) => upgrade.pluginId === "github")?.status, "held", JSON.stringify(reseed.idUpgrades));
  return providerIds(layout, bundledAgentPluginsDir());
}

for (const hold of ["ledger", "edited"] as const) {
  test(`a site held on the pre-rename github copy (${hold}) logs why github is missing instead of an empty list with no reason`, async () => {
    const { ids, refusals } = await heldPreRenameProviders(hold);
    assert.deepEqual(ids, []);
    assert.equal(refusals.filter((refusal) => refusal.includes("'github'")).length, 1, `refusals: ${JSON.stringify(refusals)}`);
  });
}
