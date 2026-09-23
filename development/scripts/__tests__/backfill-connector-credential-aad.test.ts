import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { composioConnectorCredentials, workspaces } from "../../../apps/website/src/platform/db/schema.sqlite.js";
import { AesGcmSecretSealer } from "../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../../apps/website/src/features/webhooks/keyring.env.js";
import { buildConnectorCredentialAad } from "../../../apps/website/src/platform/connectors/connector-credential-aad.js";

/**
 * @file The mandatory proof for `backfill-connector-credential-aad.ts`: seal a row the OLD way (no
 * aad), run the migration, then successfully OPEN it the NEW way — same discipline as
 * `backfill-media-provider-credential-aad.test.ts`.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join("development", "scripts", "backfill-connector-credential-aad.ts");
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

test("backfill-connector-credential-aad: seals OLD (no aad), migrates in place, opens NEW — preserves account_label, and is idempotent", async () => {
  const scratch = tmpDir("backfill-connector-aad-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  const githubPlaintext = JSON.stringify({ provider: "composio", token: "tok_FIXTURE_GITHUB" });
  const githubSealed = await sealer.seal({ plaintext: githubPlaintext, key: activeKey }); // NO aad.
  const notionPlaintext = JSON.stringify({ provider: "composio", token: "tok_FIXTURE_NOTION" });
  const notionSealed = await sealer.seal({ plaintext: notionPlaintext, key: activeKey }); // NO aad.

  const seedDb = openContentDb(dbPath);
  seedDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  seedDb
    .insert(composioConnectorCredentials)
    .values([
      {
        workspaceId: WORKSPACE,
        connectorId: "github",
        accountLabel: "octocat",
        sealedKeyId: githubSealed.keyId,
        sealedCiphertext: githubSealed.ciphertext,
        sealedNonce: githubSealed.nonce,
        sealedAlg: githubSealed.alg,
        aadVersion: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        workspaceId: WORKSPACE,
        connectorId: "notion",
        accountLabel: "My Workspace",
        sealedKeyId: notionSealed.keyId,
        sealedCiphertext: notionSealed.ciphertext,
        sealedNonce: notionSealed.nonce,
        sealedAlg: notionSealed.alg,
        aadVersion: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ])
    .run();
  seedDb.$client.close();
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;

  const dryRunOutput = runScript(dbPath, undefined);
  assert.match(dryRunOutput, /DRY RUN: 2 row\(s\) would be migrated, 2 total pending/);

  const applyOutput = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(applyOutput, /RESTORE POINT CAPTURED/);
  assert.match(applyOutput, new RegExp(`MIGRATED: workspace=${WORKSPACE} connector=github -> aad_version=1`));
  assert.match(applyOutput, new RegExp(`MIGRATED: workspace=${WORKSPACE} connector=notion -> aad_version=1`));

  const db = openContentDb(dbPath);
  const rows = db.select().from(composioConnectorCredentials).all();
  const byConnector = new Map(rows.map((r) => [r.connectorId, r]));
  const githubRow = byConnector.get("github")!;
  const notionRow = byConnector.get("notion")!;

  assert.equal(githubRow.aadVersion, 1);
  assert.equal(notionRow.aadVersion, 1);
  assert.equal(githubRow.accountLabel, "octocat", "account_label must survive untouched");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const openSealer = new AesGcmSecretSealer(new EnvOrFileKeyring({ allowFileFallback: false }));
  const reopenedGithub = await openSealer.open({
    sealed: { keyId: githubRow.sealedKeyId!, ciphertext: githubRow.sealedCiphertext!, nonce: githubRow.sealedNonce!, alg: githubRow.sealedAlg! },
    aad: buildConnectorCredentialAad({ workspaceId: WORKSPACE, connectorId: "github" }),
  });
  assert.equal(reopenedGithub, githubPlaintext, "the migrated row must open to the byte-identical original plaintext under the NEW aad");

  const reopenedNotion = await openSealer.open({
    sealed: { keyId: notionRow.sealedKeyId!, ciphertext: notionRow.sealedCiphertext!, nonce: notionRow.sealedNonce!, alg: notionRow.sealedAlg! },
    aad: buildConnectorCredentialAad({ workspaceId: WORKSPACE, connectorId: "notion" }),
  });
  assert.equal(reopenedNotion, notionPlaintext);

  await assert.rejects(() =>
    openSealer.open({
      sealed: { keyId: githubRow.sealedKeyId!, ciphertext: githubRow.sealedCiphertext!, nonce: githubRow.sealedNonce!, alg: githubRow.sealedAlg! },
    })
  );

  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;
  db.$client.close();

  const secondApplyOutput = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(secondApplyOutput, /Nothing to migrate/);
  assert.doesNotMatch(secondApplyOutput, /RESTORE POINT CAPTURED/);

  fs.rmSync(scratch, { recursive: true, force: true });
});
