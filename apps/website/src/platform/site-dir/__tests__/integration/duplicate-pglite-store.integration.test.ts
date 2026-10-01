import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { sql } from "kysely";

import { openPgliteKernel } from "../../../db/kernel/drivers/pglite.js";
import { OWNER_LOCK_FILE } from "../../../db/kernel/drivers/pglite-owner.js";
import type { StorageKernel } from "../../../db/kernel/port.js";
import { duplicatePgliteStore } from "../../duplicate-pglite-store.js";
import { InternalError, ValidationError } from "../../errors.js";

function fixture(t: TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-duplicate-store-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

async function seedLedger(sourceDataDir: string, empty = false): Promise<void> {
  const source = openPgliteKernel<unknown>({ dataDir: sourceDataDir });
  try {
    await source.execute(sql`CREATE TABLE tovu_migrations (id text PRIMARY KEY)`);
    if (!empty) await source.execute(sql`INSERT INTO tovu_migrations VALUES ('fixture-migration')`);
  } finally {
    await source.close();
  }
}

async function read<T>(dataDir: string, body: (kernel: StorageKernel<unknown>) => Promise<T>): Promise<T> {
  const kernel = openPgliteKernel<unknown>({ dataDir });
  try { return await body(kernel); } finally { await kernel.close(); }
}

// F2.6/F4.5/F6.3: real WASM/Postgres and dump/restore; assert rows before fixture cleanup.
test("a cold copy purges every chat table, keeps both ledgers and content, and resets only legacy title pins", async (t) => {
  const root = fixture(t);
  const sourceDataDir = path.join(root, "source");
  const targetDataDir = path.join(root, "copy");
  await seedLedger(sourceDataDir);
  await read(sourceDataDir, async (db) => {
    await db.execute(sql`CREATE SCHEMA ai_chat`);
    await db.execute(sql`CREATE TABLE ai_chat.tovu_chat_migrations (id text PRIMARY KEY)`);
    await db.execute(sql`INSERT INTO ai_chat.tovu_chat_migrations VALUES ('chat-migration')`);
    await db.execute(sql`CREATE TABLE ai_chat.ai_chats (id text PRIMARY KEY)`);
    await db.execute(sql`INSERT INTO ai_chat.ai_chats VALUES ('chat-one')`);
    await db.execute(sql`CREATE TABLE ai_chat."odd messages" (id text PRIMARY KEY)`);
    await db.execute(sql`INSERT INTO ai_chat."odd messages" VALUES ('message-one')`);
    await db.execute(sql`CREATE TABLE posts (id text PRIMARY KEY, body text)`);
    await db.execute(sql`INSERT INTO posts VALUES ('post-one', 'content survives')`);
    await db.execute(sql`CREATE TABLE site_title_preexisting_workspaces (workspace_id text PRIMARY KEY)`);
    await db.execute(sql`INSERT INTO site_title_preexisting_workspaces VALUES ('legacy-workspace')`);
    await db.execute(sql`CREATE TABLE setting_definitions (setting_id text PRIMARY KEY, namespace text, key text)`);
    await db.execute(sql`INSERT INTO setting_definitions VALUES ('title', 'core.site', 'title'), ('other', 'core.site', 'description')`);
    await db.execute(sql`CREATE TABLE setting_values_workspace (workspace_id text, setting_id text, updated_by text, value text)`);
    await db.execute(sql`INSERT INTO setting_values_workspace VALUES
      ('legacy-workspace', 'title', 'system-settings-migration', 'Legacy title'),
      ('owner-workspace', 'title', 'owner', 'Owner title'),
      ('legacy-workspace', 'other', 'system-settings-migration', 'Description')`);
  });
  await duplicatePgliteStore({ sourceDataDir, targetDataDir });
  assert.equal(fs.existsSync(path.join(sourceDataDir, OWNER_LOCK_FILE)), false);
  await read(targetDataDir, async (db) => {
    assert.deepEqual(await db.query(sql`SELECT id, body FROM posts`), [{ id: "post-one", body: "content survives" }]);
    assert.deepEqual(await db.query(sql`SELECT id FROM tovu_migrations`), [{ id: "fixture-migration" }]);
    assert.deepEqual(await db.query(sql`SELECT id FROM ai_chat.tovu_chat_migrations`), [{ id: "chat-migration" }]);
    assert.deepEqual(await db.query(sql`SELECT id FROM ai_chat.ai_chats`), []);
    assert.deepEqual(await db.query(sql`SELECT id FROM ai_chat."odd messages"`), []);
    assert.deepEqual(await db.query(sql`SELECT workspace_id FROM site_title_preexisting_workspaces`), []);
    assert.deepEqual(await db.query(sql`SELECT workspace_id, setting_id, updated_by, value FROM setting_values_workspace ORDER BY setting_id`), [
      { workspace_id: "legacy-workspace", setting_id: "other", updated_by: "system-settings-migration", value: "Description" },
      { workspace_id: "owner-workspace", setting_id: "title", updated_by: "owner", value: "Owner title" },
    ]);
  });
  await read(sourceDataDir, async (db) => {
    assert.deepEqual(await db.query(sql`SELECT id FROM ai_chat.ai_chats`), [{ id: "chat-one" }]);
    assert.deepEqual(await db.query(sql`SELECT id FROM ai_chat."odd messages"`), [{ id: "message-one" }]);
    assert.deepEqual(await db.query(sql`SELECT workspace_id FROM site_title_preexisting_workspaces`), [{ workspace_id: "legacy-workspace" }]);
    assert.deepEqual(await db.query(sql`SELECT value FROM setting_values_workspace WHERE setting_id = 'title' AND updated_by = 'system-settings-migration'`), [{ value: "Legacy title" }]);
  });
});

test("a failed cold copy preserves an existing target, releases the source lock, and permits a later copy with no chat tables", async (t) => {
  const root = fixture(t);
  const sourceDataDir = path.join(root, "source");
  const taken = path.join(root, "taken");
  await seedLedger(sourceDataDir);
  fs.mkdirSync(taken);
  fs.writeFileSync(path.join(taken, "sentinel"), "keep this target");
  await assert.rejects(duplicatePgliteStore({ sourceDataDir, targetDataDir: taken }), {
    name: "InternalError", message: `duplicatePgliteStore: copying to ${taken} failed: storage op copyTo: ${taken} already exists`,
  });
  assert.deepEqual(fs.readdirSync(taken), ["sentinel"]);
  assert.equal(fs.readFileSync(path.join(taken, "sentinel"), "utf8"), "keep this target");
  assert.equal(fs.existsSync(path.join(sourceDataDir, OWNER_LOCK_FILE)), false);
  const targetDataDir = path.join(root, "retry");
  await duplicatePgliteStore({ sourceDataDir, targetDataDir });
  assert.deepEqual(await read(targetDataDir, (db) => db.query(sql`SELECT id FROM tovu_migrations`)), [{ id: "fixture-migration" }]);
});

test("final verification failure is wrapped as InternalError with the ledger diagnosis", async (t) => {
  const root = fixture(t);
  const sourceDataDir = path.join(root, "empty-ledger");
  const targetDataDir = path.join(root, "invalid-copy");
  await seedLedger(sourceDataDir, true);
  await assert.rejects(duplicatePgliteStore({ sourceDataDir, targetDataDir }), (error) => {
    assert.ok(error instanceof InternalError);
    assert.equal(error.message, "duplicatePgliteStore: the migration ledger tovu_migrations is empty after compacting");
    return true;
  });
  assert.equal(fs.existsSync(path.join(sourceDataDir, OWNER_LOCK_FILE)), false);
  assert.deepEqual(await read(targetDataDir, (db) => db.query(sql`SELECT id FROM tovu_migrations`)), []);
});

test("a locked source yields ValidationError and never creates a target or removes the other owner's lock", async (t) => {
  const root = fixture(t);
  const sourceDataDir = path.join(root, "locked");
  const targetDataDir = path.join(root, "never-written");
  fs.mkdirSync(sourceDataDir);
  const lock = path.join(sourceDataDir, OWNER_LOCK_FILE);
  fs.writeFileSync(lock, `${process.pid}\n`);
  await assert.rejects(duplicatePgliteStore({ sourceDataDir, targetDataDir }), (error) => {
    assert.ok(error instanceof ValidationError);
    assert.equal(error.message, `the site being duplicated is running (process ${process.pid}); stop it, or duplicate it from inside that site, then retry`);
    return true;
  });
  assert.equal(fs.existsSync(targetDataDir), false);
  assert.equal(fs.readFileSync(lock, "utf8"), `${process.pid}\n`);
});
