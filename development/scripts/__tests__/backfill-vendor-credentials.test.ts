import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "../../../src/db/sqlite/content-db.js";
import { publishCredentialSets, sourceControlCredentialSets, vendorCredentialSets, workspaces } from "../../../src/db/schema.js";
import { AesGcmSecretSealer } from "../../../src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../../src/features/webhooks/keyring.env.js";
import { buildPublishCredentialAad } from "../../../src/features/deployments/publish-credentials/aad.js";
import { buildSourceControlCredentialAad } from "../../../src/features/source-control/aad.js";
import { buildVendorCredentialAad } from "../../../src/features/vendor-credentials/aad.js";

/**
 * @file The mandatory proof for `backfill-vendor-credentials.ts` (this dispatch's own requirement,
 * restated in that script's own header): seal a row the OLD way, run the migration, then
 * successfully OPEN it the NEW way — not just confirm the row moved. A row that moved but cannot be
 * opened under its new AAD is a permanently bricked credential (`integrations/secret-sealer.aesgcm.
 * ts`'s own file header: AAD is authenticated but never stored, so it can never be recovered once
 * mismatched), so "the plaintext round-trips through the real AES-GCM sealer, under the real new
 * AAD, after a real subprocess run of the real script" is the one claim this file exists to prove.
 *
 * Runs the real script as a child process (`execFileSync`), same reasoning
 * `backfill-slug-collision-defaults.test.ts` gives for its own identical choice: `main()` runs
 * unconditionally at import time, so a child process is the only way to invoke it without also
 * inheriting this test runner's own argv/cwd.
 *
 * A throwaway, per-test random hex root key stands in for the real `TOVU_INTEGRATIONS_ROOT_KEY` —
 * this file never touches the real one, and the two `EnvOrFileKeyring`/`AesGcmSecretSealer` pairs it
 * constructs (one to seal the OLD-format fixture rows before the script runs, one to open the
 * NEW-format rows after) are built the exact same way `server/deps.ts`'s `siteAssistantSecretKeyring`
 * is (`new EnvOrFileKeyring({ allowFileFallback: false })`), so this test exercises the identical
 * key-derivation path production uses, not a stand-in double.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join("development", "scripts", "backfill-vendor-credentials.ts");
const NOW = "2026-08-16T00:00:00.000Z";
const WORKSPACE = "workspace-1";

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runScript(dbPath: string, rootKeyHex: string | undefined, extraArgs: string[] = []): string {
  const env = { ...process.env, ...(rootKeyHex !== undefined ? { TOVU_INTEGRATIONS_ROOT_KEY: rootKeyHex } : {}) };
  delete env.TOVU_INTEGRATIONS_ROOT_KEY_UNUSED;
  if (rootKeyHex === undefined) delete env.TOVU_INTEGRATIONS_ROOT_KEY;
  return execFileSync("node", ["--import", "tsx", SCRIPT, "--db", dbPath, ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env,
  });
}

test("backfill-vendor-credentials: seals OLD, migrates, opens NEW — plus vendor-merge label/default disambiguation and idempotency", async () => {
  const scratch = tmpDir("backfill-vendor-credentials-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  // --- Seed two OLD-format rows that will merge into the SAME "github" vendor group (this is the
  // real-world common case this script's own header documents: every existing row's label is the
  // hardcoded literal "default"), plus one that stays solo (gitlab, no collision). ---
  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  const publishId = "cred-publish-github-pages";
  const publishPlaintext = JSON.stringify({ providerId: "github-pages", token: "ghp_FIXTUREPUBLISHTOKENAAAA1111" });
  const publishSealed = await sealer.seal({
    plaintext: publishPlaintext,
    key: activeKey,
    aad: buildPublishCredentialAad({ workspaceId: WORKSPACE, providerId: "github-pages", id: publishId }),
  });

  const sourceControlId = "cred-sourcecontrol-github";
  const sourceControlPlaintext = JSON.stringify({ providerId: "github", token: "ghs_FIXTURESOURCECONTROLBBBB2222" });
  const sourceControlSealed = await sealer.seal({
    plaintext: sourceControlPlaintext,
    key: activeKey,
    aad: buildSourceControlCredentialAad({ workspaceId: WORKSPACE, providerId: "github", id: sourceControlId }),
  });

  const gitlabId = "cred-sourcecontrol-gitlab";
  const gitlabPlaintext = JSON.stringify({ providerId: "gitlab", token: "glpat-FIXTUREGITLABTOKENCCCC3333" });
  const gitlabSealed = await sealer.seal({
    plaintext: gitlabPlaintext,
    key: activeKey,
    aad: buildSourceControlCredentialAad({ workspaceId: WORKSPACE, providerId: "gitlab", id: gitlabId }),
  });

  const seedDb = openContentDb(dbPath);
  seedDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  seedDb
    .insert(publishCredentialSets)
    .values({
      id: publishId,
      workspaceId: WORKSPACE,
      providerId: "github-pages",
      label: "default",
      sealedKeyId: publishSealed.keyId,
      sealedCiphertext: publishSealed.ciphertext,
      sealedNonce: publishSealed.nonce,
      sealedAlg: publishSealed.alg,
      isDefault: true,
      accountLabel: null,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run();
  seedDb
    .insert(sourceControlCredentialSets)
    .values([
      {
        id: sourceControlId,
        workspaceId: WORKSPACE,
        providerId: "github",
        label: "default",
        sealedKeyId: sourceControlSealed.keyId,
        sealedCiphertext: sourceControlSealed.ciphertext,
        sealedNonce: sourceControlSealed.nonce,
        sealedAlg: sourceControlSealed.alg,
        isDefault: true,
        accountLabel: "octocat",
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: gitlabId,
        workspaceId: WORKSPACE,
        providerId: "gitlab",
        label: "default",
        sealedKeyId: gitlabSealed.keyId,
        sealedCiphertext: gitlabSealed.ciphertext,
        sealedNonce: gitlabSealed.nonce,
        sealedAlg: gitlabSealed.alg,
        isDefault: true,
        accountLabel: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ])
    .run();
  seedDb.$client.close();
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;

  // --- Dry run: needs NO root key at all (this script's own header claims this explicitly) and
  // must write nothing. ---
  const dryRunOutput = runScript(dbPath, undefined);
  assert.match(dryRunOutput, /DRY RUN: 3 row\(s\) would be migrated, 0 already migrated, 3 total/);
  const afterDryRun = openContentDb(dbPath);
  assert.equal(afterDryRun.select().from(vendorCredentialSets).all().length, 0, "a dry run must never write");
  afterDryRun.$client.close();

  // --- Apply: now the real migration runs, decrypting under each row's OLD AAD and re-sealing under
  // the NEW one. ---
  const applyOutput = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(applyOutput, /RESTORE POINT CAPTURED/);
  assert.match(applyOutput, new RegExp(`MIGRATED: origin=publish workspace=${WORKSPACE} id=${publishId} vendor=github label='default' isDefault=true`));
  assert.match(
    applyOutput,
    new RegExp(`MIGRATED: origin=source-control workspace=${WORKSPACE} id=${sourceControlId} vendor=github label='default \\(Source Control\\)' isDefault=false`)
  );
  assert.match(applyOutput, new RegExp(`MIGRATED: origin=source-control workspace=${WORKSPACE} id=${gitlabId} vendor=gitlab label='default' isDefault=true`));

  const db = openContentDb(dbPath);
  const rows = db.select().from(vendorCredentialSets).all();
  assert.equal(rows.length, 3, "every source row must produce exactly one target row");

  const byId = new Map(rows.map((r) => [r.id, r]));
  const publishRow = byId.get(publishId)!;
  const sourceControlRow = byId.get(sourceControlId)!;
  const gitlabRow = byId.get(gitlabId)!;

  // --- Label collision + is_default disambiguation (the merge-specific behavior this script's own
  // header documents as the EXPECTED common case, not an edge case). ---
  assert.equal(publishRow.vendorId, "github");
  assert.equal(publishRow.label, "default");
  assert.equal(publishRow.isDefault, true, "the FIRST row processed for a group keeps its requested default");
  assert.equal(sourceControlRow.vendorId, "github");
  assert.equal(sourceControlRow.label, "default (Source Control)", "a colliding label must be disambiguated deterministically");
  assert.equal(sourceControlRow.isDefault, false, "a SECOND row for an already-defaulted group must be demoted, never coexist as a second default");
  assert.equal(gitlabRow.vendorId, "gitlab");
  assert.equal(gitlabRow.label, "default", "a non-colliding group's label passes through unchanged");
  assert.equal(gitlabRow.isDefault, true);

  // --- accountLabel carried through unchanged (never invented, never dropped). ---
  assert.equal(sourceControlRow.accountLabel, "octocat");
  assert.equal(publishRow.accountLabel, null);

  // --- token_tail: last 4 characters of the real decrypted token. ---
  assert.equal(publishRow.tokenTail, "1111");
  assert.equal(sourceControlRow.tokenTail, "2222");
  assert.equal(gitlabRow.tokenTail, "3333");

  // --- THE MANDATORY PROOF: seal OLD, migrate, open NEW. A fresh keyring/sealer pair (same
  // construction as production) must decrypt each new row's ciphertext under buildVendorCredentialAad
  // and recover the EXACT original plaintext this test sealed under the OLD AAD above. ---
  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const openKeyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const openSealer = new AesGcmSecretSealer(openKeyring);

  const reopenedPublish = await openSealer.open({
    sealed: { keyId: publishRow.sealedKeyId, ciphertext: publishRow.sealedCiphertext, nonce: publishRow.sealedNonce, alg: publishRow.sealedAlg },
    aad: buildVendorCredentialAad({ workspaceId: WORKSPACE, vendorId: "github", id: publishId }),
  });
  assert.equal(reopenedPublish, publishPlaintext, "the migrated row must open to the byte-identical original plaintext under the NEW AAD");

  const reopenedSourceControl = await openSealer.open({
    sealed: {
      keyId: sourceControlRow.sealedKeyId,
      ciphertext: sourceControlRow.sealedCiphertext,
      nonce: sourceControlRow.sealedNonce,
      alg: sourceControlRow.sealedAlg,
    },
    aad: buildVendorCredentialAad({ workspaceId: WORKSPACE, vendorId: "github", id: sourceControlId }),
  });
  assert.equal(reopenedSourceControl, sourceControlPlaintext);

  const reopenedGitlab = await openSealer.open({
    sealed: { keyId: gitlabRow.sealedKeyId, ciphertext: gitlabRow.sealedCiphertext, nonce: gitlabRow.sealedNonce, alg: gitlabRow.sealedAlg },
    aad: buildVendorCredentialAad({ workspaceId: WORKSPACE, vendorId: "gitlab", id: gitlabId }),
  });
  assert.equal(reopenedGitlab, gitlabPlaintext);

  // --- Negative half of the same proof: the AAD genuinely changed, not merely "happens to still
  // work" — opening the migrated row under its OLD table's AAD format must fail auth-tag
  // verification, not silently succeed. ---
  await assert.rejects(
    () =>
      openSealer.open({
        sealed: { keyId: publishRow.sealedKeyId, ciphertext: publishRow.sealedCiphertext, nonce: publishRow.sealedNonce, alg: publishRow.sealedAlg },
        aad: buildPublishCredentialAad({ workspaceId: WORKSPACE, providerId: "github-pages", id: publishId }),
      }),
    /Unsupported state|unable to authenticate|bad decrypt/i
  );

  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;
  db.$client.close();

  // --- Idempotency: a second --apply run over an already-migrated database must be a complete
  // no-op — no new rows, no restore point (nothing pending to back up for). ---
  const secondApplyOutput = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(secondApplyOutput, /Nothing to migrate/);
  assert.doesNotMatch(secondApplyOutput, /RESTORE POINT CAPTURED/);
  const afterSecondApply = openContentDb(dbPath);
  assert.equal(afterSecondApply.select().from(vendorCredentialSets).all().length, 3, "a second --apply run must not duplicate or alter anything");
  afterSecondApply.$client.close();

  // --- Old tables must be untouched — this script only ever reads them. ---
  const oldTablesStillIntact = openContentDb(dbPath);
  assert.equal(oldTablesStillIntact.select().from(publishCredentialSets).all().length, 1);
  assert.equal(oldTablesStillIntact.select().from(sourceControlCredentialSets).all().length, 2);
  oldTablesStillIntact.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-vendor-credentials: a corrupted source row aborts the run without losing rows written before it", async () => {
  const scratch = tmpDir("backfill-vendor-credentials-corrupt-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  // A GOOD row, processed first (publish rows are always processed before source-control rows —
  // this script's own documented, deterministic order) — this one must survive in
  // `vendor_credential_sets` even though the run as a whole fails on the row after it.
  const goodId = "cred-good";
  const goodSealed = await sealer.seal({
    plaintext: JSON.stringify({ providerId: "vercel", token: "vercel_FIXTURE_GOOD_TOKEN" }),
    key: activeKey,
    aad: buildPublishCredentialAad({ workspaceId: WORKSPACE, providerId: "vercel", id: goodId }),
  });

  // A row this test will corrupt after sealing it correctly — simulates a bit-flipped/tampered
  // ciphertext already sitting in the source table, independent of anything this script does.
  const corruptId = "cred-corrupt";
  const corruptSealed = await sealer.seal({
    plaintext: JSON.stringify({ providerId: "gitlab", token: "glpat-FIXTURE_TO_BE_CORRUPTED" }),
    key: activeKey,
    aad: buildSourceControlCredentialAad({ workspaceId: WORKSPACE, providerId: "gitlab", id: corruptId }),
  });
  const tamperedCiphertext = Buffer.from("this-is-not-the-real-ciphertext-and-will-fail-gcm-auth-tag-check").toString("base64");

  const seedDb = openContentDb(dbPath);
  seedDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  seedDb
    .insert(publishCredentialSets)
    .values({
      id: goodId,
      workspaceId: WORKSPACE,
      providerId: "vercel",
      label: "good",
      sealedKeyId: goodSealed.keyId,
      sealedCiphertext: goodSealed.ciphertext,
      sealedNonce: goodSealed.nonce,
      sealedAlg: goodSealed.alg,
      isDefault: true,
      accountLabel: null,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run();
  seedDb
    .insert(sourceControlCredentialSets)
    .values({
      id: corruptId,
      workspaceId: WORKSPACE,
      providerId: "gitlab",
      label: "corrupt",
      sealedKeyId: corruptSealed.keyId,
      sealedCiphertext: tamperedCiphertext,
      sealedNonce: corruptSealed.nonce,
      sealedAlg: corruptSealed.alg,
      isDefault: true,
      accountLabel: null,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run();
  seedDb.$client.close();
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;

  assert.throws(() => runScript(dbPath, rootKeyHex, ["--apply"]), /Command failed/);

  const db = openContentDb(dbPath);
  const rows = db.select().from(vendorCredentialSets).all();
  assert.equal(rows.length, 1, "the row processed before the corrupt one must survive — this script never rolls back prior successful inserts");
  assert.equal(rows[0]!.id, goodId);
  db.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});
