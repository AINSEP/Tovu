import { LEGACY_SITE_KEY_ENV_VAR_NAME } from "../../../apps/website/src/features/webhooks/site-key-sources.js";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

test("backfill-vendor-credentials: unknown legacy providers fail explicitly before dry-run success or writes", (t) => {
  const scratch = tmpDir("backfill-vendor-credentials-unknown-");
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  for (const origin of ["publish", "source-control"] as const) {
    for (const providerId of ["unknown-provider", "__proto__", "toString"]) {
      const dbPath = path.join(scratch, `${origin}-${providerId}.db`);
      const db = openContentDb(dbPath);
      db.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
      // Use raw persisted values: a corrupt/legacy row need not obey today's provider union.
      const table = origin === "publish" ? "publish_credential_sets" : "source_control_credential_sets";
      db.$client.prepare(`INSERT INTO ${table}
        (id, workspace_id, provider_id, label, sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run("unknown-row", WORKSPACE, providerId, "default", "key", "not-decryptable", "nonce", "aes-256-gcm", 1, NOW, NOW);
      db.$client.close();
      for (const extraArgs of [[], ["--apply"]]) {
        assert.throws(() => runScript(dbPath, undefined, extraArgs), (error: unknown) => {
          const failure = error as { status?: number; stderr?: string; stdout?: string };
          assert.equal(failure.status, 1);
          assert.ok(String(failure.stderr).includes(`unknown legacy provider '${providerId}' for origin=${origin} workspace=${WORKSPACE} id=unknown-row`));
          assert.doesNotMatch(String(failure.stdout), /vendor=undefined|DRY RUN: would migrate|MIGRATED:|RESTORE POINT CAPTURED/);
          return true;
        });
        const read = new Database(dbPath, { readonly: true });
        try {
          assert.equal((read.prepare("SELECT count(*) AS n FROM vendor_credential_sets").get() as { n: number }).n, 0);
          assert.equal((read.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n, 1, "the source row is retained for repair");
        } finally {
          read.close();
        }
      }
    }
  }
});

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { missingDbPathMessage } from "../backfill-db-path.js";
import { publishCredentialSets, sourceControlCredentialSets, vendorCredentialSets, workspaces } from "../../../apps/website/src/platform/db/schema.sqlite.js";
import { AesGcmSecretSealer } from "../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../../apps/website/src/features/webhooks/keyring.env.js";
import { buildPublishCredentialAad } from "../../../apps/website/src/features/deployments/publish-credentials/aad.js";
import { buildSourceControlCredentialAad } from "../../../apps/website/src/features/source-control/aad.js";
import { buildVendorCredentialAad } from "../../../apps/website/src/features/vendor-credentials/aad.js";

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
 * A throwaway, per-test random hex site key stands in for the real `TOVU_SITE_KEY` —
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

/** Counts real tables in a SQLite file via a fresh read-only connection — never through the
 *  content-db helpers under test, so this stays an independent witness of the file's actual state. */
function countTables(dbPath: string): number {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get() as { n: number };
    return row.n;
  } finally {
    db.close();
  }
}

function tableRows(dbPath: string, table: string): unknown[] {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try { return db.prepare(`SELECT * FROM ${table} ORDER BY id`).all(); }
  finally { db.close(); }
}

function runScript(dbPath: string, siteKeyHex: string | undefined, extraArgs: string[] = []): string {
  const env = { ...process.env, ...(siteKeyHex !== undefined ? { [LEGACY_SITE_KEY_ENV_VAR_NAME]: siteKeyHex } : {}) };
  if (siteKeyHex === undefined) delete env[LEGACY_SITE_KEY_ENV_VAR_NAME];
  return execFileSync("node", ["--import", "tsx", SCRIPT, "--db", dbPath, ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env,
  });
}

test("backfill-vendor-credentials: seals OLD, migrates, opens NEW — plus vendor-merge label/default disambiguation and idempotency", async () => {
  const scratch = tmpDir("backfill-vendor-credentials-");
  const dbPath = path.join(scratch, "content.db");
  const siteKeyHex = randomBytes(32).toString("hex");

  // --- Seed two OLD-format rows that will merge into the SAME "github" vendor group (this is the
  // real-world common case this script's own header documents: every existing row's label is the
  // hardcoded literal "default"), plus one that stays solo (gitlab, no collision). ---
  process.env[LEGACY_SITE_KEY_ENV_VAR_NAME] = siteKeyHex;
  const keyring = new EnvOrFileKeyring({ sources: [{ kind: "env" }] });
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
  delete process.env[LEGACY_SITE_KEY_ENV_VAR_NAME];
  const originalPublishRows = tableRows(dbPath, "publish_credential_sets");
  const originalSourceControlRows = tableRows(dbPath, "source_control_credential_sets");

  // --- Dry run: needs NO site key at all (this script's own header claims this explicitly) and
  // must write nothing. ---
  const dryRunOutput = runScript(dbPath, undefined);
  assert.match(dryRunOutput, /DRY RUN: 3 row\(s\) would be migrated, 0 already migrated, 3 total/);
  const afterDryRun = openContentDb(dbPath);
  assert.equal(afterDryRun.select().from(vendorCredentialSets).all().length, 0, "a dry run must never write");
  afterDryRun.$client.close();

  // --- Apply: now the real migration runs, decrypting under each row's OLD AAD and re-sealing under
  // the NEW one. ---
  const applyOutput = runScript(dbPath, siteKeyHex, ["--apply"]);
  assert.deepEqual(tableRows(dbPath, "publish_credential_sets"), originalPublishRows);
  assert.deepEqual(tableRows(dbPath, "source_control_credential_sets"), originalSourceControlRows);
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
  process.env[LEGACY_SITE_KEY_ENV_VAR_NAME] = siteKeyHex;
  const openKeyring = new EnvOrFileKeyring({ sources: [{ kind: "env" }] });
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

  delete process.env[LEGACY_SITE_KEY_ENV_VAR_NAME];
  db.$client.close();
  const targetRowsBeforeSecondApply = tableRows(dbPath, "vendor_credential_sets");

  // --- Idempotency: a second --apply run over an already-migrated database must be a complete
  // no-op — no new rows, no restore point (nothing pending to back up for). ---
  const secondApplyOutput = runScript(dbPath, siteKeyHex, ["--apply"]);
  assert.match(secondApplyOutput, /Nothing to migrate/);
  assert.doesNotMatch(secondApplyOutput, /RESTORE POINT CAPTURED/);
  const afterSecondApply = openContentDb(dbPath);
  assert.equal(afterSecondApply.select().from(vendorCredentialSets).all().length, 3, "a second --apply run must not duplicate or alter anything");
  afterSecondApply.$client.close();
  assert.deepEqual(tableRows(dbPath, "vendor_credential_sets"), targetRowsBeforeSecondApply, "a second apply must preserve all credential bytes and metadata");
  assert.deepEqual(tableRows(dbPath, "publish_credential_sets"), originalPublishRows);
  assert.deepEqual(tableRows(dbPath, "source_control_credential_sets"), originalSourceControlRows);

  // --- Old tables must be untouched — this script only ever reads them. ---
  const oldTablesStillIntact = openContentDb(dbPath);
  assert.equal(oldTablesStillIntact.select().from(publishCredentialSets).all().length, 1);
  assert.equal(oldTablesStillIntact.select().from(sourceControlCredentialSets).all().length, 2);
  oldTablesStillIntact.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-vendor-credentials: resumes a partial github group and migrates the S3 secretAccessKey", async (t) => {
  const scratch = tmpDir("backfill-vendor-resume-");
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const priorKey = process.env[LEGACY_SITE_KEY_ENV_VAR_NAME];
  t.after(() => { if (priorKey === undefined) delete process.env[LEGACY_SITE_KEY_ENV_VAR_NAME]; else process.env[LEGACY_SITE_KEY_ENV_VAR_NAME] = priorKey; });
  const siteKeyHex = randomBytes(32).toString("hex");
  process.env[LEGACY_SITE_KEY_ENV_VAR_NAME] = siteKeyHex;
  const keyring = new EnvOrFileKeyring({ sources: [{ kind: "env" }] });
  const sealer = new AesGcmSecretSealer(keyring);
  const key = await keyring.activeKey();
  const dbPath = path.join(scratch, "content.db");
  const db = openContentDb(dbPath);
  t.after(() => { if (db.$client.open) db.$client.close(); });
  db.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  const fixtures = [
    { id: "already-github", origin: "publish", providerId: "github-pages", vendorId: "github", plaintext: JSON.stringify({ providerId: "github-pages", token: "github-secret-1111" }), tail: "1111" },
    { id: "pending-github", origin: "source-control", providerId: "github", vendorId: "github", plaintext: JSON.stringify({ providerId: "github", token: "github-secret-2222" }), tail: "2222" },
    { id: "pending-s3", origin: "publish", providerId: "s3-compatible", vendorId: "s3-compatible", plaintext: JSON.stringify({ providerId: "s3-compatible", accessKeyId: "ACCESS-5678", secretAccessKey: "s3-secret-9876" }), tail: "9876" },
  ] as const;
  for (const fixture of fixtures) {
    const aad = fixture.origin === "publish"
      ? buildPublishCredentialAad({ workspaceId: WORKSPACE, providerId: fixture.providerId as "github-pages" | "s3-compatible", id: fixture.id })
      : buildSourceControlCredentialAad({ workspaceId: WORKSPACE, providerId: "github", id: fixture.id });
    const sealed = await sealer.seal({ plaintext: fixture.plaintext, key, aad });
    const row = { id: fixture.id, workspaceId: WORKSPACE, providerId: fixture.providerId, label: "default", sealedKeyId: sealed.keyId, sealedCiphertext: sealed.ciphertext, sealedNonce: sealed.nonce, sealedAlg: sealed.alg, isDefault: true, accountLabel: "account-preserved", createdAt: NOW, updatedAt: NOW };
    if (fixture.origin === "publish") db.insert(publishCredentialSets).values(row).run();
    else db.insert(sourceControlCredentialSets).values(row).run();
  }
  const existingSealed = await sealer.seal({ plaintext: fixtures[0].plaintext, key, aad: buildVendorCredentialAad({ workspaceId: WORKSPACE, vendorId: "github", id: fixtures[0].id }) });
  db.insert(vendorCredentialSets).values({ id: fixtures[0].id, workspaceId: WORKSPACE, vendorId: "github", label: "default", tokenTail: "1111", isDefault: true, accountLabel: "existing-account", createdAt: NOW, updatedAt: NOW, sealedKeyId: existingSealed.keyId, sealedCiphertext: existingSealed.ciphertext, sealedNonce: existingSealed.nonce, sealedAlg: existingSealed.alg }).run();
  db.$client.close();
  const existing = tableRows(dbPath, "vendor_credential_sets")[0];
  assert.match(runScript(dbPath, siteKeyHex), /2 row\(s\) would be migrated, 1 already migrated, 3 total/);
  assert.match(runScript(dbPath, siteKeyHex, ["--apply"]), /2 row\(s\) migrated, 1 already migrated, 3 total/);
  const raw = new Database(dbPath, { readonly: true });
  try {
    assert.deepEqual(raw.prepare("SELECT * FROM vendor_credential_sets WHERE id = ?").get(fixtures[0].id), existing);
    const rows = raw.prepare("SELECT * FROM vendor_credential_sets ORDER BY id").all() as Array<Record<string, any>>;
    assert.equal(rows.length, 3);
    for (const fixture of fixtures) {
      const row = rows.find((row) => row.id === fixture.id)!;
      assert.ok(row);
      assert.equal(row.token_tail, fixture.tail);
      assert.equal(await sealer.open({ sealed: { keyId: row.sealed_key_id, ciphertext: row.sealed_ciphertext, nonce: row.sealed_nonce, alg: row.sealed_alg }, aad: buildVendorCredentialAad({ workspaceId: WORKSPACE, vendorId: fixture.vendorId, id: fixture.id }) }), fixture.plaintext);
    }
    const resumed = rows.find((row) => row.id === "pending-github")!;
    assert.equal(resumed.label, "default (Source Control)");
    assert.equal(resumed.is_default, 0);
  } finally { raw.close(); }
});

test("backfill-vendor-credentials: a corrupted source row aborts the run without losing rows written before it", async () => {
  const scratch = tmpDir("backfill-vendor-credentials-corrupt-");
  const dbPath = path.join(scratch, "content.db");
  const siteKeyHex = randomBytes(32).toString("hex");

  process.env[LEGACY_SITE_KEY_ENV_VAR_NAME] = siteKeyHex;
  const keyring = new EnvOrFileKeyring({ sources: [{ kind: "env" }] });
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
  delete process.env[LEGACY_SITE_KEY_ENV_VAR_NAME];

  assert.throws(() => runScript(dbPath, siteKeyHex, ["--apply"]), /Command failed/);

  const db = openContentDb(dbPath);
  const rows = db.select().from(vendorCredentialSets).all();
  assert.equal(rows.length, 1, "the row processed before the corrupt one must survive — this script never rolls back prior successful inserts");
  assert.equal(rows[0]!.id, goodId);
  db.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-vendor-credentials: a dry run against a not-yet-migrated content.db must not migrate it — asserted on the actual file, not a log line", () => {
  const scratch = tmpDir("backfill-vendor-credentials-nomigrate-");
  const dbPath = path.join(scratch, "content.db");

  // A bare SQLite file with zero tables. Nothing has ever opened this through `openContentDb`, so if
  // the dry-run path calls it unconditionally (the defect), the ENTIRE schema gets created — not a
  // subtle diff, a jump from 0 tables to the full migrated set.
  new Database(dbPath).close();
  assert.equal(countTables(dbPath), 0, "fixture must start with zero tables");
  const bytesBefore = fs.readFileSync(dbPath);

  assert.throws(
    () => runScript(dbPath, undefined),
    (error: unknown) => {
      const failure = error as { status?: number; stderr?: string };
      assert.equal(failure.status, 1);
      assert.match(String(failure.stderr), /no such table: publish_credential_sets/);
      return true;
    },
    "a dry run against an unmigrated db must fail loudly (no such table), not silently succeed"
  );

  assert.equal(countTables(dbPath), 0, "dry run must not have created any tables — it must never call migrate()");
  assert.deepEqual(fs.readFileSync(dbPath), bytesBefore, "dry run must not modify the database file at all");

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-vendor-credentials: a mistyped --db path fails loudly and creates nothing, instead of silently opening an empty database", () => {
  const scratch = tmpDir("backfill-vendor-credentials-missingdb-");
  const missing = path.join(scratch, "content.db"); // deliberately never created

  let stderr = "";
  try {
    runScript(missing, undefined);
    assert.fail("expected the script to throw");
  } catch (err) {
    stderr = `${(err as { stderr?: string }).stderr ?? ""}`;
  }
  assert.equal(stderr.includes(missingDbPathMessage(path.resolve(missing))), true, `expected the exact missing-db message. Got:\n${stderr}`);
  // The defect this guards: a typo'd path used to open (and migrate) a brand-new empty db and report
  // a false "nothing to migrate" instead of the real problem — no such database.
  assert.doesNotMatch(stderr, /DRY RUN: 0 row/);
  assert.equal(fs.existsSync(missing), false, "the script must not have created a database at the missing path");

  fs.rmSync(scratch, { recursive: true, force: true });
});
