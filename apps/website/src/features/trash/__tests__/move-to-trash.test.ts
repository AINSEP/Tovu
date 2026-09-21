import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import { formDefinitions, formSubmissions } from "#src/platform/db/schema";

import { createSqliteTrashDb } from "../db-port.sqlite.js";
import { moveToTrash } from "../move-to-trash.js";
import { buildTrashRegistry, type TrashRegistry } from "../registry.js";
import { createTableTrashAdapter } from "../table-adapter.js";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { createTrashService } from "../write-service.js";
import type { TrashAdapter, TrashAuthorizeFn, TrashPort } from "../index.js";

/**
 * @file `moveToTrash` (plan §3) — the generic entry point every `POST /trash/items` call resolves
 * through. Proves the branch order (unknown type -> forbidden -> not-found -> real trash) against a
 * real migrated SQLite and the real `form` registry entry, plus the two race-outcome mappings
 * (`not-found`/`version-changed` surfacing from `TrashPort.trash` itself) against a fake port, since
 * provoking that race through the real service deterministically would need concurrent writers.
 */

const WS = "workspace-1";
const AT = "2026-09-21T12:00:00.000Z";

interface Harness {
  db: ContentDb;
  registry: TrashRegistry;
  trash: TrashPort;
  authorize: TrashAuthorizeFn;
  granted: Set<string>;
}

function harness(): Harness {
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: { prepare(sql: string): { run(...args: unknown[]): unknown } } }).$client;
  client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(WS, WS, WS, "2026-01-01T00:00:00.000Z");

  const registry = buildTrashRegistry({ schema: { formDefinitions, formSubmissions } });
  const trashDb = createSqliteTrashDb({ db });
  const adapters = new Map<string, TrashAdapter>(
    [...registry.values()].map((entry) => [entry.entityType, createTableTrashAdapter({ entry, db: trashDb })])
  );
  let seq = 0;
  const trash = createTrashService({
    repo: new SqliteTrashRepo(db.$client),
    adapters,
    idGen: { next: () => `trash-${(seq += 1)}` },
    transaction: createContentDbTransactionRunner(db.$client),
  });

  const granted = new Set<string>(["admin.forms.manage"]);
  const authorize: TrashAuthorizeFn = async (params) =>
    granted.has(params.permission)
      ? { allowed: true, reason: "matched" }
      : { allowed: false, reason: `missing ${params.permission}` };

  return { db, registry, trash, authorize, granted };
}

function seedForm(h: Harness, id: string, overrides: { deletedAt?: string | null; version?: number } = {}): void {
  h.db.$client
    .prepare(
      `INSERT INTO form_definitions
         (id, workspace_id, name, slug, fields_json, notify_json, status, created_at, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, '{"fields":[]}', '{"enabled":false,"recipients":[]}', 'active', ?, ?, ?, ?)`
    )
    .run(id, WS, `Form ${id}`, `slug-${id}`, "2026-09-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z", overrides.deletedAt ?? null, overrides.version ?? 1);
}

test("an unregistered kind is refused before any read or authorize call", async () => {
  const h = harness();
  const outcome = await moveToTrash(
    { workspaceId: WS, entityType: "widget", entityId: "w-1", actor: { principalId: "p-1" } },
    { registry: h.registry, trash: h.trash, db: createSqliteTrashDb({ db: h.db }), authorize: h.authorize, clock: { nowIso: () => AT } }
  );
  assert.deepEqual(outcome, { ok: false, reason: "unknown-type" });
});

test("a principal without the kind's own permission is forbidden, and the row is never read", async () => {
  const h = harness();
  seedForm(h, "form-1");
  h.granted.clear();

  const outcome = await moveToTrash(
    { workspaceId: WS, entityType: "form", entityId: "form-1", actor: { principalId: "p-1" } },
    { registry: h.registry, trash: h.trash, db: createSqliteTrashDb({ db: h.db }), authorize: h.authorize, clock: { nowIso: () => AT } }
  );
  assert.deepEqual(outcome, { ok: false, reason: "forbidden", permission: "admin.forms.manage" });

  const row = h.db.$client.prepare(`SELECT deleted_at FROM form_definitions WHERE id = ?`).get("form-1") as { deleted_at: string | null };
  assert.equal(row.deleted_at, null, "a forbidden call must never trash the row");
});

test("a missing row reports not-found", async () => {
  const h = harness();
  const outcome = await moveToTrash(
    { workspaceId: WS, entityType: "form", entityId: "does-not-exist", actor: { principalId: "p-1" } },
    { registry: h.registry, trash: h.trash, db: createSqliteTrashDb({ db: h.db }), authorize: h.authorize, clock: { nowIso: () => AT } }
  );
  assert.deepEqual(outcome, { ok: false, reason: "not-found" });
});

test("an already-trashed row reads as not-found — moveToTrash never re-trashes", async () => {
  const h = harness();
  seedForm(h, "form-1", { deletedAt: AT, version: 2 });
  const outcome = await moveToTrash(
    { workspaceId: WS, entityType: "form", entityId: "form-1", actor: { principalId: "p-1" } },
    { registry: h.registry, trash: h.trash, db: createSqliteTrashDb({ db: h.db }), authorize: h.authorize, clock: { nowIso: () => AT } }
  );
  assert.deepEqual(outcome, { ok: false, reason: "not-found" });
});

test("a live, permitted row is trashed through the real service, with its own display snapshot", async () => {
  const h = harness();
  seedForm(h, "form-1", { version: 1 });

  const outcome = await moveToTrash(
    { workspaceId: WS, entityType: "form", entityId: "form-1", actor: { principalId: "p-1" } },
    { registry: h.registry, trash: h.trash, db: createSqliteTrashDb({ db: h.db }), authorize: h.authorize, clock: { nowIso: () => AT } }
  );
  assert.deepEqual(outcome, { ok: true, version: 2 });

  const row = h.db.$client.prepare(`SELECT deleted_at FROM form_definitions WHERE id = ?`).get("form-1") as { deleted_at: string | null };
  assert.notEqual(row.deleted_at, null);

  const page = await h.trash.list({ workspaceId: WS, now: AT, limit: 10 });
  assert.equal(page.items[0]?.displayTitle, "Form form-1");
  assert.equal(page.items[0]?.displaySubtitle, "slug-form-1");
});

test("a not-found race from TrashPort.trash itself surfaces as not-found, not thrown", async () => {
  const h = harness();
  seedForm(h, "form-1");
  const racingTrash: TrashPort = {
    ...h.trash,
    trash: async () => ({ ok: false, reason: "not-found" }),
  };
  const outcome = await moveToTrash(
    { workspaceId: WS, entityType: "form", entityId: "form-1", actor: { principalId: "p-1" } },
    { registry: h.registry, trash: racingTrash, db: createSqliteTrashDb({ db: h.db }), authorize: h.authorize, clock: { nowIso: () => AT } }
  );
  assert.deepEqual(outcome, { ok: false, reason: "not-found" });
});

test("a version-changed race from TrashPort.trash itself surfaces as version-changed", async () => {
  const h = harness();
  seedForm(h, "form-1");
  const racingTrash: TrashPort = {
    ...h.trash,
    trash: async () => ({ ok: false, reason: "version-changed" }),
  };
  const outcome = await moveToTrash(
    { workspaceId: WS, entityType: "form", entityId: "form-1", actor: { principalId: "p-1" } },
    { registry: h.registry, trash: racingTrash, db: createSqliteTrashDb({ db: h.db }), authorize: h.authorize, clock: { nowIso: () => AT } }
  );
  assert.deepEqual(outcome, { ok: false, reason: "version-changed" });
});
