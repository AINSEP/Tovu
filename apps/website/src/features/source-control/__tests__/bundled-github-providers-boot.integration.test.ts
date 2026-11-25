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
