import assert from "node:assert/strict";
import test from "node:test";

import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import {
  InMemoryMenuRepo,
  MenuConflictError,
  InMemoryNavLocationBindingRepo,
  type MenuRepoPort,
  type NavLocationBindingRepoPort,
  type NavMenuDoc,
  type NavMenuEntry,
} from "@jini-ai/cms/navigation";
import { SqlMenuRepo, SqlNavLocationBindingRepo } from "../repo.js";

/**
 * @file Shared contract-test suites for `MenuRepoPort` and
 * `NavLocationBindingRepoPort` (ADR-PIPE-012 D-5, C-008a/C-008b, T015/T016).
 *
 * Re-runs the exact behavioral suite against both adapters — in-memory
 * (`repo.memory.ts`) and the one Kysely body (`repo.ts`) on SQLite and PGlite — mirroring
 * the `PostRepoPort`/`SettingsRepoPort` dual-adapter precedent
 * (`src/features/settings/__tests__/repo.contract.test.ts`). Plus one new
 * case for `NavLocationBindingRepoPort`: a DB-level unique-constraint proof
 * that two concurrent `upsert` calls for the same `(workspaceId, locationKey)`
 * never leave two rows (INV-02, strengthened by the real SQLite adapter).
 */

const NOW = "2026-07-13T00:00:00.000Z";

function sampleDoc(): NavMenuDoc {
  return { type: "menu", version: 1, items: [] };
}

function sampleMenu(overrides: Partial<NavMenuEntry> = {}): NavMenuEntry {
  return {
    id: "menu-1",
    workspaceId: "ws-1",
    slug: "primary-nav",
    title: "Primary Nav",
    status: "draft",
    doc: sampleDoc(),
    locations: [],
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// MenuRepoPort contract suite (C-008a)
// ---------------------------------------------------------------------------

function runMenuRepoContractSuite(adapterName: string, makeRepo: () => MenuRepoPort) {
  test(`[${adapterName}] save + findById round-trips a menu, preserving the doc and locations`, async () => {
    const repo = makeRepo();
    const menu = sampleMenu({
      doc: { type: "menu", version: 1, items: [{ id: "item-1", label: "Home", target: { kind: "url", href: "/" } }] },
      locations: ["primary"],
    });
    await repo.save(menu);

    const found = await repo.findById({ workspaceId: "ws-1", id: "menu-1" });
    assert.ok(found);
    assert.equal(found?.slug, "primary-nav");
    assert.deepEqual(found?.locations, ["primary"]);
    assert.equal(found?.doc.items.length, 1);
    assert.equal(found?.doc.items[0].label, "Home");
  });

  test(`[${adapterName}] findById returns null for an unknown id`, async () => {
    const repo = makeRepo();
    assert.equal(await repo.findById({ workspaceId: "ws-1", id: "does-not-exist" }), null);
  });

  test(`[${adapterName}] findBySlug finds a menu by its slug, scoped to the workspace`, async () => {
    const repo = makeRepo();
    await repo.save(sampleMenu({ id: "menu-2", workspaceId: "ws-2", slug: "primary-nav" }));
    await repo.save(sampleMenu());

    const found = await repo.findBySlug({ workspaceId: "ws-1", slug: "primary-nav" });
    assert.equal(found?.id, "menu-1");

    const otherWorkspace = await repo.findBySlug({ workspaceId: "ws-1", slug: "not-here" });
    assert.equal(otherWorkspace, null);
    assert.equal((await repo.findBySlug({ workspaceId: "ws-2", slug: "primary-nav" }))?.id, "menu-2");
    assert.equal(await repo.findBySlug({ workspaceId: "ws-3", slug: "primary-nav" }), null);
    assert.equal(await repo.findById({ workspaceId: "ws-1", id: "menu-2" }), null);
    assert.equal(await repo.findById({ workspaceId: "ws-2", id: "menu-1" }), null);
    await repo.save(sampleMenu({ id: "foreign-only", workspaceId: "ws-2", slug: "foreign-only" }));
    assert.equal(await repo.findBySlug({ workspaceId: "ws-1", slug: "foreign-only" }), null);
  });

  test(`[${adapterName}] list returns only the requested workspace's menus`, async () => {
    const repo = makeRepo();
    await repo.save(sampleMenu({ id: "menu-1", workspaceId: "ws-1", slug: "a" }));
    await repo.save(sampleMenu({ id: "menu-2", workspaceId: "ws-1", slug: "b" }));
    await repo.save(sampleMenu({ id: "menu-3", workspaceId: "ws-2", slug: "c" }));

    const ws1 = await repo.list({ workspaceId: "ws-1" });
    assert.equal(ws1.length, 2);
    assert.deepEqual(
      ws1.map((m) => m.id).sort(),
      ["menu-1", "menu-2"]
    );
  });

  test(`[${adapterName}] save is an upsert: a second save with the same id replaces the row`, async () => {
    const repo = makeRepo();
    await repo.save(sampleMenu({ version: 1, title: "Primary Nav" }));
    await repo.save(sampleMenu({ version: 2, title: "Renamed Nav" }));

    const found = await repo.findById({ workspaceId: "ws-1", id: "menu-1" });
    assert.equal(found?.version, 2);
    assert.equal(found?.title, "Renamed Nav");

    const all = await repo.list({ workspaceId: "ws-1" });
    assert.equal(all.length, 1, "no duplicate row from the second save");
  });

  test(`[${adapterName}] remove deletes the row; a subsequent findById returns null`, async () => {
    const repo = makeRepo();
    await repo.save(sampleMenu());
    const neighbor = sampleMenu({ id: "neighbor", slug: "neighbor", title: "Keep me", version: 4 });
    const foreign = sampleMenu({ id: "foreign", workspaceId: "ws-2", slug: "foreign", title: "Other workspace" });
    await repo.save(neighbor);
    await repo.save(foreign);
    await repo.remove({ workspaceId: "ws-1", id: "menu-1" });
    assert.equal(await repo.findById({ workspaceId: "ws-1", id: "menu-1" }), null);
    assert.deepEqual(await repo.findById({ workspaceId: "ws-1", id: neighbor.id }), neighbor);
    assert.deepEqual(await repo.findById({ workspaceId: "ws-2", id: foreign.id }), foreign);
    await repo.remove({ workspaceId: "ws-2", id: neighbor.id });
    assert.deepEqual(await repo.findById({ workspaceId: "ws-1", id: neighbor.id }), neighbor);
  });
}

runMenuRepoContractSuite("InMemoryMenuRepo", () => new InMemoryMenuRepo());
const menuDialects = eachDialect({ tables: ["menus"], make: (kernel) => ({ kernel, repo: new SqlMenuRepo(kernel) }) });
for (const each of menuDialects) {
  runMenuRepoContractSuite(`SqlMenuRepo ${each.name}`, () => each.make().repo);
}

// ---------------------------------------------------------------------------
// Trash semantics of the durable menu repo (a `status = 'trash'` row), on every dialect
// ---------------------------------------------------------------------------

for (const each of menuDialects) {
  test(`[SqlMenuRepo ${each.name}] a trashed menu is hidden from live reads, not revived by save, and still holds its slug`, async () => {
    const { kernel, repo } = each.make();
    await repo.save(sampleMenu({ doc: { type: "menu", version: 1, items: [{ id: "i", label: "Home", target: { kind: "url", href: "/" } }] } }));
    await kernel.run((db) => db.updateTable("menus").set({ status: "trash" }).where("id", "=", "menu-1").execute());

    assert.equal(await repo.findById({ workspaceId: "ws-1", id: "menu-1" }), null);
    assert.equal(await repo.findBySlug({ workspaceId: "ws-1", slug: "primary-nav" }), null);
    assert.deepEqual(await repo.list({ workspaceId: "ws-1" }), []);
    assert.equal((await repo.findByIdIncludingTrashed({ workspaceId: "ws-1", id: "menu-1" }))?.status, "trash");

    await repo.save(sampleMenu({ title: "Stale save", status: "published" }));
    const still = await repo.findByIdIncludingTrashed({ workspaceId: "ws-1", id: "menu-1" });
    assert.equal(still?.status, "trash", "a stale save must not revive a trashed menu");
    assert.equal(still?.title, "Primary Nav");

    await assert.rejects(() => repo.save(sampleMenu({ id: "menu-2" })), MenuConflictError);
  });
}

// ---------------------------------------------------------------------------
// NavLocationBindingRepoPort contract suite (C-008b, INV-02)
// ---------------------------------------------------------------------------

function runBindingRepoContractSuite(adapterName: string, makeRepo: () => NavLocationBindingRepoPort) {
  test(`[${adapterName}] upsert + findByLocation round-trips a binding`, async () => {
    const repo = makeRepo();
    await repo.upsert({ workspaceId: "ws-1", locationKey: "primary", menuId: "menu-1", boundAt: NOW });

    const found = await repo.findByLocation({ workspaceId: "ws-1", locationKey: "primary" });
    assert.equal(found?.menuId, "menu-1");
  });

  test(`[${adapterName}] upsert reassigns a location already bound elsewhere (last-writer-wins, at most one row per location)`, async () => {
    const repo = makeRepo();
    await repo.upsert({ workspaceId: "ws-1", locationKey: "primary", menuId: "menu-a", boundAt: NOW });
    await repo.upsert({ workspaceId: "ws-1", locationKey: "primary", menuId: "menu-b", boundAt: "2026-07-13T01:00:00.000Z" });

    const found = await repo.findByLocation({ workspaceId: "ws-1", locationKey: "primary" });
    assert.equal(found?.menuId, "menu-b");

    const all = await repo.listByWorkspace({ workspaceId: "ws-1" });
    assert.equal(all.filter((row) => row.locationKey === "primary").length, 1, "exactly one row for this location");
  });

  test(`[${adapterName}] listByMenu returns every location a menu fills`, async () => {
    const repo = makeRepo();
    await repo.upsert({ workspaceId: "ws-1", locationKey: "primary", menuId: "menu-1", boundAt: NOW });
    await repo.upsert({ workspaceId: "ws-1", locationKey: "footer", menuId: "menu-1", boundAt: NOW });
    await repo.upsert({ workspaceId: "ws-1", locationKey: "sidebar", menuId: "menu-2", boundAt: NOW });

    const rows = await repo.listByMenu({ workspaceId: "ws-1", menuId: "menu-1" });
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((r) => r.locationKey).sort(),
      ["footer", "primary"]
    );
  });

  test(`[${adapterName}] remove drops a single binding`, async () => {
    const repo = makeRepo();
    await repo.upsert({ workspaceId: "ws-1", locationKey: "primary", menuId: "menu-1", boundAt: NOW });
    const neighbor = { workspaceId: "ws-1", locationKey: "footer", menuId: "menu-2", boundAt: NOW };
    const foreign = { workspaceId: "ws-2", locationKey: "primary", menuId: "menu-3", boundAt: NOW };
    await repo.upsert(neighbor);
    await repo.upsert(foreign);
    await repo.remove({ workspaceId: "ws-1", locationKey: "primary" });
    assert.equal(await repo.findByLocation({ workspaceId: "ws-1", locationKey: "primary" }), null);
    assert.deepEqual(await repo.findByLocation({ workspaceId: neighbor.workspaceId, locationKey: neighbor.locationKey }), neighbor);
    assert.deepEqual(await repo.findByLocation({ workspaceId: foreign.workspaceId, locationKey: foreign.locationKey }), foreign);
  });

  test(`[${adapterName}] removeByMenu drops every binding for a menu`, async () => {
    const repo = makeRepo();
    await repo.upsert({ workspaceId: "ws-1", locationKey: "primary", menuId: "menu-1", boundAt: NOW });
    await repo.upsert({ workspaceId: "ws-1", locationKey: "footer", menuId: "menu-1", boundAt: NOW });
    await repo.upsert({ workspaceId: "ws-1", locationKey: "sidebar", menuId: "menu-2", boundAt: NOW });

    await repo.removeByMenu({ workspaceId: "ws-1", menuId: "menu-1" });

    assert.equal((await repo.listByMenu({ workspaceId: "ws-1", menuId: "menu-1" })).length, 0);
    assert.equal((await repo.listByMenu({ workspaceId: "ws-1", menuId: "menu-2" })).length, 1);
  });

  test(`[${adapterName}] rebuildForWorkspace replaces the whole workspace's index and is idempotent`, async () => {
    const repo = makeRepo();
    await repo.upsert({ workspaceId: "ws-1", locationKey: "stale", menuId: "menu-0", boundAt: NOW });
    await repo.upsert({ workspaceId: "ws-2", locationKey: "untouched", menuId: "menu-x", boundAt: NOW });

    const replacement = [
      { workspaceId: "ws-1", locationKey: "primary", menuId: "menu-1", boundAt: NOW },
      { workspaceId: "ws-1", locationKey: "footer", menuId: "menu-2", boundAt: NOW },
    ];
    await repo.rebuildForWorkspace({ workspaceId: "ws-1", bindings: replacement });

    const ws1 = await repo.listByWorkspace({ workspaceId: "ws-1" });
    assert.equal(ws1.length, 2);
    assert.deepEqual(ws1.sort((a, b) => a.locationKey.localeCompare(b.locationKey)), [...replacement].sort((a, b) => a.locationKey.localeCompare(b.locationKey)));
    assert.equal(ws1.some((r) => r.locationKey === "stale"), false, "the stale pre-rebuild row is gone");

    // Idempotent: running again with the same input produces the same result.
    await repo.rebuildForWorkspace({ workspaceId: "ws-1", bindings: replacement });
    const ws1Again = await repo.listByWorkspace({ workspaceId: "ws-1" });
    assert.equal(ws1Again.length, 2);
    assert.deepEqual(ws1Again.sort((a, b) => a.locationKey.localeCompare(b.locationKey)), [...replacement].sort((a, b) => a.locationKey.localeCompare(b.locationKey)));

    // Other workspaces are untouched by the rebuild.
    const ws2 = await repo.listByWorkspace({ workspaceId: "ws-2" });
    assert.equal(ws2.length, 1);
    assert.deepEqual(ws2, [{ workspaceId: "ws-2", locationKey: "untouched", menuId: "menu-x", boundAt: NOW }]);
  });

  test(`[${adapterName}] rebuildForWorkspace with an empty bindings list clears the workspace's index without leaving stale rows`, async () => {
    const repo = makeRepo();
    await repo.upsert({ workspaceId: "ws-1", locationKey: "stale", menuId: "menu-0", boundAt: NOW });
    await repo.upsert({ workspaceId: "ws-2", locationKey: "untouched", menuId: "menu-x", boundAt: NOW });

    // A workspace with no bound locations left at all -- the "unbind everything" case (SqliteNav-
    // LocationBindingRepo takes a dedicated early-return path here to skip an empty INSERT, which
    // some SQLite drivers reject; this proves that path is behaviorally identical to the general one).
    await repo.rebuildForWorkspace({ workspaceId: "ws-1", bindings: [] });

    assert.equal((await repo.listByWorkspace({ workspaceId: "ws-1" })).length, 0);
    assert.equal((await repo.listByWorkspace({ workspaceId: "ws-2" })).length, 1, "other workspaces are untouched");
  });
}

runBindingRepoContractSuite("InMemoryNavLocationBindingRepo", () => new InMemoryNavLocationBindingRepo());
const bindingDialects = eachDialect({ tables: ["nav_location_bindings"], make: (kernel) => new SqlNavLocationBindingRepo(kernel) });
for (const each of bindingDialects) {
  runBindingRepoContractSuite(`SqlNavLocationBindingRepo ${each.name}`, each.make);
}

// ---------------------------------------------------------------------------
// T016 / INV-02: DB-level unique-constraint proof (durable adapter only — the
// in-memory adapter's guarantee rests on the single-threaded event loop,
// which this test does not exercise).
// ---------------------------------------------------------------------------

for (const each of bindingDialects) test(`SqlNavLocationBindingRepo ${each.name}: two concurrent upsert calls for the same (workspaceId, locationKey) never leave two rows`, async () => {
  const repo = each.make();

  await Promise.all([
    repo.upsert({ workspaceId: "ws-1", locationKey: "primary", menuId: "menu-a", boundAt: "2026-07-13T00:00:00.000Z" }),
    repo.upsert({ workspaceId: "ws-1", locationKey: "primary", menuId: "menu-b", boundAt: "2026-07-13T00:00:01.000Z" }),
  ]);

  const all = await repo.listByWorkspace({ workspaceId: "ws-1" });
  assert.equal(all.length, 1, "the DB-level UNIQUE(workspace_id, location_key) constraint allows only one row");
  assert.ok(["menu-a", "menu-b"].includes(all[0].menuId), "one of the two concurrent writers won");
});

for (const each of bindingDialects) {
  test(`[SqlNavLocationBindingRepo ${each.name}] a failed rebuild rolls back the complete original index`, async () => {
    const repo = each.make();
    const original = [{ workspaceId: "ws-1", locationKey: "primary", menuId: "menu-original", boundAt: NOW }, { workspaceId: "ws-1", locationKey: "footer", menuId: "footer-original", boundAt: NOW }];
    const foreign = { workspaceId: "ws-2", locationKey: "primary", menuId: "foreign", boundAt: NOW };
    for (const binding of [...original, foreign]) await repo.upsert(binding);
    const duplicate = { workspaceId: "ws-1", locationKey: "replacement", menuId: "replacement-menu", boundAt: NOW };
    await assert.rejects(repo.rebuildForWorkspace({ workspaceId: "ws-1", bindings: [duplicate, duplicate] }));
    const sort = (rows: typeof original) => rows.sort((a, b) => a.locationKey.localeCompare(b.locationKey));
    assert.deepEqual(sort(await repo.listByWorkspace({ workspaceId: "ws-1" })), sort([...original]));
    assert.deepEqual(await repo.listByWorkspace({ workspaceId: "ws-2" }), [foreign]);
  });
}
