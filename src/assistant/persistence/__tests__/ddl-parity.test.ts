import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import Database from "better-sqlite3";
import { CHAT_HISTORY_DDL, createChatHistoryStore } from "@jini-ai/sqlite";

/**
 * @file Guards the one hazard created by copying Jini's chat-history DDL into a Tovu migration
 * instead of letting Jini create the tables: silent drift.
 *
 * Migration `0023` explains why the copy exists — `@jini-ai/sqlite` owns its own `app.sqlite`, and
 * a second migrator writing into `content.db` would bypass Tovu's snapshot and backup tooling. The
 * cost of that choice is that the schema now has two spellings, and nothing in the type system
 * notices when a Jini upgrade changes one of them. A drifted column would not fail loudly: the
 * Jini store would simply query a column Tovu's table does not have, at runtime, in production.
 *
 * These tests compare the shipped migration against the package constant structurally rather than
 * by string equality, so reformatting or comment edits in either place stay allowed while an
 * actual schema change fails.
 */

const MIGRATION_PATH = join(process.cwd(), "src/infra/drizzle/0023_ai_chat_history.sql");

/**
 * Reduces DDL to its comparable shape: comments stripped, drizzle's statement markers removed,
 * whitespace collapsed, lowercased. What survives is exactly the set of characters SQLite acts on.
 */
function normalizeDdl(sql: string): string {
  return sql
    .replace(/^\s*--.*$/gm, "")
    .replace(/-->\s*statement-breakpoint/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Applies a DDL blob to a fresh in-memory database and returns its resulting shape. */
function schemaShapeOf(ddl: string): { tables: string[]; columns: Record<string, string[]>; indexes: string[] } {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(ddl);
  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[])
    .map((r) => r.name)
    .filter((name) => !name.startsWith("sqlite_"));
  const columns: Record<string, string[]> = {};
  for (const table of tables) {
    columns[table] = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string; notnull: number }[])
      .map((c) => `${c.name}:${c.type}:${c.notnull}`)
      .sort();
  }
  const indexes = (db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as { name: string }[])
    .map((r) => r.name);
  db.close();
  return { tables, columns, indexes };
}

describe("ai_chats DDL parity with @jini-ai/sqlite", () => {
  it("produces the identical schema to CHAT_HISTORY_DDL", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8");
    assert.deepEqual(
      schemaShapeOf(normalizeDdl(migration)),
      schemaShapeOf(CHAT_HISTORY_DDL),
      "migration 0023 has drifted from @jini-ai/sqlite's CHAT_HISTORY_DDL — reconcile them, and prefer changing the migration so the package stays the source of truth",
    );
  });

  it("creates tables the Jini store can actually query", () => {
    // Structural equality above would still pass if both sides were wrong together. This runs the
    // real store against the real migration, which is the property that actually matters.
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(normalizeDdl(readFileSync(MIGRATION_PATH, "utf8")));
    const store = createChatHistoryStore(db, {
      scopeId: "workspace-local",
      ownerKind: "user",
      ownerId: "u1",
    });
    return (async () => {
      await store.create({ id: "c1", title: "Parity check" });
      await store.appendMessage("c1", { id: "m1", role: "user", content: "hello" });
      const listed = await store.list();
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.messageCount, 1);
      db.close();
    })();
  });

  it("enforces the cascade the migration declares", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(normalizeDdl(readFileSync(MIGRATION_PATH, "utf8")));
    const store = createChatHistoryStore(db, {
      scopeId: "workspace-local",
      ownerKind: "user",
      ownerId: "u1",
    });
    return (async () => {
      await store.create({ id: "c1" });
      await store.appendMessage("c1", { id: "m1", role: "user", content: "hello" });
      await store.delete("c1");
      const orphans = db.prepare(`SELECT COUNT(*) AS n FROM ai_chat_messages`).get() as { n: number };
      assert.equal(orphans.n, 0, "messages outlived their conversation — is foreign_keys ON?");
      db.close();
    })();
  });
});
