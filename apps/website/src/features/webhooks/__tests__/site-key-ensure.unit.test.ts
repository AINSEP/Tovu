import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { fingerprintRootKeyHex } from "../keyring.env.js";
import { ensureSiteKey, ensureSiteKeyForBoot, planSiteKeyEnsure, type SiteKeyMaterialCheck } from "../site-key-ensure.js";

/**
 * @file Site-key plan §A.2 slice — `planSiteKeyEnsure` (the pure decision table) and `ensureSiteKey`
 * (its one writer). Every `ensureSiteKey` test uses a fresh temp dir for `home` and a fresh temp
 * dir for `siteDir`, never the real `~/.tovu` or a real site.
 */

const ABSENT: SiteKeyMaterialCheck = { kind: "absent" };
const VALID: SiteKeyMaterialCheck = { kind: "valid" };
const INVALID: SiteKeyMaterialCheck = { kind: "invalid" };

// ---------------------------------------------------------------------------
// planSiteKeyEnsure — pure decision table: adopt / mint / refuse / invalid / noop / production-noop
// ---------------------------------------------------------------------------

test("planSiteKeyEnsure: production mode is always 'production-noop', regardless of every other input", () => {
  assert.equal(
    planSiteKeyEnsure({ mode: "production", perSite: VALID, other: VALID, siteDbsWithKeyData: true }).action,
    "production-noop"
  );
  assert.equal(
    planSiteKeyEnsure({ mode: "production", perSite: ABSENT, other: ABSENT, siteDbsWithKeyData: true }).action,
    "production-noop"
  );
});

test("planSiteKeyEnsure: a valid per-site file is always 'noop'", () => {
  assert.equal(planSiteKeyEnsure({ mode: "local", perSite: VALID, other: ABSENT, siteDbsWithKeyData: false }).action, "noop");
  assert.equal(planSiteKeyEnsure({ mode: "local", perSite: VALID, other: VALID, siteDbsWithKeyData: true }).action, "noop");
});

test("planSiteKeyEnsure: an invalid per-site file is 'invalid', regardless of any other source", () => {
  assert.equal(planSiteKeyEnsure({ mode: "local", perSite: INVALID, other: ABSENT, siteDbsWithKeyData: false }).action, "invalid");
  assert.equal(planSiteKeyEnsure({ mode: "local", perSite: INVALID, other: VALID, siteDbsWithKeyData: false }).action, "invalid");
});

test("planSiteKeyEnsure: per-site absent, another source is valid → 'adopt'", () => {
  assert.equal(planSiteKeyEnsure({ mode: "local", perSite: ABSENT, other: VALID, siteDbsWithKeyData: false }).action, "adopt");
  assert.equal(planSiteKeyEnsure({ mode: "local", perSite: ABSENT, other: VALID, siteDbsWithKeyData: true }).action, "adopt");
});

test("planSiteKeyEnsure: per-site absent, another source is present but invalid → 'invalid'", () => {
  assert.equal(planSiteKeyEnsure({ mode: "local", perSite: ABSENT, other: INVALID, siteDbsWithKeyData: false }).action, "invalid");
});

test("planSiteKeyEnsure: nothing anywhere, key-dependent data present → 'refuse'", () => {
  assert.equal(planSiteKeyEnsure({ mode: "local", perSite: ABSENT, other: ABSENT, siteDbsWithKeyData: true }).action, "refuse");
});

test("planSiteKeyEnsure: nothing anywhere, no key-dependent data → 'mint'", () => {
  assert.equal(planSiteKeyEnsure({ mode: "local", perSite: ABSENT, other: ABSENT, siteDbsWithKeyData: false }).action, "mint");
});

// ---------------------------------------------------------------------------
// ensureSiteKey — the I/O wrapper and its one writer
// ---------------------------------------------------------------------------

let home: string;
let siteDir: string;

test.beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "tovu-site-key-ensure-home-"));
  siteDir = mkdtempSync(path.join(tmpdir(), "tovu-site-key-ensure-site-"));
});

test.afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(siteDir, { recursive: true, force: true });
});

function perSiteFilePathIn(homeDir: string, siteKeyId: string): string {
  return path.join(homeDir, ".tovu", "site-keys", `${siteKeyId}.hex`);
}

function bareEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TOVU_SITE_KEY;
  delete env.TOVU_INTEGRATIONS_ROOT_KEY;
  delete env.TOVU_RUNTIME_MODE;
  return env;
}

function validHex(): string {
  return randomBytes(32).toString("hex");
}

function buildSealedCiphertextDb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE publish_credential_sets (id INTEGER PRIMARY KEY, sealed_ciphertext TEXT)");
    db.exec("INSERT INTO publish_credential_sets (sealed_ciphertext) VALUES ('cipher-bytes')");
  } finally {
    db.close();
  }
}

test("ensureSiteKey: production mode is a no-op — never touches the filesystem", () => {
  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "production", env: bareEnv(), home });
  assert.deepEqual(result, { action: "production-noop" });
  assert.equal(existsSync(path.join(home, ".tovu")), false);
});

test("ensureSiteKey: an existing valid per-site file is a no-op — never rewritten", () => {
  const perSiteFilePath = perSiteFilePathIn(home, "site-1");
  mkdirSync(path.dirname(perSiteFilePath), { recursive: true });
  const hex = validHex();
  writeFileSync(perSiteFilePath, hex, { mode: 0o600 });

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home });

  assert.equal(result.action, "noop");
  assert.equal(result.fingerprint, fingerprintRootKeyHex(hex));
  assert.equal(readFileSync(perSiteFilePath, "utf8"), hex);
});

test("ensureSiteKey: an existing but malformed per-site file is 'invalid' — reported, never overwritten", () => {
  const perSiteFilePath = perSiteFilePathIn(home, "site-1");
  mkdirSync(path.dirname(perSiteFilePath), { recursive: true });
  writeFileSync(perSiteFilePath, "not-hex-at-all", { mode: 0o600 });

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home });

  assert.equal(result.action, "invalid");
  assert.equal(result.reason, "not-hex");
  assert.equal(readFileSync(perSiteFilePath, "utf8"), "not-hex-at-all");
});

test("ensureSiteKey: per-site absent, env var active → 'adopt' — the per-site file gets the SAME bytes", () => {
  const hex = validHex();
  const env = { ...bareEnv(), TOVU_INTEGRATIONS_ROOT_KEY: hex };

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env, home });

  assert.equal(result.action, "adopt");
  assert.equal(result.fingerprint, fingerprintRootKeyHex(hex));
  const perSiteFilePath = perSiteFilePathIn(home, "site-1");
  assert.equal(readFileSync(perSiteFilePath, "utf8"), hex);
});

test("ensureSiteKey: per-site absent, legacy shared file active → 'adopt' from that file", () => {
  const hex = validHex();
  const legacySharedFilePath = path.join(home, ".tovu", "integrations-root-key.hex");
  mkdirSync(path.dirname(legacySharedFilePath), { recursive: true });
  writeFileSync(legacySharedFilePath, hex, { mode: 0o600 });

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home });

  assert.equal(result.action, "adopt");
  assert.equal(result.fingerprint, fingerprintRootKeyHex(hex));
  const perSiteFilePath = perSiteFilePathIn(home, "site-1");
  assert.equal(readFileSync(perSiteFilePath, "utf8"), hex);
  // The legacy file itself must be untouched — adopt copies, it never deletes the source.
  assert.equal(readFileSync(legacySharedFilePath, "utf8"), hex);
});

test("ensureSiteKey: per-site absent, env var present but malformed → 'invalid' — nothing is written", () => {
  const env = { ...bareEnv(), TOVU_INTEGRATIONS_ROOT_KEY: "not-hex-at-all" };

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env, home });

  assert.equal(result.action, "invalid");
  assert.equal(result.reason, "not-hex");
  assert.equal(existsSync(perSiteFilePathIn(home, "site-1")), false);
});

test("ensureSiteKey: env var present but blank → treated as ABSENT, not invalid — falls through to mint when nothing else exists", () => {
  const env = { ...bareEnv(), TOVU_INTEGRATIONS_ROOT_KEY: "" };

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env, home });

  assert.equal(result.action, "mint");
  const perSiteFilePath = perSiteFilePathIn(home, "site-1");
  assert.match(readFileSync(perSiteFilePath, "utf8"), /^[0-9a-f]{64}$/);
});

test("ensureSiteKey: env var present but whitespace-only, legacy shared file active → 'adopt' from the file — blank env is not treated as invalid", () => {
  const hex = validHex();
  const legacySharedFilePath = path.join(home, ".tovu", "integrations-root-key.hex");
  mkdirSync(path.dirname(legacySharedFilePath), { recursive: true });
  writeFileSync(legacySharedFilePath, hex, { mode: 0o600 });
  const env = { ...bareEnv(), TOVU_INTEGRATIONS_ROOT_KEY: "   " };

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env, home });

  assert.equal(result.action, "adopt");
  assert.equal(result.fingerprint, fingerprintRootKeyHex(hex));
});

test("ensureSiteKey: nothing anywhere, this site's content.db holds a sealed row → 'refuse' — no file created", () => {
  const contentDbPath = path.join(siteDir, "content.db");
  buildSealedCiphertextDb(contentDbPath);

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home });

  assert.equal(result.action, "refuse");
  assert.equal(existsSync(perSiteFilePathIn(home, "site-1")), false);
});

test("ensureSiteKey: nothing anywhere, no content.db yet (brand new site) → 'mint' — a missing DB is not 'unreadable'", () => {
  // Deliberately no content.db written at all.
  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home });

  assert.equal(result.action, "mint");
  const perSiteFilePath = perSiteFilePathIn(home, "site-1");
  const written = readFileSync(perSiteFilePath, "utf8");
  assert.match(written, /^[0-9a-f]{64}$/);
  assert.equal(result.fingerprint, fingerprintRootKeyHex(written));
});

test("ensureSiteKey: mint writes the per-site file at mode 0600 and the site-keys dir at mode 0700", () => {
  ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home });

  const perSiteFilePath = perSiteFilePathIn(home, "site-1");
  const fileMode = statSync(perSiteFilePath).mode & 0o777;
  const dirMode = statSync(path.dirname(perSiteFilePath)).mode & 0o777;
  assert.equal(fileMode, 0o600);
  assert.equal(dirMode, 0o700);
});

test("ensureSiteKey: two different siteKeyIds under the same home get two independent files", () => {
  const first = ensureSiteKey({ siteDir, siteKeyId: "site-a", mode: "local", env: bareEnv(), home });
  const second = ensureSiteKey({ siteDir, siteKeyId: "site-b", mode: "local", env: bareEnv(), home });

  assert.equal(first.action, "mint");
  assert.equal(second.action, "mint");
  assert.notEqual(first.fingerprint, second.fingerprint);
  assert.notEqual(perSiteFilePathIn(home, "site-a"), perSiteFilePathIn(home, "site-b"));
});

// ---------------------------------------------------------------------------
// ensureSiteKeyForBoot — A3a's actual boot-path call site: resolves siteKeyId from siteDir's
// `.site-meta.json` itself (via site-key-sources.ts's resolveSiteKeyId), so serve.ts/index.ts never
// have to compute it themselves.
// ---------------------------------------------------------------------------

test("ensureSiteKeyForBoot: siteDir has a .site-meta.json siteId → resolves it and mints the per-site file", () => {
  writeFileSync(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId: "meta-site-1" }));

  const result = ensureSiteKeyForBoot({ siteDir, mode: "local", env: bareEnv(), home });

  assert.ok(result, "a resolvable siteKeyId must produce a real ensureSiteKey result, not undefined");
  assert.equal(result?.action, "mint");
  assert.equal(existsSync(perSiteFilePathIn(home, "meta-site-1")), true);
});

test("ensureSiteKeyForBoot: siteDir has no .site-meta.json → undefined, no file written, never throws", () => {
  const result = ensureSiteKeyForBoot({ siteDir, mode: "local", env: bareEnv(), home });

  assert.equal(result, undefined);
  assert.equal(existsSync(path.join(home, ".tovu")), false);
});
