import assert from "node:assert/strict";
import test from "node:test";

import { ValidationError } from "#src/platform/site-dir/index";

import { RAILWAY_VALID_REGIONS, renderRailwayConfig } from "../deploy-config-railway.js";
import type { DeploymentDescriptor } from "../deploy-config.js";

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
    { name: "TOVU_INTEGRATIONS_ROOT_KEY", requirement: "recommended" },
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

test("renderRailwayConfig: never emits a secret VALUE or any env-var field at all — railway.json has no such section", () => {
  const result = renderRailwayConfig(FIXTURE_DESCRIPTOR, { region: "us-west2" });

  assert.ok(!result.contents.includes("TOVU_ADMIN_PASSWORD"));
  assert.ok(!result.contents.includes("TOVU_INTEGRATIONS_ROOT_KEY"));
  const parsed = JSON.parse(result.contents) as Record<string, unknown>;
  assert.ok(!("envVars" in parsed), "no top-level envVars key");
  assert.ok(!("variables" in parsed), "no top-level variables key");
  assert.ok(
    result.notes.some((note) => note.includes("railway variables set TOVU_ADMIN_PASSWORD")),
    "the secret instead appears as a CLI instruction in notes"
  );
});

test("renderRailwayConfig: rejects a missing region — railway.json has no single-service region default to fall back to", () => {
  assert.throws(() => renderRailwayConfig(FIXTURE_DESCRIPTOR, { region: "" }), ValidationError);
});

test("renderRailwayConfig: rejects a region outside Railway's own 4 identifiers", () => {
  assert.throws(() => renderRailwayConfig(FIXTURE_DESCRIPTOR, { region: "us-east-1" }), ValidationError);
});

test("renderRailwayConfig: pins numReplicas to 1 for every documented region — never more, since Tovu's SQLite volume is single-writer", () => {
  for (const region of RAILWAY_VALID_REGIONS) {
    const result = renderRailwayConfig(FIXTURE_DESCRIPTOR, { region });
    const parsed = JSON.parse(result.contents) as { deploy: { multiRegionConfig: Record<string, { numReplicas: number }> } };
    assert.deepEqual(Object.keys(parsed.deploy.multiRegionConfig), [region]);
    assert.equal(parsed.deploy.multiRegionConfig[region]!.numReplicas, 1);
  }
});
