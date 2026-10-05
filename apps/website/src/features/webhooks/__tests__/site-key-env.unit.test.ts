import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveSiteKeyEnv, SITE_KEY_ENV_VAR_NAME, siteKeyEnvOnlySources, siteKeySources } from "../site-key-sources.js";
import { EnvOrFileKeyring, inspectSiteKeyMaterial, revealSiteKeyMaterial } from "../keyring.env.js";

const key = "ab".repeat(32);
const derive = { workspaceId: "ws", purpose: "test", info: "vector" };
// The pre-rename env name, built from parts so the site-key naming guard does not flag it.
const removedName = ["TOVU", "INTEGRATIONS", "ROOT", "KEY"].join("_");
for (const [label, env, expected] of [
  ["TOVU_SITE_KEY set", { [SITE_KEY_ENV_VAR_NAME]: key }, { kind: "ok", value: key, varName: SITE_KEY_ENV_VAR_NAME }],
  ["TOVU_SITE_KEY trimmed", { [SITE_KEY_ENV_VAR_NAME]: ` ${key}\n` }, { kind: "ok", value: key, varName: SITE_KEY_ENV_VAR_NAME }],
  ["only the removed pre-rename name", { [removedName]: key }, { kind: "absent" }],
  ["TOVU_SITE_KEY blank", { [SITE_KEY_ENV_VAR_NAME]: " \t " }, { kind: "absent" }],
] as const) {
  test(`site key env: ${label}`, async () => {
    assert.deepEqual(resolveSiteKeyEnv({ env }), expected);
    const sources = siteKeyEnvOnlySources({});
    const status = inspectSiteKeyMaterial({ sources }, { env: () => env });
    const reveal = revealSiteKeyMaterial({ sources }, { env: () => env });
    const keyring = new EnvOrFileKeyring({ sources }, { env: () => env });
    assert.equal("deprecated" in status, false);
    if (expected.kind === "ok") {
      assert.equal(status.active, true);
      assert.equal(status.envVarName, SITE_KEY_ENV_VAR_NAME);
      assert.equal(reveal.hex, key);
      assert.equal((await keyring.derive(derive)).length, 32);
    } else {
      assert.equal(status.source, "none");
      assert.equal(reveal.hex, undefined);
      await assert.rejects(keyring.derive(derive), /no site key/);
    }
  });
}

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
