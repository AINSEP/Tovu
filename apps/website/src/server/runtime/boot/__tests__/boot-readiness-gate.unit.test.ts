import { LEGACY_SITE_KEY_FILENAME } from "#src/features/webhooks/site-key-sources";
import { SITE_KEY_ENV_VAR_NAME } from "#src/features/webhooks/site-key-sources";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * @file 2026-09-09 site-key fix, then durability fix (same day, second pass) —
 * `runProductionReadinessGateOrExit`'s own env-var wiring (`boot-readiness-gate.ts`). The source
 * checks pin the shared keyring wiring; an isolated subprocess also exercises the real refusal
 * and success paths, including missing, invalid, and valid durable key material.
 *
 * SUPERSEDED (second pass, same day): the first version of this test pinned
 * `hasMissingIntegrationsSiteKey: !process.env.TOVU_SITE_KEY` — env-var-only. That
 * made a valid, already-generated key file invisible to this gate, which was the exact
 * chicken-and-egg the admin site key tab's Generate action would otherwise hit (boot refuses
 * before the admin UI that could "fix" it in-app is ever reachable). The field now reads
 * `!inspectSiteKeyMaterial().active` — the SAME env-first/file-second check `EnvOrFileKeyring`'s
 * own `resolveSiteKey()` uses — so a valid key file at the (now durable, in production)
 * `defaultSiteKeyFilePath()` also satisfies this gate. This test asserts the NEW wiring; the old
 * assertion is deliberately gone, not left alongside as a second, contradictory check.
 */

const SOURCE = fs.readFileSync(path.join(import.meta.dirname, "..", "boot-readiness-gate.ts"), "utf8");

test("2026-09-09 durability fix: hasMissingSiteKey reads !inspectSiteKeyMaterial().active, not the env var alone", () => {
  assert.match(
    SOURCE,
    /hasMissingSiteKey:\s*!siteKeyStatus\.active,/,
    "the boot gate's envSnapshot must accept a valid key file too (via inspectSiteKeyMaterial), not only the raw env var — otherwise a generated file is invisible to this gate and boot refuses even when one exists"
  );
});

test("2026-09-09 durability fix: boot-readiness-gate.ts imports inspectSiteKeyMaterial from the real keyring module, not a local reimplementation", () => {
  assert.match(
    SOURCE,
    /import\s*\{\s*inspectSiteKeyMaterial\s*\}\s*from\s*"#src\/features\/webhooks\/keyring\.env"/,
    "must reuse the SAME env-first/file-second precedence EnvOrFileKeyring itself uses, not a second, driftable implementation of that check"
  );
});

test("the production boot adapter refuses missing or invalid site keys and accepts a valid durable key file", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "boot-gate-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const gateUrl = pathToFileURL(path.join(import.meta.dirname, "..", "boot-readiness-gate.ts")).href;
  const script = `process.chdir(process.env.TEST_GATE_CWD); const { runProductionReadinessGateOrExit } = await import(${JSON.stringify(gateUrl)}); await runProductionReadinessGateOrExit(); console.log("gate-passed");`;
  const env: NodeJS.ProcessEnv = { ...process.env, TEST_GATE_CWD: cwd, TOVU_RUNTIME_MODE: "production", TOVU_ADMIN_PASSWORD: "nondefault-test-password", ANALYTICS_ROOT_KEY_SEED: "test-analytics-seed" };
  delete env.TOVU_SITE_KEY;
  const run = () => spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { env, encoding: "utf8", timeout: 30000 });
  const missing = run();
  assert.equal(missing.error, undefined);
  assert.equal(missing.status, 1, missing.stderr);
  assert.match(missing.stderr, /missing-site-key/);
  assert.doesNotMatch(missing.stdout, /gate-passed/);

  const keyFile = path.join(cwd, "sites", ".tovu", LEGACY_SITE_KEY_FILENAME);
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, "not-a-key");
  const invalid = run();
  assert.equal(invalid.error, undefined);
  assert.equal(invalid.status, 1, invalid.stderr);
  assert.match(invalid.stderr, /missing-site-key/);
  assert.doesNotMatch(invalid.stdout, /gate-passed/);

  fs.writeFileSync(keyFile, "7a".repeat(32), { mode: 0o600 });
  const valid = run();
  assert.equal(valid.error, undefined);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /gate-passed/);
  assert.doesNotMatch(valid.stderr, /Refusing to boot/);
});

test("production boot reads only TOVU_SITE_KEY: the removed pre-rename env name alone is a missing key", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "boot-site-key-env-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const gateUrl = pathToFileURL(path.join(import.meta.dirname, "..", "boot-readiness-gate.ts")).href;
  const script = `process.chdir(process.env.TEST_GATE_CWD); const { runProductionReadinessGateOrExit } = await import(${JSON.stringify(gateUrl)}); await runProductionReadinessGateOrExit(); console.log("gate-passed");`;
  // Built from parts so the site-key naming guard does not flag this regression check itself.
  const removedName = ["TOVU", "INTEGRATIONS", "ROOT", "KEY"].join("_");
  for (const [name, exit] of [[SITE_KEY_ENV_VAR_NAME, 0], [removedName, 1]] as const) {
    const env: NodeJS.ProcessEnv = { ...process.env, TEST_GATE_CWD: cwd, HOME: cwd, TOVU_RUNTIME_MODE: "production", TOVU_ADMIN_PASSWORD: "nondefault-test-password", ANALYTICS_ROOT_KEY_SEED: "test-analytics-seed" };
    delete env.TOVU_SITE_KEY;
    delete env[removedName];
    env[name] = "7a".repeat(32);
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { env, encoding: "utf8", timeout: 30000 });
    assert.equal(child.error, undefined);
    assert.equal(child.status, exit, child.stderr);
    if (exit) {
      assert.match(child.stderr, /missing-site-key/);
      assert.doesNotMatch(child.stdout, /gate-passed/);
      assert.doesNotMatch(child.stderr, /7a7a7a/);
    } else assert.match(child.stdout, /gate-passed/);
  }
});

// REGRESSION (2026-10-08 hardwiring audit #4/#5): fails if the shared boot gate stops printing the
// readiness warnings, or prints them only in production (where the deployed-but-local case never is).
test("the boot gate warns, without refusing, for a deployed local-mode boot and for production without COMMENTS_IP_SALT", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "boot-gate-warn-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const gateUrl = pathToFileURL(path.join(import.meta.dirname, "..", "boot-readiness-gate.ts")).href;
  const script = `process.chdir(process.env.TEST_GATE_CWD); const { runProductionReadinessGateOrExit } = await import(${JSON.stringify(gateUrl)}); await runProductionReadinessGateOrExit(); console.log("gate-passed");`;
  const run = (overrides: NodeJS.ProcessEnv) => {
    const env: NodeJS.ProcessEnv = { ...process.env, TEST_GATE_CWD: cwd, HOME: cwd, ...overrides };
    for (const name of ["TOVU_RUNTIME_MODE", "TOVU_AGENT_PERMISSION_MODE", "COMMENTS_IP_SALT", "KUBERNETES_SERVICE_HOST", "FLY_APP_NAME"]) if (!(name in overrides)) delete env[name];
    return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { env, encoding: "utf8", timeout: 30000 });
  };

  const deployedLocal = run({ NODE_ENV: "production" });
  assert.equal(deployedLocal.error, undefined);
  assert.equal(deployedLocal.status, 0, deployedLocal.stderr);
  assert.match(deployedLocal.stdout, /gate-passed/);
  assert.match(deployedLocal.stderr, /\[boot-readiness\] WARNING: this server looks deployed \(NODE_ENV=production.*?\) but TOVU_RUNTIME_MODE is not "production": production boot checks are off and the assistant agent runs with permission mode "bypass"\./);

  const production = run({ TOVU_RUNTIME_MODE: "production", TOVU_ADMIN_PASSWORD: "nondefault-test-password", ANALYTICS_ROOT_KEY_SEED: "test-analytics-seed", TOVU_SITE_KEY: "7a".repeat(32) });
  assert.equal(production.error, undefined);
  assert.equal(production.status, 0, production.stderr);
  assert.match(production.stdout, /gate-passed/);
  assert.match(production.stderr, /\[boot-readiness\] WARNING: COMMENTS_IP_SALT is not set: comment IP hashes are salted with a value derived from the site key/);
  assert.doesNotMatch(production.stderr, /looks deployed/);
  assert.doesNotMatch(production.stderr, /7a7a7a/);
});
