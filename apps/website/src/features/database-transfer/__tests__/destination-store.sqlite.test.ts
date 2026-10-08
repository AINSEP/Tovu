import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { DestinationUnreadableError, SealedDatabaseDestinationStore, type SavedDatabaseDestination } from "../destination-store.js";
import { DatabaseDestinationRepo } from "../destination-repo.js";

/**
 * @file The saved destination is persistent and sealed: a server restart (a new store over the same
 * content.db) still finds it, the stored row never holds the address or its password in the clear,
 * and a sealed address moved onto another workspace's row does not open (the AAD binds the workspace).
 */

const PASSWORD = "PW-SENTINEL-9d2e";
const ADDRESS = `postgresql://owner:${PASSWORD}@db.example.test:6543/postgres?sslmode=require`;
const DESTINATION: SavedDatabaseDestination = {
  connectionString: ADDRESS,
  description: { host: "db.example.test", port: "6543", database: "postgres", user: "owner" },
  savedAt: "2026-09-27T20:00:00.000Z",
};

function fixture(t: test.TestContext): { db: ContentDb; keyring: InMemoryKeyring; open: () => SealedDatabaseDestinationStore; reopen: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-destination-"));
  let db = openContentDb(path.join(dir, "content.db"));
  t.after(() => {
    db.$client.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const keyring = new InMemoryKeyring();
  // Every `open()` builds a fresh store and repo; `reopen()` also reopens the database file —
  // together, what a restart does.
  const reopen = () => {
    db.$client.close();
    db = openContentDb(path.join(dir, "content.db"));
  };
  const open = () => new SealedDatabaseDestinationStore({ repo: new DatabaseDestinationRepo(db), sealer: new AesGcmSecretSealer(keyring), keyring });
  return { get db() { return db; }, keyring, open, reopen };
}

test("a saved destination and its last run survive a restart", async (t) => {
  const { open, reopen } = fixture(t);
  await open().save("ws-1", DESTINATION);
  await open().recordRun("ws-1", { copied: true, snapshotAt: "2026-09-27T21:00:00.000Z", tableCount: 88, rowCount: 1234 });

  reopen();
  const restarted = open();
  assert.deepEqual(await restarted.get("ws-1"), { ...DESTINATION, tokenHint: { length: 81, last4: "uire" } });
  assert.deepEqual(await restarted.lastRun("ws-1"), { copied: true, snapshotAt: "2026-09-27T21:00:00.000Z", tableCount: 88, rowCount: 1234 });
  assert.equal(await restarted.get("ws-other"), null);
  assert.equal(await restarted.lastRun("ws-other"), null);
});

test("the address is sealed at rest: no stored column holds it or its password", async (t) => {
  const { db, open } = fixture(t);
  await open().save("ws-1", DESTINATION);
  const rows = db.$client.prepare("SELECT * FROM database_transfer_destinations").all() as Record<string, unknown>[];
  assert.equal(rows.length, 1);
  const stored = JSON.stringify(rows);
  assert.doesNotMatch(stored, new RegExp(PASSWORD));
  assert.doesNotMatch(stored, /postgresql:\/\//);
  assert.equal(rows[0]!.sealed_alg, "aes-256-gcm");
  assert.equal(rows[0]!.aad_version, 1);
  assert.deepEqual([rows[0]!.host, rows[0]!.port, rows[0]!.database_name, rows[0]!.user_name], ["db.example.test", "6543", "postgres", "owner"]);
});

test("saving again replaces the destination, and a new destination forgets the old one's last run", async (t) => {
  const { db, open } = fixture(t);
  const store = open();
  await store.save("ws-1", DESTINATION);
  await store.recordRun("ws-1", { copied: false, snapshotAt: "x", code: "COPY_FAILED", message: "m" });
  const next = { ...DESTINATION, connectionString: "postgresql://other@db2.example.test/app", description: { host: "db2.example.test", port: "5432", database: "app", user: "other" } };
  await store.save("ws-1", next);
  assert.deepEqual(await open().get("ws-1"), { ...next, tokenHint: { length: 39, last4: "/app" } });
  assert.equal(await open().lastRun("ws-1"), null);
  assert.equal(db.$client.prepare<[], { n: number }>("SELECT count(*) AS n FROM database_transfer_destinations").get()?.n, 1);
});

test("a sealed address copied onto another workspace's row does not open, and says to save it again", async (t) => {
  const { db, open } = fixture(t);
  await open().save("ws-1", DESTINATION);
  db.$client.prepare("INSERT INTO database_transfer_destinations SELECT 'ws-2', host, port, database_name, user_name, sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg, aad_version, saved_at, NULL FROM database_transfer_destinations WHERE workspace_id = 'ws-1'").run();
  await assert.rejects(open().get("ws-2"), (err: unknown) => {
    assert.ok(err instanceof DestinationUnreadableError);
    assert.equal(err.message, "the saved destination database could not be unlocked (the site's key may have changed); save it again with database_transfer_set_destination");
    return true;
  });
});

test("a destination sealed under another site key does not open", async (t) => {
  const { db } = fixture(t);
  const other = new InMemoryKeyring("v1");
  const repo = new DatabaseDestinationRepo(db);
  await new SealedDatabaseDestinationStore({ repo, sealer: new AesGcmSecretSealer(other), keyring: other }).save("ws-1", DESTINATION);
  const mine = new InMemoryKeyring("v1");
  await assert.rejects(new SealedDatabaseDestinationStore({ repo, sealer: new AesGcmSecretSealer(mine), keyring: mine }).get("ws-1"), DestinationUnreadableError);
});

test("an unsupported stored AAD version is refused before attempting decryption", async (t) => {
  const { db, open, keyring } = fixture(t);
  await open().save("ws-1", DESTINATION);
  db.$client.prepare("UPDATE database_transfer_destinations SET aad_version = 99 WHERE workspace_id = 'ws-1'").run();
  const realSealer = new AesGcmSecretSealer(keyring);
  let opens = 0;
  const store = new SealedDatabaseDestinationStore({ repo: new DatabaseDestinationRepo(db), keyring, sealer: {
    seal: input => realSealer.seal(input),
    open: (input, optional) => { opens += 1; return realSealer.open(input, optional); },
  } });
  await assert.rejects(store.get("ws-1"), (error: unknown) => {
    assert.ok(error instanceof DestinationUnreadableError);
    assert.equal(error.message, "the saved destination database could not be unlocked (the site's key may have changed); save it again with database_transfer_set_destination");
    return true;
  });
  assert.equal(opens, 0);
  const stored = db.$client.prepare("SELECT aad_version FROM database_transfer_destinations WHERE workspace_id = 'ws-1'").get() as { aad_version: number };
  assert.equal(stored.aad_version, 99);
});
