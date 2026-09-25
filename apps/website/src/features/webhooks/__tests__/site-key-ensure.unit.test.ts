import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { fingerprintRootKeyHex } from "../keyring.env.js";
import { ensureSiteKey, ensureSiteKeyForBoot, planSiteKeyEnsure, type SiteKeyMaterialCheck } from "../site-key-ensure.js";

/** Site-key plan §A.4 additions to this suite start at "ensureSiteKey: fingerprint stamp" below —
 *  everything above is unchanged from A2/A3a. */

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

// ---------------------------------------------------------------------------
// ensureSiteKeyForBoot: no .site-meta.json at all (2026-09-24 fix) — this is the DEFAULT
// `sites/<name>/` site's own real shape (`content-db-schema-guard.ts`'s header: "not a `tovu
// init`/`tovu serve <dir>` install directory — no `.site-meta.json` is ever written there"), so
// this is not a hypothetical edge case: it is what a fresh checkout's `sites/tovu-com` looks like
// under a plain `npm start`/`npm run dev` boot. Before this fix `ensureSiteKeyForBoot` silently did
// nothing for exactly this site, and `start.mjs` unconditionally silenced the one notice that would
// have said so (`TOVU_ROOT_KEY_NOTICE=off`) on the false premise a key had just been ensured.
// ---------------------------------------------------------------------------

test("ensureSiteKeyForBoot: siteDir has no .site-meta.json, LOCAL mode → mints a minimal one and mints the per-site key file — no silent gap", () => {
  const result = ensureSiteKeyForBoot({ siteDir, mode: "local", env: bareEnv(), home });

  assert.ok(result, "a site with no meta file must still end up with a usable key in local mode");
  assert.equal(result?.action, "mint");
  const meta = JSON.parse(readFileSync(path.join(siteDir, ".site-meta.json"), "utf8")) as Record<string, unknown>;
  assert.equal(typeof meta.siteKeyId, "string");
  assert.ok((meta.siteKeyId as string).length > 0);
  assert.equal(existsSync(perSiteFilePathIn(home, meta.siteKeyId as string)), true);
});

test("ensureSiteKeyForBoot: siteDir has no .site-meta.json, PRODUCTION mode → still undefined, nothing written anywhere — production never mints", () => {
  const result = ensureSiteKeyForBoot({ siteDir, mode: "production", env: bareEnv(), home });

  assert.equal(result, undefined);
  assert.equal(existsSync(path.join(siteDir, ".site-meta.json")), false);
  assert.equal(existsSync(path.join(home, ".tovu")), false);
});

test("ensureSiteKeyForBoot: a .site-meta.json that exists but is corrupt (unreadable JSON) is NEVER overwritten — no key is minted, the file is untouched", () => {
  const metaPath = path.join(siteDir, ".site-meta.json");
  writeFileSync(metaPath, "{ not valid json");

  const result = ensureSiteKeyForBoot({ siteDir, mode: "local", env: bareEnv(), home });

  assert.equal(result, undefined, "a corrupt meta file must never be silently replaced with a fresh one");
  assert.equal(readFileSync(metaPath, "utf8"), "{ not valid json", "the corrupt file's own bytes must survive untouched");
  assert.equal(existsSync(path.join(home, ".tovu")), false);
});

test("ensureSiteKeyForBoot: a .site-meta.json that already exists with real fields is preserved verbatim — only a genuinely ABSENT file is ever minted", () => {
  writeFileSync(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId: "meta-site-1", templateId: "starter" }));

  const result = ensureSiteKeyForBoot({ siteDir, mode: "local", env: bareEnv(), home });

  assert.equal(result?.action, "mint");
  const meta = JSON.parse(readFileSync(path.join(siteDir, ".site-meta.json"), "utf8")) as Record<string, unknown>;
  assert.equal(meta.siteId, "meta-site-1", "an existing field must never be dropped or altered by the boot-time mint path");
  assert.equal(meta.templateId, "starter");
  assert.equal(existsSync(perSiteFilePathIn(home, "meta-site-1")), true, "resolveSiteKeyId's own siteId fallback already covers this file — no NEW meta write should occur");
});

// ---------------------------------------------------------------------------
// ensureSiteKeyForBoot: boot must never crash on a key-write failure (2026-09-24 fix) — a boot
// whose ~/.tovu (or equivalent) cannot be written must still start the server; the admin status
// route already reports "missing"/"missing-with-data" for a site with no per-site key, exactly as
// it does today for any other reason a key never got created.
// ---------------------------------------------------------------------------

test("ensureSiteKeyForBoot: the per-site key file's own directory cannot be created → returns undefined, never throws", () => {
  // `home` itself is a plain file, not a directory, so `mkdirSync(<home>/.tovu, ...)` inside
  // `ensureSiteKey`'s own atomic write must fail with ENOTDIR — a real, not simulated, write
  // failure, reached through the exact code path a real permissions/disk problem would hit.
  rmSync(home, { recursive: true, force: true });
  writeFileSync(home, "not a directory");
  writeFileSync(path.join(siteDir, ".site-meta.json"), JSON.stringify({ siteId: "meta-site-1" }));

  assert.doesNotThrow(() => {
    const result = ensureSiteKeyForBoot({ siteDir, mode: "local", env: bareEnv(), home });
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// ensureSiteKey: fingerprint stamp (site-key plan §A.2/§A.4) — after `noop`/`adopt`/`mint` settle
// on the key now in the per-site file, `.site-meta.json`'s own `siteKeyFingerprint` is stamped if
// absent, left alone if it already matches, and turns the result into `"mismatch"` — never
// overwritten, never treated as a reason to mint — if it names a DIFFERENT key.
// ---------------------------------------------------------------------------

function writeSiteMeta(dir: string, meta: Record<string, unknown>): void {
  writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(meta));
}

function readSiteMeta(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(dir, ".site-meta.json"), "utf8")) as Record<string, unknown>;
}

test("ensureSiteKey: no .site-meta.json at siteDir → mint still succeeds, nothing to stamp against (pre-A4 caller shape, unchanged)", () => {
  // Deliberately no .site-meta.json written — mirrors every ensureSiteKey test above this section.
  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home });

  assert.equal(result.action, "mint");
  assert.equal(existsSync(path.join(siteDir, ".site-meta.json")), false, "ensureSiteKey never CREATES a .site-meta.json, only stamps an existing one");
});

test("ensureSiteKey: mint with a fresh site stamps siteKeyFingerprint into .site-meta.json, preserving every other field", () => {
  writeSiteMeta(siteDir, { siteId: "meta-site-1", templateId: "starter", schemaVersion: 3 });

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home });

  assert.equal(result.action, "mint");
  const meta = readSiteMeta(siteDir);
  assert.equal(meta.siteKeyFingerprint, result.fingerprint, "the stamp must equal the fingerprint of the key actually minted");
  assert.equal(meta.siteId, "meta-site-1", "stamping must not drop or alter an unrelated field");
  assert.equal(meta.templateId, "starter", "stamping must not drop or alter an unrelated field");
  assert.equal(meta.schemaVersion, 3, "stamping must not drop or alter an unrelated field");
});

test("ensureSiteKey: noop with a stamp that already matches the key's real fingerprint → stays 'noop', .site-meta.json is not rewritten", () => {
  const perSiteFilePath = perSiteFilePathIn(home, "site-1");
  mkdirSync(path.dirname(perSiteFilePath), { recursive: true });
  const hex = validHex();
  writeFileSync(perSiteFilePath, hex, { mode: 0o600 });
  const fingerprint = fingerprintRootKeyHex(hex);
  writeSiteMeta(siteDir, { siteId: "meta-site-1", siteKeyFingerprint: fingerprint });
  const metaPathStatBefore = statSync(path.join(siteDir, ".site-meta.json"));

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home });

  assert.equal(result.action, "noop");
  assert.equal(result.fingerprint, fingerprint);
  assert.deepEqual(readSiteMeta(siteDir), { siteId: "meta-site-1", siteKeyFingerprint: fingerprint });
  // A same-content atomic rewrite would still change the inode/mtime — assert the file was never
  // even opened for writing, not just that its content still reads the same.
  assert.equal(statSync(path.join(siteDir, ".site-meta.json")).ino, metaPathStatBefore.ino, "a matching stamp must not trigger any write at all");
});

test("ensureSiteKey: noop with a TAMPERED (mismatched) stamped fingerprint → 'mismatch', neither the key file nor .site-meta.json is touched", () => {
  const perSiteFilePath = perSiteFilePathIn(home, "site-1");
  mkdirSync(path.dirname(perSiteFilePath), { recursive: true });
  const hex = validHex();
  writeFileSync(perSiteFilePath, hex, { mode: 0o600 });
  const realFingerprint = fingerprintRootKeyHex(hex);
  const tamperedFingerprint = fingerprintRootKeyHex(validHex()); // a different key's fingerprint, planted here on purpose
  assert.notEqual(tamperedFingerprint, realFingerprint, "test precondition: the two fingerprints must actually differ");
  writeSiteMeta(siteDir, { siteId: "meta-site-1", siteKeyFingerprint: tamperedFingerprint });

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home });

  assert.equal(result.action, "mismatch", "a stamp that names a different key must be surfaced, not silently trusted");
  assert.equal(result.fingerprint, realFingerprint, "the result must report the key file's REAL fingerprint, not the stale stamp");
  assert.equal(readFileSync(perSiteFilePath, "utf8"), hex, "a mismatch must never overwrite the existing key file");
  assert.equal(readSiteMeta(siteDir).siteKeyFingerprint, tamperedFingerprint, "a mismatch must never silently overwrite .site-meta.json's own stamp — it is evidence, not a cache");
});

test("ensureSiteKey: adopt into a fresh per-site file also stamps the fingerprint (not just mint)", () => {
  const hex = validHex();
  const env = { ...bareEnv(), TOVU_INTEGRATIONS_ROOT_KEY: hex };
  writeSiteMeta(siteDir, { siteId: "meta-site-1" });

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env, home });

  assert.equal(result.action, "adopt");
  assert.equal(readSiteMeta(siteDir).siteKeyFingerprint, fingerprintRootKeyHex(hex));
});

// ---------------------------------------------------------------------------
// Review fix (2026-09-24): the stamp is consulted BEFORE a write, not only after it.
// - adopt: a candidate whose fingerprint differs from the stamp, on a site with sealed data, is
//   known to be the wrong key — writing it would make it permanent (the per-site file wins over
//   every other source from then on, so the right key could never be adopted later).
// - mint/adopt with no key-dependent data: nothing can be orphaned, so a stale stamp is updated
//   instead of leaving a permanent false "mismatch" banner Generate cannot clear.
// ---------------------------------------------------------------------------

test("ensureSiteKey: adopt of a key whose fingerprint differs from the stamp, on a site with sealed data → 'mismatch', and the wrong key is NOT written", () => {
  const stampedFingerprint = fingerprintRootKeyHex(validHex());
  const wrongHex = validHex();
  writeSiteMeta(siteDir, { siteId: "meta-site-1", siteKeyFingerprint: stampedFingerprint });
  buildSealedCiphertextDb(path.join(siteDir, "content.db"));
  const env = { ...bareEnv(), TOVU_INTEGRATIONS_ROOT_KEY: wrongHex };

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env, home });

  assert.equal(result.action, "mismatch");
  assert.equal(result.fingerprint, fingerprintRootKeyHex(wrongHex), "reports the candidate's own fingerprint");
  assert.equal(existsSync(perSiteFilePathIn(home, "site-1")), false, "a key the stamp proves wrong must never become the site's permanent per-site key");
  assert.equal(readSiteMeta(siteDir).siteKeyFingerprint, stampedFingerprint, "the stamp is evidence while sealed data exists — never overwritten");
});

test("ensureSiteKey: adopt with a stale stamp on a site with NO key-dependent data → 'adopt', and the stamp is updated to the adopted key", () => {
  const hex = validHex();
  writeSiteMeta(siteDir, { siteId: "meta-site-1", siteKeyFingerprint: fingerprintRootKeyHex(validHex()) });
  const env = { ...bareEnv(), TOVU_INTEGRATIONS_ROOT_KEY: hex };

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env, home });

  assert.equal(result.action, "adopt");
  assert.equal(readFileSync(perSiteFilePathIn(home, "site-1"), "utf8"), hex);
  assert.equal(readSiteMeta(siteDir).siteKeyFingerprint, fingerprintRootKeyHex(hex));
});

test("ensureSiteKey: mint on a site carrying a stale stamp (moved/copied site, no sealed data) → 'mint', and the stamp is updated — no permanent false mismatch", () => {
  writeSiteMeta(siteDir, { siteId: "meta-site-1", siteKeyFingerprint: fingerprintRootKeyHex(validHex()) });

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env: bareEnv(), home });

  assert.equal(result.action, "mint");
  assert.equal(readSiteMeta(siteDir).siteKeyFingerprint, result.fingerprint);
});

test("ensureSiteKeyForBoot: a traversal siteKeyId in .site-meta.json writes nothing anywhere (the id is rejected before any path is built)", () => {
  writeSiteMeta(siteDir, { siteId: "ok", siteKeyId: "../../escaped" });
  const env = { ...bareEnv(), TOVU_INTEGRATIONS_ROOT_KEY: validHex() };

  const result = ensureSiteKeyForBoot({ siteDir, mode: "local", env, home });

  assert.equal(result, undefined);
  assert.equal(existsSync(path.join(home, "escaped.hex")), false);
  assert.equal(existsSync(path.join(home, ".tovu")), false);
});

test("ensureSiteKey: TOVU_SITE_KEY set but blank does not hide a valid TOVU_INTEGRATIONS_ROOT_KEY — the legacy value is adopted", () => {
  const hex = validHex();
  const env = { ...bareEnv(), TOVU_SITE_KEY: "", TOVU_INTEGRATIONS_ROOT_KEY: hex };

  const result = ensureSiteKey({ siteDir, siteKeyId: "site-1", mode: "local", env, home });

  assert.equal(result.action, "adopt");
  assert.equal(readFileSync(perSiteFilePathIn(home, "site-1"), "utf8"), hex);
});
