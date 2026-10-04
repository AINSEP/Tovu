import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { ValidationError } from "#src/platform/site-dir/index";

import { createDeployConfigKit, MIGRATIONS_NOTE, type DeployConfigGeneratorModule, type DeploymentDescriptor, type RenderDeployConfigOptions, type RenderedDeployConfig } from "#src/features/deployments/deploy-config";

/** The bundled `deploy` plugin's generator module, imported from its source like the other bundled-deploy tests. */
const MODULE_PATH = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/deploy/deploy-configs/fly.mjs");
const imported = (await import(pathToFileURL(MODULE_PATH).href)) as { default: DeployConfigGeneratorModule };

/** The module's `render` with the real host kit, under the name the core renderer had before it moved. */
function renderFlyToml(descriptor: DeploymentDescriptor, options: RenderDeployConfigOptions): RenderedDeployConfig {
  return imported.default.render(descriptor, options, createDeployConfigKit());
}

/**
 * @file `renderFlyToml` against a KNOWN, hand-fixed descriptor (not the real repo's) — exact-string
 * assertions, so a change to the emitted TOML's shape is caught here regardless of whatever the real
 * `Dockerfile`/`fly.toml` happen to say at the time (that's `deploy-config.unit.test.ts`'s job).
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

test("renderFlyToml: exact fly.toml contents for a known descriptor and region", () => {
  const result = renderFlyToml(FIXTURE_DESCRIPTOR, { region: "iad" });

  assert.equal(result.filename, "fly.toml");
  assert.equal(
    result.contents,
    `app = "acme-app"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  TOVU_RUNTIME_MODE = "production"
  PORT = "4000"

[[mounts]]
  source = "acme_sites"
  destination = "/workspace/Tovu/sites"

[http_service]
  internal_port = 4000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

  [[http_service.checks]]
    grace_period = "60s"
    interval = "30s"
    method = "GET"
    timeout = "5s"
    path = "/readyz"
`
  );
});

test("renderFlyToml: never emits a secret VALUE — only fly secrets set NAME instructions in notes", (t) => {
  const previousPassword = process.env.TOVU_ADMIN_PASSWORD;
  const sentinel = "deployment-secret-value-must-never-escape-9374";
  process.env.TOVU_ADMIN_PASSWORD = sentinel;
  t.after(() => {
    if (previousPassword === undefined) delete process.env.TOVU_ADMIN_PASSWORD;
    else process.env.TOVU_ADMIN_PASSWORD = previousPassword;
  });
  const result = renderFlyToml(FIXTURE_DESCRIPTOR, { region: "iad" });

  assert.ok(!result.contents.includes("TOVU_ADMIN_PASSWORD"), "fly.toml has no field for secrets at all");
  assert.ok(!result.contents.includes("TOVU_SITE_KEY"));
  assert.deepEqual(result.notes, [
    "Create the volume before the first deploy — this file only MOUNTS it, it does not create it: fly volumes create acme_sites --region iad -a acme-app",
    MIGRATIONS_NOTE,
    "Set TOVU_ADMIN_PASSWORD (boot-blocking) with: fly secrets set TOVU_ADMIN_PASSWORD=<value> -a acme-app",
    "Set TOVU_SITE_KEY (recommended) with: fly secrets set TOVU_SITE_KEY=<value> -a acme-app",
  ]);
  assert.ok(!result.contents.includes(sentinel), "generated config must not contain the environment secret");
  assert.ok(!JSON.stringify(result.notes).includes(sentinel), "instructions must not contain the environment secret");
});

test("renderFlyToml: rejects a missing region rather than defaulting to one", () => {
  assert.throws(() => renderFlyToml(FIXTURE_DESCRIPTOR, { region: "" }), ValidationError);
  assert.throws(() => renderFlyToml(FIXTURE_DESCRIPTOR, { region: "   " }), ValidationError);
});

test("renderFlyToml: rejects a --region that would inject a new top-level TOML key (regression)", () => {
  // Before the fix, this exact string closed `primary_region`'s quoted value early and injected a
  // real `primary_region_evil = "x"` top-level key into the generated fly.toml.
  const maliciousRegion = 'iad"\nprimary_region_evil="x';
  assert.throws(() => renderFlyToml(FIXTURE_DESCRIPTOR, { region: maliciousRegion }), ValidationError);
});

test("renderFlyToml: rejects a quote- or newline-bearing appName/volumeName, not just region (regression)", () => {
  assert.throws(() => renderFlyToml({ ...FIXTURE_DESCRIPTOR, appName: 'evil"\nsome_key="x' }, { region: "iad" }), ValidationError);
  assert.throws(() => renderFlyToml({ ...FIXTURE_DESCRIPTOR, volumeName: 'evil"\nsome_key="x' }, { region: "iad" }), ValidationError);
});
