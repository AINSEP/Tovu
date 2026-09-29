import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

import Database from "better-sqlite3";
import { sql } from "kysely";

import { openMemorySqliteKernel, sqliteKernel } from "../../kernel/drivers/sqlite.js";
import type { StorageKernel } from "../../kernel/port.js";
import { readSchemaShape } from "../../kernel/schema-shape.js";
import { openContentDb } from "../../sqlite/content-db.js";
import { migrateContentDatabase } from "../index.js";
import { applyLegacyEntries, FROZEN_CHAIN, readFrozenChain } from "../legacy-sqlite.js";
import { hasLedger } from "../runner.js";
import { LegacyHistoryError } from "../step.js";

/**
 * @file SQLite adoption of the frozen drizzle chain (ADR-066 §5), on scratch databases only:
 * a brand-new file gets the whole chain; a drizzle-migrated one is adopted with no schema change; a
 * partial history gets exactly its missing tail (including the 0068+ fake-2027-stamp entries
 * drizzle's migrator would skip after a real-stamped one); an unknown hash, a gap, tables without
 * history, or a schema that differs from the chain's head stop adoption with nothing recorded; a
 * file-backed database is backed up first. Real site copies: see the M1 handoff (proof script).
 */

const BOOKKEEPING = ["__drizzle_migrations", "tovu_migrations"];
const LEGACY_CHAT_TABLES = ["ai_chats", "ai_chat_messages", "assistant_agent_sessions"];
const chain = readFrozenChain();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-legacy-adoption-"));
const opened: Array<StorageKernel<unknown>> = [];

after(async () => {
  for (const kernel of opened) await kernel.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function memory(): StorageKernel<unknown> {
  const kernel = openMemorySqliteKernel<unknown>();
  opened.push(kernel);
  return kernel;
}

async function drizzleRows(kernel: StorageKernel<unknown>): Promise<number> {
  const [{ n }] = await kernel.query<{ n: number }>(sql`SELECT count(*) AS n FROM __drizzle_migrations`);
  return n;
}

async function ledgerIds(kernel: StorageKernel<unknown>): Promise<string[]> {
  if (!(await hasLedger(kernel))) return [];
  return (await kernel.query<{ id: string }>(sql`SELECT id FROM tovu_migrations ORDER BY id`)).map((row) => row.id);
}

/** A kernel whose database has the first `count` chain entries, recorded the way drizzle does. */
async function partial(count: number): Promise<StorageKernel<unknown>> {
  const kernel = memory();
  await kernel.transaction(() => applyLegacyEntries(kernel, chain.slice(0, count)));
  return kernel;
}

describe("0000_legacy_baseline on SQLite", () => {
  test("the chain is the frozen one", () => {
    assert.equal(chain.length, FROZEN_CHAIN.length);
    assert.equal(chain.at(-1)?.tag, FROZEN_CHAIN.lastTag);
  });

  test("a brand-new database gets the whole chain, the same schema drizzle's migrator builds", async () => {
    const kernel = memory();
    const report = await migrateContentDatabase(kernel);
    assert.deepEqual(report.applied, ["0000_legacy_baseline", "0001_post_search", "0002_drop_empty_legacy_chat_tables"]);
    assert.equal(await drizzleRows(kernel), 78);
    const viaDrizzle = sqliteKernel<unknown>(openContentDb(":memory:"));
    // Step 0002 drops the three empty legacy chat tables drizzle's chain creates; compare the rest.
    const mine = await readSchemaShape(kernel, { exclude: BOOKKEEPING });
    assert.deepEqual(mine, await readSchemaShape(viaDrizzle, { exclude: [...BOOKKEEPING, ...LEGACY_CHAT_TABLES] }));
  });

  test("a drizzle-migrated database is adopted with no schema change and no new drizzle rows", async () => {
    const db = openContentDb(":memory:");
    const kernel = sqliteKernel<unknown>(db);
    const before = await readSchemaShape(kernel, { exclude: [...BOOKKEEPING, ...LEGACY_CHAT_TABLES] });
    const report = await migrateContentDatabase(kernel);
    assert.deepEqual(report.applied, ["0000_legacy_baseline", "0001_post_search", "0002_drop_empty_legacy_chat_tables"]);
    assert.deepEqual(await readSchemaShape(kernel, { exclude: BOOKKEEPING }), before, "only the empty legacy chat tables are gone");
    assert.equal(await drizzleRows(kernel), 78);
    assert.deepEqual((await migrateContentDatabase(kernel)).applied, [], "a rerun applies nothing");
  });

  test("a partial history gets exactly its missing tail, fake-2027 entries included", async () => {
    const kernel = await partial(58);
    const report = await migrateContentDatabase(kernel);
    assert.equal(await drizzleRows(kernel), 78);
    assert.ok(report.notes.some((note) => note.includes("0058_keen_mauler") && note.includes("0077_external_mcp_tool_approvals") && note.includes("(20)")));
    assert.deepEqual(await ledgerIds(kernel), ["0000_legacy_baseline", "0001_post_search", "0002_drop_empty_legacy_chat_tables"]);
  });

  test("a recorded hash that is not in the chain stops adoption, nothing recorded", async () => {
    const kernel = await partial(10);
    await kernel.execute(sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('deadbeef', 1)`);
    await assert.rejects(migrateContentDatabase(kernel), (error: unknown) => error instanceof LegacyHistoryError && /not in the frozen chain/.test(error.message));
    assert.deepEqual(await ledgerIds(kernel), []);
    assert.equal(await drizzleRows(kernel), 11, "the tail was not applied");
  });

  test("an entry missing before the last applied one stops adoption", async () => {
    const kernel = await partial(12);
    await kernel.execute(sql`DELETE FROM __drizzle_migrations WHERE hash = ${chain[5].hash}`);
    await assert.rejects(migrateContentDatabase(kernel), (error: unknown) => error instanceof LegacyHistoryError && error.message.includes(chain[5].tag));
  });

  test("tables without any drizzle history are not adopted", async () => {
    const kernel = memory();
    await kernel.execute(sql`CREATE TABLE posts (id text)`);
    await assert.rejects(migrateContentDatabase(kernel), (error: unknown) => error instanceof LegacyHistoryError && /no drizzle migration history/.test(error.message));
  });

  test("a schema that differs from the chain's head stops adoption and names the difference", async () => {
    const kernel = await partial(78);
    await kernel.execute(sql`DROP INDEX member_tiers_workspace_slug_unique`);
    await assert.rejects(
      migrateContentDatabase(kernel),
      (error: unknown) => error instanceof LegacyHistoryError && error.message.includes("member_tiers_workspace_slug_unique")
    );
    assert.deepEqual(await ledgerIds(kernel), []);
  });

  test("extra tables (plugin data modules) are kept and reported, not refused", async () => {
    const kernel = await partial(78);
    await kernel.execute(sql`CREATE TABLE p_demo__things (id text PRIMARY KEY)`);
    const report = await migrateContentDatabase(kernel);
    assert.ok(report.notes.some((note) => note.includes("p_demo__things")));
  });

  test("a file-backed database is backed up before adoption", async () => {
    const file = path.join(tmp, "content.db");
    const db = openContentDb(file);
    const backupPath = path.join(tmp, "backup.db");
    const report = await migrateContentDatabase(sqliteKernel<unknown>(db), { backupPath });
    assert.ok(report.notes.some((note) => note.includes(backupPath)));
    const copy = new Database(backupPath, { readonly: true });
    try {
      assert.equal((copy.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n, 78);
      const hasLedger = copy.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'tovu_migrations'").get() as { n: number };
      assert.equal(hasLedger.n, 0, "the backup is the database as it was before adoption");
    } finally {
      copy.close();
      db.$client.close();
    }
  });
});
