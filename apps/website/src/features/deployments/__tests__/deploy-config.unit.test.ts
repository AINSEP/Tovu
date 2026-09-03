import assert from "node:assert/strict";
import test from "node:test";

import { ValidationError } from "#src/platform/site-dir/index";

import { assertNoConfigInjection, buildDeploymentDescriptor } from "../deploy-config.js";

/**
 * @file `buildDeploymentDescriptor`'s own derivation logic. Pins the values it derives from THIS
 * repo's real `Dockerfile`/`fly.toml`/`health.ts` today — same discipline `dockerfile.unit.test.ts`
 * already uses reading the repo-root Dockerfile directly rather than a fixture: if any of those
 * three files' relevant fields ever change shape, this test SHOULD fail loudly, forcing either the
 * extraction pattern or this pin to be updated deliberately, rather than silently drifting.
 */

test("buildDeploymentDescriptor: derives every field from the repo's own Dockerfile/fly.toml/health.ts", () => {
  const descriptor = buildDeploymentDescriptor();

  assert.equal(descriptor.appName, "tovu-ai-cms", "derived from fly.toml's `app = \"...\"`");
  assert.equal(descriptor.port, 3000, "derived from Dockerfile's `EXPOSE 3000`");
  assert.equal(descriptor.dockerfilePath, "Dockerfile", "derived from fly.toml's [build].dockerfile");
  assert.equal(descriptor.volumeMountPath, "/workspace/Tovu/sites", "derived from fly.toml's [[mounts]].destination");
  assert.equal(descriptor.volumeName, "tovu_sites", "derived from fly.toml's [[mounts]].source");
  assert.equal(descriptor.healthCheckPath, "/readyz", "derived from the real registerReadyzRoute registration");
});

test("buildDeploymentDescriptor: secrets are declared by name only, with the boot-blocking/recommended split the boot gate code actually enforces", () => {
  const descriptor = buildDeploymentDescriptor();

  assert.deepEqual(descriptor.secrets, [
    { name: "TOVU_ADMIN_PASSWORD", requirement: "boot-blocking" },
    { name: "ANALYTICS_ROOT_KEY_SEED", requirement: "boot-blocking" },
    { name: "TOVU_INTEGRATIONS_ROOT_KEY", requirement: "recommended" },
  ]);
  // Deliberately excluded — see deploy-config.ts's own REQUIRED_SECRETS doc for why.
  const names = descriptor.secrets.map((s) => s.name);
  assert.ok(!names.includes("TOVU_ADMIN_USER"));
  assert.ok(!names.includes("JINI_AGENT_DAEMON_PORT"));
});

test("buildDeploymentDescriptor: called twice returns the same values (no hidden mutable state)", () => {
  const first = buildDeploymentDescriptor();
  const second = buildDeploymentDescriptor();
  assert.deepEqual(first, second);
});

/**
 * `assertNoConfigInjection` is a guard: it must actually be able to fail. Direct coverage of the
 * guard itself, in addition to the exact-string regressions already exercised end-to-end through
 * `deploy-config-render.unit.test.ts`/`deploy-config-fly.unit.test.ts` — each of this function's
 * three checks proven to throw, plus the happy path proven NOT to throw.
 */
test("assertNoConfigInjection: a safe value never throws", () => {
  assert.doesNotThrow(() => assertNoConfigInjection("field", "acme-app_1"));
});

test("assertNoConfigInjection: a quote/newline/CR throws with exact text", () => {
  assert.throws(
    () => assertNoConfigInjection("field", 'evil"value'),
    (err: unknown) =>
      err instanceof ValidationError &&
      err.message === 'field ("evil\\"value") contains a quote or newline character, which would corrupt the generated config file',
  );
});

test("assertNoConfigInjection: a YAML-significant character throws with exact text", () => {
  assert.throws(
    () => assertNoConfigInjection("field", "evil:value"),
    (err: unknown) =>
      err instanceof ValidationError &&
      err.message ===
        'field ("evil:value") contains a YAML-significant character (one of : # { [ & *), which would corrupt an unquoted YAML scalar in the generated config file',
  );
});

test("assertNoConfigInjection: a leading hyphen or surrounding whitespace throws with exact text", () => {
  assert.throws(
    () => assertNoConfigInjection("field", "-evil"),
    (err: unknown) =>
      err instanceof ValidationError &&
      err.message ===
        'field ("-evil") starts with "-" or has leading/trailing whitespace, which would corrupt an unquoted YAML scalar in the generated config file',
  );
  assert.throws(
    () => assertNoConfigInjection("field", " evil "),
    (err: unknown) =>
      err instanceof ValidationError &&
      err.message ===
        'field (" evil ") starts with "-" or has leading/trailing whitespace, which would corrupt an unquoted YAML scalar in the generated config file',
  );
});
