import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { sql } from "kysely";

import { listTables } from "../../kernel/dialect.js";
import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import { openMemorySqliteKernel, sqliteKernel } from "../../kernel/drivers/sqlite.js";
import type { StorageKernel } from "../../kernel/port.js";
import { DROP_EMPTY_LEGACY_CHAT_TABLES_ID } from "../0002_drop_empty_legacy_chat_tables.js";
import { migrateContentDatabase } from "../index.js";
import { openLegacyContentDb } from "./legacy-content-db.fixture.js";

/**
 * @file Step `0002_drop_empty_legacy_chat_tables` (the two-db split's `content.db` half): drops each
 * of the three legacy chat tables only while it is empty; one with rows (a pre-split install) is
 * kept and reported. Postgres/PGlite: recorded, nothing changed.
 */

const LEGACY_CHAT_TABLES = ["ai_chats", "ai_chat_messages", "assistant_agent_sessions"];

const opened: StorageKernel<unknown>[] = [];
after(async () => {
  for (const kernel of opened) await kernel.close();
});

/** A content database at the legacy chain's head (drizzle's migrator), not yet adopted. */
function legacyContentKernel(): StorageKernel<unknown> {
  const kernel = sqliteKernel<unknown>(openLegacyContentDb({ filePath: ":memory:" }));
  opened.push(kernel);
  return kernel;
}

const legacyChatTablesIn = async (kernel: StorageKernel<unknown>) => (await listTables(kernel)).filter((name) => LEGACY_CHAT_TABLES.includes(name));

describe(DROP_EMPTY_LEGACY_CHAT_TABLES_ID, () => {
  test("SQLite: the three empty legacy chat tables are dropped", async () => {
    const kernel = legacyContentKernel();
    assert.deepEqual((await legacyChatTablesIn(kernel)).sort(), [...LEGACY_CHAT_TABLES].sort(), "the legacy chain creates them");
    const report = await migrateContentDatabase(kernel);
    assert.ok(report.applied.includes(DROP_EMPTY_LEGACY_CHAT_TABLES_ID));
    assert.deepEqual(await legacyChatTablesIn(kernel), []);
  });

  test("SQLite: a table with rows is kept untouched and reported; its empty siblings still go", async () => {
    const kernel = legacyContentKernel();
    await kernel.execute(sql`INSERT INTO ai_chats (id, scope_id, owner_kind, owner_id, created_at, updated_at) VALUES ('c1', 'ws-1', 'user', 'user-1', 1, 1)`);
    const report = await migrateContentDatabase(kernel);
    assert.deepEqual(await legacyChatTablesIn(kernel), ["ai_chats"]);
    const [{ n }] = await kernel.query<{ n: number }>(sql`SELECT count(*) AS n FROM ai_chats`);
    assert.equal(n, 1, "the surviving row is not touched");
    assert.ok(report.notes.some((note) => note === "kept legacy chat table ai_chats: it has rows"));
  });

  test("SQLite: a brand-new database (the runner's own chain) ends without them", async () => {
    const kernel = openMemorySqliteKernel<unknown>();
    opened.push(kernel);
    await migrateContentDatabase(kernel);
    assert.deepEqual(await legacyChatTablesIn(kernel), []);
  });

  test("PGlite: recorded, nothing in public changes", async () => {
    const kernel = openPgliteKernel<unknown>();
    opened.push(kernel);
    const report = await migrateContentDatabase(kernel);
    assert.ok(report.applied.includes(DROP_EMPTY_LEGACY_CHAT_TABLES_ID));
    assert.deepEqual(await legacyChatTablesIn(kernel), []);
  });
});
