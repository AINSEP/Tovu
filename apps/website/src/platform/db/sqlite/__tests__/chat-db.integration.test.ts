import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { openChatDb } from "../chat-db.js";

/**
 * @file Integration tests for the sidecar `chat.db` bootstrap, against a real temp-file SQLite
 * database (mirrors `database-journal.integration.test.ts`'s pattern: a real `better-sqlite3`
 * file, not a fake). Asserts on real database state (`sqlite_master`, row contents, FK cascade
 * behavior) rather than log output, per this task's own instruction — a test that only checks
 * "no error thrown" would pass even if `openChatDb` created zero tables.
 */

function openTempChatDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-db-"));
  const filePath = path.join(tmpDir, "chat.db");
  const db = openChatDb(filePath);
  return { db, filePath, tmpDir };
}

function tableNames(db: Database.Database): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name);
}

test("openChatDb creates all three chat tables (ai_chats, ai_chat_messages, assistant_agent_sessions)", () => {
  const { db, tmpDir } = openTempChatDb();
  try {
    const names = tableNames(db);
    assert.ok(names.includes("ai_chats"), "ai_chats must exist");
    assert.ok(names.includes("ai_chat_messages"), "ai_chat_messages must exist");
    assert.ok(names.includes("assistant_agent_sessions"), "assistant_agent_sessions must exist");
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("openChatDb: foreign_keys pragma is ON, so deleting a conversation cascades to its messages and agent sessions", () => {
  const { db, tmpDir } = openTempChatDb();
  try {
    db.prepare(
      `INSERT INTO ai_chats (id, scope_id, owner_kind, owner_id, created_at, updated_at)
       VALUES ('conv-1', 'ws-1', 'user', 'user-1', 1, 1)`
    ).run();
    db.prepare(
      `INSERT INTO ai_chat_messages (id, conversation_id, role, content, position, created_at)
       VALUES ('msg-1', 'conv-1', 'user', 'hello', 0, 1)`
    ).run();
    db.prepare(
      `INSERT INTO assistant_agent_sessions (conversation_id, agent_id, session_id, updated_at)
       VALUES ('conv-1', 'agent-1', 'session-1', 1)`
    ).run();

    db.prepare(`DELETE FROM ai_chats WHERE id = 'conv-1'`).run();

    const remainingMessages = db.prepare(`SELECT count(*) AS n FROM ai_chat_messages`).get() as { n: number };
    const remainingSessions = db.prepare(`SELECT count(*) AS n FROM assistant_agent_sessions`).get() as { n: number };
    assert.equal(remainingMessages.n, 0, "ai_chat_messages must cascade-delete with its parent conversation");
    assert.equal(remainingSessions.n, 0, "assistant_agent_sessions must cascade-delete with its parent conversation");
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("openChatDb is idempotent: reopening an already-initialized file preserves existing rows and does not error", () => {
  const { filePath, tmpDir } = openTempChatDb();
  try {
    const first = new Database(filePath);
    first.prepare(
      `INSERT INTO ai_chats (id, scope_id, owner_kind, owner_id, created_at, updated_at)
       VALUES ('conv-1', 'ws-1', 'user', 'user-1', 1, 1)`
    ).run();
    first.close();

    const second = openChatDb(filePath);
    const row = second.prepare(`SELECT id FROM ai_chats WHERE id = 'conv-1'`).get() as { id: string } | undefined;
    assert.equal(row?.id, "conv-1", "reopening must not drop or recreate an already-populated table");
    second.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("openChatDb: a fresh file starts with zero rows in every chat table", () => {
  const { db, tmpDir } = openTempChatDb();
  try {
    for (const tableName of ["ai_chats", "ai_chat_messages", "assistant_agent_sessions"]) {
      const row = db.prepare(`SELECT count(*) AS n FROM ${tableName}`).get() as { n: number };
      assert.equal(row.n, 0, `${tableName} must start empty`);
    }
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
