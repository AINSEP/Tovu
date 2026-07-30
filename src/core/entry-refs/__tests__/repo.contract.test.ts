import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "../../../infra/sqlite/content-db";
import { InMemoryEntryRefsRepo } from "../repo.memory";
import { SqliteEntryRefsRepo } from "../repo.sqlite";
import type { EntryRefsRepoPort } from "../ports";
import type { EntryRefRow } from "../types";

/**
 * @file Shared contract-test suite for `EntryRefsRepoPort`, run against both `repo.memory.ts` and
 * `repo.sqlite.ts` — mirrors `src/identity/__tests__/repo.contract.test.ts`'s shape (that file's
 * own header cites the convention this file follows).
 *
 * Fable adversarial-review fix (2026-07-21, Finding C/P10a): this port previously had zero SQLite
 * execution anywhere in the test suite — only the in-memory adapter was ever exercised, so a real
 * schema mismatch or a broken delete-then-insert in `SqliteEntryRefsRepo` could ship undetected.
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

    await repo.replaceForSource({
      workspaceId: WS,
      sourceEntryId: "area-1",
      refs: [row({ sourceEntryId: "area-1", targetId: "widget-2", fieldPath: "bodyJson.placements[0]" })],
    });
    found = await repo.findBySource({ workspaceId: WS, sourceEntryId: "area-1" });
    assert.deepEqual(found.map((r) => r.targetId), ["widget-2"], "the prior ref must be gone — replace is a full swap, not an append");
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

    const refs = await repo.findByTarget({ workspaceId: WS, targetKind: "entry", targetId: "widget-shared" });
    assert.deepEqual(
      refs.map((r) => r.sourceEntryId).sort(),
      ["area-footer", "page-1"]
    );
  });

  test(`[${adapterName}] findByTarget/findBySource are scoped per workspace`, async () => {
    const repo = makeRepo();
    await repo.replaceForSource({ workspaceId: WS, sourceEntryId: "area-1", refs: [row({ sourceEntryId: "area-1", targetId: "widget-1" })] });
    await repo.replaceForSource({ workspaceId: WS2, sourceEntryId: "area-1", refs: [row({ workspaceId: WS2, sourceEntryId: "area-1", targetId: "widget-1" })] });

    assert.equal((await repo.findBySource({ workspaceId: WS, sourceEntryId: "area-1" })).length, 1);
    assert.equal(
      (await repo.findByTarget({ workspaceId: WS, targetKind: "entry", targetId: "widget-1" })).length,
      1,
      "a same-id target in a different workspace must not be counted as a reference in this one"
    );
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
