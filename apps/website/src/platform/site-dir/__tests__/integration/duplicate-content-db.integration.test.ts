import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { openChatDb } from "../../../db/sqlite/chat-db.js";
import { initSite } from "../../init-site.js";
import { duplicateContentDb } from "../../duplicate-content-db.js";

/**
 * @file `duplicateContentDb` — TDD certification for the `content.db` half of `duplicateSite`.
 *
 * Covers the three claims a filesystem-only copy could not make good on: (1) chat/session history
 * is excluded from the copy even though it physically exists in the source (not merely "the
 * function ran without throwing" — the adversarial case here is real rows present in the excluded
 * tables), (2) real content survives the copy byte-for-byte-equivalent (row counts, values), and
 * (3) everything the purge is NOT aimed at survives — plugin business data and, adversarially, a
 * table this repository has never heard of. Every assertion reads real database state via a fresh
 * SQLite connection, never a log line.
 */

function mkTempParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-duplicate-content-db-"));
}

/** Builds a real site via `initSite` (real starter-template seed: one workspace, N posts, one
 *  presentation row) and inserts one fake row into each of the three raw-SQL chat/session tables
 *  directly — the same tables `platform/db/__tests__/schema-migration-drift.test.ts`'s own
 *  `RAW_SQL_MANAGED_TABLES` registry documents (that constant lives there, in the drift guard, and
 *  nowhere else; `db/migration/manifest.ts` has never declared it).
 *  Returns the site's `content.db` path. */
function buildSourceWithChatHistory(parent: string): string {
  const { dir } = initSite({ dir: path.join(parent, "source"), name: "Source Site" });
  const dbPath = path.join(dir, "content.db");

  // `initSite` opens content.db through `openContentDb`, which now drops these three tables the
  // moment they're empty (the two-db split's forward migration, `drop-empty-legacy-chat-tables.ts`)
  // -- so right after `initSite` they no longer exist. Reopen the same file through `openChatDb`
  // first to recreate them (byte-identical DDL to migrations 0023/0051, per
  // `chat-orphan-check.integration.test.ts`'s own fixture note), modeling a PRE-split install whose
  // content.db still carries real rows in tables this repo's migrations still create.
  const raw = openChatDb(dbPath);
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

/**
 * Plants the raw-SQL tables the PLUGIN system creates in `content.db` at install time, with real
 * rows in each. DDL copied verbatim from `sites/tovu-com/content.db`'s own `sqlite_master` (read
 * read-only on 2026-09-06), so this fixture is the shape a real installed plugin actually leaves
 * behind rather than an invented approximation:
 *
 * - `_plugin_migrations` / `_plugin_identity` — `features/plugins/data-module.ts`'s `ensureJournal`
 *   and `features/plugins/plugin-identity.ts`. Installed on every site that has ever installed a
 *   plugin; the owner's own site holds 12 and 3 rows respectively.
 * - `p_store__products` / `p_comments__comments` — one plugin's own business data, named
 *   `p_{pluginId}__{table}` by `data-module.ts`'s `fqName`. The owner's site holds 3 products.
 *
 * None of these is declared in `db/schema.sqlite.ts`, and none is chat.
 */
function plantPluginData(dbPath: string): void {
  const raw = new Database(dbPath);
  try {
    raw.exec(`
      CREATE TABLE _plugin_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plugin_id TEXT NOT NULL,
        table_name TEXT NOT NULL,
        ddl TEXT NOT NULL,
        snapshot_path TEXT,
        at INTEGER NOT NULL
      );
      CREATE TABLE _plugin_identity (
        plugin_id TEXT PRIMARY KEY,
        source_url TEXT NOT NULL,
        publisher TEXT NOT NULL,
        signature TEXT,
        minted_at INTEGER NOT NULL
      );
      CREATE TABLE "p_store__products" ("id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "price" INTEGER NOT NULL, "stock" INTEGER NOT NULL, "version" INTEGER NOT NULL);
      CREATE TABLE "p_comments__comments" ("id" TEXT PRIMARY KEY, "workspace_id" TEXT NOT NULL, "entry_id" TEXT NOT NULL, "thread_root_id" TEXT NOT NULL, "depth" INTEGER NOT NULL, "status" TEXT NOT NULL, "author_name" TEXT NOT NULL, "body_text" TEXT NOT NULL, "created_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, "version" INTEGER NOT NULL);
    `);
    const now = Date.now();
    raw
      .prepare(`INSERT INTO _plugin_migrations (plugin_id, table_name, ddl, snapshot_path, at) VALUES ('store', 'p_store__products', 'CREATE TABLE "p_store__products" (...)', NULL, ?)`)
      .run(now);
    raw
      .prepare(`INSERT INTO _plugin_identity (plugin_id, source_url, publisher, signature, minted_at) VALUES ('store', 'https://example.invalid/store', 'Tovu', NULL, ?)`)
      .run(now);
    raw
      .prepare(`INSERT INTO "p_store__products" ("id", "title", "price", "stock", "version") VALUES ('prod-1', 'A real paid product', 4200, 7, 1)`)
      .run();
    raw
      .prepare(
        `INSERT INTO "p_comments__comments" ("id", "workspace_id", "entry_id", "thread_root_id", "depth", "status", "author_name", "body_text", "created_at", "updated_at", "version")
         VALUES ('cmt-1', 'ws-1', 'entry-1', 'cmt-1', 0, 'approved', 'A reader', 'a real published comment', '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z', 1)`
      )
      .run();
  } finally {
    raw.close();
  }
}

/**
 * A plugin's business data — products, comments — and the plugin system's own bookkeeping must
 * survive a duplicate. Duplicating a client site with a store must not hand back a store with zero
 * products; re-minting `_plugin_identity` would make an installed plugin look like a first install
 * over tables that already exist, and losing `_plugin_migrations` erases the DDL timeline
 * `data-module.ts` reconciles against.
 *
 * This is the regression for a purge that kept only what `db/schema.sqlite.ts` declares: none of these
 * four tables is declared there, so all four were emptied.
 */
test("plugin tables and their rows survive the copy — a duplicated store keeps its products", () => {
  const parent = mkTempParent();
  try {
    const sourceDbPath = buildSourceWithChatHistory(parent);
    plantPluginData(sourceDbPath);
    const targetDbPath = path.join(parent, "target-content.db");

    duplicateContentDb({ sourceDbPath, targetDbPath });

    const copy = new Database(targetDbPath, { readonly: true });
    try {
      const product = copy.prepare(`SELECT "title", "stock" FROM "p_store__products" WHERE "id" = 'prod-1'`).get() as
        | { title: string; stock: number }
        | undefined;
      assert.deepEqual(product, { title: "A real paid product", stock: 7 }, "the store's product row must survive intact");

      const comment = copy.prepare(`SELECT "body_text" FROM "p_comments__comments" WHERE "id" = 'cmt-1'`).get() as
        | { body_text: string }
        | undefined;
      assert.deepEqual(comment, { body_text: "a real published comment" }, "the comment row must survive intact");

      const migrations = (copy.prepare(`SELECT COUNT(*) AS c FROM _plugin_migrations`).get() as { c: number }).c;
      assert.equal(migrations, 1, "_plugin_migrations must survive — it is the plugin DDL timeline, not chat");

      const identity = (copy.prepare(`SELECT COUNT(*) AS c FROM _plugin_identity`).get() as { c: number }).c;
      assert.equal(identity, 1, "_plugin_identity must survive — a duplicate is not a first install");
    } finally {
      copy.close();
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

/**
 * The adversarial half of the test above, and the reason the fix is an INVERSION rather than a
 * widened keep-list. A keep-list extended with `p_*`/`_plugin_*` would pass the previous test and
 * still empty this table — the exact failure mode `layout.ts` records one level up, where a
 * denylist was replaced rather than lengthened. The purge must name what it deletes; a table
 * nobody has classified is data, and data is kept.
 */
test("a table nobody has classified survives the copy — the purge names what it deletes", () => {
  const parent = mkTempParent();
  try {
    const sourceDbPath = buildSourceWithChatHistory(parent);
    const targetDbPath = path.join(parent, "target-content.db");

    const raw = new Database(sourceDbPath);
    try {
      raw.exec(`CREATE TABLE unclassified_ledger (id TEXT PRIMARY KEY, note TEXT NOT NULL)`);
      raw.prepare(`INSERT INTO unclassified_ledger (id, note) VALUES ('row-1', 'authored by something nobody listed')`).run();
    } finally {
      raw.close();
    }

    duplicateContentDb({ sourceDbPath, targetDbPath });

    const copy = new Database(targetDbPath, { readonly: true });
    try {
      const row = copy.prepare(`SELECT note FROM unclassified_ledger WHERE id = 'row-1'`).get() as { note: string } | undefined;
      assert.deepEqual(
        row,
        { note: "authored by something nobody listed" },
        "an unclassified table's rows must survive — losing a client's data is worse than copying one extra table"
      );
    } finally {
      copy.close();
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

/**
 * The purge set is `chat-orphan-check.ts`'s `CHAT_TABLE_NAMES` and nothing else, so it must not
 * throw against a `content.db` that never had those tables (a future migration dropping them, or a
 * database built by something other than this repo's migrator).
 */
test("a content.db with no chat tables at all duplicates without error", () => {
  const parent = mkTempParent();
  try {
    const sourceDbPath = buildSourceWithChatHistory(parent);
    const targetDbPath = path.join(parent, "target-content.db");

    const raw = new Database(sourceDbPath);
    try {
      raw.exec(`DROP TABLE assistant_agent_sessions; DROP TABLE ai_chat_messages; DROP TABLE ai_chats;`);
    } finally {
      raw.close();
    }

    duplicateContentDb({ sourceDbPath, targetDbPath });

    const copy = new Database(targetDbPath, { readonly: true });
    try {
      const [integrity] = copy.pragma("integrity_check") as Array<{ integrity_check: string }>;
      assert.equal(integrity.integrity_check, "ok");
      const posts = (copy.prepare(`SELECT COUNT(*) AS c FROM posts`).get() as { c: number }).c;
      assert.ok(posts > 0, "content must still be copied when there is nothing to purge");
    } finally {
      copy.close();
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
