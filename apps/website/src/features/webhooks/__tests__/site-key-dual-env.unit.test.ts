import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveSiteKeyEnv, SITE_KEY_ENV_VAR_NAME, LEGACY_SITE_KEY_ENV_VAR_NAME, siteKeyEnvOnlySources, siteKeySources } from "../site-key-sources.js";
import { EnvOrFileKeyring, UnusableRootKeyError, inspectRootKeyMaterial, revealRootKeyMaterial } from "../keyring.env.js";
import { ensureSiteKey, ensureSiteKeyForBoot, installSiteKey } from "../site-key-ensure.js";
import { runProductionReadinessGate } from "#src/server/runtime/boot/production-readiness-gate";
import { siteTokenState } from "#src/server/inbound/admin-http/routes/system/site-token";

const key = "ab".repeat(32);
const other = "cd".repeat(32);
const derive = { workspaceId: "ws", purpose: "test", info: "vector" };
for (const [label, env, expected] of [
  ["only new", { [SITE_KEY_ENV_VAR_NAME]: key }, { kind: "ok", value: key, varName: SITE_KEY_ENV_VAR_NAME, deprecated: false }],
  ["only legacy", { [LEGACY_SITE_KEY_ENV_VAR_NAME]: key }, { kind: "ok", value: key, varName: LEGACY_SITE_KEY_ENV_VAR_NAME, deprecated: true }],
  ["both equal", { [SITE_KEY_ENV_VAR_NAME]: key, [LEGACY_SITE_KEY_ENV_VAR_NAME]: key }, { kind: "ok", value: key, varName: SITE_KEY_ENV_VAR_NAME, deprecated: true }],
  ["both differ", { [SITE_KEY_ENV_VAR_NAME]: key, [LEGACY_SITE_KEY_ENV_VAR_NAME]: other }, { kind: "conflict" }],
  ["blank new", { [SITE_KEY_ENV_VAR_NAME]: " \t ", [LEGACY_SITE_KEY_ENV_VAR_NAME]: key }, { kind: "ok", value: key, varName: LEGACY_SITE_KEY_ENV_VAR_NAME, deprecated: true }],
  ["both blank", { [SITE_KEY_ENV_VAR_NAME]: " ", [LEGACY_SITE_KEY_ENV_VAR_NAME]: "" }, { kind: "absent" }],
] as const) {
  test(`dual env: ${label}`, async () => {
    assert.deepEqual(resolveSiteKeyEnv({ env }), expected);
    const sources = siteKeyEnvOnlySources({});
    const status = inspectRootKeyMaterial({ sources }, { env: () => env });
    const reveal = revealRootKeyMaterial({ sources }, { env: () => env });
    const keyring = new EnvOrFileKeyring({ sources }, { env: () => env });
    if (expected.kind === "conflict") {
      assert.equal(status.reason, "env-conflict");
      assert.equal(status.active, false);
      assert.equal(reveal.hex, undefined);
      await assert.rejects(keyring.derive(derive), (error: unknown) => error instanceof UnusableRootKeyError && error.reason === "env-conflict");
      assert.equal(siteTokenState({ ...status, hasKeyDependentData: false }), "env-conflict");
      const result = await runProductionReadinessGate({ mode: "production", inventory: [], envSnapshot: {
        hasDevSecretPlaceholder: false, hasLocalhostEgressAllowance: false, hasAlwaysOnAnalyticsStub: false,
        hasDefaultOwnerPassword: false, hasMissingIntegrationsRootKey: !status.active, hasSiteKeyEnvConflict: status.reason === "env-conflict",
      } });
      assert.equal(result.ok, false);
      if (!result.ok) assert.ok(result.failures.some(f => f.details.checkName === "site-key-env-conflict"));
    } else if (expected.kind === "ok") {
      assert.equal(status.active, true);
      assert.equal(status.envVarName, expected.varName);
      assert.equal(reveal.hex, key);
      assert.equal((await keyring.derive(derive)).length, 32);
    } else {
      assert.equal(status.source, "none");
      await assert.rejects(keyring.derive(derive), /no site key/);
    }
  });
}

test("conflict refuses ensure and recovery before any write", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "site-key-conflict-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { [SITE_KEY_ENV_VAR_NAME]: key, [LEGACY_SITE_KEY_ENV_VAR_NAME]: other };
  const siteDir = join(dir, "site");
  mkdirSync(siteDir);
  const result = await ensureSiteKey({ siteDir, siteKeyId: "safe", mode: "local", home: dir, cwd: dir, env, findSiteKeyDependentData: async () => false });
  assert.equal(result.action, "refuse");
  assert.equal(result.reason, "env-conflict");
  assert.deepEqual(readdirSync(siteDir), []);
  assert.equal((await ensureSiteKeyForBoot({ siteDir, mode: "local", home: dir, cwd: dir, env, findSiteKeyDependentData: async () => false }))?.action, "refuse");
  assert.deepEqual(readdirSync(siteDir), []);
  assert.deepEqual(readdirSync(dir), ["site"]);
  assert.equal(installSiteKey({ siteDir, hex: key, mode: "production", home: dir, cwd: dir, env })?.outcome, "env-conflict");
  assert.deepEqual(readdirSync(siteDir), []);
});

test("production sources prefer the new durable file, with legacy file as read-only fallback; readers never mint", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "site-key-reader-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sources = siteKeySources({ mode: "production", env: {}, home: dir, cwd: dir });
  assert.deepEqual(sources.map(s => s.kind), ["env", "volume-file", "legacy-volume-file"]);
  assert.equal(sources[1].path, join(dir, "sites", ".tovu", "site-key.hex"));
  await assert.rejects(new EnvOrFileKeyring({ sources }, { env: () => ({}) }).derive(derive), /no site key/);
  assert.deepEqual(readdirSync(dir), []);
  const file = join(dir, "sites", ".tovu", "site-key.hex");
  mkdirSync(join(dir, "sites", ".tovu"), { recursive: true });
  writeFileSync(file, key);
  await assert.rejects(new EnvOrFileKeyring({ sources: siteKeyEnvOnlySources({}) }, { env: () => ({}) }).derive(derive), /no site key/);
  assert.equal((await new EnvOrFileKeyring({ sources }, { env: () => ({}) }).derive(derive)).length, 32);
});

test("env alias comparison matches decoded hex bytes rather than formatting", () => {
  assert.deepEqual(resolveSiteKeyEnv({ env: { [SITE_KEY_ENV_VAR_NAME]: ` ${key.toUpperCase()}\n`, [LEGACY_SITE_KEY_ENV_VAR_NAME]: key } }), {
    kind: "ok", value: key.toUpperCase(), varName: SITE_KEY_ENV_VAR_NAME, deprecated: true,
  });
});

test("a valid per-site file cannot hide conflicting env aliases", async (t) => {
  const home = mkdtempSync(join(tmpdir(), "site-key-priority-conflict-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const env = { [SITE_KEY_ENV_VAR_NAME]: key, [LEGACY_SITE_KEY_ENV_VAR_NAME]: other };
  const keyDir = join(home, ".tovu", "site-keys");
  mkdirSync(keyDir, { recursive: true });
  const file = join(keyDir, "safe.hex");
  writeFileSync(file, key);
  const sources = siteKeySources({ mode: "local", home, cwd: home, env, siteKeyId: "safe" });
  assert.equal(inspectRootKeyMaterial({ sources }, { env: () => env }).reason, "env-conflict");
  await assert.rejects(new EnvOrFileKeyring({ sources }, { env: () => env }).derive(derive), (e: unknown) => e instanceof UnusableRootKeyError && e.reason === "env-conflict");
  assert.equal((await ensureSiteKey({ siteDir: home, home, cwd: home, env, mode: "local", siteKeyId: "safe", findSiteKeyDependentData: async () => false })).action, "refuse");
  assert.deepEqual(readdirSync(keyDir), ["safe.hex"]);
});
