import { LEGACY_SITE_KEY_FILENAME } from "#src/features/webhooks/site-key-sources";
import { LEGACY_SITE_KEY_ENV_VAR_NAME } from "#src/features/webhooks/site-key-sources";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * @file 2026-09-09 integrations-root-key fix, then durability fix (same day, second pass) —
 * `runProductionReadinessGateOrExit`'s own env-var wiring (`boot-readiness-gate.ts`). The source
 * checks pin the shared keyring wiring; an isolated subprocess also exercises the real refusal
 * and success paths, including missing, invalid, and valid durable key material.
 *
 * SUPERSEDED (second pass, same day): the first version of this test pinned
 * `hasMissingIntegrationsRootKey: !process.env.TOVU_INTEGRATIONS_ROOT_KEY` — env-var-only. That
 * made a valid, already-generated key file invisible to this gate, which was the exact
 * chicken-and-egg the admin Site Token tab's Generate action would otherwise hit (boot refuses
 * before the admin UI that could "fix" it in-app is ever reachable). The field now reads
 * `!inspectRootKeyMaterial().active` — the SAME env-first/file-second check `EnvOrFileKeyring`'s
 * own `resolveRootKey()` uses — so a valid key file at the (now durable, in production)
 * `defaultRootKeyFilePath()` also satisfies this gate. This test asserts the NEW wiring; the old
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
  const env = { ...process.env, TEST_GATE_CWD: cwd, TOVU_RUNTIME_MODE: "production", TOVU_ADMIN_PASSWORD: "nondefault-test-password", ANALYTICS_ROOT_KEY_SEED: "test-analytics-seed" };
  delete env[LEGACY_SITE_KEY_ENV_VAR_NAME];
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

test("production boot accepts either env name and equal aliases but refuses conflicting aliases even with a valid volume file", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "boot-dual-env-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const dir = path.join(cwd, "sites", ".tovu");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "site-key.hex"), "7a".repeat(32));
  const gateUrl = pathToFileURL(path.join(import.meta.dirname, "..", "boot-readiness-gate.ts")).href;
  const script = `process.chdir(process.env.TEST_GATE_CWD); const { runProductionReadinessGateOrExit } = await import(${JSON.stringify(gateUrl)}); await runProductionReadinessGateOrExit(); console.log("gate-passed");`;
  for (const [preferred, legacy, exit] of [
    ["7a".repeat(32), undefined, 0], [undefined, "7a".repeat(32), 0],
    ["7a".repeat(32), "7a".repeat(32), 0], ["7a".repeat(32), "8b".repeat(32), 1],
  ] as const) {
    const env: NodeJS.ProcessEnv = { ...process.env, TEST_GATE_CWD: cwd, HOME: cwd, TOVU_RUNTIME_MODE: "production", TOVU_ADMIN_PASSWORD: "nondefault-test-password", ANALYTICS_ROOT_KEY_SEED: "test-analytics-seed" };
    delete env.TOVU_SITE_KEY;
    delete env[LEGACY_SITE_KEY_ENV_VAR_NAME];
    if (preferred) env.TOVU_SITE_KEY = preferred;
    if (legacy) env[LEGACY_SITE_KEY_ENV_VAR_NAME] = legacy;
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { env, encoding: "utf8", timeout: 30000 });
    assert.equal(child.error, undefined);
    assert.equal(child.status, exit, child.stderr);
    if (exit) {
      assert.match(child.stderr, /site-key-env-conflict/);
      assert.doesNotMatch(child.stdout, /gate-passed/);
      assert.doesNotMatch(child.stderr, /7a7a7a|8b8b8b/);
    } else assert.match(child.stdout, /gate-passed/);
  }
});
