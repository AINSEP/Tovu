import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { customCredentialSets, workspaces } from "../../../apps/website/src/platform/db/schema.sqlite.js";
import { AesGcmSecretSealer } from "../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../../apps/website/src/features/webhooks/keyring.env.js";
import { buildCustomCredentialAad } from "../../../apps/website/src/features/custom-credentials/aad.js";
import { missingDbPathMessage } from "../backfill-db-path.js";

/**
 * @file The mandatory proof for `backfill-custom-credential-usernames.ts` (Pass 1 of the
 * `custom_credential_sets.username` two-pass migration — see that script's own header): seal a row
 * the OLD way (username only inside the sealed `{token, username?}` connection object, column left
 * NULL exactly as every pre-2026-09-01 row is), run the migration, then confirm the plaintext
 * `username` column now carries the SAME value the sealed payload has — WITHOUT the ciphertext
 * changing by even one byte. Modeled on `backfill-vendor-credentials.test.ts`'s own real-sealer,
 * real-subprocess approach (this file's own header), with one deliberate structural difference:
 * that test's second case proves an abort-on-first-failure script stops without losing prior writes;
 * this script's own dispatch requires the OPPOSITE behavior (continue past a single bad row so one
 * rotated/wrong master secret never blocks every other credential from migrating), so this file's
 * second case proves CONTINUATION instead of abort, and a third case proves the "no username" branch
 * is a no-op skip, not a failure.
 *
 * Runs the real script as a child process (`execFileSync`) for the same reason
 * `backfill-vendor-credentials.test.ts` gives for its own identical choice: `main()` runs
 * unconditionally at import time, so a child process is the only way to invoke it without also
 * inheriting this test runner's own argv/cwd.
 *
 * A throwaway, per-test random hex root key stands in for the real `TOVU_INTEGRATIONS_ROOT_KEY` —
 * this file never touches the real one. `EnvOrFileKeyring`/`AesGcmSecretSealer` are constructed the
 * exact same way `server/deps.ts`'s `siteAssistantSecretKeyring` is
 * (`new EnvOrFileKeyring({ allowFileFallback: false })`), so this test exercises the identical
 * key-derivation path production uses, not a stand-in double.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join("development", "scripts", "backfill-custom-credential-usernames.ts");
const NOW = "2026-09-01T00:00:00.000Z";
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

interface SeedCredentialInput {
  id: string;
  label: string;
  category: string;
  baseUrl: string;
  sealedCiphertext: string;
  sealedNonce: string;
  sealedKeyId: string;
  sealedAlg: string;
  username?: string | null;
}

test("backfill-custom-credential-usernames: populates the column from the sealed payload, leaves the ciphertext byte-identical, and is idempotent on re-run", async () => {
  const scratch = tmpDir("backfill-custom-credential-usernames-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  const credId = "cred-name-com";
  const plaintext = JSON.stringify({ token: "namecom_FIXTURE_TOKEN_AAAA1111", username: "owner@example.com" });
  const sealed = await sealer.seal({
    plaintext,
    key: activeKey,
    aad: buildCustomCredentialAad({ workspaceId: WORKSPACE, id: credId }),
  });

  const seedDb = openContentDb(dbPath);
  seedDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  seedDb
    .insert(customCredentialSets)
    .values({
      id: credId,
      workspaceId: WORKSPACE,
      label: "name.com",
      category: "general",
      baseUrl: "https://api.name.com",
      additionalHostsJson: null,
      username: null, // OLD-shape row: username lives only inside the sealed payload.
      sealedKeyId: sealed.keyId,
      sealedCiphertext: sealed.ciphertext,
      sealedNonce: sealed.nonce,
      sealedAlg: sealed.alg,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run();
  seedDb.$client.close();
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;

  // --- Dry run: decrypts this row (same as --apply, so its count is accurate — see the
  // "dry run's reported would-migrate count matches --apply's" test below for the case this
  // guards against) and so needs the root key, but must still write nothing. ---
  const dryRunOutput = runScript(dbPath, rootKeyHex);
  assert.match(dryRunOutput, /DRY RUN: 1 row\(s\) would be migrated, 0 would be skipped \(no username\), 0 would fail \(could not decrypt\), 0 already migrated, 1 total/);
  const afterDryRun = openContentDb(dbPath);
  const rowAfterDryRun = afterDryRun.select().from(customCredentialSets).all()[0]!;
  assert.equal(rowAfterDryRun.username, null, "a dry run must never write");
  assert.equal(rowAfterDryRun.sealedCiphertext, sealed.ciphertext, "a dry run must never touch the ciphertext");
  afterDryRun.$client.close();

  // --- Apply: decrypts under the row's own AAD and copies `username` onto the plaintext column. ---
  const applyOutput = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(applyOutput, /RESTORE POINT CAPTURED/);
  assert.match(applyOutput, new RegExp(`MIGRATED: workspace=${WORKSPACE} id=${credId}`));
  assert.match(applyOutput, /Done: 1 row\(s\) migrated, 0 already migrated, 0 skipped \(no username\), 0 failed, 1 total/);

  const db = openContentDb(dbPath);
  const row = db.select().from(customCredentialSets).all()[0]!;
  assert.equal(row.username, "owner@example.com", "the column must carry the exact value from the sealed payload");

  // --- THE MANDATORY PROOF: the ciphertext/nonce/key id/alg are byte-identical to what was sealed
  // before this script ever ran — this script must NEVER rewrite the ciphertext. ---
  assert.equal(row.sealedCiphertext, sealed.ciphertext, "sealed_ciphertext must be untouched");
  assert.equal(row.sealedNonce, sealed.nonce, "sealed_nonce must be untouched");
  assert.equal(row.sealedKeyId, sealed.keyId, "sealed_key_id must be untouched");
  assert.equal(row.sealedAlg, sealed.alg, "sealed_alg must be untouched");

  // The sealed payload must still open correctly under the SAME AAD as before (this script never
  // re-seals) — confirms the ciphertext claim above isn't just an unchanged-string coincidence.
  const reopened = await sealer.open({
    sealed: { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg },
    aad: buildCustomCredentialAad({ workspaceId: WORKSPACE, id: credId }),
  });
  assert.equal(reopened, plaintext);
  db.$client.close();

  // --- Idempotency: a re-run over an already-migrated database is a complete no-op — no restore
  // point (nothing pending), and the column/ciphertext are unchanged. ---
  const secondApplyOutput = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(secondApplyOutput, /Nothing to migrate/);
  assert.doesNotMatch(secondApplyOutput, /RESTORE POINT CAPTURED/);
  const afterSecondApply = openContentDb(dbPath);
  const rowAfterSecondApply = afterSecondApply.select().from(customCredentialSets).all()[0]!;
  assert.equal(rowAfterSecondApply.username, "owner@example.com");
  assert.equal(rowAfterSecondApply.sealedCiphertext, sealed.ciphertext);
  afterSecondApply.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-custom-credential-usernames: a row that fails to decrypt is skipped and counted, but its siblings still migrate — and the run exits non-zero", async () => {
  const scratch = tmpDir("backfill-custom-credential-usernames-corrupt-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  // A row this test will corrupt after sealing it correctly — simulates a bit-flipped/tampered
  // ciphertext (or one sealed under a rotated/unrelated root key) already sitting in the table,
  // independent of anything this script does.
  const corruptId = "cred-corrupt";
  const corruptSealed = await sealer.seal({
    plaintext: JSON.stringify({ token: "FIXTURE_TO_BE_CORRUPTED", username: "will-never-be-read" }),
    key: activeKey,
    aad: buildCustomCredentialAad({ workspaceId: WORKSPACE, id: corruptId }),
  });
  const tamperedCiphertext = Buffer.from("this-is-not-the-real-ciphertext-and-will-fail-gcm-auth-tag-check").toString("base64");

  // A GOOD row, alphabetically/insertion-ordered AFTER the corrupt one — must still migrate even
  // though the row before it in the scan failed. This is the one deliberate divergence from
  // `backfill-vendor-credentials.ts` (which aborts the whole run on its first decrypt failure): a
  // rotated or wrong master secret on ONE row must never block every other credential in the table.
  const goodId = "cred-good";
  const goodPlaintext = JSON.stringify({ token: "FIXTURE_GOOD_TOKEN", username: "good-owner" });
  const goodSealed = await sealer.seal({
    plaintext: goodPlaintext,
    key: activeKey,
    aad: buildCustomCredentialAad({ workspaceId: WORKSPACE, id: goodId }),
  });

  const seedDb = openContentDb(dbPath);
  seedDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  const seedRow = (input: SeedCredentialInput) =>
    seedDb
      .insert(customCredentialSets)
      .values({
        id: input.id,
        workspaceId: WORKSPACE,
        label: input.label,
        category: input.category,
        baseUrl: input.baseUrl,
        additionalHostsJson: null,
        username: input.username ?? null,
        sealedKeyId: input.sealedKeyId,
        sealedCiphertext: input.sealedCiphertext,
        sealedNonce: input.sealedNonce,
        sealedAlg: input.sealedAlg,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  seedRow({
    id: corruptId,
    label: "corrupt",
    category: "general",
    baseUrl: "https://api.example.com",
    sealedKeyId: corruptSealed.keyId,
    sealedCiphertext: tamperedCiphertext,
    sealedNonce: corruptSealed.nonce,
    sealedAlg: corruptSealed.alg,
  });
  seedRow({
    id: goodId,
    label: "good",
    category: "general",
    baseUrl: "https://api.good.example.com",
    sealedKeyId: goodSealed.keyId,
    sealedCiphertext: goodSealed.ciphertext,
    sealedNonce: goodSealed.nonce,
    sealedAlg: goodSealed.alg,
  });
  seedDb.$client.close();
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;

  let threw = false;
  try {
    runScript(dbPath, rootKeyHex, ["--apply"]);
  } catch (err) {
    threw = true;
    const output = `${(err as { stdout?: string }).stdout ?? ""}`;
    assert.match(output, new RegExp(`FAILED \\(could not decrypt\\): workspace=${WORKSPACE} id=${corruptId}`));
    assert.match(output, new RegExp(`MIGRATED: workspace=${WORKSPACE} id=${goodId}`));
    assert.match(output, /Done: 1 row\(s\) migrated, 0 already migrated, 0 skipped \(no username\), 1 failed, 2 total/);
  }
  assert.equal(threw, true, "the process must exit non-zero when any row failed to decrypt");

  const db = openContentDb(dbPath);
  const rows = db.select().from(customCredentialSets).all();
  const byId = new Map(rows.map((r) => [r.id, r]));
  assert.equal(byId.get(goodId)!.username, "good-owner", "a sibling row must still migrate despite the corrupt row failing");
  assert.equal(byId.get(corruptId)!.username, null, "a row that fails to decrypt must be left with username still NULL, never guessed at");
  assert.equal(byId.get(corruptId)!.sealedCiphertext, tamperedCiphertext, "a failed row's (already-corrupt) ciphertext must still be left untouched, never rewritten");
  db.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-custom-credential-usernames: a sealed payload with no username is skipped, not treated as an error", async () => {
  const scratch = tmpDir("backfill-custom-credential-usernames-nousername-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  const credId = "cred-no-username";
  const plaintext = JSON.stringify({ token: "FIXTURE_TOKEN_NO_USERNAME" });
  const sealed = await sealer.seal({
    plaintext,
    key: activeKey,
    aad: buildCustomCredentialAad({ workspaceId: WORKSPACE, id: credId }),
  });

  // A companion row that DOES have a username to backfill — with `countPending` now
  // decrypt-aware (this file's own regression test below), a database containing ONLY
  // never-backfillable rows converges to "Nothing to migrate" before ever reaching the apply
  // loop, so this test needs a genuinely pending sibling to force the loop (and its
  // "SKIPPED (no username)" branch below) to actually run.
  const pendingId = "cred-pending-sibling";
  const pendingPlaintext = JSON.stringify({ token: "FIXTURE_TOKEN_WITH_USERNAME", username: "sibling-owner" });
  const pendingSealed = await sealer.seal({
    plaintext: pendingPlaintext,
    key: activeKey,
    aad: buildCustomCredentialAad({ workspaceId: WORKSPACE, id: pendingId }),
  });

  const seedDb = openContentDb(dbPath);
  seedDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  const seedRow = (input: SeedCredentialInput) =>
    seedDb
      .insert(customCredentialSets)
      .values({
        id: input.id,
        workspaceId: WORKSPACE,
        label: input.label,
        category: input.category,
        baseUrl: input.baseUrl,
        additionalHostsJson: null,
        username: input.username ?? null,
        sealedKeyId: input.sealedKeyId,
        sealedCiphertext: input.sealedCiphertext,
        sealedNonce: input.sealedNonce,
        sealedAlg: input.sealedAlg,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  seedRow({
    id: credId,
    label: "no-username-provider",
    category: "general",
    baseUrl: "https://api.example.com",
    sealedKeyId: sealed.keyId,
    sealedCiphertext: sealed.ciphertext,
    sealedNonce: sealed.nonce,
    sealedAlg: sealed.alg,
  });
  seedRow({
    id: pendingId,
    label: "pending-provider",
    category: "general",
    baseUrl: "https://api.example.com",
    sealedKeyId: pendingSealed.keyId,
    sealedCiphertext: pendingSealed.ciphertext,
    sealedNonce: pendingSealed.nonce,
    sealedAlg: pendingSealed.alg,
  });
  seedDb.$client.close();
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;

  const applyOutput = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(applyOutput, new RegExp(`SKIPPED \\(no username in sealed payload\\): workspace=${WORKSPACE} id=${credId}`));
  assert.match(applyOutput, new RegExp(`MIGRATED: workspace=${WORKSPACE} id=${pendingId}`));
  assert.match(applyOutput, /Done: 1 row\(s\) migrated, 0 already migrated, 1 skipped \(no username\), 0 failed, 2 total/);

  const db = openContentDb(dbPath);
  const byId = new Map(db.select().from(customCredentialSets).all().map((r) => [r.id, r]));
  assert.equal(byId.get(credId)!.username, null, "no username to backfill — the column must stay NULL, not an empty string or anything invented");
  assert.equal(byId.get(credId)!.sealedCiphertext, sealed.ciphertext);
  assert.equal(byId.get(pendingId)!.username, "sibling-owner");
  db.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-custom-credential-usernames: a database whose ONLY NULL row is undecryptable is reported as FAILED, never as \"Nothing to migrate\"", async () => {
  const scratch = tmpDir("backfill-custom-credential-usernames-only-corrupt-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  // A row this test corrupts after sealing it correctly, same fixture shape as the
  // "skipped and counted, but its siblings still migrate" test above — but here there is no
  // pending sibling. Pre-fix, `countPending` silently drops this row from its count (its own
  // `catch { continue; }`), `pending` comes back 0, and `main()` prints "Nothing to migrate" and
  // returns with exit 0 BEFORE the per-row apply loop (the only place that used to log a FAILED
  // line) ever runs — an undecryptable row is invisible forever and the operator is told
  // everything is fine.
  const corruptId = "cred-only-corrupt";
  const corruptSealed = await sealer.seal({
    plaintext: JSON.stringify({ token: "FIXTURE_TO_BE_CORRUPTED", username: "will-never-be-read" }),
    key: activeKey,
    aad: buildCustomCredentialAad({ workspaceId: WORKSPACE, id: corruptId }),
  });
  const tamperedCiphertext = Buffer.from("this-is-not-the-real-ciphertext-and-will-fail-gcm-auth-tag-check").toString("base64");

  const seedDb = openContentDb(dbPath);
  seedDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  seedDb
    .insert(customCredentialSets)
    .values({
      id: corruptId,
      workspaceId: WORKSPACE,
      label: "only-corrupt",
      category: "general",
      baseUrl: "https://api.example.com",
      additionalHostsJson: null,
      username: null,
      sealedKeyId: corruptSealed.keyId,
      sealedCiphertext: tamperedCiphertext,
      sealedNonce: corruptSealed.nonce,
      sealedAlg: corruptSealed.alg,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run();
  seedDb.$client.close();
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;

  let threw = false;
  let output = "";
  try {
    output = runScript(dbPath, rootKeyHex, ["--apply"]);
  } catch (err) {
    threw = true;
    output = `${(err as { stdout?: string }).stdout ?? ""}`;
  }

  assert.equal(threw, true, "a database whose only NULL row cannot be decrypted must exit non-zero, never report success");
  assert.doesNotMatch(output, /Nothing to migrate/, "an undecryptable row must never be reported as convergence/success");
  assert.match(output, new RegExp(`FAILED \\(could not decrypt\\): workspace=${WORKSPACE} id=${corruptId}`));
  assert.doesNotMatch(output, /RESTORE POINT CAPTURED/, "nothing here was ever going to be written, so no restore point should be captured");

  const db = openContentDb(dbPath);
  const row = db.select().from(customCredentialSets).all()[0]!;
  assert.equal(row.username, null, "an undecryptable row must never have a guessed value written");
  assert.equal(row.sealedCiphertext, tamperedCiphertext, "an undecryptable row's ciphertext must remain untouched");
  db.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-custom-credential-usernames: dry run's reported would-migrate count matches --apply's real pending count on a token-only-only database", async () => {
  const scratch = tmpDir("backfill-custom-credential-usernames-dryrun-accuracy-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  // A database whose ONLY NULL-username row is token-only — legitimately has nothing to backfill,
  // ever (this file's header). The bug this test pins: pre-fix, the dry-run branch counted every
  // `username === null` row as "would be migrated" without decrypting to exclude this case, so it
  // reported "1 row(s) would be migrated" here while `--apply` (which does decrypt) correctly
  // reports "Nothing to migrate" on the exact same database -- a confusing, incorrect preview.
  const tokenOnlyId = "cred-token-only-dryrun-check";
  const tokenOnlySealed = await sealer.seal({
    plaintext: JSON.stringify({ token: "FIXTURE_TOKEN_ONLY_DRYRUN_CHECK" }),
    key: activeKey,
    aad: buildCustomCredentialAad({ workspaceId: WORKSPACE, id: tokenOnlyId }),
  });

  const seedDb = openContentDb(dbPath);
  seedDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  seedDb
    .insert(customCredentialSets)
    .values({
      id: tokenOnlyId,
      workspaceId: WORKSPACE,
      label: "token-only-provider",
      category: "general",
      baseUrl: "https://api.example.com",
      additionalHostsJson: null,
      username: null,
      sealedKeyId: tokenOnlySealed.keyId,
      sealedCiphertext: tokenOnlySealed.ciphertext,
      sealedNonce: tokenOnlySealed.nonce,
      sealedAlg: tokenOnlySealed.alg,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run();
  seedDb.$client.close();
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;

  // Dry run now decrypts to classify the row (same as --apply), so it needs the real root key.
  const dryRunOutput = runScript(dbPath, rootKeyHex, []);
  assert.match(
    dryRunOutput,
    /DRY RUN: 0 row\(s\) would be migrated,/,
    `dry run must not count a token-only row as "would be migrated". Got:\n${dryRunOutput}`
  );

  // THE MANDATORY PROOF: --apply against the SAME database must agree with the dry run above.
  const applyOutput = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(applyOutput, /Nothing to migrate/);
  assert.doesNotMatch(applyOutput, /RESTORE POINT CAPTURED/, "a token-only-only database has nothing to migrate");

  const afterApply = openContentDb(dbPath);
  const row = afterApply.select().from(customCredentialSets).all()[0]!;
  assert.equal(row.username, null, "a dry run must never write, and a token-only row is never backfilled");
  assert.equal(row.sealedCiphertext, tokenOnlySealed.ciphertext);
  afterApply.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-custom-credential-usernames: countPending converges to 0 with a token-only row present, instead of reporting outstanding work forever", async () => {
  const scratch = tmpDir("backfill-custom-credential-usernames-convergence-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  // A token-only credential — legitimately has no username and never will (this file's header on
  // `custom_credential_sets.username`, and `schema.sqlite.ts`'s own doc on that column). Its `username`
  // column stays NULL forever by design, no matter how many times this script re-runs.
  const tokenOnlyId = "cred-token-only";
  const tokenOnlySealed = await sealer.seal({
    plaintext: JSON.stringify({ token: "FIXTURE_TOKEN_ONLY_FOREVER" }),
    key: activeKey,
    aad: buildCustomCredentialAad({ workspaceId: WORKSPACE, id: tokenOnlyId }),
  });

  // A genuinely pending credential, so the first `--apply` invocation has real work to do.
  const pendingId = "cred-genuinely-pending";
  const pendingSealed = await sealer.seal({
    plaintext: JSON.stringify({ token: "FIXTURE_TOKEN_WITH_USERNAME", username: "real-owner" }),
    key: activeKey,
    aad: buildCustomCredentialAad({ workspaceId: WORKSPACE, id: pendingId }),
  });

  const seedDb = openContentDb(dbPath);
  seedDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  const seedRow = (input: SeedCredentialInput) =>
    seedDb
      .insert(customCredentialSets)
      .values({
        id: input.id,
        workspaceId: WORKSPACE,
        label: input.label,
        category: input.category,
        baseUrl: input.baseUrl,
        additionalHostsJson: null,
        username: input.username ?? null,
        sealedKeyId: input.sealedKeyId,
        sealedCiphertext: input.sealedCiphertext,
        sealedNonce: input.sealedNonce,
        sealedAlg: input.sealedAlg,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  seedRow({
    id: tokenOnlyId,
    label: "token-only-provider",
    category: "general",
    baseUrl: "https://api.example.com",
    sealedKeyId: tokenOnlySealed.keyId,
    sealedCiphertext: tokenOnlySealed.ciphertext,
    sealedNonce: tokenOnlySealed.nonce,
    sealedAlg: tokenOnlySealed.alg,
  });
  seedRow({
    id: pendingId,
    label: "pending-provider",
    category: "general",
    baseUrl: "https://api.example.com",
    sealedKeyId: pendingSealed.keyId,
    sealedCiphertext: pendingSealed.ciphertext,
    sealedNonce: pendingSealed.nonce,
    sealedAlg: pendingSealed.alg,
  });
  seedDb.$client.close();
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;

  // --- First apply: migrates the genuinely pending row, skips the token-only row (no username to
  // copy) — the token-only row's `username` column stays NULL, as it always will. ---
  const firstApply = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(firstApply, /RESTORE POINT CAPTURED/);
  assert.match(firstApply, new RegExp(`MIGRATED: workspace=${WORKSPACE} id=${pendingId}`));
  assert.match(firstApply, new RegExp(`SKIPPED \\(no username in sealed payload\\): workspace=${WORKSPACE} id=${tokenOnlyId}`));
  assert.match(firstApply, /Done: 1 row\(s\) migrated, 0 already migrated, 1 skipped \(no username\), 0 failed, 2 total/);

  // --- THE MANDATORY PROOF: a second `--apply` invocation, with the token-only row's `username`
  // STILL NULL, must report convergence — "Nothing to migrate" — not rediscover the token-only row
  // as outstanding work and capture yet another restore point. Pre-fix, `countPending` counted every
  // `username IS NULL` row as pending regardless of whether it could ever be backfilled, so this
  // second invocation would loop forever: same restore point capture, same "SKIPPED" line, on every
  // future run, even though nothing will ever change again. ---
  const secondApply = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(secondApply, /Nothing to migrate/);
  assert.doesNotMatch(secondApply, /RESTORE POINT CAPTURED/, "a token-only row must never be re-treated as pending work");
  assert.doesNotMatch(secondApply, /SKIPPED/, "the token-only row must not be re-decrypted/re-processed on a converged run");

  // --- A third invocation confirms this is a stable, converged state, not a one-off fluke. ---
  const thirdApply = runScript(dbPath, rootKeyHex, ["--apply"]);
  assert.match(thirdApply, /Nothing to migrate/);

  const db = openContentDb(dbPath);
  const byId = new Map(db.select().from(customCredentialSets).all().map((r) => [r.id, r]));
  assert.equal(byId.get(tokenOnlyId)!.username, null, "a token-only credential's username column stays NULL forever — by design, not by omission");
  assert.equal(byId.get(tokenOnlyId)!.sealedCiphertext, tokenOnlySealed.ciphertext);
  assert.equal(byId.get(pendingId)!.username, "real-owner");
  db.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-custom-credential-usernames: the FAILED-only summary line reports the database's real total row count, not just the unreadable count", async () => {
  const scratch = tmpDir("backfill-custom-credential-usernames-failed-total-");
  const dbPath = path.join(scratch, "content.db");
  const rootKeyHex = randomBytes(32).toString("hex");

  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const sealer = new AesGcmSecretSealer(keyring);
  const activeKey = await keyring.activeKey();

  // The ONLY NULL row, and it is undecryptable — same shape as the "only corrupt" test above, so
  // `pending === 0` and the apply loop below never runs.
  const corruptId = "cred-only-corrupt-with-sibling";
  const corruptSealed = await sealer.seal({
    plaintext: JSON.stringify({ token: "FIXTURE_TO_BE_CORRUPTED", username: "will-never-be-read" }),
    key: activeKey,
    aad: buildCustomCredentialAad({ workspaceId: WORKSPACE, id: corruptId }),
  });
  const tamperedCiphertext = Buffer.from("this-is-not-the-real-ciphertext-and-will-fail-gcm-auth-tag-check").toString("base64");

  // A SECOND row that is already migrated (`username` non-NULL) — excluded from both `pending` and
  // `unreadable` (countPending only ever looks at NULL rows), but it is still a real row in the
  // table. The bug this test pins: pre-fix, the "Done: ... total" line used `unreadable.length`
  // (1) instead of the table's actual row count (2), silently dropping this row from the total.
  const alreadyMigratedId = "cred-already-migrated-sibling";
  const alreadyMigratedSealed = await sealer.seal({
    plaintext: JSON.stringify({ token: "FIXTURE_ALREADY_MIGRATED" }),
    key: activeKey,
    aad: buildCustomCredentialAad({ workspaceId: WORKSPACE, id: alreadyMigratedId }),
  });

  const seedDb = openContentDb(dbPath);
  seedDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  const seedRow = (input: SeedCredentialInput) =>
    seedDb
      .insert(customCredentialSets)
      .values({
        id: input.id,
        workspaceId: WORKSPACE,
        label: input.label,
        category: input.category,
        baseUrl: input.baseUrl,
        additionalHostsJson: null,
        username: input.username ?? null,
        sealedKeyId: input.sealedKeyId,
        sealedCiphertext: input.sealedCiphertext,
        sealedNonce: input.sealedNonce,
        sealedAlg: input.sealedAlg,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  seedRow({
    id: corruptId,
    label: "only-corrupt-with-sibling",
    category: "general",
    baseUrl: "https://api.example.com",
    sealedKeyId: corruptSealed.keyId,
    sealedCiphertext: tamperedCiphertext,
    sealedNonce: corruptSealed.nonce,
    sealedAlg: corruptSealed.alg,
  });
  seedRow({
    id: alreadyMigratedId,
    label: "already-migrated-sibling",
    category: "general",
    baseUrl: "https://api.example.com",
    username: "already-migrated-owner",
    sealedKeyId: alreadyMigratedSealed.keyId,
    sealedCiphertext: alreadyMigratedSealed.ciphertext,
    sealedNonce: alreadyMigratedSealed.nonce,
    sealedAlg: alreadyMigratedSealed.alg,
  });
  seedDb.$client.close();
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;

  let output = "";
  try {
    output = runScript(dbPath, rootKeyHex, ["--apply"]);
  } catch (err) {
    output = `${(err as { stdout?: string }).stdout ?? ""}`;
  }

  assert.match(
    output,
    /Done: 0 row\(s\) migrated, 1 failed, 2 total\./,
    `expected the real 2-row table total, not just the 1 unreadable row. Got:\n${output}`
  );

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("backfill-custom-credential-usernames: a mistyped --db path fails loudly and creates nothing, instead of silently creating and migrating an empty database", () => {
  const scratch = tmpDir("backfill-custom-credential-usernames-missingdb-");
  const missing = path.join(scratch, "content.db"); // deliberately never created

  let threw = false;
  let stderr = "";
  try {
    runScript(missing, undefined, ["--apply"]);
  } catch (err) {
    threw = true;
    stderr = `${(err as { stderr?: string }).stderr ?? ""}`;
  }
  assert.equal(threw, true, "the script must fail rather than silently succeed against a missing db");
  assert.equal(stderr.includes(missingDbPathMessage(path.resolve(missing))), true, `expected the exact missing-db message. Got:\n${stderr}`);
  // The defect this guards: pre-fix, `--apply` against a mistyped path opened `openContentDb`
  // directly (creates-and-migrates on open), found zero rows in the brand-new empty database, and
  // printed "Nothing to migrate" — a false all-clear about data it never read.
  assert.doesNotMatch(stderr, /Nothing to migrate/, "must fail on the missing DATABASE, not report a false all-clear");
  assert.equal(fs.existsSync(missing), false, "the script must not have created a database at the missing path");

  fs.rmSync(scratch, { recursive: true, force: true });
});
