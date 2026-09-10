import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { openChatDb } from "../chat-db.js";
import { openContentDb } from "../content-db.js";
import { dropEmptyLegacyChatTables } from "../drop-empty-legacy-chat-tables.js";

/**
 * @file Unit coverage for the two-db split (`0fb84ae0`) forward migration: dropping the three
 * vestigial chat tables (`ai_chats`, `ai_chat_messages`, `assistant_agent_sessions`) from
 * `content.db` on fresh installs, while never touching a pre-split install's real history.
 *
 * The "build a content.db-shaped fixture with `openChatDb` instead of the real migration chain"
 * trick is borrowed from `chat-orphan-check.integration.test.ts`'s own fixture note: the three
 * tables' DDL is byte-identical between `chat-db.ts` and migrations `0023`/`0051`, so it produces
 * the same physical tables without needing this test to know the migrations folder's location.
 */

const CHAT_TABLE_NAMES = ["ai_chats", "ai_chat_messages", "assistant_agent_sessions"] as const;

function tableNames(db: Database.Database): string[] {
  return (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>)
    .map((row) => row.name)
    .sort();
}

test("openContentDb on a brand-new db leaves none of the three chat tables behind", () => {
  const db = openContentDb(":memory:");
  const names = tableNames(db.$client);
  for (const table of CHAT_TABLE_NAMES) {
    assert.ok(!names.includes(table), `expected a fresh content.db to have no "${table}" table, but it does`);
  }
});

test("drops every one of the three tables when all are empty", () => {
  const db = openChatDb(":memory:");
  for (const table of CHAT_TABLE_NAMES) assert.ok(tableNames(db).includes(table), `fixture is missing "${table}"`);

  dropEmptyLegacyChatTables(db);

  const names = tableNames(db);
  for (const table of CHAT_TABLE_NAMES) assert.ok(!names.includes(table), `"${table}" should have been dropped`);
});

test("leaves a non-empty table completely intact, and still drops its empty siblings", () => {
  const db = openChatDb(":memory:");
  db.prepare(
    `INSERT INTO ai_chats (id, scope_id, owner_kind, owner_id, created_at, updated_at) VALUES ('c1', 'ws-1', 'user', 'user-1', 1, 1)`
  ).run();

  dropEmptyLegacyChatTables(db);

  const names = tableNames(db);
  assert.ok(names.includes("ai_chats"), "a non-empty ai_chats must not be dropped");
  assert.ok(!names.includes("ai_chat_messages"), "the empty sibling ai_chat_messages should still be dropped");
  assert.ok(!names.includes("assistant_agent_sessions"), "the empty sibling assistant_agent_sessions should still be dropped");

  const row = db.prepare(`SELECT count(*) AS n FROM ai_chats`).get() as { n: number };
  assert.equal(row.n, 1, "the surviving row must not be touched");
});

test("is idempotent -- calling it again after the tables are already gone is a no-op", () => {
  const db = openChatDb(":memory:");
  dropEmptyLegacyChatTables(db);
  assert.doesNotThrow(() => dropEmptyLegacyChatTables(db));
  for (const table of CHAT_TABLE_NAMES) assert.ok(!tableNames(db).includes(table));
});

test("tolerates a db that never had any of the three tables at all", () => {
  const db = new Database(":memory:");
  assert.doesNotThrow(() => dropEmptyLegacyChatTables(db));
});
