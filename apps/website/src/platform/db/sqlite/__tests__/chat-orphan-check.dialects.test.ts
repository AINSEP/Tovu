import assert from "node:assert/strict";
import { test } from "node:test";

import { sql } from "kysely";

import { type ContentKernel, describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { CHAT_TABLE_NAMES, checkForOrphanedChatRows } from "../chat-orphan-check.js";

/**
 * @file The orphaned-chat-rows check on every dialect. The Postgres content schema has no chat
 * tables, and a SQLite `content.db` may or may not still hold them, so each test drops the three and
 * creates bare stand-ins itself; the PGlite instance is shared by the file, so the tables are
 * dropped again at the end of each test.
 */

async function dropChatTables(kernel: ContentKernel): Promise<void> {
  for (const table of [...CHAT_TABLE_NAMES].reverse()) await kernel.execute(sql`DROP TABLE IF EXISTS ${sql.table(table)}`);
}

describeEachDialect<ContentKernel>("checkForOrphanedChatRows", { tables: [], make: (kernel) => kernel }, (makeKernel) => {
  test("absent chat tables count as zero", async () => {
    const kernel = makeKernel();
    await dropChatTables(kernel);

    const check = await checkForOrphanedChatRows(kernel);

    assert.deepEqual(check, { counts: { aiChats: 0, aiChatMessages: 0, assistantAgentSessions: 0 }, total: 0, orphaned: false });
  });

  test("counts the rows in each chat table that exists", async () => {
    const kernel = makeKernel();
    await dropChatTables(kernel);
    try {
      await kernel.execute(sql`CREATE TABLE ai_chats (id TEXT PRIMARY KEY)`);
      await kernel.execute(sql`CREATE TABLE ai_chat_messages (id TEXT PRIMARY KEY)`);
      await kernel.execute(sql`INSERT INTO ai_chats (id) VALUES ('a'), ('b')`);
      await kernel.execute(sql`INSERT INTO ai_chat_messages (id) VALUES ('m1'), ('m2'), ('m3')`);

      const check = await checkForOrphanedChatRows(kernel);

      assert.deepEqual(check, { counts: { aiChats: 2, aiChatMessages: 3, assistantAgentSessions: 0 }, total: 5, orphaned: true });
    } finally {
      await dropChatTables(kernel);
    }
  });
});
