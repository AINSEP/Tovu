import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "../../infra/sqlite/content-db";
import { InMemoryWidgetRegionBindingRepo } from "../repo.memory";
import { SqliteWidgetRegionBindingRepo } from "../repo.sqlite";
import type { WidgetRegionBindingRepoPort } from "../ports";

/**
 * @file Shared contract-test suite for `WidgetRegionBindingRepoPort`, run against both
 * `repo.memory.ts` and `repo.sqlite.ts` — mirrors `src/identity/__tests__/repo.contract.test.ts`'s
 * shape (that file's own header cites the convention this file follows).
 *
 * Fable adversarial-review fix (2026-07-21, Finding C/P10a): this port previously had zero SQLite
 * execution anywhere in the test suite — only the in-memory adapter was ever exercised, so a real
 * schema mismatch, a broken `UNIQUE(workspace_id, region_key)` constraint, or an `onConflictDoUpdate`
 * target error in `SqliteWidgetRegionBindingRepo` could ship undetected.
 */

const WS = "workspace-1";
const WS2 = "workspace-2";

function runSuite(adapterName: string, makeRepo: () => WidgetRegionBindingRepoPort) {
  test(`[${adapterName}] upsert + findByRegion round-trips, upsert on the same (workspace, regionKey) replaces the row (real UNIQUE constraint, not just in-memory discipline)`, async () => {
    const repo = makeRepo();
    await repo.upsert({ workspaceId: WS, regionKey: "footer", areaEntryId: "area-1", updatedAt: "2026-07-21T00:00:00.000Z" });
    let found = await repo.findByRegion({ workspaceId: WS, regionKey: "footer" });
    assert.equal(found?.areaEntryId, "area-1");

    await repo.upsert({ workspaceId: WS, regionKey: "footer", areaEntryId: "area-2", updatedAt: "2026-07-21T01:00:00.000Z" });
    found = await repo.findByRegion({ workspaceId: WS, regionKey: "footer" });
    assert.equal(found?.areaEntryId, "area-2", "upsert must replace, not duplicate, the existing binding for this region");
  });

  test(`[${adapterName}] findByRegion is scoped per workspace — the same regionKey in two workspaces are independent bindings`, async () => {
    const repo = makeRepo();
    await repo.upsert({ workspaceId: WS, regionKey: "footer", areaEntryId: "ws1-area", updatedAt: "2026-07-21T00:00:00.000Z" });
    await repo.upsert({ workspaceId: WS2, regionKey: "footer", areaEntryId: "ws2-area", updatedAt: "2026-07-21T00:00:00.000Z" });

    assert.equal((await repo.findByRegion({ workspaceId: WS, regionKey: "footer" }))?.areaEntryId, "ws1-area");
    assert.equal((await repo.findByRegion({ workspaceId: WS2, regionKey: "footer" }))?.areaEntryId, "ws2-area");
  });

  test(`[${adapterName}] listByWorkspace scopes by workspace`, async () => {
    const repo = makeRepo();
    await repo.upsert({ workspaceId: WS, regionKey: "footer", areaEntryId: "a1", updatedAt: "2026-07-21T00:00:00.000Z" });
    await repo.upsert({ workspaceId: WS, regionKey: "sidebar", areaEntryId: "a2", updatedAt: "2026-07-21T00:00:00.000Z" });
    await repo.upsert({ workspaceId: WS2, regionKey: "footer", areaEntryId: "a3", updatedAt: "2026-07-21T00:00:00.000Z" });

    const rows = await repo.listByWorkspace({ workspaceId: WS });
    assert.deepEqual(rows.map((r) => r.regionKey).sort(), ["footer", "sidebar"]);
  });

  test(`[${adapterName}] markInactive (REQ-14) removes only the targeted region's binding, leaves the widget_area entry untouched (out of this port's scope) and other regions/workspaces intact`, async () => {
    const repo = makeRepo();
    await repo.upsert({ workspaceId: WS, regionKey: "footer", areaEntryId: "a1", updatedAt: "2026-07-21T00:00:00.000Z" });
    await repo.upsert({ workspaceId: WS, regionKey: "sidebar", areaEntryId: "a2", updatedAt: "2026-07-21T00:00:00.000Z" });
    await repo.upsert({ workspaceId: WS2, regionKey: "footer", areaEntryId: "a3", updatedAt: "2026-07-21T00:00:00.000Z" });

    await repo.markInactive({ workspaceId: WS, regionKey: "footer" });

    assert.equal(await repo.findByRegion({ workspaceId: WS, regionKey: "footer" }), null);
    assert.equal((await repo.findByRegion({ workspaceId: WS, regionKey: "sidebar" }))?.areaEntryId, "a2");
    assert.equal((await repo.findByRegion({ workspaceId: WS2, regionKey: "footer" }))?.areaEntryId, "a3", "markInactive must not leak across workspaces");
  });

  test(`[${adapterName}] rebuildForWorkspace (INV-02: the index is always derivable, in full, from live widget_area entries alone) fully replaces the workspace's rows and leaves other workspaces untouched`, async () => {
    const repo = makeRepo();
    await repo.upsert({ workspaceId: WS, regionKey: "footer", areaEntryId: "stale", updatedAt: "2026-07-21T00:00:00.000Z" });
    await repo.upsert({ workspaceId: WS2, regionKey: "footer", areaEntryId: "ws2-untouched", updatedAt: "2026-07-21T00:00:00.000Z" });

    await repo.rebuildForWorkspace({
      workspaceId: WS,
      bindings: [
        { workspaceId: WS, regionKey: "header", areaEntryId: "rebuilt-header", updatedAt: "2026-07-21T02:00:00.000Z" },
        { workspaceId: WS, regionKey: "sidebar", areaEntryId: "rebuilt-sidebar", updatedAt: "2026-07-21T02:00:00.000Z" },
      ],
    });

    assert.equal(await repo.findByRegion({ workspaceId: WS, regionKey: "footer" }), null, "the stale pre-rebuild row must be gone");
    assert.equal((await repo.findByRegion({ workspaceId: WS, regionKey: "header" }))?.areaEntryId, "rebuilt-header");
    assert.equal((await repo.findByRegion({ workspaceId: WS, regionKey: "sidebar" }))?.areaEntryId, "rebuilt-sidebar");
    assert.equal((await repo.findByRegion({ workspaceId: WS2, regionKey: "footer" }))?.areaEntryId, "ws2-untouched", "rebuild must be scoped to one workspace only");
  });
}

runSuite("InMemoryWidgetRegionBindingRepo", () => new InMemoryWidgetRegionBindingRepo());
runSuite("SqliteWidgetRegionBindingRepo", () => new SqliteWidgetRegionBindingRepo(openContentDb(":memory:")));
