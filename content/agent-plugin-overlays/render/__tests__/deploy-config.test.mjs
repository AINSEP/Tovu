import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { load as parseYaml } from "js-yaml";
import { runDeployConfigCommand } from "../../../../apps/website/src/cli/commands/deploy-config.ts";
import { BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED, packAgentPluginDirectory } from "../../../../apps/website/src/features/agent-plugins/lifecycle.ts";
import { loadDeployConfigGeneratorsFromSource } from "../../../../apps/website/src/features/deployments/deploy-config-registry.ts";
import { agentPluginSourceDir } from "../../../../development/test-support/agent-plugin-source.mjs";
import { processComposedBundledSourceRoot } from "../../../../apps/website/src/features/agent-plugins/__tests__/fixtures/bundled-source-root.ts";

/**
 * @file Tovu's half of the Render deploy-config generator (`@jini-ai/agent-plugins/render`): the
 * `tovu deploy config` CLI (Tovu's HOST_DEPLOY_ENV, the local site id, the overlay's
 * `deploy-notes.json`) and the package as Tovu packs and seeds it. The generator's own output rules
 * are proven in Jini, `packages/agent-plugins/render/deploy-configs/__tests__/render.test.mjs`.
 */

// render ships from @jini-ai/agent-plugins/render: read it where Tovu takes it from.
const PLUGIN_DIR = agentPluginSourceDir({ pluginId: "render" });

/** Runs the CLI against a throwaway site holding `siteId`, generators loaded from the composed bundle. */
async function runCli(t, { siteId, region }) {
  const site = await mkdtemp(path.join(tmpdir(), "tovu-render-site-")); t.after(() => rm(site, { recursive: true, force: true }));
  await writeFile(path.join(site, ".site-meta.json"), JSON.stringify({ siteId }));
  const out = []; const err = [];
  await runDeployConfigCommand({ target: "render", region }, {
    env: { TOVU_SITE_DIR: site, TOVU_BUNDLED_AGENT_PLUGINS_DIR: await processComposedBundledSourceRoot() },
    stdout: (m) => { out.push(m); }, stderr: (m) => { err.push(m); },
  });
  return { out, err };
}

/** The service's envVars keys, in file order. */
function envKeysOf(contents) {
  return parseYaml(contents).services[0].envVars.map(({ key }) => key);
}

/**
 * Bug class: a generator silently dropping the `options.env` the CLI stamps (bug 376 — Render
 * ignored it, so `tovu deploy config --target render` printed "stamped TOVU_SITE_ID=…" and then
 * deployed a server that would mint a different site identity). Driven the way an operator hits it.
 * The generator now emits the host's variables after PORT, in the order Tovu passes them
 * (HOST_DEPLOY_ENV first, then the site id); the Chromium note is Tovu's overlay note, appended last.
 */
test("tovu deploy config --target render carries Tovu's runtime mode and the local site's TOVU_SITE_ID into render.yaml", async (t) => {
  const { out, err } = await runCli(t, { siteId: "site-uuid-render", region: "oregon" });
  assert.ok(err.some((line) => line.includes("stamped TOVU_SITE_ID=site-uuid-render")), err.join(""));
  assert.deepEqual(envKeysOf(out[0]).slice(0, 3), ["PORT", "TOVU_RUNTIME_MODE", "TOVU_SITE_ID"]);
  const [service] = parseYaml(out[0]).services;
  const values = Object.fromEntries(service.envVars.map(({ key, value }) => [key, value]));
  assert.equal(values.TOVU_RUNTIME_MODE, "production");
  assert.equal(values.TOVU_SITE_ID, "site-uuid-render", "the stamped id must reach the deployed service");
  assert.ok(err.at(-1).includes("set the environment variable TOVU_INSTALL_BROWSER=1 on this service"), err.join(""));
  assert.ok(!out[0].includes("TOVU_INSTALL_BROWSER"), "off stays the default: render.yaml itself never opts in");
});

test("render is a seeded-disabled package with its config and deploy-ops descriptors, modules and skill packed", async () => {
  const manifest = JSON.parse(await readFile(path.join(PLUGIN_DIR, "plugin.json"), "utf8"));
  assert.equal(manifest.name, "render");
  assert.equal(manifest.extensions.tovu.id, "tovu/render");
  assert.equal(manifest.extensions.tovu.displayName, "Render");
  assert.deepEqual(manifest.extensions.tovu.provides, ["deploy-config:render", "deploy-ops:render"]);
  assert.deepEqual(JSON.parse(await readFile(path.join(PLUGIN_DIR, "mcp.json"), "utf8")).mcpServers, {});
  const registry = await loadDeployConfigGeneratorsFromSource({ pluginId: "render", packageRoot: PLUGIN_DIR });
  assert.deepEqual(registry.refusals, []);
  assert.deepEqual(registry.list().map(item => item.descriptor.id), ["render"]);
  const packed = await packAgentPluginDirectory(PLUGIN_DIR);
  for (const file of ["plugin.json", "mcp.json", "tovu-deploy-configs.json", "deploy-configs/render.mjs", "skills/render/SKILL.md", "tovu-deploy-ops.json", "deploy-ops/render.mjs"]) assert.ok(packed.files.includes(file), file);
  assert.ok(!packed.files.includes("tovu-deploy-targets.json"));
  assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has("render"), false);
});
