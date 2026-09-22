import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import * as schema from "#src/platform/db/schema.sqlite";
import { SqliteMenuRepo, SqliteNavLocationBindingRepo } from "#src/features/navigation/repo.sqlite";
import { createNavMenuReadModel } from "#src/features/navigation/index";
import type { NavMenuReadModel } from "#src/features/navigation/index";
import { buildMenuTrashFollowUpHooks } from "#src/features/navigation/menu-trash-follow-ups";
import type { DomainEvent, OutboxPort } from "@jini-ai/cms/core";

import { createSqliteTrashDb } from "../db-port.sqlite.js";
import { moveToTrash } from "../move-to-trash.js";
import { buildTrashRegistry, type TrashRegistry } from "../registry.js";
import { createTableTrashAdapter } from "../table-adapter.js";
import { withFollowUps } from "../follow-ups.js";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { createTrashService } from "../write-service.js";
import type { TrashAdapter, TrashPort } from "../index.js";

/**
 * @file A `menu` moved to the Trash through the generic path (`moveToTrash`), seen from every
 * production render surface that reads a menu (T5, plan §2): the header location resolver, the docs
 * sidebar slug lookup, and the menu-as-widget read model. Real SQLite, the real `SqliteMenuRepo`/
 * `SqliteNavLocationBindingRepo`, the real `NavMenuReadModel` — nothing here is a double of the thing
 * under test. Mirrors `form-trash-flow.test.ts`'s harness shape, plus the follow-up-hook wiring
 * `widget-trash-flow.test.ts` demonstrates for a type with its own hooks.
 */

const WS = "workspace-1";
const AT = "2026-09-21T12:00:00.000Z";
const AT2 = "2026-09-21T12:05:00.000Z";
const ACTOR = { principalId: "admin-1", pluginId: null };
const DOCS_SLUG = "docs-somepage-sidebar";

interface Harness {
  db: ContentDb;
  registry: TrashRegistry;
  trash: TrashPort;
  menuRepo: SqliteMenuRepo;
  bindingRepo: SqliteNavLocationBindingRepo;
  readModel: NavMenuReadModel;
  events: DomainEvent[];
}

function harness(): Harness {
  const db = openContentDb(":memory:");
  db.$client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(WS, WS, WS, "2026-01-01T00:00:00.000Z");
  const registry = buildTrashRegistry({ schema });
  const trashDb = createSqliteTrashDb({ db });
  const menuRepo = new SqliteMenuRepo(db);
  const bindingRepo = new SqliteNavLocationBindingRepo(db);

  const events: DomainEvent[] = [];
  const unreachable = (name: string) => async () => {
    throw new Error(`${name} is not needed by this test`);
  };
  const outbox: OutboxPort = {
    enqueue: async (event) => void events.push(event),
    claimPending: unreachable("claimPending"),
    markDelivered: unreachable("markDelivered"),
    markFailed: unreachable("markFailed"),
  };
  let seq = 0;
  const idGen = { newId: () => `evt-${(seq += 1)}` };
  const clock = { nowIso: () => AT2 };

  const adapters = new Map<string, TrashAdapter>(
    [...registry.values()].map((entry) => [entry.entityType, createTableTrashAdapter({ entry, db: trashDb })])
  );
  // Same wiring `deps.ts` performs at composition: the generic status-marker adapter plus this
  // type's own hide/unhide/purge follow-up events.
  adapters.set(
    "menu",
    withFollowUps({ adapter: adapters.get("menu")!, hooks: buildMenuTrashFollowUpHooks({ menuRepo, outbox, idGen, clock }) })
  );

  const trash = createTrashService({
    repo: new SqliteTrashRepo(db.$client),
    adapters,
    idGen: { next: () => `trash-${randomUUID()}` },
    transaction: createContentDbTransactionRunner(db.$client),
  });

  const readModel = createNavMenuReadModel({ menuRepo, bindingRepo });
  return { db, registry, trash, menuRepo, bindingRepo, readModel, events };
}

/** Seeds a menu (default `published`) bound to the `"header"` location. */
async function seedBoundMenu(
  h: Harness,
  id: string,
  options: { status?: string; slug?: string } = {}
): Promise<void> {
  await h.menuRepo.save({
    id,
    workspaceId: WS,
    slug: options.slug ?? DOCS_SLUG,
    title: `Menu ${id}`,
    status: (options.status ?? "published") as never,
    doc: { items: [] },
    locations: [],
    updatedAt: AT,
    version: 1,
  });
  await h.bindingRepo.upsert({ workspaceId: WS, locationKey: "header", menuId: id, boundAt: AT });
}

async function trashItemId(h: Harness, entityId: string): Promise<string> {
  const page = await h.trash.list({ workspaceId: WS, now: AT2, limit: 50 });
  const item = page.items.find((row) => row.entityId === entityId);
  assert.ok(item, `a Trash row for '${entityId}' must exist`);
  return item.id;
}

async function trashMenu(h: Harness, id: string, expectedVersion = 1): Promise<void> {
  const outcome = await moveToTrash(
    { workspaceId: WS, entityType: "menu", entityId: id, actor: ACTOR },
    {
      registry: h.registry,
      trash: h.trash,
      db: createSqliteTrashDb({ db: h.db }),
      authorize: async () => ({ allowed: true, reason: "matched" }),
      clock: { nowIso: () => AT2 },
    }
  );
  assert.deepEqual(outcome, { ok: true, version: expectedVersion + 1 });
}

/** All three production render surfaces at once (plan §2 T5 "Work" item 1 / anchors). */
async function readAllSurfaces(h: Harness, menuId: string) {
  const header = await h.readModel.resolveForLocation({ context: { workspaceId: WS, currentPath: "/" }, locationKey: "header" });
  const docsSidebar = await h.menuRepo.findBySlug({ workspaceId: WS, slug: DOCS_SLUG });
  const widget = await h.readModel.getMenu({ workspaceId: WS, menuId });
  return { header, docsSidebar, widget };
}

test("trashing a bound menu stops it rendering on the header location, the docs-sidebar slug lookup and the menu-widget read model — the binding itself is untouched, and one navigation.menu.updated event fires", async () => {
  const h = harness();
  await seedBoundMenu(h, "m1");

  const before = await readAllSurfaces(h, "m1");
  assert.ok(before.header, "the header location resolves before trashing");
  assert.ok(before.docsSidebar, "the docs sidebar slug resolves before trashing");
  assert.ok(before.widget, "the menu widget read model resolves before trashing");

  await trashMenu(h, "m1");

  const after = await readAllSurfaces(h, "m1");
  assert.equal(after.header, null, "the header location no longer renders the trashed menu");
  assert.equal(after.docsSidebar, null, "the docs sidebar no longer finds the trashed menu by slug");
  assert.equal(after.widget, null, "the menu widget read model no longer resolves the trashed menu");

  const binding = await h.bindingRepo.findByLocation({ workspaceId: WS, locationKey: "header" });
  assert.ok(binding, "the location binding itself is untouched by trash — only purge removes it");
  assert.equal(binding?.menuId, "m1");

  assert.equal(h.events.length, 1);
  assert.equal(h.events[0]!.name, "navigation.menu.updated");
  assert.deepEqual(h.events[0]!.payload, { menuId: "m1", slug: DOCS_SLUG });
});

test("restoring a trashed menu brings back every surface, restores its exact prior status (not the fallback), and fires a second navigation.menu.updated event", async () => {
  const h = harness();
  await seedBoundMenu(h, "m1", { status: "draft" });
  await trashMenu(h, "m1");

  const restored = await h.trash.restore({ workspaceId: WS, entityType: "menu", entityId: "m1", at: AT2 });
  assert.equal(restored, "restored");

  const after = await readAllSurfaces(h, "m1");
  assert.ok(after.header, "the header location resolves again after restore");
  assert.ok(after.docsSidebar, "the docs sidebar resolves again after restore");
  assert.ok(after.widget, "the menu widget read model resolves again after restore");

  const menu = await h.menuRepo.findById({ workspaceId: WS, id: "m1" });
  assert.equal(menu?.status, "draft", "the priorMarker round-tripped — not the 'published' restoreFallback");

  assert.equal(h.events.length, 2, "hide's event plus restore's own");
  assert.equal(h.events[1]!.name, "navigation.menu.updated");
});

test("purging a trashed menu removes its location bindings and the row itself, and fires navigation.menu.deleted with the pre-purge slug", async () => {
  const h = harness();
  await seedBoundMenu(h, "m1");
  await trashMenu(h, "m1");

  const report = await h.trash.purgeSelected({
    workspaceId: WS,
    ids: [await trashItemId(h, "m1")],
    actor: ACTOR,
    authorizeItem: async () => true,
  });
  assert.equal(report.purged, 1);

  const binding = await h.bindingRepo.findByLocation({ workspaceId: WS, locationKey: "header" });
  assert.equal(binding, null, "purgeFirst removed the binding — the registry's own purge, not a special case here");
  assert.equal(await h.menuRepo.findById({ workspaceId: WS, id: "m1" }), null);
  assert.equal(await h.menuRepo.findByIdIncludingTrashed({ workspaceId: WS, id: "m1" }), null, "the row is physically gone");

  assert.equal(h.events.length, 2, "hide's event plus purge's own");
  assert.equal(h.events[1]!.name, "navigation.menu.deleted");
  assert.deepEqual(h.events[1]!.payload, { menuId: "m1", slug: DOCS_SLUG });
});
