import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";

import * as realSecrets from "@jini-ai/platform/secrets";

/**
 * @file Pins `keyring.env.ts`'s translation of errors coming back from `@jini-ai/platform/secrets`.
 * With today's Jini these paths are defence in depth — Tovu validates a key before handing it over,
 * and Jini itself already maps `EEXIST`/`ELOOP` to `RootKeyFileAlreadyExistsError` — so the only
 * seam that reaches them is a module mock of the Jini boundary. Each fake below is a subclass or a
 * spread of the REAL module, so the types and every other export stay the real ones.
 */

type DeriveInput = { workspaceId: string; purpose: string; info: string };
type SigningInput = { workspaceId: string; subscriptionId: string; version: number };

let deriveFailure: unknown;
let generateFailure: unknown;

/** The real keyring, except that a derivation fails with `deriveFailure` when one is set. */
class FailingFixedKeyring extends realSecrets.FixedRootKeyKeyring {
  override async derive(input: DeriveInput): Promise<Uint8Array> {
    if (deriveFailure !== undefined) throw deriveFailure;
    return super.derive(input);
  }
  override async deriveSigningSecret(input: SigningInput): Promise<Uint8Array> {
    if (deriveFailure !== undefined) throw deriveFailure;
    return super.deriveSigningSecret(input);
  }
}

const failingGenerate: typeof realSecrets.generateFileRootKey = (options) => {
  if (generateFailure !== undefined) throw generateFailure;
  return realSecrets.generateFileRootKey(options);
};

mock.module("@jini-ai/platform/secrets", {
  namedExports: { ...realSecrets, FixedRootKeyKeyring: FailingFixedKeyring, generateFileRootKey: failingGenerate },
});

const { EnvOrFileKeyring, generateFileSiteKey, SiteKeyFileAlreadyExistsError, UnusableSiteKeyError } = await import("../keyring.env.js");

const KEY = "ab".repeat(32);
const keyring = new EnvOrFileKeyring({ sources: [{ kind: "env" }] }, { env: () => ({ TOVU_SITE_KEY: KEY }) });

// generateFileSiteKey creates the key's directory before calling Jini, so it gets a real temp dir.
const workDir = mkdtempSync(join(tmpdir(), "tovu-keyring-jini-boundary-"));
const KEY_FILE = join(workDir, "keys", "site-key.hex");
test.after(() => rmSync(workDir, { recursive: true, force: true }));

function jiniRefusal(): InstanceType<typeof realSecrets.UnusableRootKeyError> {
  return new realSecrets.UnusableRootKeyError({
    source: "file",
    reason: "odd-length",
    message: "the root key file at /k is not usable as a root key: x. The keyring refuses to derive any key material from it.",
  });
}

function codedError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`fake ${code}`), { code });
}

test.afterEach(() => {
  deriveFailure = undefined;
  generateFailure = undefined;
});

test("jini boundary: a Jini UnusableRootKeyError from derive becomes Tovu's UnusableSiteKeyError with Tovu wording", async () => {
  deriveFailure = jiniRefusal();
  await assert.rejects(keyring.derive({ workspaceId: "ws", purpose: "p", info: "i" }), (error: unknown) => {
    assert.ok(error instanceof UnusableSiteKeyError);
    assert.equal(error.name, "UnusableSiteKeyError");
    assert.equal(error.source, "file");
    assert.equal(error.reason, "odd-length");
    assert.equal(error.message, "the root key file at /k is not usable as a root key: x. Tovu refuses to derive any key material from it.");
    return true;
  });
});

test("jini boundary: a Jini UnusableRootKeyError from deriveSigningSecret is translated the same way", async () => {
  deriveFailure = jiniRefusal();
  await assert.rejects(keyring.deriveSigningSecret({ workspaceId: "ws", subscriptionId: "s", version: 1 }), {
    name: "UnusableSiteKeyError",
    message: "the root key file at /k is not usable as a root key: x. Tovu refuses to derive any key material from it.",
  });
});

test("jini boundary: any other derive failure propagates as the very same error object", async () => {
  const failure = new TypeError("hkdf exploded");
  deriveFailure = failure;
  await assert.rejects(keyring.derive({ workspaceId: "ws", purpose: "p", info: "i" }), (error: unknown) => {
    assert.equal(error, failure);
    return true;
  });
});

test("jini boundary: the mocked keyring still derives normally when nothing fails", async () => {
  const secret = await keyring.derive({ workspaceId: "ws", purpose: "p", info: "i" });
  assert.equal(secret.length, 32);
});

test("jini boundary: a raw EEXIST from Jini's create becomes SiteKeyFileAlreadyExistsError", () => {
  generateFailure = codedError("EEXIST");
  assert.throws(() => generateFileSiteKey({ keyFilePath: KEY_FILE }), {
    name: "SiteKeyFileAlreadyExistsError",
    message: `a site key file already exists at ${KEY_FILE} — generate never overwrites an existing key`,
  });
});

test("jini boundary: a raw ELOOP (refused symlink chain) also becomes SiteKeyFileAlreadyExistsError", () => {
  generateFailure = codedError("ELOOP");
  assert.throws(() => generateFileSiteKey({ keyFilePath: KEY_FILE }), SiteKeyFileAlreadyExistsError);
});

test("jini boundary: Jini's own RootKeyFileAlreadyExistsError (matched by name) becomes SiteKeyFileAlreadyExistsError", () => {
  generateFailure = Object.assign(new Error("a root key file already exists at /x"), { name: "RootKeyFileAlreadyExistsError" });
  assert.throws(() => generateFileSiteKey({ keyFilePath: KEY_FILE }), SiteKeyFileAlreadyExistsError);
});

test("jini boundary: a different fs error code propagates unchanged", () => {
  const failure = codedError("EACCES");
  generateFailure = failure;
  assert.throws(() => generateFileSiteKey({ keyFilePath: KEY_FILE }), (error: unknown) => {
    assert.equal(error, failure);
    return true;
  });
});

test("jini boundary: an Error with no code and another name propagates unchanged", () => {
  const failure = new RangeError("disk full");
  generateFailure = failure;
  assert.throws(() => generateFileSiteKey({ keyFilePath: KEY_FILE }), (error: unknown) => {
    assert.equal(error, failure);
    return true;
  });
});

test("jini boundary: a thrown null propagates unchanged", () => {
  generateFailure = null;
  assert.throws(() => generateFileSiteKey({ keyFilePath: KEY_FILE }), (error: unknown) => {
    assert.equal(error, null);
    return true;
  });
});

test("jini boundary: a thrown non-object (string) propagates unchanged", () => {
  generateFailure = "EEXIST";
  assert.throws(() => generateFileSiteKey({ keyFilePath: KEY_FILE }), (error: unknown) => {
    assert.equal(error, "EEXIST");
    return true;
  });
});
