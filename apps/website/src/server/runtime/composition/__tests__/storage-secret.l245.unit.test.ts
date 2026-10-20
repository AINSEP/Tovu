import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { SecretSealerPort } from "#src/features/webhooks/ports";
import { readSealedConnectionString, STORAGE_SECRET_FILENAME, StorageSecretError } from "../storage-secret.js";

test("L245: missing, unreadable and malformed JSON files report only the path and category", async t => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "l245-secret-"));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  const target = path.join(siteDir, STORAGE_SECRET_FILENAME);
  await assert.rejects(readSealedConnectionString({ siteDir }), new StorageSecretError(`this site stores its Postgres connection string sealed in ${target}, which does not exist`));
  fs.mkdirSync(target);
  await assert.rejects(readSealedConnectionString({ siteDir }), new StorageSecretError(`${target} is not valid JSON`));
  fs.rmdirSync(target);
  fs.writeFileSync(target, "{");
  await assert.rejects(readSealedConnectionString({ siteDir }), new StorageSecretError(`${target} is not valid JSON`));
});

test("L245: version and sealed field validation happens before calling the sealer", async t => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "l245-secret-"));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  const target = path.join(siteDir, STORAGE_SECRET_FILENAME);
  const sealer: SecretSealerPort = { seal: async () => assert.fail("no seal"), open: async () => assert.fail("invalid file must not decrypt") };
  const invalid: unknown[] = [null, {}, { version: 2, sealed: { ciphertext: "c", nonce: "n" } }, { version: 1 },
    { version: 1, sealed: null }, { version: 1, sealed: { ciphertext: 1, nonce: "n" } },
    { version: 1, sealed: { ciphertext: "c" } }, { version: 1, sealed: { ciphertext: "c", nonce: 1 } }];
  for (const file of invalid) {
    fs.writeFileSync(target, JSON.stringify(file));
    await assert.rejects(readSealedConnectionString({ siteDir }, { sealer }), new StorageSecretError(`${target} is not a sealed connection string (version 1)`));
  }
});

test("L245: valid envelopes reach the injected sealer unchanged with storage AAD; decrypt errors are redacted", async t => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "l245-secret-"));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  const target = path.join(siteDir, STORAGE_SECRET_FILENAME);
  const sealed = { ciphertext: "", nonce: "", keyId: "test-key", extra: "preserved" };
  fs.writeFileSync(target, JSON.stringify({ version: 1, sealed }));
  const sealer: SecretSealerPort = {
    seal: async () => assert.fail("no seal"),
    open: async (required, optional) => {
      assert.deepEqual(required, { sealed });
      assert.deepEqual(optional, { aad: "tovu:site-storage:postgres-connection:v1" });
      return "unchanged plaintext";
    },
  };
  assert.equal(await readSealedConnectionString({ siteDir }, { sealer }), "unchanged plaintext");
  sealer.open = async () => { throw new Error("private key details"); };
  await assert.rejects(readSealedConnectionString({ siteDir }, { sealer }), new StorageSecretError(`${target} does not open with this site's key (a different site key, or the file was changed)`));
});
