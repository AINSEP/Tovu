import assert from "node:assert/strict";
import test from "node:test";
import type Database from "better-sqlite3";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import * as schema from "#src/platform/db/schema";

import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { createSqliteTrashDb } from "../db-port.sqlite.js";
import { buildTrashRegistry } from "../registry.js";
import { createTableTrashAdapter } from "../table-adapter.js";
import { createTrashService } from "../write-service.js";
import type { TrashAdapter, TrashPort } from "../ports.js";

/**
 * @file The `form` `TRASHABLE` entry against real SQLite (originally Batch B1, plan §B; rewritten
 * for G1c against `createTableTrashAdapter` — plan §3's "Delete the file; keep `form-adapter.test.ts`
 * and point it at the entry"). `adapters/form.ts` (`createFormTrashAdapter`) is deleted; every case
 * below that it proved is reproduced here through the ONE generic adapter, driven by the registry.
 *
 * The two clauses this file exists to prove, on top of `trash.contract.test.ts`'s generic clauses and
 * `table-adapter.test.ts`'s own `form`-entry coverage:
 *
 *  - **column-only, same as every other adapter** — a form whose `fields_json` is unparseable is
 *    still trashable and restorable, byte-identical (decision 1, mirrors `post.ts`).
 *  - **purge order is submissions-then-definition, and only while trashed** — `form_submissions`
 *    has a real `ON DELETE restrict` FK (`content-db.ts` runs with `foreign_keys = ON`), so a purge
 *    that deleted the definition first would throw; and a purge must never fire on a row this
 *    adapter's own live-marker check says is still live, even at a matching version (decision 6's
 *    "extra guard").
 */

const WS = "workspace-1";
const AT = "2026-09-21T12:00:00.000Z";

/** Deliberately unparseable — the shape `widgets_trash_instance` chokes on today. */
const MALFORMED_FIELDS_JSON = '{"fields":[{"id":"name"';

interface Harness {
  client: Database.Database;
  adapter: TrashAdapter;
}

function harness(): Harness {
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: Database.Database }).$client;
  client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(WS, WS, WS, "2026-01-01T00:00:00.000Z");
  const registry = buildTrashRegistry({ schema });
  const adapter = createTableTrashAdapter({ entry: registry.get("form")!, db: createSqliteTrashDb({ db }) });
  return { client, adapter };
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

function readRow(client: Database.Database, id: string): { deleted_at: string | null; version: number; fields_json: string } | undefined {
  return client
    .prepare(`SELECT deleted_at, version, fields_json FROM form_definitions WHERE id = ?`)
    .get(id) as { deleted_at: string | null; version: number; fields_json: string } | undefined;
}

function submissionCount(client: Database.Database, formDefinitionId: string): number {
  return (
    client
      .prepare(`SELECT count(*) AS n FROM form_submissions WHERE form_definition_id = ?`)
      .get(formDefinitionId) as { n: number }
  ).n;
}

// ---------------------------------------------------------------------------
// 1. hide / unhide — no payload round-trip
// ---------------------------------------------------------------------------

test("hide sets deleted_at and bumps version; a row with unparseable fields_json is hidden and unhidden byte-identical", async () => {
  const h = harness();
  seedForm(h.client, "form-broken", { fieldsJson: MALFORMED_FIELDS_JSON });

  const hidden = await h.adapter.hide({ workspaceId: WS, entityId: "form-broken", at: AT, expectedVersion: 1 });
  assert.deepEqual(hidden, { ok: true, version: 2 });
  const afterHide = readRow(h.client, "form-broken")!;
  assert.notEqual(afterHide.deleted_at, null);
  assert.equal(afterHide.fields_json, MALFORMED_FIELDS_JSON, "hide must not rewrite the payload");

  const unhidden = await h.adapter.unhide({ workspaceId: WS, entityId: "form-broken", at: AT, expectedVersion: 2 });
  assert.deepEqual(unhidden, { ok: true, version: 3 });
  const afterUnhide = readRow(h.client, "form-broken")!;
  assert.equal(afterUnhide.fields_json, MALFORMED_FIELDS_JSON, "unhide must not rewrite the payload either");
});

// ---------------------------------------------------------------------------
// 2. unhide clears deleted_at
// ---------------------------------------------------------------------------

test("unhide clears deleted_at", async () => {
  const h = harness();
  seedForm(h.client, "form-1", { deletedAt: AT, version: 2 });

  const result = await h.adapter.unhide({ workspaceId: WS, entityId: "form-1", at: AT, expectedVersion: 2 });
  assert.deepEqual(result, { ok: true, version: 3 });
  assert.equal(readRow(h.client, "form-1")!.deleted_at, null);
});

// ---------------------------------------------------------------------------
// 3. purge at the recorded version deletes submissions AND the definition (FK ON), leaves
//    another form's submissions intact
// ---------------------------------------------------------------------------

test("purge at the recorded version deletes that form's submissions and the definition, and leaves another form's submissions intact", async () => {
  const h = harness();
  seedForm(h.client, "form-1", { deletedAt: AT, version: 2 });
  seedForm(h.client, "form-2", { version: 1 });
  seedSubmission(h.client, "sub-1", "form-1");
  seedSubmission(h.client, "sub-2", "form-1");
  seedSubmission(h.client, "sub-3", "form-2");

  const outcome = await h.adapter.purge({ workspaceId: WS, entityId: "form-1", expectedVersion: 2 });
  assert.equal(outcome, "purged");
  assert.equal(readRow(h.client, "form-1"), undefined);
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

  const outcome = await h.adapter.purge({ workspaceId: WS, entityId: "form-1", expectedVersion: 2 });
  assert.equal(outcome, "version-changed");
  assert.notEqual(readRow(h.client, "form-1"), undefined, "the definition must survive");
  assert.equal(submissionCount(h.client, "form-1"), 1, "submissions must not be touched");
});

// ---------------------------------------------------------------------------
// 5. purge of a LIVE form at a matching version -> version-changed, nothing deleted
// ---------------------------------------------------------------------------

test("purge of a LIVE form at a matching version reports version-changed and deletes nothing (decision 6's extra guard)", async () => {
  const h = harness();
  seedForm(h.client, "form-1", { deletedAt: null, version: 1 });
  seedSubmission(h.client, "sub-1", "form-1");

  const outcome = await h.adapter.purge({ workspaceId: WS, entityId: "form-1", expectedVersion: 1 });
  assert.equal(outcome, "version-changed");
  assert.notEqual(readRow(h.client, "form-1"), undefined, "a live form must never be purged");
  assert.equal(submissionCount(h.client, "form-1"), 1);
});

// ---------------------------------------------------------------------------
// 6. purge of a missing row -> already-gone
// ---------------------------------------------------------------------------

test("purge of a missing row reports already-gone", async () => {
  const h = harness();
  const outcome = await h.adapter.purge({ workspaceId: WS, entityId: "does-not-exist", expectedVersion: 1 });
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
  const adapters = new Map<string, TrashAdapter>([["form", h.adapter]]);
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
  assert.equal(readRow(h.client, "form-1")!.deleted_at, null);
  assert.equal(submissionCount(h.client, "form-1"), 2, "restore must not touch submissions");
});
