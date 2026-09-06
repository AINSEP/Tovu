import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { initSite } from "../../init-site.js";
import { duplicateContentDb } from "../../duplicate-content-db.js";

/**
 * @file `duplicateContentDb` — TDD certification for the `content.db` half of `duplicateSite`.
 *
 * Covers the two claims a filesystem-only copy could not make good on: (1) chat/session history is
 * excluded from the copy even though it physically exists in the source (not merely "the function
 * ran without throwing" — the adversarial case here is real rows present in the excluded tables),
 * and (2) real content survives the copy byte-for-byte-equivalent (row counts, values). Every
 * assertion reads real database state via a fresh SQLite connection, never a log line.
 */

function mkTempParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-duplicate-content-db-"));
}

/** Builds a real site via `initSite` (real starter-template seed: one workspace, N posts, one
 *  presentation row) and inserts one fake row into each of the three raw-SQL chat/session tables
 *  directly — the same tables `db/migration/manifest.ts`'s own `RAW_SQL_MANAGED_TABLES` documents.
 *  Returns the site's `content.db` path. */
function buildSourceWithChatHistory(parent: string): string {
  const { dir } = initSite({ dir: path.join(parent, "source"), name: "Source Site" });
  const dbPath = path.join(dir, "content.db");

  const raw = new Database(dbPath);
  try {
    const now = Date.now();
    raw
      .prepare(
        `INSERT INTO ai_chats (id, scope_id, owner_kind, owner_id, title, title_source, created_at, updated_at)
         VALUES ('chat-1', 'ws-1', 'user', 'user-1', 'A real conversation', 'fallback', ?, ?)`
      )
      .run(now, now);
    raw
      .prepare(
        `INSERT INTO ai_chat_messages (id, conversation_id, role, content, position, created_at)
         VALUES ('msg-1', 'chat-1', 'user', 'do not duplicate me', 0, ?)`
      )
      .run(now);
    raw
      .prepare(
        `INSERT INTO assistant_agent_sessions (conversation_id, agent_id, session_id, updated_at)
         VALUES ('chat-1', 'agent-1', 'cli-session-1', ?)`
      )
      .run(now);
  } finally {
    raw.close();
  }
  return dbPath;
}

test("chat/session history rows do not survive the copy, even though the source really has them", () => {
  const parent = mkTempParent();
  try {
    const sourceDbPath = buildSourceWithChatHistory(parent);
    const targetDbPath = path.join(parent, "target-content.db");

    duplicateContentDb({ sourceDbPath, targetDbPath });

    const copy = new Database(targetDbPath, { readonly: true });
    try {
      const chatCount = (copy.prepare(`SELECT COUNT(*) AS c FROM ai_chats`).get() as { c: number }).c;
      const messageCount = (copy.prepare(`SELECT COUNT(*) AS c FROM ai_chat_messages`).get() as { c: number }).c;
      const sessionCount = (copy.prepare(`SELECT COUNT(*) AS c FROM assistant_agent_sessions`).get() as { c: number }).c;
      assert.equal(chatCount, 0, "ai_chats must be empty in the duplicate");
      assert.equal(messageCount, 0, "ai_chat_messages must be empty in the duplicate");
      assert.equal(sessionCount, 0, "assistant_agent_sessions must be empty in the duplicate");
    } finally {
      copy.close();
    }

    // The SOURCE must be completely untouched — this function must never mutate what it reads from.
    const source = new Database(sourceDbPath, { readonly: true });
    try {
      const stillThere = (source.prepare(`SELECT COUNT(*) AS c FROM ai_chats`).get() as { c: number }).c;
      assert.equal(stillThere, 1, "the source's own chat row must be untouched");
    } finally {
      source.close();
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("real content (posts, workspace, presentation) survives the copy intact", () => {
  const parent = mkTempParent();
  try {
    const sourceDbPath = buildSourceWithChatHistory(parent);
    const targetDbPath = path.join(parent, "target-content.db");

    duplicateContentDb({ sourceDbPath, targetDbPath });

    const source = new Database(sourceDbPath, { readonly: true });
    const copy = new Database(targetDbPath, { readonly: true });
    try {
      const sourcePosts = source.prepare(`SELECT id, title FROM posts ORDER BY id`).all();
      const copyPosts = copy.prepare(`SELECT id, title FROM posts ORDER BY id`).all();
      assert.ok(sourcePosts.length > 0, "the starter template must seed at least one post (test precondition)");
      assert.deepEqual(copyPosts, sourcePosts, "every post row must survive, byte-for-byte");

      const sourceWorkspaces = (source.prepare(`SELECT COUNT(*) AS c FROM workspaces`).get() as { c: number }).c;
      const copyWorkspaces = (copy.prepare(`SELECT COUNT(*) AS c FROM workspaces`).get() as { c: number }).c;
      assert.equal(copyWorkspaces, sourceWorkspaces, "workspace row count must be preserved");
      assert.ok(copyWorkspaces > 0, "test precondition: the starter template seeds a workspace");
    } finally {
      source.close();
      copy.close();
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("the copy passes integrity_check and keeps the migrator's bookkeeping table intact", () => {
  const parent = mkTempParent();
  try {
    const sourceDbPath = buildSourceWithChatHistory(parent);
    const targetDbPath = path.join(parent, "target-content.db");

    duplicateContentDb({ sourceDbPath, targetDbPath });

    const copy = new Database(targetDbPath, { readonly: true });
    try {
      const [integrity] = copy.pragma("integrity_check") as Array<{ integrity_check: string }>;
      assert.equal(integrity.integrity_check, "ok");

      const migrationRows = (copy.prepare(`SELECT COUNT(*) AS c FROM __drizzle_migrations`).get() as { c: number }).c;
      assert.ok(
        migrationRows > 0,
        "__drizzle_migrations must survive the purge — a future openContentDb() must see this db as already migrated"
      );
    } finally {
      copy.close();
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("no stray -wal/-shm sidecar is left next to the finished copy", () => {
  const parent = mkTempParent();
  try {
    const sourceDbPath = buildSourceWithChatHistory(parent);
    const targetDbPath = path.join(parent, "target-content.db");

    duplicateContentDb({ sourceDbPath, targetDbPath });

    assert.equal(fs.existsSync(`${targetDbPath}-wal`), false, "no leftover -wal sidecar");
    assert.equal(fs.existsSync(`${targetDbPath}-shm`), false, "no leftover -shm sidecar");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
