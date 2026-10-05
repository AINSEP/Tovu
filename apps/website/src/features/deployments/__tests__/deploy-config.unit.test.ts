import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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

  assert.equal(descriptor.appName, "tovu", "derived from fly.toml's `app = \"...\"`");
  assert.equal(descriptor.port, 3000, "derived from Dockerfile's `EXPOSE 3000`");
  assert.equal(descriptor.dockerfilePath, "Dockerfile", "derived from fly.toml's [build].dockerfile");
  assert.equal(descriptor.volumeMountPath, "/workspace/Tovu/sites", "derived from fly.toml's [[mounts]].destination");
  assert.equal(descriptor.volumeName, "tovu_sites", "derived from fly.toml's [[mounts]].source");
  assert.equal(descriptor.healthCheckPath, "/readyz", "derived from the real registerReadyzRoute registration");
});

test("buildDeploymentDescriptor: secrets are declared by name only, with the boot-blocking/recommended split the boot gate code actually enforces", () => {
  const descriptor = buildDeploymentDescriptor();

  // 2026-09-09 site-key fix: TOVU_SITE_KEY moved from "recommended" to
  // "boot-blocking" — `production-readiness-gate.ts`'s `hasMissingIntegrationsSiteKey` now refuses
  // production boot when it is unset, closing the silent-rekey gap this test used to describe as
  // acceptable (an unset var used to boot fine and silently mint a fresh site key on every
  // container redeploy).
  assert.deepEqual(descriptor.secrets, [
    { name: "TOVU_ADMIN_PASSWORD", requirement: "boot-blocking" },
    { name: "ANALYTICS_ROOT_KEY_SEED", requirement: "boot-blocking" },
    { name: "TOVU_SITE_KEY", requirement: "boot-blocking" },
  ]);
  // Deliberately excluded — see deploy-config.ts's own REQUIRED_SECRETS doc for why.
  const names = descriptor.secrets.map((s) => s.name);
  assert.ok(!names.includes("TOVU_ADMIN_USER"));
  assert.ok(!names.includes("JINI_AGENT_DAEMON_PORT"));
});

test("buildDeploymentDescriptor: each boot-blocking env secret is one the real boot gate reads by that exact name", () => {
  // A rename once declared `ANALYTICS_ANALYTICS_SEED` while the gate still read
  // `ANALYTICS_ROOT_KEY_SEED`: an operator setting every declared secret got `dev-secret-placeholder`
  // and a refused boot. `TOVU_SITE_KEY` is resolved through `siteKeySources`, not a direct read.
  const gate = readFileSync(path.join(process.cwd(), "apps/website/src/server/runtime/boot/boot-readiness-gate.ts"), "utf8");
  const direct = buildDeploymentDescriptor().secrets.filter((s) => s.requirement === "boot-blocking" && s.name !== "TOVU_SITE_KEY");
  assert.deepEqual(direct.filter((s) => !gate.includes(`process.env.${s.name}`)).map((s) => s.name), []);
});

test("buildDeploymentDescriptor: called twice returns the same values (no hidden mutable state)", () => {
  const first = buildDeploymentDescriptor();
  const second = buildDeploymentDescriptor();
  assert.deepEqual(first, second);
});

test("buildDeploymentDescriptor refuses source format drift instead of guessing a missing port", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "tovu-deploy-descriptor-"));
  t.mock.method(process, "cwd", () => root);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "Dockerfile"), "FROM node:22\n# EXPOSE removed\n");
  writeFileSync(path.join(root, "fly.toml"), 'app = "fixture"\n[build]\ndockerfile = "Dockerfile"\n[[mounts]]\nsource = "data"\ndestination = "/data"\n');
  const routePath = path.join(root, "apps/website/src/server/inbound/public-http/routes/ops/health.ts");
  mkdirSync(path.dirname(routePath), { recursive: true });
  writeFileSync(routePath, 'export const registerReadyzRoute = () => app.get("/readyz", handler);');
  assert.throws(() => buildDeploymentDescriptor(), { message: "tovu deploy config: could not derive the container port from Dockerfile (EXPOSE line) — its format changed since deploy-config.ts's extraction pattern was written. Update the pattern in deploy-config.ts to match the new format, or hardcode the value there instead with a comment explaining why it can no longer be derived." });
});

/**
 * `assertNoConfigInjection` is a guard: it must actually be able to fail. Direct coverage of the
 * guard itself, in addition to the exact-string regressions already exercised end-to-end through
 * `agent-plugins/__tests__/unit/bundled-deploy-config-{render,fly}.unit.test.ts` — each of this function's
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

test("assertNoConfigInjection rejects every quoted-sink and YAML indicator character independently", () => {
  for (const character of ['"', "\n", "\r"]) {
    const value = `before${character}after`;
    assert.throws(() => assertNoConfigInjection("field", value), error => error instanceof ValidationError && error.message === `field (${JSON.stringify(value)}) contains a quote or newline character, which would corrupt the generated config file`);
  }
  for (const character of [":", "#", "{", "[", "&", "*"]) {
    const value = `before${character}after`;
    assert.throws(() => assertNoConfigInjection("field", value), error => error instanceof ValidationError && error.message === `field (${JSON.stringify(value)}) contains a YAML-significant character (one of : # { [ & *), which would corrupt an unquoted YAML scalar in the generated config file`);
  }
});
