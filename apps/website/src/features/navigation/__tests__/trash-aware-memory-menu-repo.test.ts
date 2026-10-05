import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryMenuRepo, MenuConflictError, MenuVersionConflictError, type NavMenuEntry } from "../index.js";
import { TrashAwareInMemoryMenuRepo } from "../trash-aware-memory-menu-repo.js";

function menu(overrides: Partial<NavMenuEntry> = {}): NavMenuEntry {
  return { id: "m1", workspaceId: "ws", slug: "nav", title: "Saved navigation", status: "draft", doc: { type: "menu", version: 1, items: [] },
    locations: ["header"], updatedAt: "2026-10-01T12:00:00.000Z", version: 7, ...overrides };
}

test("trash hides a menu from live reads, preserves its exact row, and refuses stale revival and slug theft", async () => {
  const repo = new TrashAwareInMemoryMenuRepo();
  const lookup = { workspaceId: "ws", id: "m1" };
  await repo.save(menu());
  assert.deepEqual(await repo.findById(lookup), menu());
  await repo.saveAny({ ...menu({ status: "trash", version: 8 }), priorStatus: "draft" });
  await repo.save(menu({ title: "Stale overwrite", version: 9 }));
  assert.equal(await repo.findById(lookup), null);
  assert.equal(await repo.findBySlug({ workspaceId: "ws", slug: "nav" }), null);
  assert.deepEqual(await repo.list({ workspaceId: "ws" }), []);
  assert.deepEqual(await repo.findByIdIncludingTrashed(lookup), menu({ status: "trash", version: 8 }));
  assert.deepEqual(await repo.findAnyById(lookup), { ...menu({ status: "trash", version: 8 }), priorStatus: "draft" });
  await assert.rejects(repo.save(menu({ id: "m2" })), MenuConflictError);
  assert.equal(await repo.findAnyById({ workspaceId: "ws", id: "m2" }), null);
  assert.equal(await repo.findAnyById({ workspaceId: "other", id: "m1" }), null);
  await repo.save(menu({ id: "foreign", workspaceId: "other" }));
  assert.deepEqual(await repo.list({ workspaceId: "other" }), [menu({ id: "foreign", workspaceId: "other" })]);
});

test("restore clears the prior-status marker, exposes the row again, and removal frees its slug", async () => {
  const repo = new TrashAwareInMemoryMenuRepo();
  const lookup = { workspaceId: "ws", id: "m1" };
  await repo.saveAny({ ...menu({ status: "trash" }), priorStatus: "draft" });
  await repo.saveAny({ ...menu({ version: 8 }), priorStatus: null });
  assert.deepEqual(await repo.findAnyById(lookup), { ...menu({ version: 8 }), priorStatus: null });
  assert.deepEqual(await repo.findBySlug({ workspaceId: "ws", slug: "nav" }), menu({ version: 8 }));
  assert.deepEqual(await repo.list({ workspaceId: "ws" }), [menu({ version: 8 })]);
  await repo.remove(lookup);
  assert.equal(await repo.findAnyById(lookup), null);
  await repo.save(menu({ id: "replacement" }));
  assert.equal((await repo.findBySlug({ workspaceId: "ws", slug: "nav" }))?.id, "replacement");
});

// F1.3/F3.3: menu identity is (workspaceId, id), including its restore metadata.
test("BUG: trash restore status remains scoped when two workspaces contain the same menu id", async () => {
  const repo = new TrashAwareInMemoryMenuRepo();
  await repo.saveAny({ ...menu({ status: "trash" }), priorStatus: "draft" });
  await repo.saveAny({ ...menu({ workspaceId: "other", status: "trash" }), priorStatus: "published" });
  assert.deepEqual(await repo.findAnyById({ workspaceId: "ws", id: "m1" }),
    { ...menu({ status: "trash" }), priorStatus: "draft" });
  assert.deepEqual(await repo.findAnyById({ workspaceId: "other", id: "m1" }),
    { ...menu({ workspaceId: "other", status: "trash" }), priorStatus: "published" });
});

test("BUG: restoring a same-id menu in another workspace does not clear this workspace's restore status", async () => {
  const repo = new TrashAwareInMemoryMenuRepo();
  await repo.saveAny({ ...menu({ status: "trash" }), priorStatus: "draft" });
  await repo.saveAny({ ...menu({ workspaceId: "other", status: "published" }), priorStatus: null });
  assert.deepEqual(await repo.findAnyById({ workspaceId: "other", id: "m1" }),
    { ...menu({ workspaceId: "other", status: "published" }), priorStatus: null });
  assert.deepEqual(await repo.findAnyById({ workspaceId: "ws", id: "m1" }),
    { ...menu({ status: "trash" }), priorStatus: "draft" });
});

// F4.5/F6.3/F6.5: permanently deleting a trashed row must clear its restore metadata.
// A later id-preserving publish can recreate that id; it must be a fresh live menu.
test("BUG: removing a trashed menu clears its restore marker when the same id is recreated", async () => {
  const repo = new TrashAwareInMemoryMenuRepo();
  const lookup = { workspaceId: "ws", id: "m1" };
  await repo.saveAny({ ...menu({ status: "trash" }), priorStatus: "draft" });
  await repo.saveAny({ ...menu({ workspaceId: "other", status: "trash" }), priorStatus: "published" });
  assert.deepEqual(await repo.findAnyById(lookup), { ...menu({ status: "trash" }), priorStatus: "draft" });

  await repo.remove(lookup);
  assert.equal(await repo.findAnyById(lookup), null);
  await repo.save(menu({ title: "Republished menu", status: "published", version: 1 }));

  assert.deepEqual(await repo.findAnyById({ workspaceId: "other", id: "m1" }),
    { ...menu({ workspaceId: "other", status: "trash" }), priorStatus: "published" });
  assert.deepEqual(await repo.findById(lookup), menu({ title: "Republished menu", status: "published", version: 1 }));
  assert.deepEqual(await repo.findAnyById(lookup),
    { ...menu({ title: "Republished menu", status: "published", version: 1 }), priorStatus: null });
});

test("save re-wraps only a compare-and-set conflict as MenuVersionConflictError; anything else passes through untouched", async () => {
  const failing = (error: Error) => {
    const inner = new InMemoryMenuRepo({});
    inner.save = async () => { throw error; };
    return new TrashAwareInMemoryMenuRepo({}, { inner });
  };
  const lost = new MenuConflictError({ message: "menu 'm1' was modified concurrently (expected version 1, found 2)" });
  await assert.rejects(failing(lost).save(menu(), { expectedVersion: 1 }), (error: unknown) =>
    error instanceof MenuVersionConflictError && error.message === lost.message && error.cause === lost);

  // Without `expectedVersion` there is no compare-and-set, so a conflict is not a version conflict.
  const other = new MenuConflictError({ message: "other conflict" });
  await assert.rejects(failing(other).save(menu()), (error: unknown) => error === other);

  const disk = new Error("disk full");
  await assert.rejects(failing(disk).save(menu(), { expectedVersion: 1 }), (error: unknown) => error === disk);
});
