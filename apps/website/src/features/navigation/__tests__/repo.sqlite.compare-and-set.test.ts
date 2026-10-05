import assert from "node:assert/strict";
import test from "node:test";

import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { MenuConflictError, updateMenuTree, type MenuRepoPort, type NavMenuEntry } from "@jini-ai/cms/navigation";
import type { OutboxPort } from "@jini-ai/cms/core";
import { SqlMenuRepo } from "../repo.js";
import { TrashAwareInMemoryMenuRepo } from "../trash-aware-memory-menu-repo.js";

/**
 * @file Menu writes are compare-and-set (wm S4): `MenuRepoPort.save(record, { expectedVersion })`
 * lands only on the live row still holding that version, on every Tovu adapter — the one Kysely body
 * (`repo.ts`) on SQLite and PGlite, and the hermetic `TrashAwareInMemoryMenuRepo`. Real-Postgres
 * row-lock contention lives in `repo.compare-and-set.postgres.test.ts`.
 */

const WS = "ws-1";

function menu(overrides: Partial<NavMenuEntry> = {}): NavMenuEntry {
  return {
    id: "menu-1",
    workspaceId: WS,
    slug: "primary-nav",
    title: "Primary Nav",
    status: "published",
    doc: { type: "menu", version: 1, items: [] },
    locations: [],
    updatedAt: "2026-10-04T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

/** Trashes a stored row the way `deleteMenu` does: an unconditional save with `status: "trash"`. */
async function trash(repo: MenuRepoPort, row: NavMenuEntry): Promise<void> {
  await repo.save({ ...row, status: "trash", version: row.version + 1 });
}

function conflict(id: string, expected: number, found: number | "none"): (error: unknown) => boolean {
  return (error) =>
    error instanceof MenuConflictError &&
    error.message === `menu '${id}' was modified concurrently (expected version ${expected}, found ${found})`;
}

const noOutbox: OutboxPort = { enqueue: async () => {}, claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {} };

function runCompareAndSetSuite(adapterName: string, makeRepo: () => MenuRepoPort): void {
  test(`[${adapterName}] a matching expectedVersion writes the row`, async () => {
    const repo = makeRepo();
    await repo.save(menu());
    await repo.save(menu({ title: "Edited", version: 2 }), { expectedVersion: 1 });
    assert.deepEqual(await repo.findById({ workspaceId: WS, id: "menu-1" }), menu({ title: "Edited", version: 2 }));
  });

  test(`[${adapterName}] two saves on the same base version: the second gets the exact version conflict and changes nothing`, async () => {
    const repo = makeRepo();
    await repo.save(menu());
    await repo.save(menu({ title: "First", version: 2 }), { expectedVersion: 1 });
    await assert.rejects(() => repo.save(menu({ title: "Second", version: 2 }), { expectedVersion: 1 }), conflict("menu-1", 1, 2));
    assert.equal((await repo.findById({ workspaceId: WS, id: "menu-1" }))?.title, "First");
  });

  test(`[${adapterName}] an expectedVersion on a missing, trashed or other-workspace row finds none`, async () => {
    const repo = makeRepo();
    await repo.save(menu({ id: "trashed", slug: "trashed" }));
    await trash(repo, menu({ id: "trashed", slug: "trashed" }));
    await repo.save(menu({ id: "foreign", slug: "foreign", workspaceId: "ws-2" }));
    for (const id of ["missing", "trashed", "foreign"]) {
      await assert.rejects(() => repo.save(menu({ id, slug: id, version: 3 }), { expectedVersion: 2 }), conflict(id, 2, "none"));
    }
    assert.equal(await repo.findById({ workspaceId: WS, id: "missing" }), null);
    assert.equal(await repo.findById({ workspaceId: WS, id: "trashed" }), null);
    assert.equal((await repo.findById({ workspaceId: "ws-2", id: "foreign" }))?.version, 1);
  });

  test(`[${adapterName}] a compare-and-set onto a slug a trashed menu holds is the Trash slug conflict`, async () => {
    const repo = makeRepo();
    await repo.save(menu({ id: "old", slug: "taken" }));
    await trash(repo, menu({ id: "old", slug: "taken" }));
    await repo.save(menu());
    await assert.rejects(
      () => repo.save(menu({ slug: "taken", version: 2 }), { expectedVersion: 1 }),
      (error: unknown) =>
        error instanceof MenuConflictError &&
        error.message === "a menu with slug 'taken' is in the Trash — restore it, or delete it permanently from the Trash, to reuse the slug"
    );
    assert.equal((await repo.findById({ workspaceId: WS, id: "menu-1" }))?.slug, "primary-nav");
  });

  test(`[${adapterName}] two concurrent updateMenuTree calls on the same base version: exactly one wins`, async () => {
    const repo = makeRepo();
    await repo.save(menu());
    const deps = { repo, clock: { nowMs: () => 0 }, idGen: { newId: () => "event" }, outbox: noOutbox };
    const edit = (label: string) =>
      updateMenuTree({ deps, input: { workspaceId: WS, id: "menu-1", expectedVersion: 1, items: [{ id: label, label, target: { kind: "url", href: "/" } }] } });
    const results = await Promise.allSettled([edit("first"), edit("second")]);

    assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
    const lost = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.ok(conflict("menu-1", 1, 2)(lost?.reason));
    const stored = await repo.findById({ workspaceId: WS, id: "menu-1" });
    assert.equal(stored?.version, 2);
    assert.equal(stored?.doc.items.length, 1);
  });
}

runCompareAndSetSuite("TrashAwareInMemoryMenuRepo", () => new TrashAwareInMemoryMenuRepo());
for (const each of eachDialect({ tables: ["menus"], make: (kernel) => new SqlMenuRepo(kernel) })) {
  runCompareAndSetSuite(`SqlMenuRepo ${each.name}`, each.make);
}
