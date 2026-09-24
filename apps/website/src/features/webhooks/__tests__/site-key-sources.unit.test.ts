import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { SITE_KEY_ENV_VAR_NAME, siteKeySources } from "../site-key-sources.js";
import { DEFAULT_ROOT_KEY_ENV_VAR_NAME } from "../keyring.env.js";

/**
 * @file Site-key plan §A.1 slice 1 — `siteKeySources` is a pure ordering function: given a mode,
 * env snapshot, home/cwd, and this site's `siteKeyId`, it returns the candidate places to look, in
 * precedence order. It never touches the filesystem or `process.env` itself.
 */

const HOME = "/home/owner";
const CWD = "/workspace/Tovu";

test("local mode with a siteKeyId: [per-site file, env, legacy shared file], in that order", () => {
  const sources = siteKeySources({ mode: "local", env: {}, home: HOME, cwd: CWD, siteKeyId: "site-abc" });

  assert.deepEqual(
    sources.map((s) => s.kind),
    ["per-site-file", "env", "legacy-shared-file"]
  );
  assert.equal(sources[0].path, join(HOME, ".tovu", "site-keys", "site-abc.hex"));
  assert.equal(sources[1].envVarName, DEFAULT_ROOT_KEY_ENV_VAR_NAME);
  assert.equal(sources[2].path, join(HOME, ".tovu", "integrations-root-key.hex"));
});

test("production mode: [env, legacy volume file] — never a per-site file, regardless of siteKeyId", () => {
  const sources = siteKeySources({ mode: "production", env: {}, home: HOME, cwd: CWD, siteKeyId: "site-abc" });

  assert.deepEqual(
    sources.map((s) => s.kind),
    ["env", "legacy-volume-file"]
  );
  assert.equal(sources[0].envVarName, DEFAULT_ROOT_KEY_ENV_VAR_NAME);
  assert.equal(sources[1].path, join(CWD, "sites", ".tovu", "integrations-root-key.hex"));
});

test("a missing siteKeyId drops the per-site candidate in local mode: [env, legacy shared file]", () => {
  const sources = siteKeySources({ mode: "local", env: {}, home: HOME, cwd: CWD });

  assert.deepEqual(
    sources.map((s) => s.kind),
    ["env", "legacy-shared-file"]
  );
});

test("an empty-string siteKeyId is treated the same as missing — no per-site candidate", () => {
  const sources = siteKeySources({ mode: "local", env: {}, home: HOME, cwd: CWD, siteKeyId: "" });

  assert.deepEqual(
    sources.map((s) => s.kind),
    ["env", "legacy-shared-file"]
  );
});

test("the env candidate prefers TOVU_SITE_KEY over the legacy name when it is already set", () => {
  const sources = siteKeySources({
    mode: "local",
    env: { [SITE_KEY_ENV_VAR_NAME]: "aa".repeat(32) },
    home: HOME,
    cwd: CWD,
    siteKeyId: "site-abc",
  });

  const envSource = sources.find((s) => s.kind === "env");
  assert.equal(envSource?.envVarName, SITE_KEY_ENV_VAR_NAME);
});

test("the env candidate names the legacy var when only it is set — an unmodified install still resolves", () => {
  const sources = siteKeySources({
    mode: "production",
    env: { [DEFAULT_ROOT_KEY_ENV_VAR_NAME]: "bb".repeat(32) },
    home: HOME,
    cwd: CWD,
  });

  const envSource = sources.find((s) => s.kind === "env");
  assert.equal(envSource?.envVarName, DEFAULT_ROOT_KEY_ENV_VAR_NAME);
});

test("every non-env source carries a path and no envVarName; the env source carries envVarName and no path", () => {
  const sources = siteKeySources({ mode: "local", env: {}, home: HOME, cwd: CWD, siteKeyId: "site-abc" });

  for (const source of sources) {
    if (source.kind === "env") {
      assert.equal(source.path, undefined);
      assert.ok(source.envVarName);
    } else {
      assert.ok(source.path);
      assert.equal(source.envVarName, undefined);
    }
  }
});
