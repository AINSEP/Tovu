import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "kysely";
import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import { openChatDb, openSiteChatDb } from "../../sqlite/chat-db.js";
import { CHAT_MIGRATIONS } from "../index.js";
import { chatPinned } from "../chat/0004_chat_pinned.js";
import { sqliteChatTables } from "../chat/0001_sqlite_chat_tables.js";

const context = { note: () => {} };

test("fresh bootstrap = migrated schema", async () => {
  const fresh = openChatDb({ filePath: ":memory:" });
  const migrated = await openSiteChatDb({ filePath: ":memory:" });
  try {
    const columns = "SELECT name, type, [notnull], dflt_value, pk FROM pragma_table_info('ai_chats') ORDER BY cid";
    const indexes = "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'ai_chats' ORDER BY name";
    assert.deepEqual(fresh.prepare(columns).all(), migrated.prepare(columns).all());
    assert.deepEqual(fresh.prepare(indexes).all(), migrated.prepare(indexes).all());
    assert.ok(fresh.prepare("SELECT 1 FROM pragma_table_info('ai_chats') WHERE name='pinned_at'").get());
    assert.ok(fresh.prepare("SELECT 1 FROM sqlite_master WHERE name='idx_ai_chats_owner_cleanup'").get());
  } finally { fresh.close(); migrated.close(); }
});

test("migration manifest is complete", () => {
  assert.deepEqual(CHAT_MIGRATIONS.slice(-2).map(step => step.id), ["0003_active_run_index", "0004_chat_pinned"]);
});

test("adopted SQLite parity", async () => {
  const kernel = openMemorySqliteKernel<unknown>();
  try {
    await sqliteChatTables("baseline").up(kernel, context);
    await kernel.execute(sql`ALTER TABLE ai_chats ADD COLUMN pinned_at INTEGER`);
    await kernel.execute(sql`INSERT INTO ai_chats (id, scope_id, owner_kind, owner_id, created_at, updated_at, pinned_at)
      VALUES ('kept', 'workspace', 'user', 'owner', 1, 2, 3)`);
    await chatPinned({ checksum: "pin" }, {}).up(kernel, context);
    await chatPinned({ checksum: "pin" }, {}).up(kernel, context);
    assert.deepEqual(await kernel.query(sql`SELECT id, pinned_at, updated_at FROM ai_chats`), [{ id: "kept", pinned_at: 3, updated_at: 2 }]);
    assert.deepEqual(await kernel.query(sql`SELECT name FROM pragma_index_info('idx_ai_chats_owner_cleanup') ORDER BY seqno`),
      ["scope_id", "owner_kind", "owner_id", "pinned_at", "updated_at"].map(name => ({ name })));
  } finally { await kernel.close(); }
  const adopted = openChatDb({ filePath: ":memory:" });
  try {
    const reopened = openChatDb({ filePath: "adopted" }, { open: () => adopted });
    assert.equal(reopened, adopted);
    assert.deepEqual(adopted.prepare("SELECT count(*) AS n FROM pragma_table_info('ai_chats') WHERE name='pinned_at'").get(), { n: 1 });
  } finally { adopted.close(); }
});
