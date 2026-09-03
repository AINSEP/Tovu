import assert from "node:assert/strict";
import test from "node:test";

import { ValidationError } from "#src/platform/site-dir/index";

import { RENDER_VALID_REGIONS, renderRenderYaml } from "../deploy-config-render.js";
import type { DeploymentDescriptor } from "../deploy-config.js";

/**
 * @file `renderRenderYaml` against a KNOWN, hand-fixed descriptor — exact-string assertions, same
 * discipline as `deploy-config-fly.unit.test.ts`.
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

test("renderRenderYaml: exact render.yaml contents for a known descriptor and region", () => {
  const result = renderRenderYaml(FIXTURE_DESCRIPTOR, { region: "frankfurt" });

  assert.equal(result.filename, "render.yaml");
  assert.equal(
    result.contents,
    `services:
  - type: web
    name: acme-app
    runtime: docker
    plan: starter
    region: frankfurt
    healthCheckPath: /readyz
    envVars:
      - key: TOVU_RUNTIME_MODE
        value: production
      - key: PORT
        value: "4000"
      - key: TOVU_ADMIN_PASSWORD
        sync: false
      - key: TOVU_INTEGRATIONS_ROOT_KEY
        sync: false
    disk:
      name: acme_sites
      mountPath: /workspace/Tovu/sites
      sizeGB: 10
`
  );
});

test("renderRenderYaml: never emits a secret VALUE — sync: false prompts in the Dashboard instead", () => {
  const result = renderRenderYaml(FIXTURE_DESCRIPTOR, { region: "frankfurt" });

  assert.match(result.contents, /- key: TOVU_ADMIN_PASSWORD\n {8}sync: false/);
  assert.match(result.contents, /- key: TOVU_INTEGRATIONS_ROOT_KEY\n {8}sync: false/);
});

test("renderRenderYaml: rejects a missing region rather than defaulting to Render's own \"oregon\" default", () => {
  assert.throws(() => renderRenderYaml(FIXTURE_DESCRIPTOR, { region: "" }), ValidationError);
});

test("renderRenderYaml: rejects a region outside Render's own enum, e.g. a Fly region code", () => {
  assert.throws(() => renderRenderYaml(FIXTURE_DESCRIPTOR, { region: "iad" }), ValidationError);
});

test("renderRenderYaml: accepts every documented Render region", () => {
  for (const region of RENDER_VALID_REGIONS) {
    const result = renderRenderYaml(FIXTURE_DESCRIPTOR, { region });
    assert.match(result.contents, new RegExp(`region: ${region}\\n`));
  }
});

test("renderRenderYaml: rejects a quote- or newline-bearing appName/volumeName (regression, same class of bug as the Fly TOML injection)", () => {
  assert.throws(() => renderRenderYaml({ ...FIXTURE_DESCRIPTOR, appName: 'evil"\nsome_key: x' }, { region: "frankfurt" }), ValidationError);
  assert.throws(() => renderRenderYaml({ ...FIXTURE_DESCRIPTOR, volumeName: 'evil"\nsome_key: x' }, { region: "frankfurt" }), ValidationError);
});

/**
 * Regression for the UNQUOTED-YAML-scalar hole: `assertNoConfigInjection` (`deploy-config.ts`)
 * rejected only `"`/newline/CR, but `renderRenderYaml`'s `name: ${descriptor.appName}` and disk
 * `name: ${descriptor.volumeName}` lines are unquoted plain YAML scalars — a `:`, `#`, `{`, `[`,
 * `&`, `*`, or a leading `-`/leading-trailing space in either field changes what the scalar means
 * (or makes the file invalid) with none of those characters tripping the old guard. Each case
 * asserts the EXACT thrown message, and the appName cases are mirrored onto volumeName since both
 * flow through the same unquoted `name:` sink.
 */
test("renderRenderYaml: rejects a colon in appName/volumeName — would end the plain scalar and start a new YAML key", () => {
  assert.throws(
    () => renderRenderYaml({ ...FIXTURE_DESCRIPTOR, appName: "evil:app" }, { region: "frankfurt" }),
    (err: unknown) =>
      err instanceof ValidationError &&
      err.message ===
        'the derived Render service name (fly.toml\'s app) ("evil:app") contains a YAML-significant character (one of : # { [ & *), which would corrupt an unquoted YAML scalar in the generated config file'
  );
  assert.throws(
    () => renderRenderYaml({ ...FIXTURE_DESCRIPTOR, volumeName: "evil:vol" }, { region: "frankfurt" }),
    (err: unknown) =>
      err instanceof ValidationError &&
      err.message ===
        'the derived Render disk name (fly.toml\'s [[mounts]].source) ("evil:vol") contains a YAML-significant character (one of : # { [ & *), which would corrupt an unquoted YAML scalar in the generated config file'
  );
});

test("renderRenderYaml: rejects a hash in appName — would start an inline YAML comment mid-scalar", () => {
  assert.throws(
    () => renderRenderYaml({ ...FIXTURE_DESCRIPTOR, appName: "evil#app" }, { region: "frankfurt" }),
    (err: unknown) =>
      err instanceof ValidationError &&
      err.message ===
        'the derived Render service name (fly.toml\'s app) ("evil#app") contains a YAML-significant character (one of : # { [ & *), which would corrupt an unquoted YAML scalar in the generated config file'
  );
});

test("renderRenderYaml: rejects a curly brace in appName — would open a YAML flow mapping", () => {
  assert.throws(
    () => renderRenderYaml({ ...FIXTURE_DESCRIPTOR, appName: "evil{app}" }, { region: "frankfurt" }),
    (err: unknown) =>
      err instanceof ValidationError &&
      err.message ===
        'the derived Render service name (fly.toml\'s app) ("evil{app}") contains a YAML-significant character (one of : # { [ & *), which would corrupt an unquoted YAML scalar in the generated config file'
  );
});

test("renderRenderYaml: rejects a leading hyphen in volumeName — would read as a YAML block-sequence entry", () => {
  assert.throws(
    () => renderRenderYaml({ ...FIXTURE_DESCRIPTOR, volumeName: "-evilvol" }, { region: "frankfurt" }),
    (err: unknown) =>
      err instanceof ValidationError &&
      err.message ===
        'the derived Render disk name (fly.toml\'s [[mounts]].source) ("-evilvol") starts with "-" or has leading/trailing whitespace, which would corrupt an unquoted YAML scalar in the generated config file'
  );
});

test("renderRenderYaml: a normal appName/volumeName still renders byte-identically to before this fix (happy path unmoved)", () => {
  // Same FIXTURE_DESCRIPTOR ("acme-app" / "acme_sites") as the exact-content test above — pinned
  // again here, right next to the new reject-list cases, so a reviewer can see side by side that
  // widening the guard (deploy-config.ts's assertNoConfigInjection) never touched what an
  // already-safe name renders as; it only ever rejects additional unsafe ones.
  const result = renderRenderYaml(FIXTURE_DESCRIPTOR, { region: "frankfurt" });
  assert.match(result.contents, /^ {4}name: acme-app$/m);
  assert.match(result.contents, /^ {6}name: acme_sites$/m);
});
