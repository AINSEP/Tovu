import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { openContentDbReadOnly, openSqliteContentConnection } from "../content-db.js";
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
