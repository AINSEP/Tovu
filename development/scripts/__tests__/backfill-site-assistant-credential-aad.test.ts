import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { siteAssistantCredentials, workspaces } from "../../../apps/website/src/platform/db/schema.sqlite.js";
import { AesGcmSecretSealer } from "../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../../apps/website/src/features/webhooks/keyring.env.js";
import { buildSiteAssistantCredentialAad } from "../../../apps/website/src/assistant/site-credential-aad.js";

/**
 * @file The mandatory proof for `backfill-site-assistant-credential-aad.ts`: seal a row the OLD way
 * (no aad), run the migration, then successfully OPEN it the NEW way — same discipline as
 * `backfill-media-provider-credential-aad.test.ts`.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join("development", "scripts", "backfill-site-assistant-credential-aad.ts");
const NOW = "2026-09-02T00:00:00.000Z";
const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";

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

test("backfill-site-assistant-credential-aad: seals OLD (no aad), migrates in place, opens NEW — preserves provider/masked, and is idempotent", async () => {
  const scratch = tmpDir("backfill-site-assistant-aad-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  const plaintext = "FIXTURE_SITE_ASSISTANT_KEY_1111";
  const sealed = await sealer.seal({ plaintext, key: activeKey }); // NO aad — legacy shape.

  const seedDb = openContentDb(dbPath);
  seedDb
    .insert(workspaces)
    .values([
      { id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW },
      { id: OTHER_WORKSPACE, name: OTHER_WORKSPACE, slug: OTHER_WORKSPACE, createdAt: NOW },
    ])
    .run();
  seedDb
    .insert(siteAssistantCredentials)
    .values([
      {
        workspaceId: WORKSPACE,
        provider: "google",
        baseUrl: "https://generativelanguage.googleapis.com",
        model: "gemini-flash-latest",
        sealedKeyId: sealed.keyId,
        sealedCiphertext: sealed.ciphertext,
        sealedNonce: sealed.nonce,
        sealedAlg: sealed.alg,
        masked: "••••1111",
        aadVersion: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      // No key at all — must be left alone.
      {
        workspaceId: OTHER_WORKSPACE,
        provider: "google",
        baseUrl: null,
        model: null,
        sealedKeyId: null,
        sealedCiphertext: null,
        sealedNonce: null,
        sealedAlg: null,
        masked: null,
        aadVersion: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ])
    .run();
  seedDb.$client.close();
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;

  const dryRunOutput = runScript(dbPath, undefined);
  assert.match(dryRunOutput, /DRY RUN: 1 row\(s\) would be migrated, 1 total pending/);

  const applyOutput = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(applyOutput, /RESTORE POINT CAPTURED/);
  assert.match(applyOutput, new RegExp(`MIGRATED: workspace=${WORKSPACE} -> aad_version=1`));

  const db = openContentDb(dbPath);
  const rows = db.select().from(siteAssistantCredentials).all();
  const byWorkspace = new Map(rows.map((r) => [r.workspaceId, r]));
  const rowOne = byWorkspace.get(WORKSPACE)!;
  const rowTwo = byWorkspace.get(OTHER_WORKSPACE)!;

  assert.equal(rowOne.aadVersion, 1);
  assert.equal(rowOne.provider, "google", "provider must survive untouched");
  assert.equal(rowOne.masked, "••••1111", "masked must survive untouched");
  assert.equal(rowTwo.aadVersion, 0, "a row with no key must be left untouched");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const openSealer = new AesGcmSecretSealer(new EnvOrFileKeyring({ allowFileFallback: false }));
  const reopened = await openSealer.open({
    sealed: { keyId: rowOne.sealedKeyId!, ciphertext: rowOne.sealedCiphertext!, nonce: rowOne.sealedNonce!, alg: rowOne.sealedAlg! },
    aad: buildSiteAssistantCredentialAad({ workspaceId: WORKSPACE }),
  });
  assert.equal(reopened, plaintext, "the migrated row must open to the byte-identical original plaintext under the NEW aad");

  await assert.rejects(() =>
    openSealer.open({
      sealed: { keyId: rowOne.sealedKeyId!, ciphertext: rowOne.sealedCiphertext!, nonce: rowOne.sealedNonce!, alg: rowOne.sealedAlg! },
    })
  );

  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;
  db.$client.close();

  const secondApplyOutput = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(secondApplyOutput, /Nothing to migrate/);
  assert.doesNotMatch(secondApplyOutput, /RESTORE POINT CAPTURED/);

  fs.rmSync(scratch, { recursive: true, force: true });
});
