import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runDeployConfigCommand } from "../../../../apps/website/src/cli/commands/deploy-config.ts";
import { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED, packAgentPluginDirectory } from "../../../../apps/website/src/features/agent-plugins/lifecycle.ts";
import { loadDeployConfigGeneratorsFromSource } from "../../../../apps/website/src/features/deployments/deploy-config-registry.ts";
import { agentPluginSourceDir } from "../../../../development/test-support/agent-plugin-source.mjs";
import { processComposedBundledSourceRoot } from "../../../../apps/website/src/features/agent-plugins/__tests__/fixtures/bundled-source-root.ts";

/**
 * @file Tovu's half of the Railway deploy-config generator (`@jini-ai/agent-plugins/railway`): the
 * `tovu deploy config` CLI (Tovu's HOST_DEPLOY_ENV, the local site id, the overlay's
 * `deploy-notes.json`) and the package as Tovu packs and seeds it. The generator's own output rules
 * are proven in Jini, `packages/agent-plugins/railway/deploy-configs/__tests__/railway.test.mjs`.
 */

// railway ships from @jini-ai/agent-plugins/railway: read it where Tovu takes it from.
const PLUGIN_DIR = agentPluginSourceDir({ pluginId: "railway" });

/** Runs the CLI against a throwaway site holding `siteId`, generators loaded from the composed bundle. */
async function runCli(t, { siteId, region }) {
  const site = await mkdtemp(path.join(tmpdir(), "tovu-railway-site-")); t.after(() => rm(site, { recursive: true, force: true }));
  await writeFile(path.join(site, ".site-meta.json"), JSON.stringify({ siteId }));
  const out = []; const err = [];
  await runDeployConfigCommand({ target: "railway", region }, {
    env: { TOVU_SITE_DIR: site, TOVU_BUNDLED_AGENT_PLUGINS_DIR: await processComposedBundledSourceRoot() },
    stdout: (m) => { out.push(m); }, stderr: (m) => { err.push(m); },
  });
  return { out, err };
}

/**
 * Bug class: a generator silently dropping the `options.env` the CLI stamps (bug 376). railway.json
 * cannot hold variables, so each one must reach the operator as a `railway variables set` step —
 * Tovu's runtime mode (HOST_DEPLOY_ENV) included. The Chromium note is Tovu's overlay note, last.
 */
test("tovu deploy config --target railway tells the operator to set Tovu's runtime mode and the local site's TOVU_SITE_ID", async (t) => {
  const { out, err } = await runCli(t, { siteId: "site-uuid-railway", region: "us-west2" });
  assert.ok(err.some((line) => line.includes("stamped TOVU_SITE_ID=site-uuid-railway")), err.join(""));
  assert.ok(err.some((line) => line.includes("railway variables set TOVU_RUNTIME_MODE='production'")), err.join(""));
  assert.ok(err.some((line) => line.includes("railway variables set TOVU_SITE_ID='site-uuid-railway'")), err.join(""));
  assert.ok(!out[0].includes("TOVU_SITE_ID") && !out[0].includes("TOVU_RUNTIME_MODE"), "railway.json itself still has no variables section");
  assert.ok(err.at(-1).includes("railway variables set TOVU_INSTALL_BROWSER=1"), err.join(""));
});

test("railway is a seeded-disabled package with its config and deploy-ops descriptors, modules and skill packed", async () => {
  const manifest = JSON.parse(await readFile(path.join(PLUGIN_DIR, "plugin.json"), "utf8"));
  assert.equal(manifest.name, "railway");
  assert.equal(manifest.extensions.tovu.id, "tovu/railway");
  assert.equal(manifest.extensions.tovu.displayName, "Railway");
  assert.deepEqual(manifest.extensions.tovu.provides, ["deploy-config:railway", "deploy-ops:railway"]);
  assert.deepEqual(JSON.parse(await readFile(path.join(PLUGIN_DIR, "mcp.json"), "utf8")).mcpServers, {});
  const registry = await loadDeployConfigGeneratorsFromSource({ pluginId: "railway", packageRoot: PLUGIN_DIR });
  assert.deepEqual(registry.refusals, []);
  assert.deepEqual(registry.list().map(item => item.descriptor.id), ["railway"]);
  const packed = await packAgentPluginDirectory(PLUGIN_DIR);
  for (const file of ["plugin.json", "mcp.json", "tovu-deploy-configs.json", "deploy-configs/railway.mjs", "skills/railway/SKILL.md", "tovu-deploy-ops.json", "deploy-ops/railway.mjs"]) assert.ok(packed.files.includes(file), file);
  assert.ok(!packed.files.includes("tovu-deploy-targets.json"));
  assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has("railway"), false);
});
