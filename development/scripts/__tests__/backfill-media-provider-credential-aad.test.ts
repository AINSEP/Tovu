import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { mediaProviderCredentials, workspaces } from "../../../apps/website/src/platform/db/schema.js";
import { AesGcmSecretSealer } from "../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../../apps/website/src/features/webhooks/keyring.env.js";
import { buildMediaProviderCredentialAad } from "../../../apps/website/src/features/media/aad.js";

/**
 * @file The mandatory proof for `backfill-media-provider-credential-aad.ts` (this dispatch's own
 * requirement): seal a row the OLD way (no aad, `aad_version = 0`), run the migration, then
 * successfully OPEN it the NEW way — not just confirm `aad_version` flipped. A row that was touched
 * but cannot be opened under its new AAD is a permanently bricked credential (AAD is authenticated
 * but never stored, so it can never be recovered once mismatched), so "the plaintext round-trips
 * through the real AES-GCM sealer, under the real new AAD, after a real subprocess run of the real
 * script" is the one claim this file exists to prove.
 *
 * Runs the real script as a child process (`execFileSync`) — same reasoning
 * `backfill-vendor-credentials.test.ts` gives for its own identical choice: `main()` runs
 * unconditionally at import time.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join("development", "scripts", "backfill-media-provider-credential-aad.ts");
const NOW = "2026-09-02T00:00:00.000Z";
const WORKSPACE = "workspace-1";

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runScript(dbPath: string, rootKeyHex: string | undefined, extraArgs: string[] = []): string {
  const env = { ...process.env, ...(rootKeyHex !== undefined ? { TOVU_INTEGRATIONS_ROOT_KEY: rootKeyHex } : {}) };
  if (rootKeyHex === undefined) delete env.TOVU_INTEGRATIONS_ROOT_KEY;
  return execFileSync("node", ["--import", "tsx", SCRIPT, "--db", dbPath, ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env,
  });
}

test("backfill-media-provider-credential-aad: seals OLD (no aad), migrates in place, opens NEW — plus a no-key row is left alone and the run is idempotent", async () => {
  const scratch = tmpDir("backfill-media-aad-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  const openaiPlaintext = "sk-FIXTURE-OPENAI-TOKEN-1111";
  const openaiSealed = await sealer.seal({ plaintext: openaiPlaintext, key: activeKey }); // NO aad — the legacy shape.

  const grokPlaintext = "xai-FIXTURE-GROK-TOKEN-2222";
  const grokSealed = await sealer.seal({ plaintext: grokPlaintext, key: activeKey }); // NO aad — the legacy shape.

  const seedDb = openContentDb(dbPath);
  seedDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  seedDb
    .insert(mediaProviderCredentials)
    .values([
      {
        workspaceId: WORKSPACE,
        providerId: "openai",
        baseUrl: null,
        model: null,
        sealedKeyId: openaiSealed.keyId,
        sealedCiphertext: openaiSealed.ciphertext,
        sealedNonce: openaiSealed.nonce,
        sealedAlg: openaiSealed.alg,
        keyTail: "1111",
        aadVersion: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        workspaceId: WORKSPACE,
        providerId: "grok",
        baseUrl: null,
        model: null,
        sealedKeyId: grokSealed.keyId,
        sealedCiphertext: grokSealed.ciphertext,
        sealedNonce: grokSealed.nonce,
        sealedAlg: grokSealed.alg,
        keyTail: "2222",
        aadVersion: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      // A row with NO key at all — must be left alone entirely (never counted as pending, never
      // touched — this file's own script header).
      {
        workspaceId: WORKSPACE,
        providerId: "fal",
        baseUrl: "https://fal.example.com",
        model: null,
        sealedKeyId: null,
        sealedCiphertext: null,
        sealedNonce: null,
        sealedAlg: null,
        keyTail: null,
        aadVersion: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ])
    .run();
  seedDb.$client.close();
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;

  // --- Dry run: needs NO root key at all and must write nothing. ---
  const dryRunOutput = runScript(dbPath, undefined);
  assert.match(dryRunOutput, /DRY RUN: 2 row\(s\) would be migrated, 2 total pending/);
  const afterDryRun = openContentDb(dbPath);
  assert.equal(
    afterDryRun.select().from(mediaProviderCredentials).all().find((r) => r.providerId === "openai")!.aadVersion,
    0,
    "a dry run must never write"
  );
  afterDryRun.$client.close();

  // --- Apply: decrypts under no aad, re-seals under the derived aad. ---
  const applyOutput = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(applyOutput, /RESTORE POINT CAPTURED/);
  assert.match(applyOutput, new RegExp(`MIGRATED: workspace=${WORKSPACE} provider=openai -> aad_version=1`));
  assert.match(applyOutput, new RegExp(`MIGRATED: workspace=${WORKSPACE} provider=grok -> aad_version=1`));

  const db = openContentDb(dbPath);
  const rows = db.select().from(mediaProviderCredentials).all();
  const byProvider = new Map(rows.map((r) => [r.providerId, r]));
  const openaiRow = byProvider.get("openai")!;
  const grokRow = byProvider.get("grok")!;
  const falRow = byProvider.get("fal")!;

  assert.equal(openaiRow.aadVersion, 1);
  assert.equal(grokRow.aadVersion, 1);
  assert.equal(falRow.aadVersion, 0, "a row with no key must be left untouched");
  assert.equal(falRow.sealedCiphertext, null);
  // Untouched sibling columns.
  assert.equal(openaiRow.keyTail, "1111");
  assert.equal(falRow.baseUrl, "https://fal.example.com");

  // --- THE MANDATORY PROOF: seal OLD, migrate, open NEW. A fresh keyring/sealer pair must decrypt
  // each row's ciphertext under buildMediaProviderCredentialAad and recover the EXACT original
  // plaintext this test sealed under NO aad above. ---
  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const openSealer = new AesGcmSecretSealer(new EnvOrFileKeyring({ allowFileFallback: false }));

  const reopenedOpenai = await openSealer.open({
    sealed: { keyId: openaiRow.sealedKeyId!, ciphertext: openaiRow.sealedCiphertext!, nonce: openaiRow.sealedNonce!, alg: openaiRow.sealedAlg! },
    aad: buildMediaProviderCredentialAad({ workspaceId: WORKSPACE, providerId: "openai" }),
  });
  assert.equal(reopenedOpenai, openaiPlaintext, "the migrated row must open to the byte-identical original plaintext under the NEW aad");

  const reopenedGrok = await openSealer.open({
    sealed: { keyId: grokRow.sealedKeyId!, ciphertext: grokRow.sealedCiphertext!, nonce: grokRow.sealedNonce!, alg: grokRow.sealedAlg! },
    aad: buildMediaProviderCredentialAad({ workspaceId: WORKSPACE, providerId: "grok" }),
  });
  assert.equal(reopenedGrok, grokPlaintext);

  // --- Negative half of the same proof: opening the migrated row with NO aad (its old shape) must
  // now fail auth-tag verification — the ciphertext genuinely changed, not merely the flag. ---
  await assert.rejects(() =>
    openSealer.open({
      sealed: { keyId: openaiRow.sealedKeyId!, ciphertext: openaiRow.sealedCiphertext!, nonce: openaiRow.sealedNonce!, alg: openaiRow.sealedAlg! },
    })
  );

  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;
  db.$client.close();

  // --- Idempotency: a second --apply run must be a complete no-op. ---
  const secondApplyOutput = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(secondApplyOutput, /Nothing to migrate/);
  assert.doesNotMatch(secondApplyOutput, /RESTORE POINT CAPTURED/);
  const afterSecondApply = openContentDb(dbPath);
  const rowsAfterSecond = afterSecondApply.select().from(mediaProviderCredentials).all();
  assert.equal(rowsAfterSecond.length, 3, "a second --apply run must not duplicate or alter row count");
  afterSecondApply.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-media-provider-credential-aad: a corrupted row aborts the run without losing rows migrated before it", async () => {
  const scratch = tmpDir("backfill-media-aad-corrupt-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  const goodSealed = await sealer.seal({ plaintext: "sk-FIXTURE-GOOD-TOKEN", key: activeKey });
  const corruptSealed = await sealer.seal({ plaintext: "sk-FIXTURE-TO-BE-CORRUPTED", key: activeKey });
  const tamperedCiphertext = Buffer.from("this-is-not-the-real-ciphertext-and-will-fail-gcm-auth-tag-check").toString("base64");

  const seedDb = openContentDb(dbPath);
  seedDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  seedDb
    .insert(mediaProviderCredentials)
    .values([
      {
        workspaceId: WORKSPACE,
        providerId: "openai",
        baseUrl: null,
        model: null,
        sealedKeyId: goodSealed.keyId,
        sealedCiphertext: goodSealed.ciphertext,
        sealedNonce: goodSealed.nonce,
        sealedAlg: goodSealed.alg,
        keyTail: "OKEN",
        aadVersion: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        workspaceId: WORKSPACE,
        providerId: "grok",
        baseUrl: null,
        model: null,
        sealedKeyId: corruptSealed.keyId,
        sealedCiphertext: tamperedCiphertext,
        sealedNonce: corruptSealed.nonce,
        sealedAlg: corruptSealed.alg,
        keyTail: "TED",
        aadVersion: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ])
    .run();
  seedDb.$client.close();
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;

  assert.throws(() => runScript(dbPath, rootKeyHex, ["--apply"]), /Command failed/);

  const db = openContentDb(dbPath);
  const rows = db.select().from(mediaProviderCredentials).all();
  const openaiRow = rows.find((r) => r.providerId === "openai")!;
  assert.equal(openaiRow.aadVersion, 1, "the row processed before the corrupt one must survive migrated — this script never rolls back prior successful writes");
  db.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});
