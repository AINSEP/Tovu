import assert from "node:assert/strict";
import test from "node:test";
import { openContentDb } from "../../../platform/db/sqlite/content-db.js";
import { contentKernel } from "../../../platform/db/content-kernel.js";
import { SqliteSiteTitlePreservationStore } from "../site-title-preservation.sqlite.js";

for (const useKernel of [false, true]) {
  test(`SQLite title-preservation wrapper uses the supplied ${useKernel ? "kernel" : "content DB"} for reads and writes`, async (t) => {
    const db = openContentDb(":memory:");
    t.after(() => db.$client.close());
    db.$client.prepare("INSERT INTO site_title_preexisting_workspaces (workspace_id, preserved_at) VALUES (?, NULL)").run("ws-b");
    db.$client.prepare("INSERT INTO site_title_preexisting_workspaces (workspace_id, preserved_at) VALUES (?, NULL)").run("ws-a");
    const store = new SqliteSiteTitlePreservationStore(useKernel ? contentKernel(db) : db);
    assert.deepEqual(await store.listPendingWorkspaceIds(), ["ws-a", "ws-b"]);
    await store.markPreserved({ workspaceId: "ws-a", preservedAt: "2026-10-01T12:00:00.000Z" });
    assert.deepEqual(db.$client.prepare("SELECT workspace_id, preserved_at FROM site_title_preexisting_workspaces ORDER BY workspace_id").all(),
      [{ workspace_id: "ws-a", preserved_at: "2026-10-01T12:00:00.000Z" }, { workspace_id: "ws-b", preserved_at: null }]);
    assert.equal(await store.isPending("ws-a"), false);
    assert.equal(await store.isPending("ws-b"), true);
    assert.equal(await store.isPending("absent"), false);
  });
}
