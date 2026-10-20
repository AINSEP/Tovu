import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  EnvOrFileKeyring,
  FixedSiteKeyKeyring,
  inspectSiteKeyMaterial,
  revealSiteKeyMaterial,
  fingerprintSiteKeyHex,
  generateFileSiteKey,
  parseSiteKeyHex,
  SiteKeyFileAlreadyExistsError,
  UnusableSiteKeyError,
} from "../keyring.env.js";
import type { SiteKeySource } from "../site-key-sources.js";

/**
 * @file Boundary pins for `keyring.env.ts` (security-sensitive): the exact refusal wording per
 * source kind and rejection, the "no site key" list, the default `process.env` reader, and the
 * exact (key-ordered) status/reveal shapes. Written against the pre-refactor code so the refactor
 * is provably behaviour-identical. Key material in this file is synthetic test data only.
 */

const KEY_A = "ab".repeat(32);
const KEY_B = "cd".repeat(32);
const DERIVE_INPUT = { workspaceId: "ws", purpose: "sealer", info: "v1" };
const SIGNING_INPUT = { workspaceId: "ws", subscriptionId: "sub", version: 1 };

const REFUSAL_TAIL = "Tovu refuses to derive any key material from it rather than sealing under a shortened or empty key.";
const NOT_HEX_DETAIL =
  'it contains characters that are not hex digits (only 0-9 and a-f are allowed; a "0x" prefix, whitespace inside the value, or a base64 or PEM body all fail this)';

function sealedWarning(subject: string): string {
  return (
    ` IMPORTANT: anything this site sealed while ${subject} was in place was sealed under key material derived from these same bytes, ` +
    `not from a real 32-byte key, so those stored credentials are not protected as intended — with empty or very short material the derived key is computable from published constants. ` +
    `Replacing or regenerating the key will NOT restore them; it will make them unreadable. ` +
    `Do not overwrite, delete or regenerate this key until you have decided what to do with the credentials already stored.`
  );
}

function tempDir(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "tovu-keyring-pins-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function fileWith(t: TestContext, content: string): string {
  const path = join(tempDir(t), "site-key.hex");
  writeFileSync(path, content, { mode: 0o600 });
  return path;
}

/** Sets `process.env.TOVU_SITE_KEY` for one test and restores the previous value afterwards. */
function withProcessSiteKey(t: TestContext, value: string | undefined): void {
  const previous = process.env.TOVU_SITE_KEY;
  if (value === undefined) delete process.env.TOVU_SITE_KEY;
  else process.env.TOVU_SITE_KEY = value;
  t.after(() => {
    if (previous === undefined) delete process.env.TOVU_SITE_KEY;
    else process.env.TOVU_SITE_KEY = previous;
  });
}

function envKeyring(value: string): EnvOrFileKeyring {
  return new EnvOrFileKeyring({ sources: [{ kind: "env" }] }, { env: () => ({ TOVU_SITE_KEY: value }) });
}

async function refusalOf(promise: Promise<unknown>): Promise<UnusableSiteKeyError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof UnusableSiteKeyError, `expected UnusableSiteKeyError, got ${String(error)}`);
    return error;
  }
  assert.fail("expected the derivation to be refused");
}

// ---------------------------------------------------------------------------
// EnvOrFileKeyring refusals — exact wording per source kind and rejection
// ---------------------------------------------------------------------------

test("pin: a non-hex env value is refused naming TOVU_SITE_KEY, with no already-sealed warning", async () => {
  const error = await refusalOf(envKeyring("zz".repeat(32)).derive(DERIVE_INPUT));
  assert.equal(error.name, "UnusableSiteKeyError");
  assert.equal(error.source, "env");
  assert.equal(error.reason, "not-hex");
  assert.equal(error.message, `TOVU_SITE_KEY is not usable as a site key: ${NOT_HEX_DETAIL}. ${REFUSAL_TAIL}`);
});

test("pin: an odd-length env value is refused with no already-sealed warning", async () => {
  const error = await refusalOf(envKeyring("abc").derive(DERIVE_INPUT));
  assert.equal(error.reason, "odd-length");
  assert.equal(
    error.message,
    `TOVU_SITE_KEY is not usable as a site key: it has an odd number of hex digits (3), so it does not describe whole bytes — usually a partial write or a truncated copy. ${REFUSAL_TAIL}`
  );
});

test("pin: a too-short env value carries the already-sealed warning for 'this value'", async () => {
  const error = await refusalOf(envKeyring("abcd").derive(DERIVE_INPUT));
  assert.equal(error.reason, "too-short");
  assert.equal(
    error.message,
    `TOVU_SITE_KEY is not usable as a site key: it is 2 bytes (4 hex digits); a site key must be at least 32 bytes (64 hex digits) — usually a truncated copy. ${REFUSAL_TAIL}${sealedWarning("this value")}`
  );
});

test("pin: an empty key file is refused as source 'file' with the already-sealed warning for 'this file'", async (t) => {
  const path = fileWith(t, "");
  const keyring = new EnvOrFileKeyring({ sources: [{ kind: "per-site-file", path }] }, { env: () => ({}) });
  const error = await refusalOf(keyring.derive(DERIVE_INPUT));
  assert.equal(error.source, "file");
  assert.equal(error.reason, "empty");
  assert.equal(error.message, `the site key file at ${path} is not usable as a site key: it is empty. ${REFUSAL_TAIL}${sealedWarning("this file")}`);
});

test("pin: a non-hex legacy shared file is refused as source 'file', naming its path", async (t) => {
  const path = fileWith(t, "not hex");
  const keyring = new EnvOrFileKeyring({ sources: [{ kind: "legacy-shared-file", path }] }, { env: () => ({}) });
  const error = await refusalOf(keyring.deriveSigningSecret(SIGNING_INPUT));
  assert.equal(error.source, "file");
  assert.equal(error.reason, "not-hex");
  assert.equal(error.message, `the site key file at ${path} is not usable as a site key: ${NOT_HEX_DETAIL}. ${REFUSAL_TAIL}${sealedWarning("this file")}`);
});

test("pin: no source resolving lists every configured source, in order, by name only", async () => {
  const keyring = new EnvOrFileKeyring({ sources: [{ kind: "env" }, { kind: "volume-file", path: "/nowhere/site-key.hex" }] }, { env: () => ({}) });
  await assert.rejects(keyring.derive(DERIVE_INPUT), {
    name: "Error",
    message: "no site key: none of the configured sources resolved (env var TOVU_SITE_KEY, the site key file at /nowhere/site-key.hex)",
  });
});

test("pin: an empty source list is refused with an empty source list in the message", async () => {
  const keyring = new EnvOrFileKeyring({ sources: [] }, { env: () => ({}) });
  await assert.rejects(keyring.deriveSigningSecret(SIGNING_INPUT), {
    message: "no site key: none of the configured sources resolved ()",
  });
});

// ---------------------------------------------------------------------------
// EnvOrFileKeyring — defaults
// ---------------------------------------------------------------------------

test("pin: with no deps the keyring reads process.env on every derivation, not once at construction", async (t) => {
  withProcessSiteKey(t, undefined);
  const keyring = new EnvOrFileKeyring({ sources: [{ kind: "env" }] });
  await assert.rejects(keyring.derive(DERIVE_INPUT), { message: "no site key: none of the configured sources resolved (env var TOVU_SITE_KEY)" });
  process.env.TOVU_SITE_KEY = KEY_A;
  assert.deepEqual(await keyring.derive(DERIVE_INPUT), await new FixedSiteKeyKeyring(KEY_A).derive(DERIVE_INPUT));
});

test("pin: keyId defaults to v1 and is configurable", async () => {
  assert.deepEqual(await envKeyring(KEY_A).activeKey(), { keyId: "v1" });
  const custom = new EnvOrFileKeyring({ keyId: "v7", sources: [] }, { env: () => ({}) });
  assert.deepEqual(await custom.activeKey(), { keyId: "v7" });
});

test("pin: EnvOrFileKeyring and FixedSiteKeyKeyring derive the same bytes for the same key, both methods", async () => {
  const fixed = new FixedSiteKeyKeyring(KEY_A);
  assert.deepEqual(await envKeyring(KEY_A).derive(DERIVE_INPUT), await fixed.derive(DERIVE_INPUT));
  assert.deepEqual(await envKeyring(KEY_A).deriveSigningSecret(SIGNING_INPUT), await fixed.deriveSigningSecret(SIGNING_INPUT));
  assert.notDeepEqual(await envKeyring(KEY_B).derive(DERIVE_INPUT), await fixed.derive(DERIVE_INPUT));
});

test("pin: FixedSiteKeyKeyring keyId defaults to v1 and is configurable", async () => {
  assert.deepEqual(await new FixedSiteKeyKeyring(KEY_A).activeKey(), { keyId: "v1" });
  assert.deepEqual(await new FixedSiteKeyKeyring(KEY_A, "v3").activeKey(), { keyId: "v3" });
});

test("pin: FixedSiteKeyKeyring refuses invalid hex at construction", () => {
  assert.throws(() => new FixedSiteKeyKeyring("abcd"), { message: "FixedRootKeyKeyring: not a valid root key (too-short)" });
});

test("pin: parseSiteKeyHex trims surrounding whitespace and reports digits for a rejection", () => {
  assert.deepEqual(parseSiteKeyHex(`  ${KEY_A}\n`), { ok: true, hex: KEY_A });
  assert.deepEqual(parseSiteKeyHex("abcde"), { ok: false, reason: "odd-length", hexDigits: 5 });
});

// ---------------------------------------------------------------------------
// inspectSiteKeyMaterial / revealSiteKeyMaterial — exact, key-ordered shapes
// ---------------------------------------------------------------------------

test("pin: status of an active env key — exact key order, no hex", () => {
  const sources: SiteKeySource[] = [{ kind: "env" }, { kind: "per-site-file", path: "/k/site.hex" }];
  const status = inspectSiteKeyMaterial({ sources }, { env: () => ({ TOVU_SITE_KEY: KEY_A }) });
  assert.equal(
    JSON.stringify(status),
    JSON.stringify({ active: true, source: "env", fingerprint: fingerprintSiteKeyHex(KEY_A), keyFilePath: "/k/site.hex", envVarName: "TOVU_SITE_KEY" })
  );
});

test("pin: reveal of an active env key — exact key order, hex included", () => {
  const sources: SiteKeySource[] = [{ kind: "env" }];
  const reveal = revealSiteKeyMaterial({ sources }, { env: () => ({ TOVU_SITE_KEY: KEY_A }) });
  assert.equal(
    JSON.stringify(reveal),
    JSON.stringify({ active: true, source: "env", hex: KEY_A, fingerprint: fingerprintSiteKeyHex(KEY_A), keyFilePath: "", envVarName: "TOVU_SITE_KEY" })
  );
  assert.ok("envVarName" in reveal);
});

test("pin: status and reveal of an active file key — no envVarName key at all", (t) => {
  const path = fileWith(t, `${KEY_B}\n`);
  const sources: SiteKeySource[] = [{ kind: "env" }, { kind: "volume-file", path }];
  const status = inspectSiteKeyMaterial({ sources }, { env: () => ({}) });
  assert.equal(JSON.stringify(status), JSON.stringify({ active: true, source: "file", fingerprint: fingerprintSiteKeyHex(KEY_B), keyFilePath: path }));
  assert.equal("envVarName" in status, false);
  const reveal = revealSiteKeyMaterial({ sources }, { env: () => ({}) });
  assert.equal(JSON.stringify(reveal), JSON.stringify({ active: true, source: "file", hex: KEY_B, fingerprint: fingerprintSiteKeyHex(KEY_B), keyFilePath: path }));
  assert.equal("envVarName" in reveal, false);
});

test("pin: status and reveal of an invalid env key — invalid + reason, envVarName kept, no hex/fingerprint", () => {
  const sources: SiteKeySource[] = [{ kind: "env" }];
  const deps = { env: () => ({ TOVU_SITE_KEY: "abcd" }) };
  const expected = JSON.stringify({ active: false, source: "env", invalid: true, reason: "too-short", keyFilePath: "", envVarName: "TOVU_SITE_KEY" });
  assert.equal(JSON.stringify(inspectSiteKeyMaterial({ sources }, deps)), expected);
  const reveal = revealSiteKeyMaterial({ sources }, deps);
  assert.equal(JSON.stringify(reveal), expected);
  assert.equal("hex" in reveal, false);
});

test("pin: status and reveal of an invalid legacy file — source 'file', never falls through to a later valid source", (t) => {
  const bad = fileWith(t, "nothex");
  const good = fileWith(t, KEY_A);
  const sources: SiteKeySource[] = [{ kind: "legacy-volume-file", path: bad }, { kind: "volume-file", path: good }];
  const expected = JSON.stringify({ active: false, source: "file", invalid: true, reason: "not-hex", keyFilePath: good });
  assert.equal(JSON.stringify(inspectSiteKeyMaterial({ sources }, { env: () => ({}) })), expected);
  assert.equal(JSON.stringify(revealSiteKeyMaterial({ sources }, { env: () => ({}) })), expected);
});

test("pin: status and reveal with nothing present — source 'none', no invalid/reason/envVarName keys", () => {
  const sources: SiteKeySource[] = [{ kind: "env" }, { kind: "per-site-file", path: "/nowhere/x.hex" }];
  const expected = JSON.stringify({ active: false, source: "none", keyFilePath: "/nowhere/x.hex" });
  const status = inspectSiteKeyMaterial({ sources }, { env: () => ({}) });
  assert.equal(JSON.stringify(status), expected);
  assert.deepEqual(Object.keys(status), ["active", "source", "keyFilePath"]);
  const reveal = revealSiteKeyMaterial({ sources }, { env: () => ({}) });
  assert.deepEqual(Object.keys(reveal), ["active", "source", "keyFilePath"]);
});

test("pin: inspectSiteKeyMaterial with no deps reads process.env", (t) => {
  withProcessSiteKey(t, KEY_A);
  const status = inspectSiteKeyMaterial({ sources: [{ kind: "env" }] });
  assert.equal(status.fingerprint, fingerprintSiteKeyHex(KEY_A));
});

test("pin: revealSiteKeyMaterial with no deps reads process.env", (t) => {
  withProcessSiteKey(t, KEY_B);
  const reveal = revealSiteKeyMaterial({ sources: [{ kind: "env" }] });
  assert.equal(reveal.hex, KEY_B);
});

// ---------------------------------------------------------------------------
// generateFileSiteKey — refusals
// ---------------------------------------------------------------------------

test("pin: generateFileSiteKey over an existing file throws SiteKeyFileAlreadyExistsError with the exact message", (t) => {
  const path = fileWith(t, KEY_A);
  assert.throws(() => generateFileSiteKey({ keyFilePath: path }), {
    name: "SiteKeyFileAlreadyExistsError",
    message: `a site key file already exists at ${path} — generate never overwrites an existing key`,
  });
  assert.throws(() => generateFileSiteKey({ keyFilePath: path }), SiteKeyFileAlreadyExistsError);
});

test("pin: generateFileSiteKey whose directory path is occupied by a file propagates the raw fs error, not 'already exists'", (t) => {
  const dir = tempDir(t);
  const blocker = join(dir, "blocker");
  writeFileSync(blocker, "x");
  assert.throws(() => generateFileSiteKey({ keyFilePath: join(blocker, "site-key.hex") }), (error: unknown) => {
    assert.ok(!(error instanceof SiteKeyFileAlreadyExistsError));
    assert.equal((error as NodeJS.ErrnoException).code, "EEXIST");
    assert.equal((error as NodeJS.ErrnoException).syscall, "mkdir");
    return true;
  });
});

test("pin: generateFileSiteKey returns hex, its fingerprint and the path it wrote", (t) => {
  const dir = tempDir(t);
  mkdirSync(join(dir, "keys"));
  const keyFilePath = join(dir, "keys", "site-key.hex");
  const generated = generateFileSiteKey({ keyFilePath });
  assert.match(generated.hex, /^[0-9a-f]{64}$/);
  assert.deepEqual(generated, { hex: generated.hex, fingerprint: fingerprintSiteKeyHex(generated.hex), keyFilePath });
});
