import assert from "node:assert/strict";
import path from "node:path";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { load as parseYaml } from "js-yaml";
import { parse as parseToml } from "smol-toml";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { ValidationError } from "../../../../../apps/website/src/platform/site-dir/index.ts";

import { createDeployConfigKit, MIGRATIONS_NOTE } from "../../../../../apps/website/src/features/deployments/deploy-config.ts";

/** The bundled `fly` plugin's generator module. Moved from core's
 * `agent-plugins/__tests__/unit/bundled-deploy-config-fly.unit.test.ts`: vendor tests live with the vendor;
 * the host kit (`createDeployConfigKit`) is still core's real one, imported by path. */
const MODULE_PATH = path.resolve(import.meta.dirname, "../fly.mjs");
const imported = await import(pathToFileURL(MODULE_PATH).href);

/** The module's `render` with the real host kit, under the name the core renderer had before it moved. */
function renderFlyToml(descriptor, options) {
  return imported.default.render(descriptor, options, createDeployConfigKit());
}

/**
 * @file `renderFlyToml` against a KNOWN, hand-fixed descriptor (not the real repo's) — exact-string
 * assertions, so a change to the emitted TOML's shape is caught here regardless of whatever the real
 * `Dockerfile`/`package.json` happen to say at the time (that's `deploy-config.unit.test.ts`'s job).
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
    'Headless Chromium is not installed by default. To enable browser-backed tools (page evidence, screenshots), add [build.args] TOVU_INSTALL_BROWSER = "1" to this file (or deploy with --build-arg TOVU_INSTALL_BROWSER=1) and allow ~150–250 MB more RAM per capture.',
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


/** Golden production fields captured from root fly.toml before its removal. Comments lived in the
 * workflow header; every actual setting below must survive plugin generation unchanged. */
const PRODUCTION_FLY_TOML = `app = "tovu"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[build.args]
  TOVU_INSTALL_BROWSER = "0"

[env]
  TOVU_RUNTIME_MODE = "production"
  PORT = "3000"
  TOVU_SITE = "tovu-com"
  TOVU_SITE_ID = "fly-site-fixture"
  TOVU_PUBLIC_URL = "https://tovu.dev"

[[mounts]]
  source = "tovu_sites"
  destination = "/workspace/Tovu/sites"

[http_service]
  internal_port = 3000
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
`;

test("renderFlyToml preserves every production field, including the live volume folder and public origin", () => {
  const result = renderFlyToml({
    ...FIXTURE_DESCRIPTOR, appName: "tovu", port: 3000, volumeName: "tovu_sites",
  }, {
    region: "iad",
    env: { TOVU_SITE: "tovu-com", TOVU_SITE_ID: "fly-site-fixture", TOVU_PUBLIC_URL: "https://tovu.dev" },
    buildArgs: { TOVU_INSTALL_BROWSER: "0" },
  });
  assert.equal(result.contents, PRODUCTION_FLY_TOML);
});

test("the production workflow's generation command uses the plugin and emits the parity config without npm or a built CLI", (t) => {
  const repoRoot = path.resolve(path.dirname(MODULE_PATH), "../../../..");
  const workflow = parseYaml(readFileSync(path.join(repoRoot, ".github/workflows/fly-deploy.yml"), "utf8"));
  const steps = workflow.jobs.deploy.steps;
  const index = steps.findIndex(step => step.name === "Generate Fly config from the plugin");
  assert.ok(index >= 0);
  assert.equal(steps[index + 1].run,
    "flyctl deploy --remote-only --config fly.toml --build-arg TOVU_BUILD_SHA=${{ github.sha }}");
  assert.deepEqual(steps[index + 1].env, { FLY_API_TOKEN: "${{ secrets.FLY_API_TOKEN }}" });
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.ok(!("FLY_API_TOKEN" in workflow.env), "generation receives no Fly credential from workflow inputs");

  // Run only the generation step in a fresh checkout-shaped directory. No flyctl, npm, TS loader,
  // network, or repo-root output is involved; the actual YAML env/command must produce the golden.
  const root = mkdtempSync(path.join(tmpdir(), "tovu-fly-workflow-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const moduleCopy = path.join(root, "content/agent-plugins/fly/deploy-configs/fly.mjs");
  mkdirSync(path.dirname(moduleCopy), { recursive: true });
  copyFileSync(MODULE_PATH, moduleCopy);
  const result = spawnSync("bash", ["-eu", "-c", steps[index].run], {
    cwd: root, encoding: "utf8",
    env: { PATH: process.env.PATH, ...workflow.env, TOVU_SITE_ID: "fly-site-fixture", TOVU_ADMIN_PASSWORD: "never-render-this-secret" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(path.join(root, "fly.toml"), "utf8"), PRODUCTION_FLY_TOML);
});

test("renderFlyToml escapes variable values instead of treating them as TOML syntax", () => {
  const value = 'https://example.test/a?next="quoted"\\path\n[unexpected]\r\t';
  const result = renderFlyToml(FIXTURE_DESCRIPTOR, {
    region: "iad", env: { TOVU_PUBLIC_URL: value, PORT: "4321" },
    buildArgs: { CUSTOM_BUILD: value },
  });
  const parsed = parseToml(result.contents);
  assert.deepEqual(parsed.env, { TOVU_RUNTIME_MODE: "production", PORT: "4321", TOVU_PUBLIC_URL: value });
  assert.deepEqual(parsed.build, { dockerfile: "Dockerfile", args: { CUSTOM_BUILD: value } });
  assert.equal((result.contents.match(/^  PORT = /gm) ?? []).length, 1, "overrides emit a single TOML key");
  assert.match(result.contents, /^  PORT = "4321"$/m);
  assert.doesNotMatch(result.contents, /^\[unexpected\]/m);
});

test("renderFlyToml rejects invalid variable names, non-string values, and declared secrets in either map", () => {
  for (const field of ["env", "buildArgs"]) {
    for (const variables of [
      { "BAD\n[env]": "value" },
      { BAD: 123 },
      { TOVU_ADMIN_PASSWORD: "never-include-this-value" },
    ]) {
      assert.throws(() => renderFlyToml(FIXTURE_DESCRIPTOR, {
        region: "iad", [field]: variables,
      }), error => error instanceof ValidationError && !error.message.includes("never-include-this-value"));
    }
  }
});

test("renderFlyToml omits an empty build args table and preserves defaults for empty options maps", () => {
  assert.equal(renderFlyToml(FIXTURE_DESCRIPTOR, { region: "iad", env: {}, buildArgs: {} }).contents,
    renderFlyToml(FIXTURE_DESCRIPTOR, { region: "iad" }).contents);
});


test("renderFlyToml escapes the TOML-forbidden DEL control character", () => {
  const result = renderFlyToml(FIXTURE_DESCRIPTOR, { region: "iad", env: { LABEL: "before\u007fafter" } });
  assert.ok(result.contents.includes('  LABEL = "before\\u007fafter"\n'));
  assert.ok(!result.contents.includes("\u007f"));
  assert.deepEqual(parseToml(result.contents).env, { TOVU_RUNTIME_MODE: "production", PORT: "4000", LABEL: "before\u007fafter" });
});
