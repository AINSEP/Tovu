import assert from "node:assert/strict";
import test from "node:test";
import type Database from "better-sqlite3";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import * as schema from "#src/platform/db/schema";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import type { ContentDb } from "#src/platform/db/sqlite/content-db";

import { createSqliteTrashDb } from "../db-port.sqlite.js";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { buildTrashRegistry, type TrashEntry } from "../registry.js";
import { createTableTrashAdapter, type TrashedItemsRef } from "../table-adapter.js";
import { createTrashService } from "../write-service.js";
import type { TrashAdapter, TrashPort } from "../ports.js";

/**
 * @file `createTableTrashAdapter` against real SQLite (Batch G1b).
 *
 * Reproduces every case `__tests__/form-adapter.test.ts` proves for the bespoke
 * `createFormTrashAdapter`, but through the ONE generic adapter driven by `TRASHABLE`'s `form` entry
 * (`registry.ts`) — same behavior, no per-domain SQL. Also proves the `"status"` marker branch
 * (decision in the G1b dispatch: implement it fully, do not throw for it) using a hand-built,
 * test-only entry over the real `menus` table — NOT registered in `TRASHABLE`.
 */

const WS = "workspace-1";
const AT = "2026-09-21T12:00:00.000Z";

/** Deliberately unparseable — the shape `widgets_trash_instance` chokes on today. */
const MALFORMED_FIELDS_JSON = '{"fields":[{"id":"name"';

interface Harness {
  db: ContentDb;
  client: Database.Database;
  formAdapter: TrashAdapter;
  menuAdapter: TrashAdapter;
  menuEntry: TrashEntry;
  /** The REAL `registry.ts` entries (T1) — distinct from `menuAdapter`'s test-only `test-menu` entry
   *  above, which only proves the generic status-marker mechanism, not this entry's own registration
   *  (its `trash`/`published` marker values, its `purgeFirst`, its `blocker`). */
  realMenuAdapter: TrashAdapter;
  termAdapter: TrashAdapter;
  taxonomyAdapter: TrashAdapter;
}

/** A test-only `TrashEntry` over the real `menus` table, exercising the `"status"` marker branch no
 *  G1 registry entry uses. Never added to `registry.ts` — see the file header. */
function buildMenuEntry(): TrashEntry {
  return {
    entityType: "test-menu",
    label: "Test Menu",
    permission: "test.menus.manage",
    table: schema.menus,
    idColumn: schema.menus.id,
    workspaceColumn: schema.menus.workspaceId,
    marker: { kind: "status", column: schema.menus.status, trashed: "trashed", restoreFallback: "draft" },
    versionColumn: schema.menus.version,
    touchColumn: schema.menus.updatedAt,
    display: { title: schema.menus.title, subtitle: schema.menus.slug },
  };
}

function harness(): Harness {
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: Database.Database }).$client;
  client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(WS, WS, WS, "2026-01-01T00:00:00.000Z");

  const trashDb = createSqliteTrashDb({ db });
  const registry = buildTrashRegistry({ schema });
  const formEntry = registry.get("form")!;
  const menuEntry = buildMenuEntry();
  // `form`'s purgeFirst declares `entityType: "form_submission"` (T1 item 5) — needed for its own
  // phantom-row cleanup, same ref shape `deps.ts` builds at composition.
  const trashedItems: TrashedItemsRef = {
    table: schema.trashedItems,
    workspaceId: schema.trashedItems.workspaceId,
    entityType: schema.trashedItems.entityType,
    entityId: schema.trashedItems.entityId,
  };

  return {
    db,
    client,
    formAdapter: createTableTrashAdapter({ entry: formEntry, db: trashDb, trashedItems }),
    menuAdapter: createTableTrashAdapter({ entry: menuEntry, db: trashDb, trashedItems }),
    menuEntry,
    realMenuAdapter: createTableTrashAdapter({ entry: registry.get("menu")!, db: trashDb, trashedItems }),
    termAdapter: createTableTrashAdapter({ entry: registry.get("term")!, db: trashDb, trashedItems }),
    taxonomyAdapter: createTableTrashAdapter({ entry: registry.get("taxonomy")!, db: trashDb, trashedItems }),
  };
}

function seedForm(
  client: Database.Database,
  id: string,
  overrides: { fieldsJson?: string; version?: number; deletedAt?: string | null } = {}
): void {
  client
    .prepare(
      `INSERT INTO form_definitions
         (id, workspace_id, name, slug, fields_json, notify_json, status, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`
    )
    .run(
      id,
      WS,
      `Form ${id}`,
      `slug-${id}`,
      overrides.fieldsJson ?? '{"fields":[]}',
      '{"enabled":false,"recipients":[]}',
      "2026-09-01T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
      overrides.deletedAt ?? null,
      overrides.version ?? 1
    );
}

function seedSubmission(client: Database.Database, id: string, formDefinitionId: string): void {
  client
    .prepare(
      `INSERT INTO form_submissions (id, workspace_id, form_definition_id, data_json, source_ip, submitted_at)
       VALUES (?, ?, ?, '{}', '127.0.0.1', ?)`
    )
    .run(id, WS, formDefinitionId, AT);
}

function seedMenu(client: Database.Database, id: string, overrides: { status?: string; version?: number } = {}): void {
  client
    .prepare(
      `INSERT INTO menus (id, workspace_id, slug, title, status, doc_json, locations_json, updated_at, version)
       VALUES (?, ?, ?, ?, ?, '{}', '{}', ?, ?)`
    )
    .run(id, WS, `slug-${id}`, `Menu ${id}`, overrides.status ?? "published", "2026-09-01T00:00:00.000Z", overrides.version ?? 1);
}

function seedNavLocationBinding(client: Database.Database, locationKey: string, menuId: string): void {
  client
    .prepare(`INSERT INTO nav_location_bindings (workspace_id, location_key, menu_id, bound_at) VALUES (?, ?, ?, ?)`)
    .run(WS, locationKey, menuId, AT);
}

function navBindingCount(client: Database.Database, menuId: string): number {
  return (
    client.prepare(`SELECT COUNT(*) AS n FROM nav_location_bindings WHERE menu_id = ?`).get(menuId) as { n: number }
  ).n;
}

function seedTaxonomy(client: Database.Database, id: string, overrides: { status?: string; version?: number } = {}): void {
  client
    .prepare(
      `INSERT INTO taxonomies (id, workspace_id, name, hierarchical, status, updated_at, version) VALUES (?, ?, ?, 1, ?, ?, ?)`
    )
    .run(id, WS, `Taxonomy ${id}`, overrides.status ?? "active", AT, overrides.version ?? 1);
}

function seedTerm(
  client: Database.Database,
  id: string,
  taxonomyId: string,
  overrides: { parentId?: string | null; status?: string; version?: number } = {}
): void {
  client
    .prepare(
      `INSERT INTO terms (id, workspace_id, taxonomy_id, parent_id, name, status, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      WS,
      taxonomyId,
      overrides.parentId ?? null,
      `Term ${id}`,
      overrides.status ?? "active",
      AT,
      overrides.version ?? 1
    );
}

function seedEntryTerm(client: Database.Database, termId: string, contentId: string): void {
  client
    .prepare(`INSERT INTO entry_terms (workspace_id, content_type, content_id, term_id, added_at) VALUES (?, 'post', ?, ?, ?)`)
    .run(WS, contentId, termId, AT);
}

function readTaxonomyRow(client: Database.Database, id: string): { status: string; version: number } | undefined {
  return client.prepare(`SELECT status, version FROM taxonomies WHERE id = ?`).get(id) as
    | { status: string; version: number }
    | undefined;
}

function readTermRow(client: Database.Database, id: string): { status: string; version: number } | undefined {
  return client.prepare(`SELECT status, version FROM terms WHERE id = ?`).get(id) as
    | { status: string; version: number }
    | undefined;
}

function entryTermCount(client: Database.Database, termId: string): number {
  return (client.prepare(`SELECT COUNT(*) AS n FROM entry_terms WHERE term_id = ?`).get(termId) as { n: number }).n;
}

function readFormRow(
  client: Database.Database,
  id: string
): { deleted_at: string | null; version: number; fields_json: string } | undefined {
  return client
    .prepare(`SELECT deleted_at, version, fields_json FROM form_definitions WHERE id = ?`)
    .get(id) as { deleted_at: string | null; version: number; fields_json: string } | undefined;
}

function readMenuRow(client: Database.Database, id: string): { status: string; version: number } | undefined {
  return client.prepare(`SELECT status, version FROM menus WHERE id = ?`).get(id) as
    | { status: string; version: number }
    | undefined;
}

function submissionCount(client: Database.Database, formDefinitionId: string): number {
  return (
    client
      .prepare(`SELECT count(*) AS n FROM form_submissions WHERE form_definition_id = ?`)
      .get(formDefinitionId) as { n: number }
  ).n;
}

// ---------------------------------------------------------------------------
// 1. hide / unhide — no payload round-trip (timestamp marker, "form" entry)
// ---------------------------------------------------------------------------

test("hide sets deleted_at and bumps version; a row with unparseable fields_json is hidden and unhidden byte-identical", async () => {
  const h = harness();
  seedForm(h.client, "form-broken", { fieldsJson: MALFORMED_FIELDS_JSON });

  const hidden = await h.formAdapter.hide({ workspaceId: WS, entityId: "form-broken", at: AT, expectedVersion: 1 });
  assert.deepEqual(hidden, { ok: true, version: 2 });
  const afterHide = readFormRow(h.client, "form-broken")!;
  assert.notEqual(afterHide.deleted_at, null);
  assert.equal(afterHide.fields_json, MALFORMED_FIELDS_JSON, "hide must not rewrite the payload");

  const unhidden = await h.formAdapter.unhide({ workspaceId: WS, entityId: "form-broken", at: AT, expectedVersion: 2 });
  assert.deepEqual(unhidden, { ok: true, version: 3 });
  const afterUnhide = readFormRow(h.client, "form-broken")!;
  assert.equal(afterUnhide.fields_json, MALFORMED_FIELDS_JSON, "unhide must not rewrite the payload either");
});

// ---------------------------------------------------------------------------
// 2. unhide clears deleted_at
// ---------------------------------------------------------------------------

test("unhide clears deleted_at", async () => {
  const h = harness();
  seedForm(h.client, "form-1", { deletedAt: AT, version: 2 });

  const result = await h.formAdapter.unhide({ workspaceId: WS, entityId: "form-1", at: AT, expectedVersion: 2 });
  assert.deepEqual(result, { ok: true, version: 3 });
  assert.equal(readFormRow(h.client, "form-1")!.deleted_at, null);
});

// ---------------------------------------------------------------------------
// 3. purge at the recorded version deletes purgeFirst (submissions) THEN the definition, leaves
//    another form's submissions untouched
// ---------------------------------------------------------------------------

test("purge at the recorded version deletes that form's submissions and the definition, and leaves another form's submissions intact", async () => {
  const h = harness();
  seedForm(h.client, "form-1", { deletedAt: AT, version: 2 });
  seedForm(h.client, "form-2", { version: 1 });
  seedSubmission(h.client, "sub-1", "form-1");
  seedSubmission(h.client, "sub-2", "form-1");
  seedSubmission(h.client, "sub-3", "form-2");

  const outcome = await h.formAdapter.purge({ workspaceId: WS, entityId: "form-1", expectedVersion: 2 });
  assert.equal(outcome, "purged");
  assert.equal(readFormRow(h.client, "form-1"), undefined);
  assert.equal(submissionCount(h.client, "form-1"), 0);
  assert.equal(submissionCount(h.client, "form-2"), 1, "another form's submissions must survive");
});

// ---------------------------------------------------------------------------
// 4. purge at a stale version -> version-changed, submissions intact
// ---------------------------------------------------------------------------

test("purge at a stale version reports version-changed and leaves the submissions intact", async () => {
  const h = harness();
  seedForm(h.client, "form-1", { deletedAt: AT, version: 3 });
  seedSubmission(h.client, "sub-1", "form-1");

  const outcome = await h.formAdapter.purge({ workspaceId: WS, entityId: "form-1", expectedVersion: 2 });
  assert.equal(outcome, "version-changed");
  assert.notEqual(readFormRow(h.client, "form-1"), undefined, "the definition must survive");
  assert.equal(submissionCount(h.client, "form-1"), 1, "submissions must not be touched");
});

// ---------------------------------------------------------------------------
// 5. purge of a LIVE form at a matching version -> version-changed, nothing deleted
// ---------------------------------------------------------------------------

test("purge of a LIVE form at a matching version reports version-changed and deletes nothing (decision 6's extra guard)", async () => {
  const h = harness();
  seedForm(h.client, "form-1", { deletedAt: null, version: 1 });
  seedSubmission(h.client, "sub-1", "form-1");

  const outcome = await h.formAdapter.purge({ workspaceId: WS, entityId: "form-1", expectedVersion: 1 });
  assert.equal(outcome, "version-changed");
  assert.notEqual(readFormRow(h.client, "form-1"), undefined, "a live form must never be purged");
  assert.equal(submissionCount(h.client, "form-1"), 1);
});

// ---------------------------------------------------------------------------
// 6. purge of a missing row -> already-gone
// ---------------------------------------------------------------------------

test("purge of a missing row reports already-gone", async () => {
  const h = harness();
  const outcome = await h.formAdapter.purge({ workspaceId: WS, entityId: "does-not-exist", expectedVersion: 1 });
  assert.equal(outcome, "already-gone");
});

// ---------------------------------------------------------------------------
// 7. through createTrashService: trash -> list shows the form snapshot; restore -> readable again,
//    submission count unchanged
// ---------------------------------------------------------------------------

test("through createTrashService: trash lists the form snapshot, and restore leaves it readable with submissions unchanged", async () => {
  const h = harness();
  seedForm(h.client, "form-1", { version: 1 });
  seedSubmission(h.client, "sub-1", "form-1");
  seedSubmission(h.client, "sub-2", "form-1");

  const repo = new SqliteTrashRepo(h.client);
  const adapters = new Map<string, TrashAdapter>([["form", h.formAdapter]]);
  let seq = 0;
  const trash: TrashPort = createTrashService({
    repo,
    adapters,
    idGen: { next: () => `trash-${(seq += 1)}` },
    transaction: createContentDbTransactionRunner(h.client),
  });

  const trashed = await trash.trash({
    workspaceId: WS,
    entityType: "form",
    entityId: "form-1",
    actor: { principalId: "principal-1" },
    display: { title: "Form form-1", subtitle: "slug-form-1" },
    at: AT,
    expectedVersion: 1,
  });
  assert.deepEqual(trashed, { ok: true, version: 2 });

  const page = await trash.list({ workspaceId: WS, now: AT, limit: 10 });
  assert.deepEqual(page.items[0]!, {
    id: "trash-1",
    workspaceId: WS,
    entityType: "form",
    entityId: "form-1",
    trashedAt: AT,
    purgeAfter: page.items[0]!.purgeAfter,
    actorPrincipalId: "principal-1",
    actorPluginId: null,
    displayTitle: "Form form-1",
    displaySubtitle: "slug-form-1",
    entityVersion: 2,
    priorMarker: null,
  });

  const restored = await trash.restore({ workspaceId: WS, entityType: "form", entityId: "form-1", at: AT });
  assert.equal(restored, "restored");
  assert.equal(readFormRow(h.client, "form-1")!.deleted_at, null);
  assert.equal(submissionCount(h.client, "form-1"), 2, "restore must not touch submissions");
});

// ---------------------------------------------------------------------------
// 8. status marker — hide records priorMarker, unhide restores it (test-only "menu" entry)
// ---------------------------------------------------------------------------

test("status marker: hide flips to the trashed value and records the prior status as priorMarker", async () => {
  const h = harness();
  seedMenu(h.client, "menu-1", { status: "published", version: 1 });

  const hidden = await h.menuAdapter.hide({ workspaceId: WS, entityId: "menu-1", at: AT, expectedVersion: 1 });
  assert.deepEqual(hidden, { ok: true, version: 2, priorMarker: "published" });
  assert.deepEqual(readMenuRow(h.client, "menu-1"), { status: "trashed", version: 2 });
});

test("status marker: unhide restores the recorded priorMarker rather than the entry's restoreFallback", async () => {
  const h = harness();
  seedMenu(h.client, "menu-1", { status: "trashed", version: 2 });

  const unhidden = await h.menuAdapter.unhide({
    workspaceId: WS,
    entityId: "menu-1",
    at: AT,
    expectedVersion: 2,
    priorMarker: "published",
  });
  assert.deepEqual(unhidden, { ok: true, version: 3 });
  assert.deepEqual(readMenuRow(h.client, "menu-1"), { status: "published", version: 3 });
});

test("status marker: unhide with no recorded priorMarker falls back to the entry's restoreFallback", async () => {
  const h = harness();
  seedMenu(h.client, "menu-2", { status: "trashed", version: 5 });

  const unhidden = await h.menuAdapter.unhide({ workspaceId: WS, entityId: "menu-2", at: AT, expectedVersion: 5 });
  assert.deepEqual(unhidden, { ok: true, version: 6 });
  assert.deepEqual(readMenuRow(h.client, "menu-2"), { status: "draft", version: 6 });
});

test("status marker: through createTrashService, trash records priorMarker and restore puts the status back", async () => {
  const h = harness();
  seedMenu(h.client, "menu-1", { status: "published", version: 1 });

  const repo = new SqliteTrashRepo(h.client);
  const adapters = new Map<string, TrashAdapter>([["test-menu", h.menuAdapter]]);
  let seq = 0;
  const trash: TrashPort = createTrashService({
    repo,
    adapters,
    idGen: { next: () => `trash-${(seq += 1)}` },
    transaction: createContentDbTransactionRunner(h.client),
  });

  const trashed = await trash.trash({
    workspaceId: WS,
    entityType: "test-menu",
    entityId: "menu-1",
    actor: { principalId: "principal-1" },
    display: { title: "Menu menu-1", subtitle: "slug-menu-1" },
    at: AT,
    expectedVersion: 1,
  });
  assert.deepEqual(trashed, { ok: true, version: 2, priorMarker: "published" });

  const page = await trash.list({ workspaceId: WS, now: AT, limit: 10 });
  assert.equal(page.items[0]!.priorMarker, "published");

  const restored = await trash.restore({ workspaceId: WS, entityType: "test-menu", entityId: "menu-1", at: AT });
  assert.equal(restored, "restored");
  assert.deepEqual(readMenuRow(h.client, "menu-1"), { status: "published", version: 3 });
});

// ---------------------------------------------------------------------------
// 9. T1: the REAL menu/term/taxonomy registry entries (registry.ts) — this section proves each
//    entry's OWN registration (its marker values, blocker, hiddenWithParent's read half excluded —
//    that is `not-trashed.ts`/`move-to-trash.test.ts`'s concern, not this adapter's), not just the
//    generic mechanism (already proven above via the test-only `test-menu` entry). Scoped to these
//    three newly-registered entries rather than a literal loop over every `TRASHABLE` entry — the
//    other kinds (post, comment, media, redirect, form, form_submission, widget) each already have
//    their own dedicated adapter/flow test file.
// ---------------------------------------------------------------------------

test("real menu entry: hide flips status to the entry's own 'trash' value and bumps version; unhide restores the recorded prior status", async () => {
  const h = harness();
  seedMenu(h.client, "menu-real-1", { status: "draft", version: 1 });

  const hidden = await h.realMenuAdapter.hide({ workspaceId: WS, entityId: "menu-real-1", at: AT, expectedVersion: 1 });
  assert.deepEqual(hidden, { ok: true, version: 2, priorMarker: "draft" });
  assert.deepEqual(readMenuRow(h.client, "menu-real-1"), { status: "trash", version: 2 });

  const unhidden = await h.realMenuAdapter.unhide({
    workspaceId: WS,
    entityId: "menu-real-1",
    at: AT,
    expectedVersion: 2,
    priorMarker: "draft",
  });
  assert.deepEqual(unhidden, { ok: true, version: 3 });
  assert.deepEqual(readMenuRow(h.client, "menu-real-1"), { status: "draft", version: 3 });
});

test("real menu entry: unhide with no recorded prior status falls back to 'published', the entry's own restoreFallback", async () => {
  const h = harness();
  seedMenu(h.client, "menu-real-2", { status: "trash", version: 4 });

  const unhidden = await h.realMenuAdapter.unhide({ workspaceId: WS, entityId: "menu-real-2", at: AT, expectedVersion: 4 });
  assert.deepEqual(unhidden, { ok: true, version: 5 });
  assert.deepEqual(readMenuRow(h.client, "menu-real-2"), { status: "published", version: 5 });
});

test("real menu entry: purge removes its location bindings and leaves another menu's bindings untouched", async () => {
  const h = harness();
  seedMenu(h.client, "menu-bound", { status: "trash", version: 1 });
  seedMenu(h.client, "menu-other", { status: "published", version: 1 });
  seedNavLocationBinding(h.client, "header", "menu-bound");
  seedNavLocationBinding(h.client, "footer", "menu-bound");
  seedNavLocationBinding(h.client, "sidebar", "menu-other");

  const outcome = await h.realMenuAdapter.purge({ workspaceId: WS, entityId: "menu-bound", expectedVersion: 1 });
  assert.equal(outcome, "purged");
  assert.equal(readMenuRow(h.client, "menu-bound"), undefined);
  assert.equal(navBindingCount(h.client, "menu-bound"), 0);
  assert.equal(navBindingCount(h.client, "menu-other"), 1, "another menu's bindings must survive");
});

test("real menu entry: hide and unhide never touch its location bindings — they survive the round trip untouched", async () => {
  const h = harness();
  seedMenu(h.client, "menu-bound", { status: "published", version: 1 });
  seedNavLocationBinding(h.client, "header", "menu-bound");
  seedNavLocationBinding(h.client, "footer", "menu-bound");

  const hidden = await h.realMenuAdapter.hide({ workspaceId: WS, entityId: "menu-bound", at: AT, expectedVersion: 1 });
  assert.equal(hidden.ok, true);
  assert.equal(navBindingCount(h.client, "menu-bound"), 2, "hide must never touch bindings — only purge's purgeFirst does");

  const unhidden = await h.realMenuAdapter.unhide({
    workspaceId: WS,
    entityId: "menu-bound",
    at: AT,
    expectedVersion: 2,
    priorMarker: "published",
  });
  assert.equal(unhidden.ok, true);
  assert.equal(navBindingCount(h.client, "menu-bound"), 2, "restore must leave the bindings exactly as they were");
});

test("real menu entry: a purge that fails after removing bindings rolls back the whole transaction — the menu row and its bindings both survive together", async () => {
  const h = harness();
  seedMenu(h.client, "menu-bound", { status: "trash", version: 1 });
  seedNavLocationBinding(h.client, "header", "menu-bound");
  seedNavLocationBinding(h.client, "footer", "menu-bound");

  // A second `purgeFirst` cascade pointing at a table that does not exist, appended after the real
  // `navLocationBindings` cascade — forces `runCascade`'s `deleteWhere` to throw a real SQL error
  // partway through `purge`'s cascade loop (`table-adapter.ts`), exactly the shape "something after
  // the bindings cascade fails" takes in production (a later cascade, or the row's own delete,
  // erroring). Proves `registry.ts`'s doc comment for `menu`'s `purgeFirst` — bindings removed inside
  // the SAME transaction as the menu row — by observation, not by reading the code: if the two
  // deletes were NOT one transaction, the bindings cascade's DELETE (which runs first and succeeds)
  // would survive this throw; it does not.
  const noSuchTable = sqliteTable("no_such_table_for_rollback_test", { id: text("id"), menuId: text("menu_id") });
  const registry = buildTrashRegistry({ schema });
  const realMenu = registry.get("menu")!;
  const failingEntry: TrashEntry = {
    ...realMenu,
    entityType: "test-menu-rollback",
    purgeFirst: [...(realMenu.purgeFirst ?? []), { table: noSuchTable, parentIdColumn: noSuchTable.menuId }],
  };
  const trashDb = createSqliteTrashDb({ db: h.db });
  const failingAdapter = createTableTrashAdapter({ entry: failingEntry, db: trashDb });

  await assert.rejects(() => failingAdapter.purge({ workspaceId: WS, entityId: "menu-bound", expectedVersion: 1 }));

  assert.deepEqual(readMenuRow(h.client, "menu-bound"), { status: "trash", version: 1 }, "the menu row must survive the rollback");
  assert.equal(navBindingCount(h.client, "menu-bound"), 2, "the bindings cascade's own DELETE must have rolled back too");
});

test("term: a LIVE child blocks hide with TERM_HAS_CHILDREN and count 1, and the parent's status is left untouched", async () => {
  const h = harness();
  seedTaxonomy(h.client, "tax-1");
  seedTerm(h.client, "term-parent", "tax-1");
  seedTerm(h.client, "term-child", "tax-1", { parentId: "term-parent" });

  const outcome = await h.termAdapter.hide({ workspaceId: WS, entityId: "term-parent", at: AT, expectedVersion: 1 });
  assert.deepEqual(outcome, { ok: false, reason: "blocked", code: "TERM_HAS_CHILDREN", count: 1 });
  assert.deepEqual(readTermRow(h.client, "term-parent"), { status: "active", version: 1 });
});

test("term: a TRASHED child still blocks hide (the blocker counts both live and trashed children, so a purge can never orphan a parent_id)", async () => {
  const h = harness();
  seedTaxonomy(h.client, "tax-1");
  seedTerm(h.client, "term-parent", "tax-1");
  seedTerm(h.client, "term-child", "tax-1", { parentId: "term-parent", status: "trash" });

  const outcome = await h.termAdapter.hide({ workspaceId: WS, entityId: "term-parent", at: AT, expectedVersion: 1 });
  assert.deepEqual(outcome, { ok: false, reason: "blocked", code: "TERM_HAS_CHILDREN", count: 1 });
});

test("term: a childless term hides normally (the blocker check does not fire when the count is 0)", async () => {
  const h = harness();
  seedTaxonomy(h.client, "tax-1");
  seedTerm(h.client, "term-leaf", "tax-1");

  const outcome = await h.termAdapter.hide({ workspaceId: WS, entityId: "term-leaf", at: AT, expectedVersion: 1 });
  assert.deepEqual(outcome, { ok: true, version: 2, priorMarker: "active" });
});

test("term: purge at a stale version reports version-changed and leaves the row and its entry_terms intact", async () => {
  const h = harness();
  seedTaxonomy(h.client, "tax-1");
  seedTerm(h.client, "term-1", "tax-1", { status: "trash", version: 3 });
  seedEntryTerm(h.client, "term-1", "post-1");

  const outcome = await h.termAdapter.purge({ workspaceId: WS, entityId: "term-1", expectedVersion: 2 });
  assert.equal(outcome, "version-changed");
  assert.notEqual(readTermRow(h.client, "term-1"), undefined);
  assert.equal(entryTermCount(h.client, "term-1"), 1);
});

test("term: purge of a LIVE term at a matching version reports version-changed and deletes nothing, even its entry_terms", async () => {
  const h = harness();
  seedTaxonomy(h.client, "tax-1");
  seedTerm(h.client, "term-1", "tax-1", { status: "active", version: 1 });
  seedEntryTerm(h.client, "term-1", "post-1");

  const outcome = await h.termAdapter.purge({ workspaceId: WS, entityId: "term-1", expectedVersion: 1 });
  assert.equal(outcome, "version-changed");
  assert.notEqual(readTermRow(h.client, "term-1"), undefined, "a live term must never be purged");
  assert.equal(entryTermCount(h.client, "term-1"), 1);
});

test("taxonomy: purge removes its terms' entry_terms then the terms then the taxonomy, leaves another taxonomy's rows untouched, and cleans up a member term's own phantom Trash row", async () => {
  const h = harness();
  seedTaxonomy(h.client, "tax-1", { status: "trash", version: 1 });
  seedTerm(h.client, "term-a", "tax-1", { status: "trash" }); // independently trashed first
  seedTerm(h.client, "term-b", "tax-1");
  seedEntryTerm(h.client, "term-a", "post-1");
  seedEntryTerm(h.client, "term-b", "post-2");
  seedTaxonomy(h.client, "tax-2");
  seedTerm(h.client, "term-other", "tax-2");
  seedEntryTerm(h.client, "term-other", "post-3");

  // `term-a` was trashed on its own before its taxonomy — give it a Trash row, same as
  // `form-trash-flow.test.ts`'s phantom-row case, so the taxonomy purge's cleanup is provable.
  const repo = new SqliteTrashRepo(h.client);
  await repo.insert({
    id: "trash-term-a",
    workspaceId: WS,
    entityType: "term",
    entityId: "term-a",
    trashedAt: AT,
    purgeAfter: "2099-01-01T00:00:00.000Z",
    actorPrincipalId: "principal-1",
    actorPluginId: null,
    displayTitle: "Term term-a",
    displaySubtitle: null,
    entityVersion: 1,
    priorMarker: "active",
  });

  const outcome = await h.taxonomyAdapter.purge({ workspaceId: WS, entityId: "tax-1", expectedVersion: 1 });
  assert.equal(outcome, "purged");
  assert.equal(readTaxonomyRow(h.client, "tax-1"), undefined);
  assert.equal(readTermRow(h.client, "term-a"), undefined);
  assert.equal(readTermRow(h.client, "term-b"), undefined);
  assert.equal(entryTermCount(h.client, "term-a"), 0);
  assert.equal(entryTermCount(h.client, "term-b"), 0);
  assert.equal(await repo.findByEntity({ workspaceId: WS, entityType: "term", entityId: "term-a" }), null);

  assert.notEqual(readTaxonomyRow(h.client, "tax-2"), undefined, "another taxonomy must survive");
  assert.notEqual(readTermRow(h.client, "term-other"), undefined, "another taxonomy's terms must survive");
  assert.equal(entryTermCount(h.client, "term-other"), 1, "another taxonomy's entry_terms must survive");
});

test("taxonomy: purge of a missing row reports already-gone", async () => {
  const h = harness();
  const outcome = await h.taxonomyAdapter.purge({ workspaceId: WS, entityId: "does-not-exist", expectedVersion: 1 });
  assert.equal(outcome, "already-gone");
});
