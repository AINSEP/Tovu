import assert from "node:assert/strict";
import { test } from "node:test";

import { MenuConflictError, MenuVersionConflictError, type NavMenuDoc, type NavMenuEntry } from "@jini-ai/cms/navigation";
import { recordingKernel } from "#src/__tests__/lane-su-pins/support/recording-kernel";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { SqliteMenuRepo, SqliteNavLocationBindingRepo } from "../repo.sqlite.js";

/**
 * @file S1b T0: the menu and nav-location-binding repos' behaviour on the unmoved code, before their query bodies
 * move to Jini `@jini-ai/cms/navigation/sql`. Real SQLite kernel (the recorder from the lane-su pins), driven through
 * the `Sqlite*Repo` names that survive the move. Each test names the one-line mutation of `repo.ts` that turns it
 * red; the run's report holds the red output of each.
 */

const NOW = "2026-07-13T00:00:00.000Z";
const WS = "ws-1";
const OTHER = "ws-2";
const doc: NavMenuDoc = { type: "menu", version: 1, items: [] };

function menu(id: string, overrides: Partial<NavMenuEntry> = {}): NavMenuEntry {
  return { id, workspaceId: WS, slug: `slug-${id}`, title: `Menu ${id}`, status: "published", doc, locations: [], updatedAt: NOW, version: 1, ...overrides };
}

function reposOn(kernel: ContentKernel) {
  return { menus: new SqliteMenuRepo({ store: kernel }), bindings: new SqliteNavLocationBindingRepo({ store: kernel }) };
}

test("a save with a stale expectedVersion is refused with the version conflict and leaves the row", async () => {
  const { menus } = reposOn(recordingKernel().kernel);
  await menus.save(menu("m1"));
  await menus.save(menu("m1", { title: "First", version: 2 }), { expectedVersion: 1 });
  await assert.rejects(
    menus.save(menu("m1", { title: "Stale", version: 2 }), { expectedVersion: 1 }),
    (error: unknown) => error instanceof MenuVersionConflictError && error instanceof MenuConflictError,
  );
  assert.equal((await menus.findById({ workspaceId: WS, id: "m1" }))?.title, "First");
  assert.equal((await menus.findById({ workspaceId: WS, id: "m1" }))?.version, 2);
});

test("menu reads: findById, findBySlug and list hide a trashed menu; only the trash-blind twin shows it", async () => {
  const { menus } = reposOn(recordingKernel().kernel);
  await menus.save(menu("live"));
  await menus.save(menu("gone"));
  await menus.save(menu("gone", { status: "trash", version: 2 }));
  assert.equal(await menus.findById({ workspaceId: WS, id: "gone" }), null);
  assert.equal(await menus.findBySlug({ workspaceId: WS, slug: "slug-gone" }), null);
  assert.deepEqual((await menus.list({ workspaceId: WS })).map((row) => row.id), ["live"]);
  assert.equal((await menus.findByIdIncludingTrashed({ workspaceId: WS, id: "gone" }))?.status, "trash");
  assert.equal((await menus.findById({ workspaceId: WS, id: "live" }))?.id, "live");
});

test("a plain save never revives a trashed menu and a stale write onto its slug is the Trash conflict", async () => {
  const { menus } = reposOn(recordingKernel().kernel);
  await menus.save(menu("t1"));
  await menus.save(menu("t1", { status: "trash", version: 2 }));
  await menus.save(menu("t1", { title: "revived", status: "published", version: 3 }));
  const held = await menus.findByIdIncludingTrashed({ workspaceId: WS, id: "t1" });
  assert.deepEqual([held?.status, held?.title, held?.version], ["trash", "Menu t1", 2]);
  await assert.rejects(menus.save(menu("t2", { slug: "slug-t1" })), MenuConflictError);
});

test("every menu read and the remove are scoped to their workspace", async () => {
  const { menus } = reposOn(recordingKernel().kernel);
  await menus.save(menu("m1"));
  await menus.save(menu("m2", { workspaceId: OTHER, slug: "slug-m1" }));
  assert.equal(await menus.findById({ workspaceId: OTHER, id: "m1" }), null);
  assert.equal((await menus.findBySlug({ workspaceId: OTHER, slug: "slug-m1" }))?.id, "m2");
  assert.deepEqual((await menus.list({ workspaceId: OTHER })).map((row) => row.id), ["m2"]);
  assert.equal(await menus.findByIdIncludingTrashed({ workspaceId: OTHER, id: "m1" }), null);
  await menus.remove({ workspaceId: OTHER, id: "m1" });
  assert.equal((await menus.findById({ workspaceId: WS, id: "m1" }))?.id, "m1");
  await menus.remove({ workspaceId: WS, id: "m1" });
  assert.equal(await menus.findById({ workspaceId: WS, id: "m1" }), null);
});

test("a compare-and-set save never touches a row of another workspace", async () => {
  const { menus } = reposOn(recordingKernel().kernel);
  await menus.save(menu("m1"));
  await assert.rejects(
    menus.save(menu("m1", { workspaceId: OTHER, title: "hijack", version: 2 }), { expectedVersion: 1 }),
    MenuVersionConflictError,
  );
  assert.equal((await menus.findById({ workspaceId: WS, id: "m1" }))?.title, "Menu m1");
});

test("the menu transaction commits its writes, rolls them all back on a throw, and takes no lock", async () => {
  const { kernel, keys } = recordingKernel();
  const { menus } = reposOn(kernel);
  assert.equal(await menus.transaction({ fn: async () => { await menus.save(menu("kept")); return "ok"; } }), "ok");
  await assert.rejects(menus.transaction({ fn: async () => { await menus.save(menu("lost")); throw new Error("abort"); } }), /abort/);
  assert.equal((await menus.findById({ workspaceId: WS, id: "kept" }))?.id, "kept");
  assert.equal(await menus.findById({ workspaceId: WS, id: "lost" }), null);
  assert.deepEqual(keys, []);
});

test("binding reads and writes are scoped to their workspace and ignore the bound menu's trash state", async () => {
  const { menus, bindings } = reposOn(recordingKernel().kernel);
  await menus.save(menu("m1"));
  await menus.save(menu("m1", { status: "trash", version: 2 }));
  await bindings.upsert({ workspaceId: WS, locationKey: "primary", menuId: "m1", boundAt: NOW });
  await bindings.upsert({ workspaceId: OTHER, locationKey: "primary", menuId: "m9", boundAt: NOW });
  assert.equal((await bindings.findByLocation({ workspaceId: WS, locationKey: "primary" }))?.menuId, "m1");
  assert.deepEqual((await bindings.listByMenu({ workspaceId: WS, menuId: "m1" })).map((row) => row.locationKey), ["primary"]);
  assert.deepEqual((await bindings.listByWorkspace({ workspaceId: WS })).map((row) => row.menuId), ["m1"]);
  assert.deepEqual(await bindings.listByMenu({ workspaceId: OTHER, menuId: "m1" }), []);
  await bindings.removeByMenu({ workspaceId: OTHER, menuId: "m1" });
  await bindings.remove({ workspaceId: OTHER, locationKey: "primary" });
  await bindings.rebuildForWorkspace({ workspaceId: OTHER, bindings: [] });
  assert.equal((await bindings.findByLocation({ workspaceId: WS, locationKey: "primary" }))?.menuId, "m1");
  assert.equal(await bindings.findByLocation({ workspaceId: OTHER, locationKey: "primary" }), null);
});
