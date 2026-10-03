import assert from "node:assert/strict";
import test from "node:test";
import { MenuConflictError, MenuNotFoundError } from "../index.js";
import { TrashAwareInMemoryMenuRepo } from "../trash-aware-memory-menu-repo.js";
import { trashMenu, type RemoveMenuFn } from "../trash-menu.js";

const at = "2026-10-01T12:00:00.000Z";
const input = { workspaceId: "ws", menuId: "m1", actor: { principalId: "operator", pluginId: "plugin" } };
async function repo() {
  const store = new TrashAwareInMemoryMenuRepo();
  await store.save({ id: "m1", workspaceId: "ws", slug: "nav", title: "Navigation", status: "draft", version: 7, updatedAt: at, doc: { type: "menu", version: 1, items: [] }, locations: [] });
  return store;
}
test("trash sends the read version, actor and display to the removal port and returns its version", async () => {
  const menuRepo = await repo();
  const calls: Parameters<RemoveMenuFn>[0][] = [];
  const result = await trashMenu(input, { menuRepo, clock: { nowIso: () => at }, remove: async (request) => {
    calls.push(request);
    return { ok: true, version: 8 };
  } });
  assert.deepEqual(calls, [{ workspaceId: "ws", id: "m1", actor: { principalId: "operator", pluginId: "plugin" },
    at, expectedVersion: 7, display: { title: "Navigation", subtitle: "nav" } }]);
  assert.deepEqual(result, { id: "m1", version: 8 });
});
for (const reason of ["not-found", "version-changed"] as const) {
  test(`trash maps removal ${reason} to the matching domain error`, async () => {
    await assert.rejects(trashMenu(input, { menuRepo: await repo(), clock: { nowIso: () => at },
      remove: async () => ({ ok: false, reason }) }), reason === "not-found" ? MenuNotFoundError : MenuConflictError);
  });
}
test("a missing or already-trashed menu never reaches the removal port", async () => {
  const menuRepo = await repo();
  const existing = await menuRepo.findById({ workspaceId: "ws", id: "m1" });
  assert.ok(existing);
  await menuRepo.saveAny({ ...existing, status: "trash", priorStatus: "draft" });
  let calls = 0;
  const deps = { menuRepo, clock: { nowIso: () => at }, remove: async () => { calls++; return { ok: true as const, version: 8 }; } };
  await assert.rejects(trashMenu(input, deps), MenuNotFoundError);
  await assert.rejects(trashMenu({ ...input, menuId: "missing" }, deps), MenuNotFoundError);
  assert.equal(calls, 0);
});
