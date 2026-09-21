import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import * as schema from "#src/platform/db/schema";
import { SqliteEntryRepo } from "#src/features/entries/repo.sqlite";
import { SqliteContentTypeRepo } from "#src/features/content-types/repo.sqlite";
import { SqliteEntryRefsRepo } from "#src/platform/db/sqlite/entry-refs-repo.sqlite";
import { buildWidgetInstanceFieldsJson, parseWidgetInstancePayload } from "#src/features/widgets/entry-payload";
import {
  adoptLegacyTrashedWidgets,
  createWidgetInstance,
  trashWidgetInstance,
  type WidgetTrashDeps,
} from "#src/features/widgets/write-service";

import { createSqliteTrashDb } from "../db-port.sqlite.js";
import { moveToTrash } from "../move-to-trash.js";
import { buildTrashRegistry, type TrashRegistry } from "../registry.js";
import { createTableTrashAdapter } from "../table-adapter.js";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { bindRemoveEntity, createTrashService } from "../write-service.js";
import type { TrashAdapter, TrashPort } from "../index.js";

/**
 * @file A `widget` moved to the Trash through the widgets domain's own delete (`trashWidgetInstance`,
 * with the Trash injected as `remove`), seen from the entries repo every widget reader goes through —
 * plan §5 G2's widgets list, plus the one-time adoption of the old "permanently deleted" widgets
 * (owner decision 6). Real SQLite, real repos, the real generic adapter.
 */

const WS = "workspace-1";
const AT = "2026-09-21T12:00:00.000Z";
const ACTOR = { principalId: "admin-1" };

interface Harness {
  db: ContentDb;
  registry: TrashRegistry;
  trash: TrashPort;
  entries: SqliteEntryRepo;
  deps: WidgetTrashDeps;
}

function harness(): Harness {
  const db = openContentDb(":memory:");
  db.$client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(WS, WS, WS, "2026-01-01T00:00:00.000Z");
  const registry = buildTrashRegistry({ schema });
  const trashDb = createSqliteTrashDb({ db });
  const adapters = new Map<string, TrashAdapter>(
    [...registry.values()].map((entry) => [entry.entityType, createTableTrashAdapter({ entry, db: trashDb })])
  );
  let seq = 0;
  const transaction = createContentDbTransactionRunner(db.$client);
  const trash = createTrashService({
    repo: new SqliteTrashRepo(db.$client),
    adapters,
    idGen: { next: () => `trash-${(seq += 1)}` },
    transaction,
  });
  const entries = new SqliteEntryRepo(db);
  return {
    db,
    registry,
    trash,
    entries,
    deps: {
      entryRepo: entries,
      contentTypeRepo: new SqliteContentTypeRepo(db),
      entryRefsRepo: new SqliteEntryRefsRepo(db),
      clock: { nowIso: () => AT },
      ids: { newId: () => randomUUID() },
      authorize: async () => ({ allowed: true, reason: "test: always allow" }),
      outbox: { enqueue: async () => undefined },
      remove: bindRemoveEntity(trash, "widget"),
      transaction,
    },
  };
}

async function createTextWidget(h: Harness, title: string, slug?: string): Promise<{ id: string; slug: string }> {
  const { instance } = await createWidgetInstance({
    deps: h.deps,
    input: { workspaceId: WS, actor: ACTOR, widgetType: "text", title, config: { body: `${title} body` }, ...(slug ? { slug } : {}) },
  });
  return { id: instance.id, slug: instance.slug };
}

function rawRow(h: Harness, id: string): { fields_json: string; deleted_at: string | null; version: number } | undefined {
  return h.db.$client.prepare(`SELECT fields_json, deleted_at, version FROM entries WHERE id = ?`).get(id) as
    | { fields_json: string; deleted_at: string | null; version: number }
    | undefined;
}

function count(h: Harness, sql: string, ...params: unknown[]): number {
  return (h.db.$client.prepare(sql).get(...params) as { n: number }).n;
}

async function trashItemId(h: Harness, entityId: string): Promise<string> {
  const page = await h.trash.list({ workspaceId: WS, now: AT, limit: 50 });
  const item = page.items.find((row) => row.entityId === entityId);
  assert.ok(item, `a Trash row for '${entityId}' must exist`);
  return item.id;
}

test("a trashed widget is gone from findById, findBySlug and listByWorkspace, and its Trash row shows title and slug", async () => {
  const h = harness();
  const kept = await createTextWidget(h, "Kept");
  const gone = await createTextWidget(h, "Gone");
  const fieldsBefore = rawRow(h, gone.id)!.fields_json;

  const result = await trashWidgetInstance({ deps: h.deps, input: { workspaceId: WS, actor: ACTOR, widgetInstanceId: gone.id } });
  assert.deepEqual(result, { widgetInstanceId: gone.id, version: 2 });

  assert.equal(await h.entries.findById({ workspaceId: WS, id: gone.id }), null);
  assert.equal(await h.entries.findBySlug({ workspaceId: WS, type: "widget", slug: gone.slug }), null);
  const listed = await h.entries.listByWorkspace({ workspaceId: WS, type: "widget" });
  assert.deepEqual(listed.map((row) => row.id), [kept.id]);
  assert.equal(rawRow(h, gone.id)!.fields_json, fieldsBefore, "trashing never rewrites the payload");

  const page = await h.trash.list({ workspaceId: WS, now: AT, limit: 50 });
  const item = page.items.find((row) => row.entityId === gone.id);
  assert.equal(item?.entityType, "widget");
  assert.equal(item?.displayTitle, "Gone");
  assert.equal(item?.displaySubtitle, gone.slug);
});

test("a widget whose payload does not parse can be trashed, and restore brings it back byte-identical", async () => {
  const h = harness();
  const { id } = await createTextWidget(h, "Corrupt");
  const corrupt = JSON.stringify({ ext: { widget: { payload: "{not json" } } });
  h.db.$client.prepare(`UPDATE entries SET fields_json = ? WHERE id = ?`).run(corrupt, id);
  assert.throws(() => parseWidgetInstancePayload(JSON.parse(corrupt)), "precondition: the payload really is unparseable");

  await trashWidgetInstance({ deps: h.deps, input: { workspaceId: WS, actor: ACTOR, widgetInstanceId: id } });
  assert.equal(await h.entries.findById({ workspaceId: WS, id }), null);

  assert.equal(await h.trash.restore({ workspaceId: WS, entityType: "widget", entityId: id, at: AT }), "restored");
  const row = rawRow(h, id)!;
  assert.equal(row.fields_json, corrupt);
  assert.equal(row.deleted_at, null);
  assert.ok(await h.entries.findById({ workspaceId: WS, id }), "a restored widget reads again");
});

test("trashing a missing or already-trashed widget is refused with WidgetInstanceNotFoundError", async () => {
  const h = harness();
  const { id } = await createTextWidget(h, "Once");
  await trashWidgetInstance({ deps: h.deps, input: { workspaceId: WS, actor: ACTOR, widgetInstanceId: id } });

  await assert.rejects(
    trashWidgetInstance({ deps: h.deps, input: { workspaceId: WS, actor: ACTOR, widgetInstanceId: id } }),
    { name: "WidgetInstanceNotFoundError", message: `widget instance '${id}' was not found` }
  );
});

test("purge deletes the row, its own outgoing entry_refs and its revisions; refs other entries hold to it stay", async () => {
  const h = harness();
  const { id } = await createTextWidget(h, "Purged");
  h.db.$client
    .prepare(
      `INSERT INTO entry_refs (workspace_id, source_entry_id, source_kind, field_path, target_kind, target_id)
       VALUES (?, ?, 'widget-config', 'config.menuRef', 'menu', 'menu-1'),
              (?, 'area-1', 'region', 'doc', 'entry', ?)`
    )
    .run(WS, id, WS, id);
  await trashWidgetInstance({ deps: h.deps, input: { workspaceId: WS, actor: ACTOR, widgetInstanceId: id } });

  const report = await h.trash.purgeSelected({
    workspaceId: WS,
    ids: [await trashItemId(h, id)],
    actor: { principalId: ACTOR.principalId, pluginId: null },
    authorizeItem: async () => true,
  });
  assert.equal(report.purged, 1);
  assert.equal(rawRow(h, id), undefined);
  assert.equal(count(h, `SELECT COUNT(*) AS n FROM entry_refs WHERE source_entry_id = ?`, id), 0);
  assert.equal(count(h, `SELECT COUNT(*) AS n FROM entry_revisions WHERE entry_id = ?`, id), 0);
  assert.equal(count(h, `SELECT COUNT(*) AS n FROM entry_refs WHERE target_id = ?`, id), 1, "a placement pointing at it now dangles (REQ-43)");
});

test("the widget entry's scope: moveToTrash on a non-widget entries row reads not-found and changes nothing", async () => {
  const h = harness();
  h.db.$client
    .prepare(
      `INSERT INTO entries (id, workspace_id, type, slug, status, title, fields_json, created_at, updated_at, version)
       VALUES ('c1', ?, 'collection', 'c1', 'published', 'Collection row', '{}', ?, ?, 1)`
    )
    .run(WS, AT, AT);

  const outcome = await moveToTrash(
    { workspaceId: WS, entityType: "widget", entityId: "c1", actor: { principalId: "admin-1", pluginId: null } },
    {
      registry: h.registry,
      trash: h.trash,
      db: createSqliteTrashDb({ db: h.db }),
      authorize: async () => ({ allowed: true, reason: "matched" }),
      clock: { nowIso: () => AT },
    }
  );
  assert.deepEqual(outcome, { ok: false, reason: "not-found" });
  assert.equal(rawRow(h, "c1")!.deleted_at, null);
});

test("a stale save to a trashed widget does not bring it back", async () => {
  const h = harness();
  const { id } = await createTextWidget(h, "Stale");
  const stale = (await h.entries.findById({ workspaceId: WS, id }))!;
  await trashWidgetInstance({ deps: h.deps, input: { workspaceId: WS, actor: ACTOR, widgetInstanceId: id } });

  await h.entries.save({ ...stale, title: "Resurrected", version: stale.version + 1 });
  const row = h.db.$client.prepare(`SELECT title, deleted_at FROM entries WHERE id = ?`).get(id) as { title: string; deleted_at: string | null };
  assert.equal(row.title, "Stale");
  assert.equal(row.deleted_at, AT);
});

test("creating a widget with the slug a trashed widget holds is refused with a message naming the Trash", async () => {
  const h = harness();
  const { id } = await createTextWidget(h, "Hero", "hero");
  await trashWidgetInstance({ deps: h.deps, input: { workspaceId: WS, actor: ACTOR, widgetInstanceId: id } });

  await assert.rejects(createTextWidget(h, "Hero again", "hero"), {
    name: "ENTRY_SLUG_CONFLICT",
    message:
      "an entry with slug 'hero' is in the Trash — restore it, or delete it permanently from the Trash, to reuse the slug",
  });
});

test("adoptLegacyTrashedWidgets moves every old trash/purged widget into the Trash with an active payload, once", async () => {
  const h = harness();
  const live = await createTextWidget(h, "Live");
  const oldTrash = await createTextWidget(h, "Old trash");
  const oldPurged = await createTextWidget(h, "Old purged");
  for (const [id, status] of [
    [oldTrash.id, "trash"],
    [oldPurged.id, "purged"],
  ] as const) {
    const fieldsJson = buildWidgetInstanceFieldsJson({ widgetType: "text", config: { body: "x" }, status });
    h.db.$client.prepare(`UPDATE entries SET fields_json = ? WHERE id = ?`).run(JSON.stringify(fieldsJson), id);
  }

  const first = await adoptLegacyTrashedWidgets({ deps: h.deps, input: { workspaceId: WS } });
  assert.deepEqual([...first.adopted].sort(), [oldTrash.id, oldPurged.id].sort());

  const page = await h.trash.list({ workspaceId: WS, now: AT, limit: 50 });
  assert.deepEqual(page.items.map((item) => item.entityId).sort(), [oldTrash.id, oldPurged.id].sort());
  for (const id of [oldTrash.id, oldPurged.id]) {
    const row = rawRow(h, id)!;
    assert.equal(row.deleted_at, AT);
    assert.equal(parseWidgetInstancePayload(JSON.parse(row.fields_json)).status, "active");
  }
  assert.ok(await h.entries.findById({ workspaceId: WS, id: live.id }), "a live widget is left alone");

  const second = await adoptLegacyTrashedWidgets({ deps: h.deps, input: { workspaceId: WS } });
  assert.deepEqual(second.adopted, []);
  assert.equal((await h.trash.list({ workspaceId: WS, now: AT, limit: 50 })).items.length, 2);

  assert.equal(await h.trash.restore({ workspaceId: WS, entityType: "widget", entityId: oldPurged.id, at: AT }), "restored");
  const restored = await h.entries.findById({ workspaceId: WS, id: oldPurged.id });
  assert.equal(parseWidgetInstancePayload(restored!.fieldsJson).status, "active", "a restored old widget renders");
});
