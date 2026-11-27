import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrateSqliteContentFile, openContentDb, openContentDbReadOnly, openSqliteContentConnection } from "../content-db.js";
import { openChatDb, openSiteChatDb } from "../chat-db.js";
import { openRoutinesDb } from "../routines-db.js";
import { testCopyPorts } from "./helpers/copy-ports.js";

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
  const db = openSqliteContentConnection({ filePath: ":memory:" });
  try {
    const report = await migrateSqliteContentFile({ db, filePath: ":memory:", ...testCopyPorts({ filePath: ":memory:" }) });
    assert.ok(report.applied.length > 0);
    assert.notEqual(db.$client.prepare("SELECT name FROM sqlite_master WHERE name = 'posts'").get(), undefined);
    assert.deepEqual((await migrateSqliteContentFile({ db, filePath: ":memory:", ...testCopyPorts({ filePath: ":memory:" }) })).applied, [], "a database at head is left untouched");
  } finally { db.$client.close(); }
});

test("the routines sidecar uses WAL, waits on writers, and enforces its run foreign keys", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "routines-opener-"));
  const filePath = path.join(dir, "routines.db");
  const handle = new Database(filePath);
  t.after(() => {
    if (handle.open) handle.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  handle.pragma("foreign_keys = OFF");
  handle.pragma("busy_timeout = 17");

  const db = openRoutinesDb({ filePath, openSqlite: requested => {
    assert.equal(requested, filePath);
    return handle;
  } });
  assert.equal(db, handle);
  assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
  assert.equal(db.pragma("busy_timeout", { simple: true }), 5000);
  db.exec("CREATE TABLE routines (id TEXT PRIMARY KEY); CREATE TABLE runs (routine_id TEXT REFERENCES routines(id));");
  assert.throws(() => db.prepare("INSERT INTO runs VALUES (?)").run("missing"), {
    code: "SQLITE_CONSTRAINT_FOREIGNKEY",
    message: "FOREIGN KEY constraint failed",
  });
  db.prepare("INSERT INTO routines VALUES (?)").run("daily");
  db.prepare("INSERT INTO runs VALUES (?)").run("daily");
  assert.deepEqual(handle.prepare("SELECT routine_id FROM runs").all(), [{ routine_id: "daily" }]);
});

test("a half-configured routines handle closes before the setup error reaches the caller", t => {
  const handle = new Database(":memory:");
  t.after(() => { if (handle.open) handle.close(); });
  const failure = new Error("could not set the routines busy timeout");
  const nativePragma = handle.pragma.bind(handle);
  t.mock.method(handle, "pragma", (source: string) => {
    if (source === "journal_mode = WAL") return nativePragma(source);
    if (source === "busy_timeout = 5000") throw failure;
    throw new Error(`unexpected pragma ${source}`);
  });

  assert.throws(() => openRoutinesDb({ filePath: ":memory:", openSqlite: requested => {
    assert.equal(requested, ":memory:");
    return handle;
  } }), (error: unknown) => error === failure);
  assert.equal(handle.open, false);
});
