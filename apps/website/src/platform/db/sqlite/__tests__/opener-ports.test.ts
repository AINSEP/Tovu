import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { migrateSqliteContentFile, openContentDb, openContentDbReadOnly, openSqliteContentConnection } from "../content-db.js";
import { openChatDb, openSiteChatDb } from "../chat-db.js";

// hwb: a host opener may map its requested file to an owned handle; no hidden native open is permitted.
test("content and both chat boot paths honor the host opener and preserve pragmas/schema", async () => {
  const calls: unknown[] = [];
  const handles: Database.Database[] = [];
  const open = (file: string, options: Database.Options) => { calls.push({ file, options }); const db = new Database(":memory:"); handles.push(db); return db; };
  const content = openSqliteContentConnection({ filePath: "/host/content" }, { open });
  const readOnly = openContentDbReadOnly({ filePath: "/host/readonly" }, { open });
  const chat = openChatDb({ filePath: "/host/chat" }, { open });
  const siteChat = await openSiteChatDb({ filePath: "/host/site-chat" }, { open });
  try {
    assert.deepEqual(calls, [{ file: "/host/content", options: {} }, { file: "/host/readonly", options: { readonly: true, fileMustExist: true } }, { file: "/host/chat", options: {} }, { file: "/host/site-chat", options: {} }]);
    assert.equal(content.$client, handles[0]); assert.equal(readOnly.$client, handles[1]);
    assert.equal(chat, handles[2]); assert.equal(siteChat, handles[3]);
    assert.equal(content.$client.pragma("foreign_keys", { simple: true }), 1);
    assert.equal(chat.pragma("busy_timeout", { simple: true }), 5000);
    assert.equal(siteChat.prepare("SELECT name FROM sqlite_master WHERE name = 'ai_chat_messages'").get() !== undefined, true);
  } finally { for (const handle of handles) handle.close(); }
});

test("openContentDb closes the host's handle and rethrows when an existing file cannot be migrated", () => {
  const handles: Database.Database[] = [];
  // A non-empty file without drizzle history: the frozen chain's first CREATE TABLE collides.
  const open = () => { const db = new Database(":memory:"); db.exec("CREATE TABLE posts (id TEXT PRIMARY KEY)"); handles.push(db); return db; };
  assert.throws(() => openContentDb({ filePath: "/host/conflicting" }, { open }), /Failed to run the query .CREATE TABLE `posts`/);
  assert.equal(handles.length, 1);
  assert.equal(handles[0]!.open, false, "a failed open must not leak the connection");
});

test("migrating an in-memory content database applies the chain without taking a file copy", async () => {
  const db = openSqliteContentConnection(":memory:");
  try {
    const report = await migrateSqliteContentFile(db, ":memory:");
    assert.ok(report.applied.length > 0);
    assert.notEqual(db.$client.prepare("SELECT name FROM sqlite_master WHERE name = 'posts'").get(), undefined);
    assert.deepEqual((await migrateSqliteContentFile(db, ":memory:")).applied, [], "a database at head is left untouched");
  } finally { db.$client.close(); }
});
