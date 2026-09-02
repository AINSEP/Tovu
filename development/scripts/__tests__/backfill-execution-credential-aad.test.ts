import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { adminExecutionCredentials, principals, workspaces } from "../../../apps/website/src/platform/db/schema.js";
import { AesGcmSecretSealer } from "../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../../apps/website/src/features/webhooks/keyring.env.js";
import { buildExecutionCredentialAad } from "../../../apps/website/src/assistant/execution-credential-aad.js";

/**
 * @file The mandatory proof for `backfill-execution-credential-aad.ts`: seal a row the OLD way (no
 * aad), run the migration, then successfully OPEN it the NEW way — same discipline as
 * `backfill-media-provider-credential-aad.test.ts`.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join("development", "scripts", "backfill-execution-credential-aad.ts");
const NOW = "2026-09-02T00:00:00.000Z";
const WORKSPACE = "workspace-1";
const ADMIN_A = "principal-admin-a";
const ADMIN_B = "principal-admin-b";

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

test("backfill-execution-credential-aad: seals OLD (no aad), migrates in place, opens NEW — preserves protocol/masked, and is idempotent", async () => {
  const scratch = tmpDir("backfill-execution-aad-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  const plaintextA = "FIXTURE_ADMIN_A_KEY_1111";
  const sealedA = await sealer.seal({ plaintext: plaintextA, key: activeKey }); // NO aad — legacy shape.

  const seedDb = openContentDb(dbPath);
  seedDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  seedDb
    .insert(principals)
    .values([
      { id: ADMIN_A, workspaceId: WORKSPACE, kind: "user", displayName: "Admin A", status: "active", createdAt: NOW },
      { id: ADMIN_B, workspaceId: WORKSPACE, kind: "user", displayName: "Admin B", status: "active", createdAt: NOW },
    ])
    .run();
  seedDb
    .insert(adminExecutionCredentials)
    .values([
      {
        workspaceId: WORKSPACE,
        principalId: ADMIN_A,
        protocol: "anthropic",
        providerId: "anthropic",
        baseUrl: null,
        model: null,
        maxTokens: null,
        sealedKeyId: sealedA.keyId,
        sealedCiphertext: sealedA.ciphertext,
        sealedNonce: sealedA.nonce,
        sealedAlg: sealedA.alg,
        masked: "••••1111",
        aadVersion: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      // No key at all — must be left alone.
      {
        workspaceId: WORKSPACE,
        principalId: ADMIN_B,
        protocol: "anthropic",
        providerId: null,
        baseUrl: null,
        model: null,
        maxTokens: null,
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
  assert.match(applyOutput, new RegExp(`MIGRATED: workspace=${WORKSPACE} principal=${ADMIN_A} -> aad_version=1`));

  const db = openContentDb(dbPath);
  const rows = db.select().from(adminExecutionCredentials).all();
  const byPrincipal = new Map(rows.map((r) => [r.principalId, r]));
  const rowA = byPrincipal.get(ADMIN_A)!;
  const rowB = byPrincipal.get(ADMIN_B)!;

  assert.equal(rowA.aadVersion, 1);
  assert.equal(rowA.protocol, "anthropic", "protocol must survive untouched");
  assert.equal(rowA.masked, "••••1111", "masked must survive untouched");
  assert.equal(rowB.aadVersion, 0, "a row with no key must be left untouched");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const openSealer = new AesGcmSecretSealer(new EnvOrFileKeyring({ allowFileFallback: false }));
  const reopened = await openSealer.open({
    sealed: { keyId: rowA.sealedKeyId!, ciphertext: rowA.sealedCiphertext!, nonce: rowA.sealedNonce!, alg: rowA.sealedAlg! },
    aad: buildExecutionCredentialAad({ workspaceId: WORKSPACE, principalId: ADMIN_A }),
  });
  assert.equal(reopened, plaintextA, "the migrated row must open to the byte-identical original plaintext under the NEW aad");

  await assert.rejects(() =>
    openSealer.open({
      sealed: { keyId: rowA.sealedKeyId!, ciphertext: rowA.sealedCiphertext!, nonce: rowA.sealedNonce!, alg: rowA.sealedAlg! },
    })
  );

  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;
  db.$client.close();

  const secondApplyOutput = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(secondApplyOutput, /Nothing to migrate/);
  assert.doesNotMatch(secondApplyOutput, /RESTORE POINT CAPTURED/);

  fs.rmSync(scratch, { recursive: true, force: true });
});
