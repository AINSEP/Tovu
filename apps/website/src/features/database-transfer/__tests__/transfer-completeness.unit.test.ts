import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { IncompleteTransferPlanError, planTransfer } from "@jini-ai/db/transfer";
import { openSqliteSnapshotSource } from "../sqlite-source.js";
import { planChatSnapshotTables, planSnapshotTables } from "../table-catalog.js";

test("content.db and chat.db plans account for all three raw-SQL tables and name any removed table", () => {
  const dir = mkdtempSync(join(tmpdir(), "transfer-completeness-"));
  const content = new Database(join(dir, "content.db"));
  const chat = new Database(join(dir, "chat.db"));
  try {
    content.exec("CREATE TABLE plugin_items (id TEXT PRIMARY KEY)");
    chat.exec(`CREATE TABLE ai_chats (id TEXT PRIMARY KEY);
      CREATE TABLE ai_chat_messages (id TEXT PRIMARY KEY, conversation_id TEXT REFERENCES ai_chats(id));
      CREATE TABLE assistant_agent_sessions (id TEXT PRIMARY KEY);
      CREATE TABLE tovu_chat_migrations (id TEXT PRIMARY KEY);`);
    const contentSource = openSqliteSnapshotSource(content.serialize());
    const chatSource = openSqliteSnapshotSource(chat.serialize());
    try {
      const sources = [{ name: "content.db", source: contentSource, ...planSnapshotTables(contentSource) }, { name: "chat.db", source: chatSource, ...planChatSnapshotTables(chatSource) }];
      const plan = planTransfer({ sources });
      const chatPlan = plan.sources[1]!;
      for (const name of ["ai_chats", "ai_chat_messages", "assistant_agent_sessions"]) assert.ok(chatPlan.tables.some(t => t.name === name));
      assert.ok(chatPlan.tables.findIndex(t => t.name === "ai_chats") < chatPlan.tables.findIndex(t => t.name === "ai_chat_messages"));
      assert.deepEqual(chatPlan.leftOut, [{ table: "tovu_chat_migrations", reason: "the database's own bookkeeping is not copied" }]);
      for (const name of ["ai_chats", "ai_chat_messages", "assistant_agent_sessions"]) {
        const broken = { ...chatPlan, tables: chatPlan.tables.filter(t => t.name !== name) };
        assert.throws(() => planTransfer({ sources: [sources[0]!, broken] }), error => error instanceof IncompleteTransferPlanError && error.message.includes(name));
      }
    } finally { contentSource.close(); chatSource.close(); }
  } finally { content.close(); chat.close(); rmSync(dir, { recursive: true, force: true }); }
});
