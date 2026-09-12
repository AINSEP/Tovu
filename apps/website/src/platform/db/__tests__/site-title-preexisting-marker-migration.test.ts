import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { readTemplate } from "#src/platform/site-dir/read-template";
import { openContentDb, type ContentDb } from "../sqlite/content-db.js";
import { migrateToBeforeSiteTitleMarker, readRealJournal, siteTitleMarkerEntry } from "./helpers/pre-site-title-marker-db.js";

/**
 * @file SPEC-050 v0.2.0 REQ-06, NC-3 = A: the schema migration that records which workspace rows
 * existed before `core.site.title` shipped, so exactly those workspaces get pinned to the legacy
 * title. Real migration files through the real product opener (`openContentDb`), against temp-file
 * databases only. `openContentDb` auto-applies migrations, so it is never pointed at a real site.
 */

function tempDbPath(t: TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-title-marker-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "content.db");
}

interface MarkerRow {
  workspace_id: string;
  preserved_at: string | null;
}

function markerRows(db: ContentDb): MarkerRow[] {
  return db.$client
    .prepare("SELECT workspace_id, preserved_at FROM site_title_preexisting_workspaces ORDER BY workspace_id")
    .all() as MarkerRow[];
}

function insertWorkspace(db: ContentDb, id: string): void {
  db.$client
    .prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)")
    .run(id, `Name of ${id}`, id, "2026-04-06T00:00:00.000Z");
}

test("NC-3 (REQ-06, EC-02): every workspace row present when the migration runs is recorded as pending", (t) => {
  const dbPath = tempDbPath(t);
  migrateToBeforeSiteTitleMarker(dbPath, (db) => {
    insertWorkspace(db, "workspace-local");
    insertWorkspace(db, "workspace-second");
  });

  const db = openContentDb(dbPath);
  try {
    assert.deepEqual(markerRows(db), [
      { workspace_id: "workspace-local", preserved_at: null },
      { workspace_id: "workspace-second", preserved_at: null },
    ]);
  } finally {
    db.$client.close();
  }
});

test("NC-3 (REQ-06): the marker applies once per database, so a workspace created after it is never recorded", (t) => {
  const dbPath = tempDbPath(t);
  migrateToBeforeSiteTitleMarker(dbPath, (db) => insertWorkspace(db, "workspace-local"));

  const first = openContentDb(dbPath);
  insertWorkspace(first, "workspace-created-later");
  first.$client.close();

  const second = openContentDb(dbPath);
  try {
    assert.deepEqual(markerRows(second), [{ workspace_id: "workspace-local", preserved_at: null }]);
  } finally {
    second.$client.close();
  }
});

test("NC-3 (REQ-05): a fresh database, migrated then seeded the way tovu init does it, records no workspace", (t) => {
  const dbPath = tempDbPath(t);
  const { seed } = readTemplate({ templateId: "starter" });

  const db = openContentDb(dbPath, seed);
  try {
    const { n } = db.$client.prepare("SELECT count(*) AS n FROM workspaces").get() as { n: number };
    assert.equal(n, 1, "the starter seed inserts its workspace");
    assert.deepEqual(markerRows(db), [], "the seed runs after migrate(), so a new site is never pre-existing");
  } finally {
    db.$client.close();
  }
});

test("the marker migration's journal timestamp is later than every earlier entry's, or drizzle skips it on every existing database", () => {
  // drizzle-orm's SQLite migrator applies an entry only when its `when` is later than the newest
  // applied `created_at`, whatever its hash or index says.
  const journal = readRealJournal();
  const marker = siteTitleMarkerEntry(journal);
  for (const entry of journal.entries.filter((candidate) => candidate.idx < marker.idx)) {
    assert.ok(marker.when > entry.when, `${marker.tag} (when=${marker.when}) must be later than ${entry.tag} (when=${entry.when})`);
  }
});
