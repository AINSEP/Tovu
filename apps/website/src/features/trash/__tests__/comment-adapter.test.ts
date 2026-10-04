import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import { createCommentTrashAdapter } from "../adapters/comment.js";

function harness(t: TestContext) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE p_comments__comments (id TEXT, workspace_id TEXT, status TEXT, updated_at TEXT, version INTEGER, body_text TEXT, PRIMARY KEY (workspace_id, id));
    CREATE TABLE p_comments__moderation_log (comment_id TEXT, note TEXT);`);
  const insert = db.prepare("INSERT INTO p_comments__comments VALUES (?, ?, ?, 'before', 7, '{corrupt}')");
  insert.run("c-1", "ws-one", "spam");
  insert.run("c-1", "ws-two", "approved");
  db.prepare("INSERT INTO p_comments__moderation_log VALUES ('c-1', 'prior moderation')").run();
  const read = (ws = "ws-one") => db.prepare("SELECT status, updated_at, version, body_text FROM p_comments__comments WHERE workspace_id = ? AND id = 'c-1'").get(ws);
  return { db, adapter: createCommentTrashAdapter(db), read };
}

// F6.3/F4.5: read the real table before/after; a success response cannot hide a no-op.
test("hide bumps version without parsing content, and restore sends spam back to pending moderation", async (t) => {
  const h = harness(t);
  assert.deepEqual(h.read(), { status: "spam", updated_at: "before", version: 7, body_text: "{corrupt}" });
  assert.deepEqual(await h.adapter.hide({ workspaceId: "ws-one", entityId: "c-1", at: "hidden-at", expectedVersion: 7 }), { ok: true, version: 8 });
  assert.deepEqual(h.read(), { status: "trash", updated_at: "hidden-at", version: 8, body_text: "{corrupt}" });
  assert.deepEqual(await h.adapter.hide({ workspaceId: "ws-one", entityId: "c-1", at: "retry-at", expectedVersion: null }), { ok: true, version: 8 });
  assert.deepEqual(h.read(), { status: "trash", updated_at: "hidden-at", version: 8, body_text: "{corrupt}" });
  assert.deepEqual(await h.adapter.unhide({ workspaceId: "ws-one", entityId: "c-1", at: "restored-at", expectedVersion: 8 }, { priorMarker: "spam" }), { ok: true, version: 9 });
  assert.deepEqual(h.read(), { status: "pending", updated_at: "restored-at", version: 9, body_text: "{corrupt}" });
  assert.deepEqual(h.read("ws-two"), { status: "approved", updated_at: "before", version: 7, body_text: "{corrupt}" });
});

test("stale and foreign writes preserve the row; purge deletes only the comment and retains its moderation log", async (t) => {
  const h = harness(t);
  assert.deepEqual(await h.adapter.hide({ workspaceId: "ws-one", entityId: "c-1", at: "at", expectedVersion: 6 }), { ok: false, reason: "version-changed" });
  assert.deepEqual(await h.adapter.unhide({ workspaceId: "ws-missing", entityId: "c-1", at: "at", expectedVersion: null }), { ok: false, reason: "not-found" });
  assert.equal(await h.adapter.purge({ workspaceId: "ws-one", entityId: "c-1", expectedVersion: 6 }), "version-changed");
  assert.deepEqual(h.read(), { status: "spam", updated_at: "before", version: 7, body_text: "{corrupt}" });
  assert.equal(await h.adapter.purge({ workspaceId: "ws-one", entityId: "c-1", expectedVersion: 7 }), "purged");
  assert.equal(h.read(), undefined);
  assert.equal(await h.adapter.purge({ workspaceId: "ws-one", entityId: "c-1", expectedVersion: 7 }), "already-gone");
  assert.deepEqual(h.read("ws-two"), { status: "approved", updated_at: "before", version: 7, body_text: "{corrupt}" });
  assert.deepEqual(h.db.prepare("SELECT * FROM p_comments__moderation_log").all(), [{ comment_id: "c-1", note: "prior moderation" }]);
});
