import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { SITE_TITLE_KEY, SITE_TITLE_NAMESPACE } from "#src/features/settings/site-title";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID } from "#src/server/runtime/configuration/seed";
import {
  resetLegacySiteTitlePin,
  SITE_TITLE_PIN_ACTOR,
  SITE_TITLE_PIN_KEY,
  SITE_TITLE_PIN_NAMESPACE,
} from "../reset-legacy-site-title-pin.js";

/**
 * @file SPEC-050 v0.3.0 (REQ-12, REQ-14, INV-07): `resetLegacySiteTitlePin` over a real, fully
 * migrated `content.db` schema, so every row below has to satisfy the real columns and foreign keys.
 * The value rows are inserted the way the settings ledger stores them; the end-to-end version (a
 * real boot writing a real pin) lives in `site-title-preservation.integration.test.ts`.
 */

const SYSTEM = "system-settings-migration";
const OWNER = "principal-owner-1";
const NOW = "2026-09-14T00:00:00.000Z";

function makeDb(workspaceIds: readonly string[]): Database.Database {
  const db = openContentDb(":memory:").$client;
  const insert = db.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)");
  for (const id of workspaceIds) insert.run(id, `Workspace ${id}`, `slug-${id}`, NOW);
  return db;
}

function insertDefinition(db: Database.Database, required: { settingId: string; namespace: string; key: string; version?: number }): void {
  db.prepare(
    `INSERT INTO setting_definitions (setting_id, version, workspace_id, namespace, key, owner_kind, schema_json, default_json, scopes, status, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, 'core', '{"type":"string"}', '"default"', 2, 'active', ?, ?)`
  ).run(required.settingId, required.version ?? 1, required.namespace, required.key, NOW, NOW);
}

function insertWorkspaceValue(
  db: Database.Database,
  required: { settingId: string; workspaceId: string; updatedBy: string; value: string | null; state?: "set" | "cleared" }
): void {
  db.prepare(
    `INSERT INTO setting_values_workspace (setting_id, workspace_id, value_json, state, def_version, seq, updated_by, updated_at)
     VALUES (?, ?, ?, ?, 1, 1, ?, ?)`
  ).run(
    required.settingId,
    required.workspaceId,
    required.value === null ? null : JSON.stringify(required.value),
    required.state ?? "set",
    required.updatedBy,
    NOW
  );
}

function insertMarker(db: Database.Database, workspaceId: string, preservedAt: string | null): void {
  db.prepare("INSERT INTO site_title_preexisting_workspaces (workspace_id, preserved_at) VALUES (?, ?)").run(workspaceId, preservedAt);
}

function workspaceValues(db: Database.Database): string[] {
  return (
    db
      .prepare("SELECT setting_id, workspace_id, updated_by, state FROM setting_values_workspace ORDER BY setting_id, workspace_id")
      .all() as Array<{ setting_id: string; workspace_id: string; updated_by: string; state: string }>
  ).map((row) => `${row.setting_id}|${row.workspace_id}|${row.updated_by}|${row.state}`);
}

function markerWorkspaceIds(db: Database.Database): string[] {
  return (db.prepare("SELECT workspace_id FROM site_title_preexisting_workspaces ORDER BY workspace_id").all() as Array<{ workspace_id: string }>).map(
    (row) => row.workspace_id
  );
}

test("drift guard: the mirrored literals are the site-title setting's own namespace and key, and the pin's own actor", () => {
  assert.equal(SITE_TITLE_PIN_NAMESPACE, SITE_TITLE_NAMESPACE);
  assert.equal(SITE_TITLE_PIN_KEY, SITE_TITLE_KEY);
  assert.equal(SITE_TITLE_PIN_ACTOR, SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID);
});

test("REQ-12/REQ-14, EC-02: every workspace's system pin and every marker row, pending or resolved, are removed, and the counts say so", () => {
  const db = makeDb(["ws-a", "ws-b", "ws-c"]);
  try {
    // Two definition versions for one setting id: the reset must still delete each pin exactly once.
    insertDefinition(db, { settingId: "def-title", namespace: "core.site", key: "title", version: 1 });
    insertDefinition(db, { settingId: "def-title", namespace: "core.site", key: "title", version: 2 });
    insertWorkspaceValue(db, { settingId: "def-title", workspaceId: "ws-a", updatedBy: SYSTEM, value: "Tovu Demo Site" });
    insertWorkspaceValue(db, { settingId: "def-title", workspaceId: "ws-b", updatedBy: SYSTEM, value: "Tovu Demo Site" });
    insertMarker(db, "ws-a", NOW);
    insertMarker(db, "ws-b", NOW);
    insertMarker(db, "ws-c", null); // recorded, pin never landed: a copy must not pin it on first boot either.

    assert.deepEqual(resetLegacySiteTitlePin({ db }), { markerRowsDeleted: 3, pinRowsDeleted: 2 });

    assert.deepEqual(workspaceValues(db), []);
    assert.deepEqual(markerWorkspaceIds(db), []);
  } finally {
    db.close();
  }
});

test("INV-07, AC-21, EC-09: an owner's own title travels — a set or cleared row by anyone but the system is kept", () => {
  const db = makeDb(["ws-a", "ws-b"]);
  try {
    insertDefinition(db, { settingId: "def-title", namespace: "core.site", key: "title" });
    insertWorkspaceValue(db, { settingId: "def-title", workspaceId: "ws-a", updatedBy: OWNER, value: "Acme Field Notes" });
    insertWorkspaceValue(db, { settingId: "def-title", workspaceId: "ws-b", updatedBy: OWNER, value: null, state: "cleared" });
    insertMarker(db, "ws-a", NOW);
    insertMarker(db, "ws-b", NOW);

    assert.deepEqual(resetLegacySiteTitlePin({ db }), { markerRowsDeleted: 2, pinRowsDeleted: 0 });

    assert.deepEqual(workspaceValues(db), [`def-title|ws-a|${OWNER}|set`, `def-title|ws-b|${OWNER}|cleared`]);
    assert.deepEqual(markerWorkspaceIds(db), []);
  } finally {
    db.close();
  }
});

test("adversarial: the system actor alone is not the pin — its rows for any other setting, including a same-named key elsewhere, are kept", () => {
  const db = makeDb(["ws-a"]);
  try {
    insertDefinition(db, { settingId: "def-title", namespace: "core.site", key: "title" });
    insertDefinition(db, { settingId: "def-seo-title", namespace: "site.seo", key: "title" });
    insertDefinition(db, { settingId: "def-site-tagline", namespace: "core.site", key: "tagline" });
    insertWorkspaceValue(db, { settingId: "def-title", workspaceId: "ws-a", updatedBy: SYSTEM, value: "Tovu Demo Site" });
    insertWorkspaceValue(db, { settingId: "def-seo-title", workspaceId: "ws-a", updatedBy: SYSTEM, value: "%s" });
    insertWorkspaceValue(db, { settingId: "def-site-tagline", workspaceId: "ws-a", updatedBy: SYSTEM, value: "A tagline" });

    assert.deepEqual(resetLegacySiteTitlePin({ db }), { markerRowsDeleted: 0, pinRowsDeleted: 1 });

    assert.deepEqual(workspaceValues(db), [`def-seo-title|ws-a|${SYSTEM}|set`, `def-site-tagline|ws-a|${SYSTEM}|set`]);
  } finally {
    db.close();
  }
});

test("a second run over an already-reset copy deletes nothing", () => {
  const db = makeDb(["ws-a"]);
  try {
    insertDefinition(db, { settingId: "def-title", namespace: "core.site", key: "title" });
    insertWorkspaceValue(db, { settingId: "def-title", workspaceId: "ws-a", updatedBy: SYSTEM, value: "Tovu Demo Site" });
    insertMarker(db, "ws-a", NOW);

    resetLegacySiteTitlePin({ db });
    assert.deepEqual(resetLegacySiteTitlePin({ db }), { markerRowsDeleted: 0, pinRowsDeleted: 0 });
  } finally {
    db.close();
  }
});

test("a copy from before the marker migration has no marker table: the pin rows still go, and the missing table is not an error", () => {
  const db = makeDb(["ws-a"]);
  try {
    db.exec("DROP TABLE site_title_preexisting_workspaces");
    insertDefinition(db, { settingId: "def-title", namespace: "core.site", key: "title" });
    insertWorkspaceValue(db, { settingId: "def-title", workspaceId: "ws-a", updatedBy: SYSTEM, value: "Tovu Demo Site" });

    assert.deepEqual(resetLegacySiteTitlePin({ db }), { markerRowsDeleted: 0, pinRowsDeleted: 1 });
    assert.deepEqual(workspaceValues(db), []);
  } finally {
    db.close();
  }
});

test("a database with none of the three tables is left untouched rather than failing", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE unrelated (id TEXT PRIMARY KEY)");
    db.prepare("INSERT INTO unrelated (id) VALUES ('kept')").run();

    assert.deepEqual(resetLegacySiteTitlePin({ db }), { markerRowsDeleted: 0, pinRowsDeleted: 0 });
    assert.deepEqual(db.prepare("SELECT id FROM unrelated").all(), [{ id: "kept" }]);
  } finally {
    db.close();
  }
});
