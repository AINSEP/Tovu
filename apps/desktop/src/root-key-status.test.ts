/**
 * @file Coverage for `root-key-status.ts` — the desktop shell's own read of whether this launch
 * has usable integrations root-key material.
 *
 * Why this module exists at all: on 2026-09-18 the app was relaunched with `electron .` from
 * `apps/desktop` instead of `npm run desktop` from the repo root. Only the latter runs
 * `development/scripts/dev-desktop.mjs`, which calls `loadRepoRootEnvFile` — so nothing in that
 * launch (nor in any site server it spawned, since those inherit `process.env`) had a root key.
 * The app booted normally and the first symptom arrived hours later as an opaque failure on the
 * first credentialed action. These tests pin the boot-time detection that replaces that delay.
 *
 * Almost every assertion below runs against INJECTED env/filesystem fakes — never the real
 * `process.env` and never the real `~/.tovu`, so a developer machine that happens to have (or not
 * have) a key cannot change the result. The one exception is the DEFAULT-DEPENDENCIES section at
 * the bottom, added after a mutation sweep showed the `?? process.env` / `?? existsSync` /
 * `?? homedir` fallbacks were unexercised: those are the only dependencies the shipped call site
 * uses, so they need real ones. Even there, nothing asserts on this machine's own key state —
 * each test sets up and tears down exactly what it reads (a temp file, a temporarily-set var).
 *
 * NOTHING here contains, prints or asserts on a key VALUE: the hex literals used as inputs are
 * throwaway test bytes, and every assertion is on presence, source, rejection reason, or the
 * one-way fingerprint.
 *
 * The validation rules mirror `apps/website/src/features/webhooks/keyring.env.ts`'s
 * `parseRootKeyHex` — see `root-key-status.ts`'s own header on why a mirror rather than an
 * import, and `root-key-parity.test.ts` for the drift guard that holds the two together.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ROOT_KEY_ENV_VAR_NAME,
  defaultRootKeyFilePath,
  inspectRootKeyForBoot,
} from "./root-key-status.ts";

/** 32 bytes of throwaway test material — never a real key, and never written anywhere. */
const VALID_HEX = "a".repeat(64);
const OTHER_VALID_HEX = "b".repeat(64);

/** A filesystem that holds exactly the files this map names. */
function fsWith(files: Record<string, string>) {
  return {
    exists: (p: string) => Object.hasOwn(files, p),
    readFile: (p: string) => {
      const found = files[p];
      if (found === undefined) throw new Error(`test fs: no file at ${p}`);
      return found;
    },
  };
}

const EMPTY_FS = fsWith({});
const KEY_FILE = "/fake/home/.tovu/integrations-root-key.hex";

test("the env var name is the one the rest of Tovu reads", () => {
  assert.equal(ROOT_KEY_ENV_VAR_NAME, "TOVU_INTEGRATIONS_ROOT_KEY");
});

// ---------------------------------------------------------------------------------------------
// present / absent — the whole point of the module
// ---------------------------------------------------------------------------------------------

test("a key supplied by env var counts as present", () => {
  const status = inspectRootKeyForBoot({
    env: { TOVU_INTEGRATIONS_ROOT_KEY: VALID_HEX },
    keyFilePath: KEY_FILE,
    ...EMPTY_FS,
  });
  assert.equal(status.present, true);
  assert.equal(status.source, "env");
  assert.equal(status.invalid, undefined);
});

test("a key supplied by key file counts as present", () => {
  const status = inspectRootKeyForBoot({
    env: {},
    keyFilePath: KEY_FILE,
    ...fsWith({ [KEY_FILE]: VALID_HEX }),
  });
  assert.equal(status.present, true);
  assert.equal(status.source, "file");
});

test("neither env var nor key file is the failure this guard exists for", () => {
  const status = inspectRootKeyForBoot({ env: {}, keyFilePath: KEY_FILE, ...EMPTY_FS });
  assert.equal(status.present, false);
  assert.equal(status.source, "none");
  assert.equal(status.keyFilePath, KEY_FILE, "an absent key must still name where a file would go");
  assert.equal(status.envVarName, "TOVU_INTEGRATIONS_ROOT_KEY");
});

test("an empty-string env var is NOT a present key", () => {
  const status = inspectRootKeyForBoot({
    env: { TOVU_INTEGRATIONS_ROOT_KEY: "" },
    keyFilePath: KEY_FILE,
    ...EMPTY_FS,
  });
  assert.equal(status.present, false);
  assert.equal(status.source, "none", "an empty var is not a configured source — the file is next");
});

test("an empty env var still falls through to a usable key file", () => {
  const status = inspectRootKeyForBoot({
    env: { TOVU_INTEGRATIONS_ROOT_KEY: "" },
    keyFilePath: KEY_FILE,
    ...fsWith({ [KEY_FILE]: VALID_HEX }),
  });
  assert.equal(status.present, true);
  assert.equal(status.source, "file");
});

test("the env var wins over a key file, matching EnvOrFileKeyring's own precedence", () => {
  const status = inspectRootKeyForBoot({
    env: { TOVU_INTEGRATIONS_ROOT_KEY: VALID_HEX },
    keyFilePath: KEY_FILE,
    ...fsWith({ [KEY_FILE]: OTHER_VALID_HEX }),
  });
  assert.equal(status.source, "env");
  assert.equal(status.fingerprint, fingerprintOf(VALID_HEX));
});

// ---------------------------------------------------------------------------------------------
// configured-but-broken — reported separately from "nothing is configured"
// ---------------------------------------------------------------------------------------------

test("a non-hex env var is present-but-unusable, not absent", () => {
  const status = inspectRootKeyForBoot({
    env: { TOVU_INTEGRATIONS_ROOT_KEY: "not-a-hex-key-at-all-not-a-hex-key-at-all-not-hex-xxxxxxxxxxxxxx" },
    keyFilePath: KEY_FILE,
    ...EMPTY_FS,
  });
  assert.equal(status.present, false);
  assert.equal(status.invalid, true);
  assert.equal(status.source, "env");
  assert.equal(status.reason, "not-hex");
});

test("an odd number of hex digits is refused", () => {
  const status = inspectRootKeyForBoot({
    env: { TOVU_INTEGRATIONS_ROOT_KEY: "a".repeat(65) },
    keyFilePath: KEY_FILE,
    ...EMPTY_FS,
  });
  assert.equal(status.present, false);
  assert.equal(status.reason, "odd-length");
});

test("a short-but-valid-hex key is refused rather than silently used", () => {
  const status = inspectRootKeyForBoot({
    env: { TOVU_INTEGRATIONS_ROOT_KEY: "a".repeat(62) },
    keyFilePath: KEY_FILE,
    ...EMPTY_FS,
  });
  assert.equal(status.present, false);
  assert.equal(status.reason, "too-short");
});

test("a corrupt key FILE is present-but-unusable, not absent", () => {
  const status = inspectRootKeyForBoot({
    env: {},
    keyFilePath: KEY_FILE,
    ...fsWith({ [KEY_FILE]: "zzzz" }),
  });
  assert.equal(status.present, false);
  assert.equal(status.invalid, true);
  assert.equal(status.source, "file");
});

test("an empty key file is refused", () => {
  const status = inspectRootKeyForBoot({
    env: {},
    keyFilePath: KEY_FILE,
    ...fsWith({ [KEY_FILE]: "   \n" }),
  });
  assert.equal(status.present, false);
  assert.equal(status.reason, "empty");
});

test("a trailing newline is not a malformed key", () => {
  const status = inspectRootKeyForBoot({
    env: {},
    keyFilePath: KEY_FILE,
    ...fsWith({ [KEY_FILE]: `${VALID_HEX}\n` }),
  });
  assert.equal(status.present, true);
});

test("an unreadable key file is reported, never thrown, so boot is never blocked", () => {
  const status = inspectRootKeyForBoot({
    env: {},
    keyFilePath: KEY_FILE,
    exists: () => true,
    readFile: () => {
      throw new Error("EACCES");
    },
  });
  assert.equal(status.present, false);
  assert.equal(status.source, "file");
  assert.equal(status.invalid, true);
});

// ---------------------------------------------------------------------------------------------
// the fingerprint — the only thing about a real key that may ever leave this module
// ---------------------------------------------------------------------------------------------

function fingerprintOf(hex: string) {
  return createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex").slice(0, 12);
}

test("a present key carries the SAME short fingerprint the Secrets page shows", () => {
  const status = inspectRootKeyForBoot({
    env: { TOVU_INTEGRATIONS_ROOT_KEY: VALID_HEX },
    keyFilePath: KEY_FILE,
    ...EMPTY_FS,
  });
  assert.equal(status.fingerprint, fingerprintOf(VALID_HEX));
  assert.equal(status.fingerprint?.length, 12);
});

test("an absent key has no fingerprint at all", () => {
  const status = inspectRootKeyForBoot({ env: {}, keyFilePath: KEY_FILE, ...EMPTY_FS });
  assert.equal(status.fingerprint, undefined);
});

test("the status never carries the key value, in any field", () => {
  const status = inspectRootKeyForBoot({
    env: { TOVU_INTEGRATIONS_ROOT_KEY: VALID_HEX },
    keyFilePath: KEY_FILE,
    ...EMPTY_FS,
  });
  const serialized = JSON.stringify(status);
  assert.equal(serialized.includes(VALID_HEX), false, "a key value must never cross this boundary");
  // ...and not a prefix of it either, which is how a "just show a bit of it" regression would look.
  assert.equal(serialized.includes(VALID_HEX.slice(0, 16)), false);
});

// ---------------------------------------------------------------------------------------------
// where the key file lives — mode-aware, mirroring keyring.env.ts's defaultRootKeyFilePath
// ---------------------------------------------------------------------------------------------

test("local mode looks in the operator's home, outside any portable site folder", () => {
  const p = defaultRootKeyFilePath({ env: {}, home: () => "/fake/home", cwd: () => "/anywhere" });
  assert.equal(p, "/fake/home/.tovu/integrations-root-key.hex");
});

test("production mode looks on the durable sites volume instead of home", () => {
  const p = defaultRootKeyFilePath({
    env: { TOVU_RUNTIME_MODE: "production" },
    home: () => "/fake/home",
    cwd: () => "/workspace/Tovu",
  });
  assert.equal(p, "/workspace/Tovu/sites/.tovu/integrations-root-key.hex");
});

test("an unrecognized runtime mode is local, never production", () => {
  const p = defaultRootKeyFilePath({
    env: { TOVU_RUNTIME_MODE: "staging" },
    home: () => "/fake/home",
    cwd: () => "/anywhere",
  });
  assert.equal(p, "/fake/home/.tovu/integrations-root-key.hex");
});

test("inspect falls back to the default path when none is given", () => {
  const status = inspectRootKeyForBoot({
    env: {},
    home: () => "/fake/home",
    cwd: () => "/anywhere",
    ...EMPTY_FS,
  });
  assert.equal(status.keyFilePath, "/fake/home/.tovu/integrations-root-key.hex");
});

// ---------------------------------------------------------------------------------------------
// The DEFAULT dependencies — the real env, the real filesystem, the real home directory.
//
// Every test above injects fakes, which left the `?? process.env` / `?? existsSync` / `?? homedir`
// fallbacks unexercised: a mutation sweep (2026-09-18) dropped all four and nothing failed. Those
// defaults are the ONLY ones the shipped call site (`installRootKeyBootGuard`) uses, so an unwired
// default is the whole feature quietly reading nothing. The tests below exercise them without
// asserting on this machine's own key state, which would be flaky in both directions.
// ---------------------------------------------------------------------------------------------

test("with no injected home, the default path is under the REAL home directory", () => {
  const p = defaultRootKeyFilePath({ env: {} });
  assert.equal(p, path.join(os.homedir(), ".tovu", "integrations-root-key.hex"));
});

test("with no injected env, the runtime mode comes from the REAL process env", () => {
  const before = process.env.TOVU_RUNTIME_MODE;
  try {
    process.env.TOVU_RUNTIME_MODE = "production";
    assert.equal(defaultRootKeyFilePath({ cwd: () => "/fake/cwd" }), "/fake/cwd/sites/.tovu/integrations-root-key.hex");
    delete process.env.TOVU_RUNTIME_MODE;
    assert.equal(defaultRootKeyFilePath({ home: () => "/fake/home" }), "/fake/home/.tovu/integrations-root-key.hex");
  } finally {
    if (before === undefined) delete process.env.TOVU_RUNTIME_MODE;
    else process.env.TOVU_RUNTIME_MODE = before;
  }
});

test("with no injected filesystem, a REAL key file on disk is found and read", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-rootkey-"));
  const file = path.join(dir, "integrations-root-key.hex");
  // Throwaway test bytes written to a temp directory — not a key, and deleted below.
  fs.writeFileSync(file, `${VALID_HEX}\n`);
  try {
    const status = inspectRootKeyForBoot({ env: {}, keyFilePath: file });
    assert.equal(status.present, true);
    assert.equal(status.source, "file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("with no injected filesystem, an absent key file reports nothing configured", () => {
  const status = inspectRootKeyForBoot({
    env: {},
    keyFilePath: path.join(os.tmpdir(), "tovu-rootkey-does-not-exist", "integrations-root-key.hex"),
  });
  assert.equal(status.present, false);
  assert.equal(status.source, "none");
});

test("with no injected env, the REAL process environment is what is read", () => {
  const before = process.env[ROOT_KEY_ENV_VAR_NAME];
  const absentFile = path.join(os.tmpdir(), "tovu-rootkey-does-not-exist", "integrations-root-key.hex");
  try {
    process.env[ROOT_KEY_ENV_VAR_NAME] = VALID_HEX;
    assert.equal(inspectRootKeyForBoot({ keyFilePath: absentFile }).source, "env");
    delete process.env[ROOT_KEY_ENV_VAR_NAME];
    assert.equal(inspectRootKeyForBoot({ keyFilePath: absentFile }).present, false);
  } finally {
    if (before === undefined) delete process.env[ROOT_KEY_ENV_VAR_NAME];
    else process.env[ROOT_KEY_ENV_VAR_NAME] = before;
  }
});

// ---------------------------------------------------------------------------------------------
// Whitespace-only env var — configured and broken, NOT "nothing configured". Parity with
// `inspectRootKeyMaterial`, which reports `{source: "env", invalid: true, reason: "empty"}` for it
// because `EnvOrFileKeyring`'s own truthiness check lets a whitespace string through.
// ---------------------------------------------------------------------------------------------

test("a whitespace-only env var is a broken env var, not an absent one", () => {
  const status = inspectRootKeyForBoot({
    env: { TOVU_INTEGRATIONS_ROOT_KEY: "   " },
    keyFilePath: KEY_FILE,
    ...EMPTY_FS,
  });
  assert.equal(status.present, false);
  assert.equal(status.source, "env", "the operator DID set it — say so, or they will look at the file");
  assert.equal(status.invalid, true);
  assert.equal(status.reason, "empty");
});

test("a whitespace-only env var does NOT silently fall through to a key file", () => {
  const status = inspectRootKeyForBoot({
    env: { TOVU_INTEGRATIONS_ROOT_KEY: "   " },
    keyFilePath: KEY_FILE,
    ...fsWith({ [KEY_FILE]: VALID_HEX }),
  });
  assert.equal(status.present, false, "EnvOrFileKeyring would refuse here, so this must agree");
});
