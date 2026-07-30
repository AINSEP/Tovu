import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { declareDataModule } from "../data-module";

/** @file ADR-023 §2 / ADR-031 OQ-1 — the declared-index grammar (SPEC-033). */

function openDb(): { db: Database.Database; dbPath: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-dm-idx-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return { db, dbPath, dir };
}

test("a declared composite index is created alongside its table", async () => {
  const { db, dbPath, dir } = openDb();
  const result = await declareDataModule({ db, dbPath, decl: {
    pluginId: "idxtest",
    pluginTier: "tier-2",
    provenance: { sourceUrl: "test://idxtest", publisher: "test" },
    tables: [
      {
        name: "widgets",
        columns: [
          { name: "id", type: "TEXT", primaryKey: true },
          { name: "workspace_id", type: "TEXT", notNull: true },
          { name: "status", type: "TEXT", notNull: true },
        ],
        indexes: [{ name: "by_workspace_status", columns: ["workspace_id", "status"] }],
      },
    ],
  } });

  assert.equal(result.ok, true, JSON.stringify(result.error));
  const idx = db
    .prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_p_idxtest__widgets__by_workspace_status'`)
    .get() as { name: string; sql: string } | undefined;
  assert.ok(idx, "the declared index exists in sqlite_master");
  assert.match(idx!.sql, /"workspace_id", "status"/);

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("an index referencing an undeclared column is rejected before any I/O", async () => {
  const { db, dbPath, dir } = openDb();
  const result = await declareDataModule({ db, dbPath, decl: {
    pluginId: "idxtest",
    pluginTier: "tier-2",
    provenance: { sourceUrl: "test://idxtest", publisher: "test" },
    tables: [
      {
        name: "widgets",
        columns: [{ name: "id", type: "TEXT", primaryKey: true }],
        indexes: [{ name: "bad", columns: ["nonexistent_column"] }],
      },
    ],
  } });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "INDEX_UNKNOWN_COLUMN");
  assert.equal(result.snapshotPath, null, "no snapshot wasted on an invalid declaration");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a unique index is enforced", async () => {
  const { db, dbPath, dir } = openDb();
  await declareDataModule({ db, dbPath, decl: {
    pluginId: "idxtest",
    pluginTier: "tier-2",
    provenance: { sourceUrl: "test://idxtest", publisher: "test" },
    tables: [
      {
        name: "widgets",
        columns: [
          { name: "id", type: "TEXT", primaryKey: true },
          { name: "slug", type: "TEXT", notNull: true },
        ],
        indexes: [{ name: "unique_slug", columns: ["slug"], unique: true }],
      },
    ],
  } });

  db.prepare(`INSERT INTO "p_idxtest__widgets" (id, slug) VALUES ('a', 'x')`).run();
  assert.throws(() => db.prepare(`INSERT INTO "p_idxtest__widgets" (id, slug) VALUES ('b', 'x')`).run());

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
