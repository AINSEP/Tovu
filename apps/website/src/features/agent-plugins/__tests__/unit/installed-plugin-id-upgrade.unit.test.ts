/**
 * @file PLUGIN-ID-UPGRADE failing proof (r62t-rsy-7 "PARTIAL · Installed plugin ID upgrade"; owner
 * decision: a maintenance step with verified bundled replacements, third-party revisions go to a
 * publisher list). The trusted pre-rename bundle is the published `@jini-ai/agent-plugins@0.7.2`
 * (`latest`, registry integrity sha512-3awhB0LhIfm2YZrfjX1AIl9XLhisW1MvgiOerWHkFXuC2ybDMiTs0VVzpV6wXSWi9zI0P8BWTEdJcryYIu+t2g==).
 * `fixtures/pre-rename-0.7.2/cloudflare` is that tarball's `cloudflare/` folder byte for byte
 * (`tovu/cloudflare` 0.3.3); the canonical bundle ships `jini/cloudflare` 0.3.4. Red until the
 * maintenance step exists: an installed site must reach the qualified ID with its owner state kept.
 */
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { bundledAgentPluginsDir } from "#src/server/runtime/composition/site-paths";
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createTovuAgentPluginLifecycle, explicitRootAgentPluginActivations } from "../../lifecycle.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { forceRemove } from "../fixtures/force-remove.js";
import { selectedPluginSourceRoot } from "../fixtures/bundled-source-root.js";

const WORKSPACE = "workspace-local";
const PRE_RENAME_ROOT = path.join(import.meta.dirname, "../fixtures/pre-rename-0.7.2");

async function boundLifecycle(t: TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-plugin-id-upgrade-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR; else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  });
  const layout = resolveAgentPluginLayout({ siteDir: process.cwd() }, { env: { TOVU_AGENT_PLUGINS_DIR: dir } });
  return { layout, lifecycle: createTovuAgentPluginLifecycle({ layout }, { bundledSourceRoot: bundledAgentPluginsDir() }) };
}

test("a site installed from the pre-rename 0.7.2 bundle reaches jini/cloudflare with its owner activation kept, and a second run is stable", async t => {
  const { layout, lifecycle } = await boundLifecycle(t);
  const workspaceRoot = layout.forWorkspace({ workspaceId: WORKSPACE }).root;
  await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE, sourceRoot: PRE_RENAME_ROOT });
  const before = (await lifecycle.listInstalledPlugins({ workspaceRoot })).find(plugin => plugin.pluginId === "cloudflare");
  assert.equal(before?.id, "tovu/cloudflare", "fixture: the published 0.7.2 bundle installs the pre-rename identity");
  await explicitRootAgentPluginActivations.setAgentPluginActivation({ workspaceRoot, pluginId: "cloudflare", enabled: true, actor: "owner" });

  const canonical = await selectedPluginSourceRoot({ pluginIds: ["cloudflare"] });
  t.after(() => canonical.dispose());
  for (const run of ["first", "second"]) {
    await lifecycle.seedBundledAgentPlugins({ layout, workspaceId: WORKSPACE, sourceRoot: canonical.root });
    const after = (await lifecycle.listInstalledPlugins({ workspaceRoot })).find(plugin => plugin.pluginId === "cloudflare");
    assert.equal(after?.id, "jini/cloudflare", `${run} upgrade run: the installed revision carries the canonical qualified ID`);
    const activation = await explicitRootAgentPluginActivations.resolveAgentPluginActivation({ workspaceRoot, pluginId: "cloudflare" });
    assert.notEqual(activation.verdict, "inactive", `${run} upgrade run: the owner's short-name activation survives the upgrade`);
  }
});
