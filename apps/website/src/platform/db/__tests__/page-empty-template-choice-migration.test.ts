import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import type Database from "better-sqlite3";

import { openContentDb, type ContentDb } from "../sqlite/content-db.js";
import {
  emptyTemplateChoiceMigrationEntry,
  migrateToBeforeEmptyTemplateChoiceMigration,
  readRealJournal,
} from "./helpers/pre-empty-template-choice-db.js";

/**
 * @file "No template chosen" = bare page (2026-09-23), slice S1 — certification of the data-only
 * migration that reclassifies every PRE-EXISTING html Page `template_choice = ''` row as `NULL`
 * before the render behavior switch ships (design:
 * `ADS-memory/.local-artifacts/no-template-bare-plan-2026-09-23.md` §0, §5 S1). `NULL` already means
 * "theme default" and keeps that meaning; only `''` is about to start meaning "bare page", so any row
 * written under the OLD meaning of `''` must be moved to `NULL` first. Real migration files through
 * the real product opener (`openContentDb`), against temp-file databases only — `openContentDb`
 * auto-applies migrations, so it is never pointed at a real site.
 */

function tempDbPath(t: TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "empty-template-choice-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "content.db");
}

interface RawPostRow {
  id: string;
  kind: string;
  body_format: string;
  template_choice: string | null;
}

function templateChoiceRows(db: ContentDb): RawPostRow[] {
  return db.$client
    .prepare("SELECT id, kind, body_format, template_choice FROM posts ORDER BY id")
    .all() as RawPostRow[];
}

function insertPost(
  db: ContentDb,
  overrides: {
    id: string;
    kind: "page" | "post";
    bodyFormat: "doc" | "html";
    templateChoice: string | null;
  }
): void {
  const isHtml = overrides.bodyFormat === "html";
  const client = db.$client as InstanceType<typeof Database>;
  client
    .prepare(
      `INSERT INTO posts
         (id, workspace_id, title, slug, body_json, body_format, body_html, status, kind, updated_at, version, template_choice)
       VALUES
         (@id, 'ws-1', @title, @slug, @body_json, @body_format, @body_html, 'draft', @kind, '2026-01-01T00:00:00.000Z', 1, @template_choice)`
    )
    .run({
      id: overrides.id,
      title: `Title of ${overrides.id}`,
      slug: overrides.id,
      body_json: isHtml ? null : JSON.stringify({ type: "doc", content: [] }),
      body_format: overrides.bodyFormat,
      body_html: isHtml ? `<section>${overrides.id}</section>` : null,
      kind: overrides.kind,
      template_choice: overrides.templateChoice,
    });
}

/** Every case the migration's WHERE clause must discriminate between: only the first row may change. */
function insertFullMatrix(db: ContentDb): void {
  insertPost(db, { id: "html-page-empty", kind: "page", bodyFormat: "html", templateChoice: "" });
  insertPost(db, { id: "doc-page-empty", kind: "page", bodyFormat: "doc", templateChoice: "" });
  insertPost(db, { id: "post-empty", kind: "post", bodyFormat: "doc", templateChoice: "" });
  insertPost(db, { id: "html-page-null", kind: "page", bodyFormat: "html", templateChoice: null });
  insertPost(db, { id: "html-page-named", kind: "page", bodyFormat: "html", templateChoice: "pages-default.html" });
}

test("data migration: a pre-existing html Page with template_choice = '' becomes NULL, every other row is byte-identical", (t) => {
  const dbPath = tempDbPath(t);
  migrateToBeforeEmptyTemplateChoiceMigration(dbPath, insertFullMatrix);

  const db = openContentDb(dbPath);
  try {
    assert.deepEqual(templateChoiceRows(db), [
      { id: "doc-page-empty", kind: "page", body_format: "doc", template_choice: "" },
      { id: "html-page-empty", kind: "page", body_format: "html", template_choice: null },
      { id: "html-page-named", kind: "page", body_format: "html", template_choice: "pages-default.html" },
      { id: "html-page-null", kind: "page", body_format: "html", template_choice: null },
      { id: "post-empty", kind: "post", body_format: "doc", template_choice: "" },
    ]);
  } finally {
    db.$client.close();
  }
});

test("data migration: running it twice (idempotent WHERE clause) leaves the already-migrated rows unchanged", (t) => {
  const dbPath = tempDbPath(t);
  migrateToBeforeEmptyTemplateChoiceMigration(dbPath, insertFullMatrix);

  const first = openContentDb(dbPath);
  const afterFirst = templateChoiceRows(first);
  first.$client.close();

  const second = openContentDb(dbPath);
  try {
    assert.deepEqual(templateChoiceRows(second), afterFirst, "re-opening (no pending migrations left) must not change any row again");
  } finally {
    second.$client.close();
  }
});

test("the data migration's journal timestamp is later than every earlier entry's, or drizzle skips it on every existing database", () => {
  // drizzle-orm's SQLite migrator applies an entry only when its `when` is later than the newest
  // applied `created_at`, whatever its hash or index says.
  const journal = readRealJournal();
  const migration = emptyTemplateChoiceMigrationEntry(journal);
  for (const entry of journal.entries.filter((candidate) => candidate.idx < migration.idx)) {
    assert.ok(migration.when > entry.when, `${migration.tag} (when=${migration.when}) must be later than ${entry.tag} (when=${entry.when})`);
  }
});
