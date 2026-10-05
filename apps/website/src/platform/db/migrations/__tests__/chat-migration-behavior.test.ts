import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";

import type { StorageKernel } from "../../kernel/port.js";
import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import { chatBaseline } from "../chat/0000_chat_baseline.js";
import { sqliteChatTables } from "../chat/0001_sqlite_chat_tables.js";

const cases = [
  { name: "SQLite", prefix: "", open: () => openMemorySqliteKernel<unknown>(), step: sqliteChatTables("sqlite-literal") },
  { name: "PGlite", prefix: "ai_chat.", open: () => openPgliteKernel<unknown>(), step: chatBaseline("postgres-literal") },
] as const;

for (const fixture of cases) {
  // F4.4/F6.3: valid sibling fields ensure the named CHECK, FK or composite key is the sole failing guard.
  // Mutations: INTEGER for PG epoch times; omit defaults/CHECK/UNIQUE/CASCADE; shorten approval's key.
  test(`${fixture.name} chat migration preserves milliseconds, defaults, ownership constraints and child cascades`, async () => {
    const kernel: StorageKernel<unknown> = fixture.open();
    const t = (name: string) => sql.table(`${fixture.prefix}${name}`);
    const constraint = fixture.name === "SQLite" ? { code: "SQLITE_CONSTRAINT_CHECK" } : { code: "23514" };
    const unique = fixture.name === "SQLite" ? { code: "SQLITE_CONSTRAINT_UNIQUE" } : { code: "23505" };
    const foreignKey = fixture.name === "SQLite" ? { code: "SQLITE_CONSTRAINT_FOREIGNKEY" } : { code: "23503" };
    try {
      await fixture.step.up(kernel);
      const addChat = (id: string, owner: string, titleSource?: string) => kernel.execute(sql`
        INSERT INTO ${t("ai_chats")} (id, scope_id, owner_kind, owner_id, title, title_source, created_at, updated_at, expires_at)
        VALUES (${id}, 'workspace-a', ${owner}, 'owner-a', 'café chat', ${titleSource ?? "manual"}, 1790000000123, 1790000000456, 1790000000789)`);
      await addChat("parent", "user");
      await kernel.execute(sql`INSERT INTO ${t("ai_chats")} (id, scope_id, owner_kind, owner_id, created_at, updated_at)
        VALUES ('sibling', 'workspace-b', 'guest', 'owner-b', 1790000000999, 1790000000999)`);
      assert.deepEqual(await kernel.query(sql`SELECT id, scope_id, owner_kind, owner_id, title, title_source, created_at, updated_at, expires_at
        FROM ${t("ai_chats")} ORDER BY id`), [
        { id: "parent", scope_id: "workspace-a", owner_kind: "user", owner_id: "owner-a", title: "café chat", title_source: "manual", created_at: 1790000000123, updated_at: 1790000000456, expires_at: 1790000000789 },
        { id: "sibling", scope_id: "workspace-b", owner_kind: "guest", owner_id: "owner-b", title: null, title_source: "fallback", created_at: 1790000000999, updated_at: 1790000000999, expires_at: null },
      ]);
      await assert.rejects(addChat("invalid-owner", "robot"), constraint);
      await assert.rejects(addChat("invalid-title-source", "user", "automatic"), constraint);
      await addChat("generated", "guest", "generated");

      const message = (id: string, parent: string, role: string, position: number) => kernel.execute(sql`
        INSERT INTO ${t("ai_chat_messages")} (id, conversation_id, role, content, position, created_at, started_at, ended_at)
        VALUES (${id}, ${parent}, ${role}, 'stored message', ${position}, 1790000000123, 1790000000456, 1790000000789)`);
      await message("message-parent", "parent", "assistant", 7);
      await message("message-sibling", "sibling", "user", 7);
      assert.deepEqual(await kernel.query(sql`SELECT id, created_at, started_at, ended_at FROM ${t("ai_chat_messages")} WHERE id = 'message-parent'`),
        [{ id: "message-parent", created_at: 1790000000123, started_at: 1790000000456, ended_at: 1790000000789 }]);
      await assert.rejects(message("duplicate-position", "parent", "user", 7), unique);
      await assert.rejects(message("orphan-message", "missing", "user", 8), foreignKey);
      await assert.rejects(message("invalid-role", "parent", "system", 8), constraint);

      const session = (parent: string, agent: string) => kernel.execute(sql`INSERT INTO ${t("assistant_agent_sessions")}
        VALUES (${parent}, ${agent}, 'opaque-session', 1790000000123)`);
      await session("parent", "agent-a");
      await session("parent", "agent-b");
      await session("sibling", "agent-a");
      // SQLite reports PRIMARYKEY for the composite primary key, unlike UNIQUE position above.
      const primary = fixture.name === "SQLite" ? { code: "SQLITE_CONSTRAINT_PRIMARYKEY" } : { code: "23505" };
      await assert.rejects(session("parent", "agent-a"), primary);
      await assert.rejects(session("missing", "agent-a"), foreignKey);
      const approval = (parent: string, principal: string, connection: string, tool: string) => kernel.execute(sql`
        INSERT INTO ${t("assistant_conversation_tool_approvals")} VALUES (${parent}, ${principal}, ${connection}, ${tool}, 'fingerprint', '2026-10-04T00:00:00.000Z')`);
      await approval("parent", "principal-a", "connection-a", "read");
      await approval("parent", "principal-b", "connection-a", "read");
      await approval("parent", "principal-a", "connection-b", "read");
      await approval("parent", "principal-a", "connection-a", "write");
      await approval("sibling", "principal-a", "connection-a", "read");
      await assert.rejects(approval("parent", "principal-a", "connection-a", "read"), primary);
      await assert.rejects(approval("missing", "principal-a", "connection-a", "read"), foreignKey);
      assert.deepEqual(await kernel.query(sql`SELECT conversation_id, agent_id, session_id, updated_at FROM ${t("assistant_agent_sessions")}
        WHERE conversation_id = 'parent' ORDER BY agent_id`), [
        { conversation_id: "parent", agent_id: "agent-a", session_id: "opaque-session", updated_at: 1790000000123 },
        { conversation_id: "parent", agent_id: "agent-b", session_id: "opaque-session", updated_at: 1790000000123 },
      ]);
      assert.deepEqual(await kernel.query(sql`SELECT principal_id, connection_id, tool_name FROM ${t("assistant_conversation_tool_approvals")}
        WHERE conversation_id = 'parent' ORDER BY principal_id, connection_id, tool_name`), [
        { principal_id: "principal-a", connection_id: "connection-a", tool_name: "read" },
        { principal_id: "principal-a", connection_id: "connection-a", tool_name: "write" },
        { principal_id: "principal-a", connection_id: "connection-b", tool_name: "read" },
        { principal_id: "principal-b", connection_id: "connection-a", tool_name: "read" },
      ]);
      await kernel.execute(sql`DELETE FROM ${t("ai_chats")} WHERE id = 'parent'`);
      assert.deepEqual(await kernel.query(sql`SELECT id, conversation_id, content FROM ${t("ai_chat_messages")}`),
        [{ id: "message-sibling", conversation_id: "sibling", content: "stored message" }]);
      assert.deepEqual(await kernel.query(sql`SELECT conversation_id, agent_id FROM ${t("assistant_agent_sessions")}`),
        [{ conversation_id: "sibling", agent_id: "agent-a" }]);
      assert.deepEqual(await kernel.query(sql`SELECT conversation_id, principal_id, connection_id, tool_name FROM ${t("assistant_conversation_tool_approvals")}`),
        [{ conversation_id: "sibling", principal_id: "principal-a", connection_id: "connection-a", tool_name: "read" }]);
      if (fixture.name === "SQLite") {
        await fixture.step.up(kernel);
        assert.deepEqual(await kernel.query(sql`SELECT id FROM ai_chats ORDER BY id`), [{ id: "generated" }, { id: "sibling" }]);
      }
    } finally {
      await kernel.close();
    }
  });
}

test("Postgres chat baseline performs no work on SQLite", async () => {
  const kernel = openMemorySqliteKernel<unknown>();
  try {
    await chatBaseline("ignored-pg").up(kernel);
    assert.deepEqual(await kernel.query(sql`SELECT name FROM sqlite_master WHERE type = 'table'`), []);
    await sqliteChatTables("sqlite-checksum").up(kernel);
    assert.deepEqual(await kernel.query(sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`), [
      { name: "ai_chat_messages" }, { name: "ai_chats" }, { name: "assistant_agent_sessions" }, { name: "assistant_conversation_tool_approvals" },
    ]);
  } finally {
    await kernel.close();
  }
});

test("SQLite chat step performs no work on Postgres and baseline failure preserves pre-existing tables", async () => {
  const kernel = openPgliteKernel<unknown>();
  try {
    await sqliteChatTables("ignored-sqlite").up(kernel);
    assert.deepEqual(await kernel.query(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`), []);
    await kernel.execute(sql`CREATE SCHEMA ai_chat`);
    await kernel.execute(sql`CREATE TABLE ai_chat.ai_chat_messages (payload text)`);
    await kernel.execute(sql`INSERT INTO ai_chat.ai_chat_messages VALUES ('pre-existing message')`);
    await assert.rejects(kernel.transaction(() => chatBaseline("conflict").up(kernel)), { code: "42P07" });
    assert.deepEqual(await kernel.query(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'ai_chat' ORDER BY tablename`),
      [{ tablename: "ai_chat_messages" }]);
    assert.deepEqual(await kernel.query(sql`SELECT * FROM ai_chat.ai_chat_messages`), [{ payload: "pre-existing message" }]);
  } finally {
    await kernel.close();
  }
});

// F6.2/F6.3: a partially initialized legacy table must surface the DDL error, not report adoption.
test("SQLite chat migration propagates an incompatible existing table error without losing its rows", async () => {
  const kernel = openMemorySqliteKernel<unknown>();
  try {
    await kernel.execute(sql`CREATE TABLE ai_chats (id text PRIMARY KEY, payload text)`);
    await kernel.execute(sql`INSERT INTO ai_chats VALUES ('legacy', 'retain this row')`);
    await assert.rejects(kernel.transaction(() => sqliteChatTables("conflict").up(kernel)), /no such column: scope_id/);
    assert.deepEqual(await kernel.query(sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`), [{ name: "ai_chats" }]);
    assert.deepEqual(await kernel.query(sql`SELECT * FROM ai_chats`), [{ id: "legacy", payload: "retain this row" }]);
  } finally {
    await kernel.close();
  }
});
