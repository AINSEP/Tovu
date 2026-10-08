import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { InMemoryEntryRefsRepo } from "../repo.memory.js";
import { SqliteEntryRefsRepo } from "#src/platform/db/sqlite/entry-refs-repo.sqlite";
import type { EntryRefsRepoPort } from "../ports.js";
import type { EntryRefRow } from "../types.js";

/**
 * @file Shared contract-test suite for `EntryRefsRepoPort`, run against both `repo.memory.ts` and
 * `repo.sqlite.ts` — mirrors `src/identity/__tests__/repo.contract.test.ts`'s shape (that file's
 * own header cites the convention this file follows).
 *
 * Both adapters need real execution coverage: schema mismatches or broken delete-then-insert
 * behavior in SQLite cannot be detected by exercising only the memory adapter.
 * `entry_refs` backs widgets' reference-count delete guards and where-used diagnostics (REQ-29..34,
 * REQ-42), so a silent SQLite-adapter bug here would surface as a false "safe to delete" or a
 * false "still referenced" on the real running server.
 */

const WS = "workspace-1";
const WS2 = "workspace-2";

function row(overrides: Partial<EntryRefRow> & Pick<EntryRefRow, "sourceEntryId" | "targetId">): EntryRefRow {
  return {
    workspaceId: WS,
    sourceKind: "widget-area-placement",
    fieldPath: "bodyJson.placements[0]",
    targetKind: "entry",
    ...overrides,
  };
}

function runSuite(adapterName: string, makeRepo: () => EntryRefsRepoPort) {
  test(`[${adapterName}] replaceForSource + findBySource round-trips, replace fully replaces (never an incremental patch)`, async () => {
    const repo = makeRepo();
    await repo.replaceForSource({
      workspaceId: WS,
      sourceEntryId: "area-1",
      refs: [row({ sourceEntryId: "area-1", targetId: "widget-1", fieldPath: "bodyJson.placements[0]" })],
    });
    let found = await repo.findBySource({ workspaceId: WS, sourceEntryId: "area-1" });
    assert.deepEqual(found.map((r) => r.targetId), ["widget-1"]);
    assert.deepEqual(found, [row({ sourceEntryId: "area-1", targetId: "widget-1", fieldPath: "bodyJson.placements[0]" })]);

    await repo.replaceForSource({
      workspaceId: WS,
      sourceEntryId: "area-1",
      refs: [row({ sourceEntryId: "area-1", targetId: "widget-2", sourceKind: "config-field", targetKind: "term", fieldPath: "fields.ext.widget.config.categoryId" })],
    });
    found = await repo.findBySource({ workspaceId: WS, sourceEntryId: "area-1" });
    assert.deepEqual(found.map((r) => r.targetId), ["widget-2"], "the prior ref must be gone — replace is a full swap, not an append");
    assert.deepEqual(found, [row({ sourceEntryId: "area-1", targetId: "widget-2", sourceKind: "config-field", targetKind: "term", fieldPath: "fields.ext.widget.config.categoryId" })]);
  });

  test(`[${adapterName}] replaceForSource with an empty refs array clears the source's rows entirely`, async () => {
    const repo = makeRepo();
    await repo.replaceForSource({ workspaceId: WS, sourceEntryId: "area-1", refs: [row({ sourceEntryId: "area-1", targetId: "widget-1" })] });
    await repo.replaceForSource({ workspaceId: WS, sourceEntryId: "area-1", refs: [] });
    assert.deepEqual(await repo.findBySource({ workspaceId: WS, sourceEntryId: "area-1" }), []);
  });

  test(`[${adapterName}] findByTarget (the where-used / safe-delete check, REQ-34/42) aggregates references from multiple distinct sources`, async () => {
    const repo = makeRepo();
    await repo.replaceForSource({ workspaceId: WS, sourceEntryId: "area-footer", refs: [row({ sourceEntryId: "area-footer", targetId: "widget-shared" })] });
    await repo.replaceForSource({
      workspaceId: WS,
      sourceEntryId: "page-1",
      refs: [row({ sourceEntryId: "page-1", targetId: "widget-shared", sourceKind: "widget-embed", fieldPath: "bodyJson.content[3]" })],
    });

    await repo.replaceForSource({ workspaceId: WS, sourceEntryId: "unrelated-target", refs: [row({ sourceEntryId: "unrelated-target", targetId: "widget-other" })] });
    await repo.replaceForSource({ workspaceId: WS, sourceEntryId: "same-id-asset", refs: [row({ sourceEntryId: "same-id-asset", targetId: "widget-shared", targetKind: "asset" })] });

    const refs = await repo.findByTarget({ workspaceId: WS, targetKind: "entry", targetId: "widget-shared" });
    assert.deepEqual(
      refs.map((r) => r.sourceEntryId).sort(),
      ["area-footer", "page-1"]
    );
    assert.deepEqual(refs.sort((a, b) => a.sourceEntryId.localeCompare(b.sourceEntryId)), [
      row({ sourceEntryId: "area-footer", targetId: "widget-shared" }),
      row({ sourceEntryId: "page-1", targetId: "widget-shared", sourceKind: "widget-embed", fieldPath: "bodyJson.content[3]" }),
    ], "where-used must return the full provenance of only the requested target id and kind");
    assert.deepEqual(await repo.findByTarget({ workspaceId: WS, targetKind: "asset", targetId: "widget-shared" }), [
      row({ sourceEntryId: "same-id-asset", targetId: "widget-shared", targetKind: "asset" }),
    ]);
  });

  test(`[${adapterName}] findByTarget/findBySource are scoped per workspace`, async () => {
    const repo = makeRepo();
    await repo.replaceForSource({ workspaceId: WS, sourceEntryId: "area-1", refs: [row({ sourceEntryId: "area-1", targetId: "widget-1" })] });
    await repo.replaceForSource({ workspaceId: WS2, sourceEntryId: "area-1", refs: [row({ workspaceId: WS2, sourceEntryId: "area-1", targetId: "widget-1", sourceKind: "widget-embed", fieldPath: "bodyJson.content[4]" })] });

    assert.equal((await repo.findBySource({ workspaceId: WS, sourceEntryId: "area-1" })).length, 1);
    assert.equal(
      (await repo.findByTarget({ workspaceId: WS, targetKind: "entry", targetId: "widget-1" })).length,
      1,
      "a same-id target in a different workspace must not be counted as a reference in this one"
    );
    const first = row({ sourceEntryId: "area-1", targetId: "widget-1" });
    const second = row({ workspaceId: WS2, sourceEntryId: "area-1", targetId: "widget-1", sourceKind: "widget-embed", fieldPath: "bodyJson.content[4]" });
    assert.deepEqual(await repo.findBySource({ workspaceId: WS, sourceEntryId: "area-1" }), [first]);
    assert.deepEqual(await repo.findBySource({ workspaceId: WS2, sourceEntryId: "area-1" }), [second]);
    assert.deepEqual(await repo.findByTarget({ workspaceId: WS, targetKind: "entry", targetId: "widget-1" }), [first]);
    assert.deepEqual(await repo.findByTarget({ workspaceId: WS2, targetKind: "entry", targetId: "widget-1" }), [second]);
  });

  test(`[${adapterName}] removeBySource (the source itself was force-purged) drops only that source's rows`, async () => {
    const repo = makeRepo();
    await repo.replaceForSource({ workspaceId: WS, sourceEntryId: "area-1", refs: [row({ sourceEntryId: "area-1", targetId: "widget-1" })] });
    await repo.replaceForSource({ workspaceId: WS, sourceEntryId: "area-2", refs: [row({ sourceEntryId: "area-2", targetId: "widget-1" })] });

    await repo.removeBySource({ workspaceId: WS, sourceEntryId: "area-1" });

    assert.deepEqual(await repo.findBySource({ workspaceId: WS, sourceEntryId: "area-1" }), []);
    assert.equal((await repo.findBySource({ workspaceId: WS, sourceEntryId: "area-2" })).length, 1, "removeBySource must not touch other sources");
  });

  test(`[${adapterName}] rebuildForWorkspace (the index is derived + rebuildable by definition) fully replaces the workspace's rows and leaves other workspaces untouched`, async () => {
    const repo = makeRepo();
    await repo.replaceForSource({ workspaceId: WS, sourceEntryId: "stale-source", refs: [row({ sourceEntryId: "stale-source", targetId: "widget-1" })] });
    await repo.replaceForSource({ workspaceId: WS2, sourceEntryId: "area-1", refs: [row({ workspaceId: WS2, sourceEntryId: "area-1", targetId: "untouched" })] });

    await repo.rebuildForWorkspace({
      workspaceId: WS,
      refs: [row({ sourceEntryId: "rebuilt-source", targetId: "widget-2", fieldPath: "bodyJson.placements[0]" })],
    });

    assert.deepEqual(await repo.findBySource({ workspaceId: WS, sourceEntryId: "stale-source" }), [], "the stale pre-rebuild row must be gone");
    assert.equal((await repo.findBySource({ workspaceId: WS, sourceEntryId: "rebuilt-source" })).length, 1);
    assert.equal(
      (await repo.findBySource({ workspaceId: WS2, sourceEntryId: "area-1" })).length,
      1,
      "rebuild must be scoped to one workspace only"
    );
  });
}

runSuite("InMemoryEntryRefsRepo", () => new InMemoryEntryRefsRepo());
runSuite("SqliteEntryRefsRepo", () => new SqliteEntryRefsRepo(openContentDb(":memory:")));
