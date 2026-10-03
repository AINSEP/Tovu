import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { flipMarker, lazyKernel } from "../adapters/marker-sql.js";

// F2.5: resolving the lazy DB handle is itself the port contract.
test("lazy kernel resolves the handle only on first use and keeps the same kernel on later calls", (t) => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  let reads = 0;
  const resolve = lazyKernel({ get $client() { reads++; return db; } });
  assert.equal(reads, 0);
  const first = resolve();
  assert.equal(reads, 1);
  assert.equal(resolve(), first);
  assert.equal(reads, 1);
});

test("null expectedVersion still flips the real marker and increments the existing version", async (t) => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec("CREATE TABLE rows (id TEXT, workspace_id TEXT, status TEXT, updated_at TEXT, version INTEGER); INSERT INTO rows VALUES ('r-1', 'ws', 'active', 'before', 12); INSERT INTO rows VALUES ('other', 'foreign', 'active', 'before', 12);");
  const result = await flipMarker({ kernel: lazyKernel(db)(), table: "rows", set: { status: "trash", updated_at: "after" }, from: { column: "status", op: "<>", value: "trash" }, workspaceId: "ws", entityId: "r-1", expectedVersion: null });
  assert.deepEqual(result, { ok: true, version: 13 });
  assert.deepEqual(db.prepare("SELECT * FROM rows ORDER BY id").all(), [
    { id: "other", workspace_id: "foreign", status: "active", updated_at: "before", version: 12 },
    { id: "r-1", workspace_id: "ws", status: "trash", updated_at: "after", version: 13 },
  ]);
});
