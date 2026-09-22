import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { composioConfig, workspaces } from "../../../apps/website/src/platform/db/schema.sqlite.js";
import { AesGcmSecretSealer } from "../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../../apps/website/src/features/webhooks/keyring.env.js";
import { buildComposioConfigAad } from "../../../apps/website/src/platform/connectors/composio-config-aad.js";

/**
 * @file The mandatory proof for `backfill-composio-config-aad.ts`: seal a row the OLD way (no aad),
 * run the migration, then successfully OPEN it the NEW way — same discipline as
 * `backfill-media-provider-credential-aad.test.ts`. Also proves `key_generation`/`auth_config_ids`
 * survive untouched, since this script's own header claims it never bumps the generation counter.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join("development", "scripts", "backfill-composio-config-aad.ts");
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

test("backfill-composio-config-aad: seals OLD (no aad), migrates in place, opens NEW — preserves key_generation/auth_config_ids, and is idempotent", async () => {
  const scratch = tmpDir("backfill-composio-config-aad-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  const plaintext1 = "comp_live_FIXTURE_WORKSPACE_ONE";
  const sealed1 = await sealer.seal({ plaintext: plaintext1, key: activeKey }); // NO aad — legacy shape.
  const plaintext2 = "comp_live_FIXTURE_WORKSPACE_TWO";
  const sealed2 = await sealer.seal({ plaintext: plaintext2, key: activeKey }); // NO aad — legacy shape.

  const seedDb = openContentDb(dbPath);
  seedDb
    .insert(workspaces)
    .values([
      { id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW },
      { id: OTHER_WORKSPACE, name: OTHER_WORKSPACE, slug: OTHER_WORKSPACE, createdAt: NOW },
    ])
    .run();
  seedDb
    .insert(composioConfig)
    .values([
      {
        workspaceId: WORKSPACE,
        sealedKeyId: sealed1.keyId,
        sealedCiphertext: sealed1.ciphertext,
        sealedNonce: sealed1.nonce,
        sealedAlg: sealed1.alg,
        keyTail: "ONE",
        authConfigIds: JSON.stringify({ github: "ac_github_1" }),
        keyGeneration: 4,
        aadVersion: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      // No key at all — must be left alone.
      {
        workspaceId: OTHER_WORKSPACE,
        sealedKeyId: null,
        sealedCiphertext: null,
        sealedNonce: null,
        sealedAlg: null,
        keyTail: null,
        authConfigIds: null,
        keyGeneration: 0,
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
  const rows = db.select().from(composioConfig).all();
  const byWorkspace = new Map(rows.map((r) => [r.workspaceId, r]));
  const rowOne = byWorkspace.get(WORKSPACE)!;
  const rowTwo = byWorkspace.get(OTHER_WORKSPACE)!;

  assert.equal(rowOne.aadVersion, 1);
  assert.equal(rowOne.keyGeneration, 4, "key_generation must survive untouched — the key's identity did not change");
  assert.equal(rowOne.authConfigIds, JSON.stringify({ github: "ac_github_1" }), "auth_config_ids must survive untouched");
  assert.equal(rowTwo.aadVersion, 0, "a row with no key must be left untouched");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const openSealer = new AesGcmSecretSealer(new EnvOrFileKeyring({ allowFileFallback: false }));
  const reopened = await openSealer.open({
    sealed: { keyId: rowOne.sealedKeyId!, ciphertext: rowOne.sealedCiphertext!, nonce: rowOne.sealedNonce!, alg: rowOne.sealedAlg! },
    aad: buildComposioConfigAad({ workspaceId: WORKSPACE }),
  });
  assert.equal(reopened, plaintext1, "the migrated row must open to the byte-identical original plaintext under the NEW aad");

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
