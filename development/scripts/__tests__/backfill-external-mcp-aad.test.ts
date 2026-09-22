import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { externalMcpServers, workspaces } from "../../../apps/website/src/platform/db/schema.sqlite.js";
import { AesGcmSecretSealer } from "../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../../apps/website/src/features/webhooks/keyring.env.js";
import { buildExternalMcpEnvAad, buildExternalMcpOAuthAad } from "../../../apps/website/src/assistant/external-mcp-aad.js";

/**
 * @file A characterization test for `backfill-external-mcp-aad.ts`, written BEFORE that script was
 * migrated onto the shared `aad-backfill-runner.ts` scaffold (Refactor(Execution), 2026-09-06) — no
 * test existed for this script until now, unlike its five siblings. Pins the same invariant those
 * siblings each prove for their own table (`backfill-media-provider-credential-aad.test.ts`'s own
 * header explains the "why", repeated here only where this table's own shape differs):
 *
 * `external_mcp_servers` carries TWO independent sealed blobs per row (`sealed_*`/env and
 * `oauth_sealed_*`/oauth), each with its own AAD lineage column and its own AAD builder — this file's
 * job is to prove both migrate independently (a row may have only one pending, or both), and that a
 * migrated blob opens under its OWN new AAD to the exact original plaintext.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join("development", "scripts", "backfill-external-mcp-aad.ts");
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

test("backfill-external-mcp-aad: env and oauth blobs migrate independently, a row can have only one pending, and the run is idempotent", async () => {
  const scratch = tmpDir("backfill-external-mcp-aad-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  // Server A: BOTH blobs pending.
  const envPlaintextA = JSON.stringify({ API_KEY: "FIXTURE-ENV-A" });
  const envSealedA = await sealer.seal({ plaintext: envPlaintextA, key: activeKey }); // NO aad — legacy.
  const oauthPlaintextA = JSON.stringify({ clientSecret: "FIXTURE-OAUTH-SECRET-A" });
  const oauthSealedA = await sealer.seal({ plaintext: oauthPlaintextA, key: activeKey }); // NO aad — legacy.

  // Server B: ONLY the env blob pending (no oauth blob stored at all).
  const envPlaintextB = JSON.stringify({ API_KEY: "FIXTURE-ENV-B" });
  const envSealedB = await sealer.seal({ plaintext: envPlaintextB, key: activeKey });

  const seedDb = openContentDb(dbPath);
  seedDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  seedDb
    .insert(externalMcpServers)
    .values([
      {
        workspaceId: WORKSPACE,
        serverId: "server-a",
        transport: "stdio",
        authMode: "oauth",
        enabled: true,
        sealedKeyId: envSealedA.keyId,
        sealedCiphertext: envSealedA.ciphertext,
        sealedNonce: envSealedA.nonce,
        sealedAlg: envSealedA.alg,
        aadVersion: 0,
        oauthSealedKeyId: oauthSealedA.keyId,
        oauthSealedCiphertext: oauthSealedA.ciphertext,
        oauthSealedNonce: oauthSealedA.nonce,
        oauthSealedAlg: oauthSealedA.alg,
        oauthAadVersion: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        workspaceId: WORKSPACE,
        serverId: "server-b",
        transport: "stdio",
        authMode: "static_env",
        enabled: true,
        sealedKeyId: envSealedB.keyId,
        sealedCiphertext: envSealedB.ciphertext,
        sealedNonce: envSealedB.nonce,
        sealedAlg: envSealedB.alg,
        aadVersion: 0,
        oauthSealedKeyId: null,
        oauthSealedCiphertext: null,
        oauthSealedNonce: null,
        oauthSealedAlg: null,
        oauthAadVersion: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ])
    .run();
  seedDb.$client.close();
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;

  // --- Dry run: needs NO root key and must write nothing. 3 blobs total pending (A-env, A-oauth, B-env). ---
  const dryRunOutput = runScript(dbPath, undefined);
  assert.match(dryRunOutput, /DRY RUN: 3 blob\(s\) would be migrated, 3 total pending/);
  const afterDryRun = openContentDb(dbPath);
  assert.equal(
    afterDryRun.select().from(externalMcpServers).all().find((r) => r.serverId === "server-a")!.aadVersion,
    0,
    "a dry run must never write"
  );
  afterDryRun.$client.close();

  // --- Apply: decrypts under no aad, re-seals each blob under ITS OWN derived aad. ---
  const applyOutput = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(applyOutput, /RESTORE POINT CAPTURED/);
  assert.match(applyOutput, new RegExp(`MIGRATED: workspace=${WORKSPACE} server=server-a slot=env`));
  assert.match(applyOutput, new RegExp(`MIGRATED: workspace=${WORKSPACE} server=server-a slot=oauth`));
  assert.match(applyOutput, new RegExp(`MIGRATED: workspace=${WORKSPACE} server=server-b slot=env`));

  const db = openContentDb(dbPath);
  const rows = db.select().from(externalMcpServers).all();
  const rowA = rows.find((r) => r.serverId === "server-a")!;
  const rowB = rows.find((r) => r.serverId === "server-b")!;

  assert.equal(rowA.aadVersion, 1);
  assert.equal(rowA.oauthAadVersion, 1);
  assert.equal(rowB.aadVersion, 1);
  assert.equal(rowB.oauthSealedKeyId, null, "a row with no oauth blob must be left untouched, not fabricated");

  // --- THE MANDATORY PROOF: seal OLD, migrate, open NEW — under each blob's OWN aad builder. ---
  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const openSealer = new AesGcmSecretSealer(new EnvOrFileKeyring({ allowFileFallback: false }));

  const reopenedEnvA = await openSealer.open({
    sealed: { keyId: rowA.sealedKeyId!, ciphertext: rowA.sealedCiphertext!, nonce: rowA.sealedNonce!, alg: rowA.sealedAlg! },
    aad: buildExternalMcpEnvAad({ workspaceId: WORKSPACE, serverId: "server-a" }),
  });
  assert.equal(reopenedEnvA, envPlaintextA);

  const reopenedOauthA = await openSealer.open({
    sealed: {
      keyId: rowA.oauthSealedKeyId!,
      ciphertext: rowA.oauthSealedCiphertext!,
      nonce: rowA.oauthSealedNonce!,
      alg: rowA.oauthSealedAlg!,
    },
    aad: buildExternalMcpOAuthAad({ workspaceId: WORKSPACE, serverId: "server-a" }),
  });
  assert.equal(reopenedOauthA, oauthPlaintextA);

  const reopenedEnvB = await openSealer.open({
    sealed: { keyId: rowB.sealedKeyId!, ciphertext: rowB.sealedCiphertext!, nonce: rowB.sealedNonce!, alg: rowB.sealedAlg! },
    aad: buildExternalMcpEnvAad({ workspaceId: WORKSPACE, serverId: "server-b" }),
  });
  assert.equal(reopenedEnvB, envPlaintextB);

  // --- Negative half: the env AAD must NOT open the oauth blob (domain separation) and vice versa. ---
  await assert.rejects(() =>
    openSealer.open({
      sealed: { keyId: rowA.sealedKeyId!, ciphertext: rowA.sealedCiphertext!, nonce: rowA.sealedNonce!, alg: rowA.sealedAlg! },
      aad: buildExternalMcpOAuthAad({ workspaceId: WORKSPACE, serverId: "server-a" }),
    })
  );

  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;
  db.$client.close();

  // --- Idempotency: a second --apply run must be a complete no-op. ---
  const secondApplyOutput = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(secondApplyOutput, /Nothing to migrate/);
  assert.doesNotMatch(secondApplyOutput, /RESTORE POINT CAPTURED/);

  fs.rmSync(scratch, { recursive: true, force: true });
});
