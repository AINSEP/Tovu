import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { openContentDb } from "../../../apps/website/src/platform/db/sqlite/content-db.js";
import { adminExecutionCredentials, principals, workspaces } from "../../../apps/website/src/platform/db/schema.js";
import * as schema from "../../../apps/website/src/platform/db/schema.js";
import { AesGcmSecretSealer } from "../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../../apps/website/src/features/webhooks/keyring.env.js";
import { buildExecutionCredentialAad } from "../../../apps/website/src/assistant/execution-credential-aad.js";

/**
 * @file The mandatory proof for `backfill-execution-credential-aad.ts`: seal a row the OLD way (no
 * aad), run the migration, then successfully OPEN it the NEW way — same discipline as
 * `backfill-media-provider-credential-aad.test.ts`.
 *
 * The second test below is this script's share of the fix for "the AAD backfill scripts still
 * mutate the database under `--dry-run`" (`openContentDb` unconditionally runs pending migrations
 * and writes the bootstrap watermark row before any caller's own dry-run check ever runs — see
 * `content-db.ts`'s `openContentDbReadOnly` doc, and its own dedicated test file
 * `content-db-readonly.unit.test.ts` for the general-purpose proof). This file adds one end-to-end
 * proof through the real CLI, on a database sitting one migration behind — the ordinary state of any
 * `content.db` between "a new migration file lands" and "the server restarts against this file".
 */

const REAL_MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../../apps/website/src/platform/db/drizzle");

/**
 * The repo's real migrations journal, read fresh on every call.
 *
 * Deliberately NOT a pinned `NEWEST_MIGRATION_TAG`/`NEWEST_MIGRATION_ADDS` pair. Such a constant is
 * stale the day the next migration lands, and its staleness surfaces as this file failing for a
 * reason that has nothing to do with what it verifies — which is exactly what happened between
 * `0058_keen_mauler` (pinned) and `0060_fast_human_cannonball` (actual). Nothing below names a
 * migration, a table, or a column: the fixture withholds "the last entry, whatever it is", and the
 * assertions are stated against the journal's own length and a whole-schema fingerprint instead.
 *
 * @complexity O(n) in journal size — one file read plus a parse.
 */
function readMigrationJournal(): { entries: Array<{ tag: string }> } {
  const journal = JSON.parse(fs.readFileSync(path.join(REAL_MIGRATIONS_DIR, "meta", "_journal.json"), "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  assert.ok(
    journal.entries.length >= 2,
    "this fixture withholds the newest migration, so the journal must carry at least two"
  );
  return journal;
}

/** Copies the real migrations folder minus its newest entry — the runtime migrator only reads
 *  `meta/_journal.json` plus the `.sql` file each entry names. */
function buildMigrationsDirMissingNewest(scratch: string): string {
  const dir = path.join(scratch, "migrations-partial");
  fs.mkdirSync(path.join(dir, "meta"), { recursive: true });
  const journal = readMigrationJournal();
  const trimmed = { ...journal, entries: journal.entries.slice(0, -1) };
  fs.writeFileSync(path.join(dir, "meta", "_journal.json"), JSON.stringify(trimmed));
  for (const entry of trimmed.entries) {
    fs.copyFileSync(path.join(REAL_MIGRATIONS_DIR, `${entry.tag}.sql`), path.join(dir, `${entry.tag}.sql`));
  }
  return dir;
}

/**
 * A stable hash over every object in the database's schema (`sqlite_master`'s `type`/`name`/`sql`).
 *
 * Replaces a "does table X still lack column Y" check keyed to whatever the newest migration
 * happened to add. This is both stronger — it catches ANY schema change a stray migration would
 * make, not one named column — and unable to go stale, since it names nothing.
 *
 * @complexity O(n) in schema object count.
 */
function schemaFingerprint(dbPath: string): string {
  const raw = new Database(dbPath, { readonly: true });
  try {
    const objects = raw.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all();
    return createHash("sha256").update(JSON.stringify(objects)).digest("hex");
  } finally {
    raw.close();
  }
}

function appliedMigrationCount(dbPath: string): number {
  const raw = new Database(dbPath, { readonly: true });
  try {
    return (raw.prepare("SELECT COUNT(*) as c FROM __drizzle_migrations").get() as { c: number }).c;
  } finally {
    raw.close();
  }
}

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

test("backfill-execution-credential-aad: --dry-run never applies a pending migration or advances the database", async () => {
  const scratch = tmpDir("backfill-execution-aad-dryrun-readonly-");
  const dbPath = path.join(scratch, "content.db");

  // Build a fixture DB migrated through every migration EXCEPT the newest one — the ordinary state
  // of a real `content.db` between "a new migration file lands in this repo" and "the server
  // restarts against this file". Seeded with real rows via the trimmed migrations set so this test
  // never depends on `openContentDb`'s own (full) migrations folder for setup.
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  const setupDb = drizzle(sqlite, { schema });
  migrate(setupDb, { migrationsFolder: buildMigrationsDirMissingNewest(scratch) });
  setupDb.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: NOW }).run();
  setupDb
    .insert(principals)
    .values({ id: ADMIN_A, workspaceId: WORKSPACE, kind: "user", displayName: "Admin A", status: "active", createdAt: NOW })
    .run();
  const rootKeyHex = randomBytes(32).toString("hex");
  process.env.TOVU_INTEGRATIONS_ROOT_KEY = rootKeyHex;
  const sealer = new AesGcmSecretSealer(new EnvOrFileKeyring({ allowFileFallback: false }));
  const activeKey = await new EnvOrFileKeyring({ allowFileFallback: false }).activeKey();
  const sealed = await sealer.seal({ plaintext: "FIXTURE_DRYRUN_KEY", key: activeKey }); // NO aad — legacy shape.
  setupDb
    .insert(adminExecutionCredentials)
    .values({
      workspaceId: WORKSPACE,
      principalId: ADMIN_A,
      protocol: "anthropic",
      providerId: "anthropic",
      baseUrl: null,
      model: null,
      maxTokens: null,
      sealedKeyId: sealed.keyId,
      sealedCiphertext: sealed.ciphertext,
      sealedNonce: sealed.nonce,
      sealedAlg: sealed.alg,
      masked: "••••KEY1",
      aadVersion: 0,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run();
  sqlite.close();
  delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;

  // --- Precondition: genuinely one migration behind. Stated against the journal's own length so it
  // stays true for every future migration, and so a `buildMigrationsDirMissingNewest` that silently
  // stopped withholding anything would fail here instead of making the proof below vacuous. ---
  const migrationsBefore = appliedMigrationCount(dbPath);
  assert.equal(
    migrationsBefore,
    readMigrationJournal().entries.length - 1,
    "fixture must sit exactly one migration behind the repo's journal"
  );
  const schemaBefore = schemaFingerprint(dbPath);
  const rowBefore = new Database(dbPath, { readonly: true })
    .prepare("SELECT * FROM admin_execution_credentials WHERE principal_id = ?")
    .get(ADMIN_A);

  // --- THE MANDATORY PROOF: a `--dry-run` invocation of the real CLI must not touch the schema or
  // any row content — read rows and compare, not a file hash (a WAL-mode db's SHA is not evidence
  // of anything). ---
  const dryRunOutput = runScript(dbPath, undefined);
  assert.match(dryRunOutput, /DRY RUN: 1 row\(s\) would be migrated, 1 total pending/);

  assert.equal(schemaFingerprint(dbPath), schemaBefore, "a --dry-run must never apply a pending migration");
  assert.equal(appliedMigrationCount(dbPath), migrationsBefore, "a --dry-run must never record a new migration as applied");
  const rowAfter = new Database(dbPath, { readonly: true })
    .prepare("SELECT * FROM admin_execution_credentials WHERE principal_id = ?")
    .get(ADMIN_A);
  assert.deepEqual(rowAfter, rowBefore, "a --dry-run must leave every row's content byte-for-byte unchanged");

  fs.rmSync(scratch, { recursive: true, force: true });
});
