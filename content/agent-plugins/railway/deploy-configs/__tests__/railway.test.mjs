// Moved from core's apps/website/src/features/agent-plugins/__tests__/unit/bundled-deploy-config-railway.unit.test.ts (types stripped): vendor tests live with
// the vendor plugin; the host kits and fixtures it drives are still core's real ones, imported by path.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { ValidationError } from "../../../../../apps/website/src/platform/site-dir/index.ts";

import { createDeployConfigKit } from "../../../../../apps/website/src/features/deployments/deploy-config.ts";

/** The bundled `railway` plugin's generator module, imported from its source like the other bundled-deploy tests. */
const MODULE_PATH = path.resolve(import.meta.dirname, "../railway.mjs");
const imported = (await import(pathToFileURL(MODULE_PATH).href));
const RAILWAY_VALID_REGIONS = imported.RAILWAY_VALID_REGIONS;

/** The module's `render` with the real host kit, under the name the core renderer had before it moved. */
function renderRailwayConfig(descriptor, options) {
  return imported.default.render(descriptor, options, createDeployConfigKit());
}

/**
 * @file `renderRailwayConfig` against a KNOWN, hand-fixed descriptor — exact-string assertions, same
 * discipline as the Fly/Render renderer tests.
 */

const FIXTURE_DESCRIPTOR = {
  appName: "acme-app",
  port: 4000,
  dockerfilePath: "Dockerfile",
  volumeMountPath: "/workspace/Tovu/sites",
  volumeName: "acme_sites",
  healthCheckPath: "/readyz",
  secrets: [
    { name: "TOVU_ADMIN_PASSWORD", requirement: "boot-blocking" },
    { name: "TOVU_SITE_KEY", requirement: "recommended" },
  ],
};

test("renderRailwayConfig: exact railway.json contents for a known descriptor and region", () => {
  const result = renderRailwayConfig(FIXTURE_DESCRIPTOR, { region: "us-west2" });

  assert.equal(result.filename, "railway.json");
  assert.equal(
    result.contents,
    `{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/readyz",
    "restartPolicyType": "ON_FAILURE",
    "multiRegionConfig": {
      "us-west2": {
        "numReplicas": 1
      }
    }
  }
}
`
  );
  // The file itself must be valid, parseable JSON — not just visually TOML/YAML-shaped-correct.
  assert.doesNotThrow(() => JSON.parse(result.contents));
});

test("renderRailwayConfig: never emits a secret VALUE or any env-var field at all — railway.json has no such section", (t) => {
  const previousPassword = process.env.TOVU_ADMIN_PASSWORD;
  const sentinel = "deployment-secret-value-must-never-escape-9374";
  process.env.TOVU_ADMIN_PASSWORD = sentinel;
  t.after(() => {
    if (previousPassword === undefined) delete process.env.TOVU_ADMIN_PASSWORD;
    else process.env.TOVU_ADMIN_PASSWORD = previousPassword;
  });
  const result = renderRailwayConfig(FIXTURE_DESCRIPTOR, { region: "us-west2" });

  assert.ok(!result.contents.includes("TOVU_ADMIN_PASSWORD"));
  assert.ok(!result.contents.includes("TOVU_SITE_KEY"));
  const parsed = JSON.parse(result.contents);
  assert.ok(!("envVars" in parsed), "no top-level envVars key");
  assert.ok(!("variables" in parsed), "no top-level variables key");
  assert.ok(
    result.notes.some((note) => note.includes("railway variables set TOVU_ADMIN_PASSWORD")),
    "the secret instead appears as a CLI instruction in notes"
  );
  assert.ok(!result.contents.includes(sentinel), "generated config must not contain the environment secret");
  assert.ok(!JSON.stringify(result.notes).includes(sentinel), "instructions must not contain the environment secret");
});

test("renderRailwayConfig: notes state the headless-Chromium opt-in — the Dockerfile default is off (owner decision 2026-10-08)", () => {
  const result = renderRailwayConfig(FIXTURE_DESCRIPTOR, { region: "us-west2" });
  assert.ok(
    result.notes.some((note) => note.includes("railway variables set TOVU_INSTALL_BROWSER=1")),
    JSON.stringify(result.notes),
  );
  assert.ok(!result.contents.includes("TOVU_INSTALL_BROWSER"), "off stays the default: railway.json itself never opts in");
});

test("renderRailwayConfig: rejects a missing region — railway.json has no single-service region default to fall back to", () => {
  assert.throws(() => renderRailwayConfig(FIXTURE_DESCRIPTOR, { region: "" }), ValidationError);
});

test("renderRailwayConfig: rejects a region outside Railway's own 4 identifiers", () => {
  assert.throws(() => renderRailwayConfig(FIXTURE_DESCRIPTOR, { region: "us-east-1" }), ValidationError);
});

test("renderRailwayConfig: pins numReplicas to 1 for every documented region — never more, since Tovu's SQLite volume is single-writer", () => {
  const expectedRegions = ["us-west2", "us-east4-eqdc4a", "europe-west4-drams3a", "asia-southeast1-eqsg3a"];
  assert.deepEqual(RAILWAY_VALID_REGIONS, expectedRegions);
  for (const region of expectedRegions) {
    const result = renderRailwayConfig(FIXTURE_DESCRIPTOR, { region });
    const parsed = JSON.parse(result.contents);
    assert.deepEqual(Object.keys(parsed.deploy.multiRegionConfig), [region]);
    assert.equal(parsed.deploy.multiRegionConfig[region].numReplicas, 1);
  }
});


test("railway is a seeded-disabled package with its config and deploy-ops descriptors, modules and skill packed", async () => {
  const { readFile } = await import("node:fs/promises");
  const { packAgentPluginDirectory, BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED } = await import("../../../../../apps/website/src/features/agent-plugins/lifecycle.ts");
  const { loadDeployConfigGeneratorsFromSource } = await import("../../../../../apps/website/src/features/deployments/deploy-config-registry.ts");
  const packageRoot = path.dirname(path.dirname(MODULE_PATH));
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "plugin.json"), "utf8"));
  assert.equal(manifest.name, "railway");
  assert.equal(manifest.extensions.tovu.id, "tovu/railway");
  assert.equal(manifest.extensions.tovu.displayName, "Railway");
  assert.deepEqual(manifest.extensions.tovu.provides, ["deploy-config:railway", "deploy-ops:railway"]);
  assert.deepEqual(JSON.parse(await readFile(path.join(packageRoot, "mcp.json"), "utf8")).mcpServers, {});
  const registry = await loadDeployConfigGeneratorsFromSource({ pluginId: "railway", packageRoot });
  assert.deepEqual(registry.refusals, []);
  assert.deepEqual(registry.list().map(item => item.descriptor.id), ["railway"]);
  const packed = await packAgentPluginDirectory(packageRoot);
  for (const file of ["plugin.json", "mcp.json", "tovu-deploy-configs.json", "deploy-configs/railway.mjs", "skills/railway/SKILL.md", "tovu-deploy-ops.json", "deploy-ops/railway.mjs"]) assert.ok(packed.files.includes(file), file);
  assert.ok(!packed.files.includes("tovu-deploy-targets.json"));
  assert.equal(BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED.has("railway"), false);
});
