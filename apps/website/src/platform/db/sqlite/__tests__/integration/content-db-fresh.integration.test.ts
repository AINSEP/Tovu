import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getTableConfig } from "drizzle-orm/sqlite-core";

import { sqliteKernel } from "../../../kernel/drivers/sqlite.js";
import { readSchemaShape } from "../../../kernel/schema-shape.js";
import { collectCoreTables } from "../../../migration/manifest.js";
import { CONTENT_MIGRATIONS, migrateContentDatabase } from "../../../migrations/index.js";
import { media, workspaces } from "../../../schema.sqlite.js";
import { openContentDb, openSqliteContentConnection, type ContentDb } from "../../content-db.js";

/** Owner follow-up 2026-10-04: the synchronous product opener must return current schema.
 * Only in-memory and temporary databases; never open a real site from this test.
 * These guards fail on the frozen-baseline-only opener, without modifying commerce's tests.
 */
const NOW = "2026-10-04T00:00:00.000Z";
const BOOKKEEPING = ["__drizzle_migrations", "tovu_migrations"];

function seedMedia(db: ContentDb): void {
  db.insert(workspaces).values({ id: "ws", name: "Workspace", slug: "ws", createdAt: NOW }).run();
  db.insert(media).values({
    id: "asset", workspaceId: "ws", title: "Asset", slug: "asset", alt: "", caption: "",
    credit: "", sourceSha256: "hash", status: "active", createdAt: NOW, updatedAt: NOW, version: 1,
  }).run();
}

function assertCreatorColumn(db: ContentDb): void {
  const columns = db.$client.prepare("PRAGMA table_info(media)").all() as Array<{ name: string; notnull: number }>;
  const creator = columns.find(column => column.name === "created_by");
  assert.ok(creator, "fresh openContentDb must include media.created_by before returning");
  assert.equal(creator.notnull, 0, "legacy/unknown creators must remain nullable");
}

test("fresh in-memory openContentDb includes media.created_by and supports Drizzle inserts without attribution", () => {
  const db = openContentDb(":memory:");
  try {
    assertCreatorColumn(db);
    seedMedia(db);
    assert.equal(db.select({ createdBy: media.createdBy }).from(media).get()?.createdBy, null);
    db.update(media).set({ createdBy: "user:owner" }).run();
    assert.equal(db.select({ createdBy: media.createdBy }).from(media).get()?.createdBy, "user:owner");
  } finally {
    db.$client.close();
  }
});

test("fresh synchronous content databases match every declared table's columns and the real TS migration head", async () => {
  const sync = openContentDb(":memory:");
  const asyncDb = openSqliteContentConnection(":memory:");
  try {
    const actual = await readSchemaShape(sqliteKernel<unknown>(sync), { exclude: BOOKKEEPING });
    for (const { table } of collectCoreTables()) {
      const declared = getTableConfig(table);
      const columns = sync.$client.prepare("SELECT name FROM pragma_table_info(?) ORDER BY name")
        .all(declared.name) as Array<{ name: string }>;
      assert.deepEqual(columns.map(column => column.name), declared.columns.map(column => column.name).sort(),
        `fresh content DB column drift: ${declared.name}`);
    }
    await migrateContentDatabase(sqliteKernel<unknown>(asyncDb));
    assert.deepEqual(actual, await readSchemaShape(sqliteKernel<unknown>(asyncDb), { exclude: BOOKKEEPING }));
  } finally {
    sync.$client.close();
    asyncDb.$client.close();
  }
});

test("fresh file openContentDb preserves creator attribution on reopen and needs no TS migrations afterward", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-fresh-content-head-"));
  let db: ContentDb | undefined;
  try {
    const file = path.join(dir, "content.db");
    db = openContentDb(file);
    assertCreatorColumn(db);
    seedMedia(db);
    db.update(media).set({ createdBy: "user:owner" }).run();
    db.$client.close();
    db = undefined;
    db = openContentDb(file);
    assert.equal(db.select({ createdBy: media.createdBy }).from(media).get()?.createdBy, "user:owner");
    const report = await migrateContentDatabase(sqliteKernel<unknown>(db));
    assert.deepEqual(report.applied, []);
    assert.deepEqual(report.alreadyApplied, CONTENT_MIGRATIONS.map(step => step.id));
  } finally {
    db?.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
