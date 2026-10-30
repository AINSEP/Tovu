import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { contentKernel } from "#src/platform/db/content-kernel";
import { flipMarker, lazyKernel } from "../adapters/marker-sql.js";

// F2.5: the injected content kernel is the port; adapter creation must not query its connection.
test("lazy kernel preserves the supplied kernel without querying its connection", (t) => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  const store = contentKernel(db);
  t.mock.method(db, "prepare", () => assert.fail("constructing/resolving the adapter must not query"));
  const resolve = lazyKernel(store);
  assert.equal(resolve(), store);
  assert.equal(resolve(), store);
  assert.equal(db.open, true);
});

test("null expectedVersion still flips the real marker and increments the existing version", async (t) => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec("CREATE TABLE rows (id TEXT, workspace_id TEXT, status TEXT, updated_at TEXT, version INTEGER); INSERT INTO rows VALUES ('r-1', 'ws', 'active', 'before', 12); INSERT INTO rows VALUES ('other', 'foreign', 'active', 'before', 12);");
  const result = await flipMarker({ kernel: lazyKernel(contentKernel(db))(), table: "rows", set: { status: "trash", updated_at: "after" }, from: { column: "status", op: "<>", value: "trash" }, workspaceId: "ws", entityId: "r-1", expectedVersion: null });
  assert.deepEqual(result, { ok: true, version: 13 });
  assert.deepEqual(db.prepare("SELECT * FROM rows ORDER BY id").all(), [
    { id: "other", workspace_id: "foreign", status: "active", updated_at: "before", version: 12 },
    { id: "r-1", workspace_id: "ws", status: "trash", updated_at: "after", version: 13 },
  ]);
});
