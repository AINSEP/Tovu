import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import { sql } from "kysely";

import { openPgliteKernel } from "#src/platform/db/kernel/drivers/pglite";
import { OWNER_LOCK_FILE } from "#src/platform/db/kernel/drivers/pglite-owner";
import { findSiteKeyDependentData } from "../../site-key-dependent-data.js";

/**
 * @file `findSiteKeyDependentData` (`platform/site-dir/site-key-dependent-data.ts`) against SQLite
 * and PGlite site folders — the per-site scan on every storage kind (ADR-067). A PGlite or Postgres
 * site has no content.db; before this, the boot scan read only content.db and so saw "no data" on
 * those sites. The live-Postgres cases are in `site-key-dependent-data.postgres.test.ts`.
 */

function buildSealedCiphertextDb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE publish_credential_sets (id INTEGER PRIMARY KEY, sealed_ciphertext TEXT)");
    db.exec("INSERT INTO publish_credential_sets (sealed_ciphertext) VALUES ('cipher-bytes')");
  } finally {
    db.close();
  }
}


function siteWithMeta(t: import("node:test").TestContext, meta?: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-data-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (meta !== undefined) writeFileSync(join(dir, ".site-meta.json"), typeof meta === "string" ? meta : JSON.stringify(meta));
  return dir;
}

async function seedPgliteRow(dataDir: string): Promise<void> {
  const kernel = openPgliteKernel<unknown>({ dataDir });
  try {
    await kernel.execute(sql`CREATE TABLE webhook_subscriptions (id serial PRIMARY KEY)`);
    await kernel.execute(sql`INSERT INTO webhook_subscriptions DEFAULT VALUES`);
  } finally {
    await kernel.close();
  }
}

test("findSiteKeyDependentData: SQLite site — content.db with sealed rows is data; no content.db is not", async (t) => {
  const empty = siteWithMeta(t);
  assert.equal(await findSiteKeyDependentData(empty), false);
  const withData = siteWithMeta(t, { storage: { kind: "sqlite" } });
  buildSealedCiphertextDb(join(withData, "content.db"));
  assert.equal(await findSiteKeyDependentData(withData), true);
});

test("findSiteKeyDependentData: a .storage-secret.json is key-dependent data on its own", async (t) => {
  const dir = siteWithMeta(t, { storage: { kind: "postgres", secretRef: "site" } });
  writeFileSync(join(dir, ".storage-secret.json"), "{}");
  assert.equal(await findSiteKeyDependentData(dir), true);
});

test("findSiteKeyDependentData: an unparseable .site-meta.json fails closed", async (t) => {
  assert.equal(await findSiteKeyDependentData(siteWithMeta(t, "{not json")), true);
});

test("findSiteKeyDependentData: PGlite site — no data dir yet is no data, and nothing is created", async (t) => {
  const dir = siteWithMeta(t, { storage: { kind: "pglite" } });
  assert.equal(await findSiteKeyDependentData(dir), false);
  assert.equal(existsSync(join(dir, "pglite")), false);
});

test("findSiteKeyDependentData: PGlite site — sealed rows in pglite/ count; an empty database does not; the owner lock is released", async (t) => {
  const withData = siteWithMeta(t, { storage: { kind: "pglite" } });
  await seedPgliteRow(join(withData, "pglite"));
  assert.equal(await findSiteKeyDependentData(withData), true);
  assert.equal(existsSync(join(withData, "pglite", OWNER_LOCK_FILE)), false, "the scan releases the owner lock");

  const clean = siteWithMeta(t, { storage: { kind: "pglite" } });
  const kernel = openPgliteKernel<unknown>({ dataDir: join(clean, "pglite") });
  await kernel.execute(sql`CREATE TABLE webhook_subscriptions (id serial PRIMARY KEY)`);
  await kernel.close();
  assert.equal(await findSiteKeyDependentData(clean), false);
});

test("findSiteKeyDependentData: PGlite site owned by another live process fails closed without opening it", async (t) => {
  const dir = siteWithMeta(t, { storage: { kind: "pglite" } });
  const dataDir = join(dir, "pglite");
  const kernel = openPgliteKernel<unknown>({ dataDir });
  await kernel.execute(sql`SELECT 1`);
  await kernel.close();
  // A live owner: this test process's own pid in the lock file.
  writeFileSync(join(dataDir, OWNER_LOCK_FILE), String(process.pid));
  assert.equal(await findSiteKeyDependentData(dir), true);
  assert.equal(readFileSync(join(dataDir, OWNER_LOCK_FILE), "utf8"), String(process.pid), "another owner's lock is left alone");
});

test("findSiteKeyDependentData: Postgres site — sealed secretRef without its file, or an unset env variable, fails closed", async (t) => {
  assert.equal(await findSiteKeyDependentData(siteWithMeta(t, { storage: { kind: "postgres", secretRef: "site" } })), true);
  const dir = siteWithMeta(t, { storage: { kind: "postgres", secretRef: { env: "TOVU_TEST_UNSET_PG_URL" } } });
  assert.equal(await findSiteKeyDependentData(dir, { env: {} }), true);
});
