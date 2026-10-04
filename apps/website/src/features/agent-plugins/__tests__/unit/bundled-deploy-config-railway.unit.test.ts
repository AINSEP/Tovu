import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { ValidationError } from "#src/platform/site-dir/index";

import { createDeployConfigKit, type DeployConfigGeneratorModule, type DeploymentDescriptor, type RenderDeployConfigOptions, type RenderedDeployConfig } from "#src/features/deployments/deploy-config";

/** The bundled `deploy` plugin's generator module, imported from its source like the other bundled-deploy tests. */
const MODULE_PATH = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/deploy/deploy-configs/railway.mjs");
const imported = (await import(pathToFileURL(MODULE_PATH).href)) as { default: DeployConfigGeneratorModule; RAILWAY_VALID_REGIONS: readonly string[] };
const RAILWAY_VALID_REGIONS = imported.RAILWAY_VALID_REGIONS;

/** The module's `render` with the real host kit, under the name the core renderer had before it moved. */
function renderRailwayConfig(descriptor: DeploymentDescriptor, options: RenderDeployConfigOptions): RenderedDeployConfig {
  return imported.default.render(descriptor, options, createDeployConfigKit());
}

/**
 * @file `renderRailwayConfig` against a KNOWN, hand-fixed descriptor — exact-string assertions, same
 * discipline as the Fly/Render renderer tests.
 */

const FIXTURE_DESCRIPTOR: DeploymentDescriptor = {
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
  const parsed = JSON.parse(result.contents) as Record<string, unknown>;
  assert.ok(!("envVars" in parsed), "no top-level envVars key");
  assert.ok(!("variables" in parsed), "no top-level variables key");
  assert.ok(
    result.notes.some((note) => note.includes("railway variables set TOVU_ADMIN_PASSWORD")),
    "the secret instead appears as a CLI instruction in notes"
  );
  assert.ok(!result.contents.includes(sentinel), "generated config must not contain the environment secret");
  assert.ok(!JSON.stringify(result.notes).includes(sentinel), "instructions must not contain the environment secret");
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
    const parsed = JSON.parse(result.contents) as { deploy: { multiRegionConfig: Record<string, { numReplicas: number }> } };
    assert.deepEqual(Object.keys(parsed.deploy.multiRegionConfig), [region]);
    assert.equal(parsed.deploy.multiRegionConfig[region]!.numReplicas, 1);
  }
});
