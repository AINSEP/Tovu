import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  SITE_KEY_ENV_VAR_NAME,
  findKeyDependentData,
  resolveSiteKeyFingerprint,
  resolveSiteKeyId,
  siteKeyFilePathFrom,
  siteKeySources,
} from "../site-key-sources.js";
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

/**
 * §A3a/A3b — `resolveSiteKeyId`: the boot/admin-route reader for `.site-meta.json`'s site-key id.
 * A4 (not built yet) is what WRITES a distinct `siteKeyId` field; until then every site's key is
 * named after its `siteId` (A.1: "It defaults to siteId when missing") — so this function accepts
 * either field, preferring `siteKeyId` when both are present (forward-compatible with A4's write).
 */
test("resolveSiteKeyId: reads .site-meta.json's siteId when there is no distinct siteKeyId field yet", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-id-"));
  try {
    writeFileSync(join(dir, ".site-meta.json"), JSON.stringify({ siteId: "site-xyz" }));
    assert.equal(resolveSiteKeyId({ siteDir: dir }), "site-xyz");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveSiteKeyId: prefers a distinct siteKeyId field over siteId when both are present (A4 forward-compat)", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-id-"));
  try {
    writeFileSync(join(dir, ".site-meta.json"), JSON.stringify({ siteId: "site-xyz", siteKeyId: "key-abc" }));
    assert.equal(resolveSiteKeyId({ siteDir: dir }), "key-abc");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveSiteKeyId: undefined (never throws) when .site-meta.json is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-id-"));
  try {
    assert.equal(resolveSiteKeyId({ siteDir: dir }), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveSiteKeyId: undefined (never throws) when .site-meta.json is not valid JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-id-"));
  try {
    writeFileSync(join(dir, ".site-meta.json"), "{not json");
    assert.equal(resolveSiteKeyId({ siteDir: dir }), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveSiteKeyId: undefined when siteId is present but not a non-empty string", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-id-"));
  try {
    writeFileSync(join(dir, ".site-meta.json"), JSON.stringify({ siteId: "" }));
    assert.equal(resolveSiteKeyId({ siteDir: dir }), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("siteKeyFilePathFrom: the per-site-file candidate's path when one is present in sources", () => {
  const sources = siteKeySources({ mode: "local", env: {}, home: HOME, cwd: CWD, siteKeyId: "site-abc" });
  assert.equal(siteKeyFilePathFrom(sources, "/fallback/path.hex"), join(HOME, ".tovu", "site-keys", "site-abc.hex"));
});

/**
 * §A.6 — `resolveSiteKeyFingerprint`: the read-only sibling of `resolveSiteKeyId`, backing the
 * admin Site Token route's `"mismatch"` state (a resolved key whose fingerprint differs from
 * `.site-meta.json`'s own stamped `siteKeyFingerprint`).
 */
test("resolveSiteKeyFingerprint: reads .site-meta.json's stamped siteKeyFingerprint", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-fingerprint-"));
  try {
    writeFileSync(join(dir, ".site-meta.json"), JSON.stringify({ siteId: "site-xyz", siteKeyFingerprint: "abc123abc123" }));
    assert.equal(resolveSiteKeyFingerprint({ siteDir: dir }), "abc123abc123");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveSiteKeyFingerprint: undefined (never throws) when .site-meta.json is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-fingerprint-"));
  try {
    assert.equal(resolveSiteKeyFingerprint({ siteDir: dir }), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveSiteKeyFingerprint: undefined (never throws) when .site-meta.json is not valid JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-fingerprint-"));
  try {
    writeFileSync(join(dir, ".site-meta.json"), "{not json");
    assert.equal(resolveSiteKeyFingerprint({ siteDir: dir }), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveSiteKeyFingerprint: undefined when the field is present but not a non-empty string", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-fingerprint-"));
  try {
    writeFileSync(join(dir, ".site-meta.json"), JSON.stringify({ siteId: "site-xyz", siteKeyFingerprint: 12345 }));
    assert.equal(resolveSiteKeyFingerprint({ siteDir: dir }), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// findKeyDependentData — moved here from `site-key-ensure.ts` (site-key plan §A.6): the admin
// Site Token route's `"missing-with-data"` state (`routes/system/site-token.ts`) needs this same
// content.db scan, and nothing under `server/inbound/**` may import `site-key-ensure.ts` (the one
// key-file WRITER — `no-site-key-ensure-import.boundary.test.ts`). This module is the shared
// READER layer both `site-key-ensure.ts` and the admin route already depend on, so the scan moved
// here rather than being duplicated. `site-key-ensure.ts` now imports it from here for its own
// `ensureSiteKey` "refuse" branch — same function, same behavior, new home.
//
// These 4 cases were originally written against the CLI's `tovu root-key ensure` command
// (`cli/__tests__/unit/root-key-ensure.unit.test.ts`, deleted in `abc4807d5` when that command was
// absorbed into `ensureSiteKeyForBoot`) and lost with it. `site-key-ensure.unit.test.ts` only
// exercises this function indirectly (via `ensureSiteKey`'s own "refuse" case, sealed_ciphertext
// only) — restored here as direct tests against the function itself, covering the 3 cases that
// indirect exercise never reached (webhook_subscriptions, a clean DB, and an unreadable DB path)
// plus the sealed_ciphertext case for a complete, self-contained direct suite at this function's
// new home.
// ---------------------------------------------------------------------------

function buildSealedCiphertextDb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE publish_credential_sets (id INTEGER PRIMARY KEY, sealed_ciphertext TEXT)");
    db.exec("INSERT INTO publish_credential_sets (sealed_ciphertext) VALUES ('cipher-bytes')");
  } finally {
    db.close();
  }
}

function buildWebhookSubscriptionsDb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE webhook_subscriptions (id INTEGER PRIMARY KEY)");
    db.exec("INSERT INTO webhook_subscriptions (id) VALUES (1)");
  } finally {
    db.close();
  }
}

function buildEmptyDb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE unrelated (id INTEGER PRIMARY KEY)");
  } finally {
    db.close();
  }
}

test("findKeyDependentData: a non-null sealed_ciphertext row counts as key-dependent data", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-key-dependent-data-"));
  try {
    const dbPath = join(dir, "content.db");
    buildSealedCiphertextDb(dbPath);
    assert.equal(findKeyDependentData([dbPath]), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("findKeyDependentData: a webhook_subscriptions row counts as key-dependent data", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-key-dependent-data-"));
  try {
    const dbPath = join(dir, "content.db");
    buildWebhookSubscriptionsDb(dbPath);
    assert.equal(findKeyDependentData([dbPath]), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("findKeyDependentData: a DB with neither table counts as clean", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-key-dependent-data-"));
  try {
    const dbPath = join(dir, "content.db");
    buildEmptyDb(dbPath);
    assert.equal(findKeyDependentData([dbPath]), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("findKeyDependentData: an unreadable DB path fails closed (counts as data present)", () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-key-dependent-data-"));
  try {
    const dbPath = join(dir, "does-not-exist.db");
    assert.equal(findKeyDependentData([dbPath]), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("siteKeyFilePathFrom: the given fallback when sources has no per-site-file candidate (e.g. production)", () => {
  const sources = siteKeySources({ mode: "production", env: {}, home: HOME, cwd: CWD });
  assert.equal(siteKeyFilePathFrom(sources, "/fallback/path.hex"), "/fallback/path.hex");
});
