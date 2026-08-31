import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import Database from "better-sqlite3";

import { createInMemoryAgentSessionStore, createSqliteAgentSessionStore } from "../agent-session-store.js";

/**
 * @file `createSqliteAgentSessionStore`/`createInMemoryAgentSessionStore` had no test before this
 * file. Exercises the real migration `0051` SQL (not a hand-duplicated copy) the same way
 * `ddl-parity.test.ts` loads migration `0023`, so a future edit to that file that breaks the store's
 * own queries fails here instead of only in production.
 */

const MIGRATION_PATH = join(process.cwd(), "apps/website/src/platform/db/drizzle/0051_assistant_agent_sessions.sql");

/** A fresh `:memory:` db with `ai_chats` stubbed (just enough for the FK) and migration 0051 applied. */
function openTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`CREATE TABLE ai_chats (id TEXT PRIMARY KEY)`);
  db.exec(readFileSync(MIGRATION_PATH, "utf8"));
  return db;
}

describe("createSqliteAgentSessionStore", () => {
  it("returns null for a (conversation, agent) pair with no stored session", async () => {
    const db = openTestDb();
    db.exec(`INSERT INTO ai_chats (id) VALUES ('c1')`);
    const store = createSqliteAgentSessionStore(db);

    assert.equal(await store.getSessionId("c1", "claude"), null);
    db.close();
  });

  it("round-trips a stored session id", async () => {
    const db = openTestDb();
    db.exec(`INSERT INTO ai_chats (id) VALUES ('c1')`);
    const store = createSqliteAgentSessionStore(db);

    await store.setSessionId("c1", "claude", "sess-abc");
    assert.equal(await store.getSessionId("c1", "claude"), "sess-abc");
    db.close();
  });

  it("overwrites the prior session id on a second set for the same pair, rather than erroring or duplicating", async () => {
    const db = openTestDb();
    db.exec(`INSERT INTO ai_chats (id) VALUES ('c1')`);
    const store = createSqliteAgentSessionStore(db);

    await store.setSessionId("c1", "claude", "sess-old");
    await store.setSessionId("c1", "claude", "sess-new");

    assert.equal(await store.getSessionId("c1", "claude"), "sess-new");
    const rowCount = db.prepare(`SELECT COUNT(*) AS n FROM assistant_agent_sessions`).get() as { n: number };
    assert.equal(rowCount.n, 1, "an upsert for the same pair must not leave a duplicate row");
    db.close();
  });

  it("keeps two agent ids for the same conversation independent", async () => {
    const db = openTestDb();
    db.exec(`INSERT INTO ai_chats (id) VALUES ('c1')`);
    const store = createSqliteAgentSessionStore(db);

    await store.setSessionId("c1", "claude", "sess-claude");
    await store.setSessionId("c1", "codex", "sess-codex");

    assert.equal(await store.getSessionId("c1", "claude"), "sess-claude");
    assert.equal(await store.getSessionId("c1", "codex"), "sess-codex");
    db.close();
  });

  it("cascades the delete of its parent conversation, matching migration 0023's own ai_chat_messages cascade", async () => {
    const db = openTestDb();
    db.exec(`INSERT INTO ai_chats (id) VALUES ('c1')`);
    const store = createSqliteAgentSessionStore(db);

    await store.setSessionId("c1", "claude", "sess-abc");
    db.exec(`DELETE FROM ai_chats WHERE id = 'c1'`);

    const rowCount = db.prepare(`SELECT COUNT(*) AS n FROM assistant_agent_sessions`).get() as { n: number };
    assert.equal(rowCount.n, 0, "a session row outlived its conversation — is foreign_keys ON, or the migration's ON DELETE CASCADE intact?");
    db.close();
  });

  it("H1 regression: clearSessionId removes a stored id so the next getSessionId returns null", async () => {
    const db = openTestDb();
    db.exec(`INSERT INTO ai_chats (id) VALUES ('c1')`);
    const store = createSqliteAgentSessionStore(db);

    await store.setSessionId("c1", "claude", "sess-dead");
    await store.clearSessionId("c1", "claude");

    assert.equal(await store.getSessionId("c1", "claude"), null);
    const rowCount = db.prepare(`SELECT COUNT(*) AS n FROM assistant_agent_sessions`).get() as { n: number };
    assert.equal(rowCount.n, 0, "clearSessionId must actually delete the row, not just make it unreadable");
    db.close();
  });

  it("clearSessionId only removes the targeted (conversation, agent) pair, leaving a sibling agent's session intact", async () => {
    const db = openTestDb();
    db.exec(`INSERT INTO ai_chats (id) VALUES ('c1')`);
    const store = createSqliteAgentSessionStore(db);

    await store.setSessionId("c1", "claude", "sess-claude");
    await store.setSessionId("c1", "codex", "sess-codex");
    await store.clearSessionId("c1", "claude");

    assert.equal(await store.getSessionId("c1", "claude"), null);
    assert.equal(await store.getSessionId("c1", "codex"), "sess-codex", "clearing one agent's session must not touch a different agent on the same conversation");
    db.close();
  });

  it("clearSessionId is a silent no-op when nothing is stored for the pair", async () => {
    const db = openTestDb();
    db.exec(`INSERT INTO ai_chats (id) VALUES ('c1')`);
    const store = createSqliteAgentSessionStore(db);

    await assert.doesNotReject(store.clearSessionId("c1", "claude"));
    assert.equal(await store.getSessionId("c1", "claude"), null);
    db.close();
  });
});

describe("createInMemoryAgentSessionStore", () => {
  it("returns null for a pair with no stored session", async () => {
    const store = createInMemoryAgentSessionStore();
    assert.equal(await store.getSessionId("c1", "claude"), null);
  });

  it("round-trips a stored session id", async () => {
    const store = createInMemoryAgentSessionStore();
    await store.setSessionId("c1", "claude", "sess-abc");
    assert.equal(await store.getSessionId("c1", "claude"), "sess-abc");
  });

  it("does not let a concatenation-ambiguous id pair collide with a different pair", async () => {
    // ("a", "bc") and ("ab", "c") would collide under a naive `${a}${b}` join key.
    const store = createInMemoryAgentSessionStore();
    await store.setSessionId("a", "bc", "sess-first");
    await store.setSessionId("ab", "c", "sess-second");

    assert.equal(await store.getSessionId("a", "bc"), "sess-first");
    assert.equal(await store.getSessionId("ab", "c"), "sess-second");
  });

  it("gives two independent store instances two independent maps", async () => {
    const storeA = createInMemoryAgentSessionStore();
    const storeB = createInMemoryAgentSessionStore();

    await storeA.setSessionId("c1", "claude", "sess-abc");
    assert.equal(await storeB.getSessionId("c1", "claude"), null);
  });

  it("H1 regression: clearSessionId removes a stored id so the next getSessionId returns null", async () => {
    const store = createInMemoryAgentSessionStore();
    await store.setSessionId("c1", "claude", "sess-dead");

    await store.clearSessionId("c1", "claude");

    assert.equal(await store.getSessionId("c1", "claude"), null);
  });

  it("clearSessionId is a silent no-op when nothing is stored for the pair", async () => {
    const store = createInMemoryAgentSessionStore();
    await assert.doesNotReject(store.clearSessionId("c1", "claude"));
    assert.equal(await store.getSessionId("c1", "claude"), null);
  });
});
