import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";
import { CONTENT_MIGRATIONS } from "#src/platform/db/migrations/index";
import { MIGRATION_BACKUP_PREFIX } from "#src/platform/db/sqlite/content-db";
import { openSiteContentDb } from "../open-site-content-db.js";

const drizzleDir = path.resolve(import.meta.dirname, "../../../../platform/db/drizzle");
const sha = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// Build the historical files independently of the adoption runner, using the committed
// Drizzle SQL/journal and native SQLite. These cases never depend on an owner's site files.
function legacyFile(file: string, count: number, duplicate: boolean): void {
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as { entries: Array<{ tag: string; when: number }> };
  assert.equal(journal.entries.length, 78, "fixture targets the frozen legacy chain");
  const db = new Database(file);
  try {
    db.pragma("journal_mode = WAL");
    db.exec("CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)");
    db.transaction(() => {
      for (const entry of journal.entries.slice(0, count)) {
        const source = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
        for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
        db.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)").run(crypto.createHash("sha256").update(source).digest("hex"), entry.when);
      }
      if (duplicate) db.exec("INSERT INTO __drizzle_migrations (hash, created_at) SELECT hash, created_at FROM __drizzle_migrations LIMIT 1");
      db.exec("CREATE TABLE p_history_probe (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
      db.prepare("INSERT INTO p_history_probe VALUES (?, ?)").run("existing-record", `preserve history ${count}`);
    })();
  } finally {
    db.close();
  }
}

function readHistory(file: string) {
  const db = new Database(file, { readonly: true });
  try {
    return {
      drizzleRows: (db.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n,
      marker: db.prepare("SELECT id, value FROM p_history_probe").all(),
      tables: (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(row => row.name),
    };
  } finally {
    db.close();
  }
}

function snapshot(file: string) {
  const db = new Database(file, { readonly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
    return {
      schema: db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all(),
      rows: Object.fromEntries(tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}"`).all().map(row => JSON.stringify(row)).sort()])),
    };
  } finally {
    db.close();
  }
}

for (const fixture of [
  { name: "head 0077 with a duplicate history row", count: 78, duplicate: true },
  { name: "head 0057 with the 20-entry tail pending", count: 58, duplicate: false },
  { name: "head 0074 with the 3-entry tail pending", count: 75, duplicate: false },
]) {
  test(`openSiteContentDb adopts generated ${fixture.name}, preserves data and becomes a no-op`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-legacy-boot-fixture-"));
    const file = path.join(root, "content.db");
    try {
      legacyFile(file, fixture.count, fixture.duplicate);
      const before = readHistory(file);
      assert.equal(before.drizzleRows, fixture.count + Number(fixture.duplicate));
      assert.equal(before.tables.includes("tovu_migrations"), false);
      assert.equal(before.tables.includes("external_mcp_tool_approvals"), fixture.count === 78);
      const originalState = snapshot(file);

      closeSqliteConnection(await openSiteContentDb(file));

      const adopted = readHistory(file);
      assert.equal(adopted.drizzleRows, fixture.duplicate ? 79 : 78);
      assert.equal(adopted.tables.includes("external_mcp_tool_approvals"), true, "the pending DDL must actually run");
      assert.deepEqual(adopted.marker, [{ id: "existing-record", value: `preserve history ${fixture.count}` }]);
      const db = new Database(file, { readonly: true });
      try {
        assert.deepEqual(db.prepare("SELECT id FROM tovu_migrations ORDER BY id").all(), CONTENT_MIGRATIONS.map(step => ({ id: step.id })));
      } finally {
        db.close();
      }
      const ops = path.join(root, "ops");
      const backups = fs.readdirSync(ops).filter(name => name.startsWith(MIGRATION_BACKUP_PREFIX) && name.endsWith(".db"));
      assert.equal(backups.length, 1);
      // SQLite's backup API can change physical page/header bytes. The independent native
      // snapshot pins every schema object and row, including the historical duplicates.
      assert.deepEqual(snapshot(path.join(ops, backups[0])), originalState, "backup contains the unmodified legacy schema and data");
      assert.deepEqual(readHistory(path.join(ops, backups[0])), before);

      const adoptedBytes = sha(file);
      closeSqliteConnection(await openSiteContentDb(file));
      assert.equal(sha(file), adoptedBytes, "second boot must write nothing");
      assert.deepEqual(fs.readdirSync(ops).filter(name => name.startsWith(MIGRATION_BACKUP_PREFIX) && name.endsWith(".db")), backups);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
