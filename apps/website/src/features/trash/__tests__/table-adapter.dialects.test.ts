import assert from "node:assert/strict";
import { test } from "node:test";

import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";

import { readLiveSnapshot } from "../entry-sql.js";
import { buildTrashRegistry, type TrashEntry } from "../registry.js";
import { createTableTrashAdapter } from "../table-adapter.js";

/**
 * @file The generic `TRASHABLE` adapter and the live-snapshot read (`notTrashed`) on every dialect
 * the storage kernel drives — ONE query body. Covers hide/unhide/purge for a timestamp marker (form,
 * with its phantom-row cascade), a status marker (menu, with its bindings cascade), the blocker and
 * two-hop cascade (term/taxonomy), `hiddenWithParent`, the display join, and a purge that rolls back.
 */

const WS = "ws-trash-dialects";
const T0 = "2026-09-01T00:00:00.000Z";
const AT = "2026-09-28T12:00:00.000Z";

const TABLES = [
  "workspaces",
  "form_definitions",
  "form_submissions",
  "trashed_items",
  "menus",
  "nav_location_bindings",
  "taxonomies",
  "terms",
  "entry_terms",
] as const;

function harness(kernel: ContentKernel) {
  const registry = buildTrashRegistry();
  const adapter = (type: string) => createTableTrashAdapter({ entry: registry.get(type)!, db: kernel });
  return { kernel, registry, form: adapter("form"), menu: adapter("menu"), term: adapter("term"), taxonomy: adapter("taxonomy") };
}

async function seedForm(kernel: ContentKernel, id: string, deletedAt: string | null = null): Promise<void> {
  await kernel.run((db) =>
    db
      .insertInto("form_definitions")
      .values({
        id,
        workspace_id: WS,
        name: `Form ${id}`,
        slug: `slug-${id}`,
        fields_json: '{"fields":[]}',
        notify_json: "{}",
        status: "active",
        created_at: T0,
        updated_at: T0,
        deleted_at: deletedAt,
        version: 1,
      })
      .execute()
  );
}

async function seedSubmission(kernel: ContentKernel, id: string, formId: string): Promise<void> {
  await kernel.run((db) =>
    db
      .insertInto("form_submissions")
      .values({ id, workspace_id: WS, form_definition_id: formId, data_json: "{}", source_ip: "127.0.0.1", submitted_at: T0 })
      .execute()
  );
}

async function seedTrashRow(kernel: ContentKernel, entityType: string, entityId: string): Promise<void> {
  // `trashed_items.workspace_id` is a real foreign key.
  await kernel.run((db) =>
    db.insertInto("workspaces").values({ id: WS, name: WS, slug: WS, created_at: T0 }).onConflict((oc) => oc.doNothing()).execute()
  );
  await kernel.run((db) =>
    db
      .insertInto("trashed_items")
      .values({
        id: `ti-${entityId}`,
        workspace_id: WS,
        entity_type: entityType,
        entity_id: entityId,
        trashed_at: T0,
        purge_after: AT,
        actor_principal_id: "p-1",
        display_title: entityId,
      })
      .execute()
  );
}

async function seedMenu(kernel: ContentKernel, id: string, status = "published"): Promise<void> {
  await kernel.run((db) =>
    db
      .insertInto("menus")
      .values({ id, workspace_id: WS, slug: `m-${id}`, title: `Menu ${id}`, status, doc_json: "{}", locations_json: "{}", updated_at: T0, version: 1 })
      .execute()
  );
}

async function seedTaxonomy(kernel: ContentKernel, id: string, status = "active"): Promise<void> {
  await kernel.run((db) =>
    db.insertInto("taxonomies").values({ id, workspace_id: WS, name: `Tax ${id}`, hierarchical: 1, status, updated_at: T0, version: 1 }).execute()
  );
}

async function seedTerm(kernel: ContentKernel, id: string, taxonomyId: string, optional: { parentId?: string; status?: string } = {}): Promise<void> {
  await kernel.run((db) =>
    db
      .insertInto("terms")
      .values({
        id,
        workspace_id: WS,
        taxonomy_id: taxonomyId,
        parent_id: optional.parentId ?? null,
        name: `Term ${id}`,
        status: optional.status ?? "active",
        updated_at: T0,
        version: 1,
      })
      .execute()
  );
}

async function count(kernel: ContentKernel, table: (typeof TABLES)[number]): Promise<number> {
  const row = await kernel.run((db) => db.selectFrom(table).select((eb) => eb.fn.countAll().as("n")).executeTakeFirstOrThrow());
  return Number(row.n);
}

describeEachDialect("generic trash table adapter", { tables: TABLES, make: harness }, (make) => {
  test("form (timestamp marker): hide stamps deleted_at and bumps the version; unhide clears it; both idempotent", async () => {
    const h = make();
    await seedForm(h.kernel, "f-1");

    assert.deepEqual(await h.form.hide({ workspaceId: WS, entityId: "f-1", at: AT, expectedVersion: 1 }), { ok: true, version: 2 });
    const hidden = await h.kernel.run((db) => db.selectFrom("form_definitions").select(["deleted_at", "version"]).executeTakeFirstOrThrow());
    assert.deepEqual({ ...hidden, version: Number(hidden.version) }, { deleted_at: AT, version: 2 });
    assert.deepEqual(await h.form.hide({ workspaceId: WS, entityId: "f-1", at: AT, expectedVersion: null }), { ok: true, version: 2, noop: true });

    assert.deepEqual(await h.form.unhide({ workspaceId: WS, entityId: "f-1", at: AT, expectedVersion: 2 }, { priorMarker: null }), { ok: true, version: 3 });
    assert.deepEqual(await h.form.unhide({ workspaceId: WS, entityId: "f-1", at: AT, expectedVersion: null }, { priorMarker: null }), {
      ok: true,
      version: 3,
      noop: true,
    });
  });

  test("not-found, version-changed, and a purge that refuses a live row", async () => {
    const h = make();
    await seedForm(h.kernel, "f-1");
    assert.deepEqual(await h.form.hide({ workspaceId: WS, entityId: "missing", at: AT, expectedVersion: null }), { ok: false, reason: "not-found" });
    assert.deepEqual(await h.form.hide({ workspaceId: WS, entityId: "f-1", at: AT, expectedVersion: 9 }), { ok: false, reason: "version-changed" });
    assert.equal(await h.form.purge({ workspaceId: WS, entityId: "f-1", expectedVersion: 1 }), "version-changed");
    assert.equal(await h.form.purge({ workspaceId: WS, entityId: "missing", expectedVersion: null }), "already-gone");
    assert.equal(await count(h.kernel, "form_definitions"), 1);
  });

  test("form purge takes its submissions and their phantom trashed_items rows with it", async () => {
    const h = make();
    await seedForm(h.kernel, "f-1", AT);
    await seedSubmission(h.kernel, "s-1", "f-1");
    await seedSubmission(h.kernel, "s-2", "f-1");
    await seedTrashRow(h.kernel, "form_submission", "s-1");

    assert.equal(await h.form.purge({ workspaceId: WS, entityId: "f-1", expectedVersion: 2 }), "version-changed");
    assert.equal(await h.form.purge({ workspaceId: WS, entityId: "f-1", expectedVersion: 1 }), "purged");
    assert.equal(await count(h.kernel, "form_definitions"), 0);
    assert.equal(await count(h.kernel, "form_submissions"), 0);
    assert.equal(await count(h.kernel, "trashed_items"), 0);
  });

  test("menu (status marker): hide records priorMarker, unhide restores it, purge removes its bindings", async () => {
    const h = make();
    await seedMenu(h.kernel, "m-1", "draft");
    await h.kernel.run((db) =>
      db.insertInto("nav_location_bindings").values({ workspace_id: WS, location_key: "header", menu_id: "m-1", bound_at: T0 }).execute()
    );

    assert.deepEqual(await h.menu.hide({ workspaceId: WS, entityId: "m-1", at: AT, expectedVersion: 1 }), { ok: true, version: 2, priorMarker: "draft" });
    const hidden = await h.kernel.run((db) => db.selectFrom("menus").select(["status", "updated_at"]).executeTakeFirstOrThrow());
    assert.deepEqual(hidden, { status: "trash", updated_at: AT });

    assert.deepEqual(await h.menu.unhide({ workspaceId: WS, entityId: "m-1", at: AT, expectedVersion: 2 }, { priorMarker: "draft" }), { ok: true, version: 3 });
    assert.equal((await h.kernel.run((db) => db.selectFrom("menus").select("status").executeTakeFirstOrThrow())).status, "draft");

    await h.menu.hide({ workspaceId: WS, entityId: "m-1", at: AT, expectedVersion: 3 });
    assert.equal(await h.menu.purge({ workspaceId: WS, entityId: "m-1", expectedVersion: 4 }), "purged");
    assert.equal(await count(h.kernel, "menus"), 0);
    assert.equal(await count(h.kernel, "nav_location_bindings"), 0);
  });

  test("a purge whose later cascade fails rolls back the earlier cascade and the row", async () => {
    const h = make();
    await seedMenu(h.kernel, "m-1", "trash");
    await h.kernel.run((db) =>
      db.insertInto("nav_location_bindings").values({ workspace_id: WS, location_key: "header", menu_id: "m-1", bound_at: T0 }).execute()
    );
    const real = h.registry.get("menu")!;
    const failing: TrashEntry = {
      ...real,
      entityType: "menu-rollback",
      purgeFirst: [...(real.purgeFirst ?? []), { table: "no_such_table_for_rollback_test", parentIdColumn: "menu_id" }],
    };

    await assert.rejects(() => createTableTrashAdapter({ entry: failing, db: h.kernel }).purge({ workspaceId: WS, entityId: "m-1", expectedVersion: 1 }));
    assert.equal(await count(h.kernel, "menus"), 1);
    assert.equal(await count(h.kernel, "nav_location_bindings"), 1);
  });

  test("term: blocked while a child exists; hidden with its trashed taxonomy; taxonomy purge runs the two-hop cascade", async () => {
    const h = make();
    await seedTaxonomy(h.kernel, "tax-1");
    await seedTerm(h.kernel, "t-parent", "tax-1");
    await seedTerm(h.kernel, "t-child", "tax-1", { parentId: "t-parent", status: "trash" });
    await h.kernel.run((db) =>
      db.insertInto("entry_terms").values({ workspace_id: WS, content_type: "post", content_id: "p-1", term_id: "t-child", added_at: T0 }).execute()
    );
    await seedTrashRow(h.kernel, "term", "t-child");

    assert.deepEqual(await h.term.hide({ workspaceId: WS, entityId: "t-parent", at: AT, expectedVersion: 1 }), {
      ok: false,
      reason: "blocked",
      code: "TERM_HAS_CHILDREN",
      count: 1,
    });

    const deps = { kernel: h.kernel, registry: h.registry };
    const termEntry = h.registry.get("term")!;
    assert.deepEqual(await readLiveSnapshot({ entry: termEntry, workspaceId: WS, entityId: "t-parent" }, deps), {
      title: "Term t-parent",
      subtitle: "Tax tax-1",
      version: 1,
    });
    assert.equal(await readLiveSnapshot({ entry: termEntry, workspaceId: WS, entityId: "t-child" }, deps), null, "own marker trashed");

    assert.deepEqual(await h.taxonomy.hide({ workspaceId: WS, entityId: "tax-1", at: AT, expectedVersion: 1 }), {
      ok: true,
      version: 2,
      priorMarker: "active",
    });
    assert.equal(await readLiveSnapshot({ entry: termEntry, workspaceId: WS, entityId: "t-parent" }, deps), null, "hidden with its taxonomy");

    assert.equal(await h.taxonomy.purge({ workspaceId: WS, entityId: "tax-1", expectedVersion: 2 }), "purged");
    assert.equal(await count(h.kernel, "taxonomies"), 0);
    assert.equal(await count(h.kernel, "terms"), 0);
    assert.equal(await count(h.kernel, "entry_terms"), 0);
    assert.equal(await count(h.kernel, "trashed_items"), 0);
  });

  test("the live snapshot reads a submission's form name through the display join", async () => {
    const h = make();
    await seedForm(h.kernel, "f-1");
    await seedSubmission(h.kernel, "s-1", "f-1");
    const snapshot = await readLiveSnapshot(
      { entry: h.registry.get("form_submission")!, workspaceId: WS, entityId: "s-1" },
      { kernel: h.kernel, registry: h.registry }
    );
    assert.deepEqual(snapshot && { ...snapshot, version: Number(snapshot.version) }, { title: "Form f-1", subtitle: T0, version: 1 });
  });
});
