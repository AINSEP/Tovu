import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { openContentDb, type ContentDb } from "../sqlite/content-db";

/**
 * @file SPEC-047/ADR-056 REQ-2 — certification of the `0024_lethal_weapon_omega` migration that
 * adds `body_format`/`body_html` and loosens `body_json`'s `NOT NULL` (Decision 3).
 *
 * Two things this migration could get wrong, both load-bearing enough to test directly rather than
 * trust from reading the generated SQL:
 *  1. It is a SQLite table-REBUILD (a `CHECK` constraint has no `ALTER TABLE ADD CONSTRAINT` path in
 *     SQLite), not a plain `ADD COLUMN` — so a pre-existing row surviving it is not automatic the way
 *     it would be for most Drizzle-generated migrations in this codebase.
 *  2. `drizzle-kit generate`'s first pass at this migration's `INSERT INTO __new_posts(...) SELECT
 *     ... FROM posts` tried to SELECT the two brand-new columns FROM THE OLD TABLE, which does not
 *     have them — that migration would fail against any real, pre-existing database (verified
 *     directly: `Error: table posts has no column named body_format`). The checked-in `.sql` file was
 *     hand-fixed to drop `body_format`/`body_html` from both the target and source column lists, so
 *     every existing row picks up the new columns' own defaults (`'doc'` / `NULL`) instead of being
 *     copied from a source that never had them. This file's first test is the regression guard for
 *     that fix — it is the "existing rows survive the migration" proof the dispatch asked for.
 *
 * The synthetic pre-migration-state fixture mirrors
 * `features/database/__tests__/integration/adapter.sqlite.integration.test.ts`'s `migrateRealDb`
 * pattern: copy the REAL migration files (not fabricated ones) into a scratch folder, run the REAL
 * `drizzle-orm` migrator against a real temp-file SQLite database, so `__drizzle_migrations` is
 * populated exactly the way `content-db.ts` populates it in production.
 */

const REAL_MIGRATIONS_DIR = path.resolve(__dirname, "../drizzle");
const REAL_JOURNAL = JSON.parse(
  fs.readFileSync(path.join(REAL_MIGRATIONS_DIR, "meta", "_journal.json"), "utf-8")
) as { version: string; dialect: string; entries: Array<{ idx: number; version: string; when: number; tag: string; breakpoints: boolean }> };

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Builds a real, temp-file SQLite database migrated up through (and including) `0023_ai_chat_history`
 * — i.e. the schema shape immediately BEFORE this feature's migration — by copying the real 0000..
 * 0023 migration files and a journal trimmed to match, then running the real drizzle-orm migrator.
 */
function buildPreMigrationDb(): { dir: string; dbPath: string; db: ContentDb } {
  const dir = tmpDir("posts-body-format-pre-");
  const dbPath = path.join(dir, "content.db");

  // Truncate BEFORE 0024's own index, not merely exclude its tag (2026-08-15 fix — surfaced by
  // migration 0039, the first `posts`-table rebuild added to the journal since 0024 itself). The
  // old `entry.tag !== "0024_lethal_weapon_omega"` filter only removed that one entry and silently
  // kept every migration AFTER 0024 too, which happened to be harmless for years because nothing
  // between 0025 and 0038 both touched `posts` AND needed one of 0024's own columns (`body_format`/
  // `body_html`) to already exist. A later full-table-rebuild migration exposes it immediately: its
  // generated `INSERT INTO __new_posts(...) SELECT ... FROM posts` lists every current column,
  // including 0024's, against a source table that — because 0024 was skipped, not because anything
  // about the new migration is wrong — never got them. Filtering by index instead of by tag is what
  // actually delivers the doc comment above's own claim ("migrated up through 0023, i.e. the schema
  // shape immediately BEFORE this feature's migration"), for any number of migrations after 0024.
  const migration0024 = REAL_JOURNAL.entries.find((entry) => entry.tag === "0024_lethal_weapon_omega");
  if (!migration0024) throw new Error("0024_lethal_weapon_omega is missing from the real migration journal");
  const preEntries = REAL_JOURNAL.entries.filter((entry) => entry.idx < migration0024.idx);
  const scratchMigrationsDir = tmpDir("posts-body-format-migrations-");
  fs.mkdirSync(path.join(scratchMigrationsDir, "meta"), { recursive: true });
  for (const entry of preEntries) {
    fs.copyFileSync(
      path.join(REAL_MIGRATIONS_DIR, `${entry.tag}.sql`),
      path.join(scratchMigrationsDir, `${entry.tag}.sql`)
    );
  }
  fs.writeFileSync(
    path.join(scratchMigrationsDir, "meta", "_journal.json"),
    JSON.stringify({ version: REAL_JOURNAL.version, dialect: REAL_JOURNAL.dialect, entries: preEntries })
  );

  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite) as unknown as ContentDb;
  migrate(db, { migrationsFolder: scratchMigrationsDir });
  fs.rmSync(scratchMigrationsDir, { recursive: true, force: true });

  return { dir, dbPath, db: db as ContentDb };
}

/** Applies the real, checked-in 0024 migration SQL directly (bypassing drizzle's migrator/journal
 * bookkeeping, which is irrelevant to what this test certifies: whether the SQL itself is safe to
 * run against a database that already has rows). */
function apply0024(db: ContentDb): void {
  const sql = fs.readFileSync(path.join(REAL_MIGRATIONS_DIR, "0024_lethal_weapon_omega.sql"), "utf-8");
  (db.$client as InstanceType<typeof Database>).exec(sql);
}

test("0024 migration: a pre-existing row survives with body_format defaulted to 'doc', body_html NULL, and body_json unchanged", () => {
  const { dir, db } = buildPreMigrationDb();
  try {
    const client = db.$client as InstanceType<typeof Database>;
    client
      .prepare(
        `INSERT INTO posts (id, workspace_id, title, slug, body_json, status, kind, updated_at, version, ext)
         VALUES ('legacy-1', 'ws-1', 'Legacy Post', 'legacy-post', ?, 'published', 'post', '2026-01-01T00:00:00.000Z', 1, '{}')`
      )
      .run(JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }));

    apply0024(db);

    const row = client.prepare("SELECT * FROM posts WHERE id = 'legacy-1'").get() as Record<string, unknown>;
    assert.ok(row, "the pre-existing row must still exist after the migration");
    assert.equal(row.body_format, "doc", "an existing row must backfill to the 'doc' default, not NULL");
    assert.equal(row.body_html, null, "an existing row must never gain a body_html value it never had");
    assert.deepEqual(
      JSON.parse(row.body_json as string),
      { type: "doc", content: [{ type: "paragraph" }] },
      "body_json must be byte-for-byte unchanged by a column-adding migration"
    );
    assert.equal(row.title, "Legacy Post");
    assert.equal(row.version, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("0024 migration: row count and the two pre-existing indexes are preserved across the rebuild", () => {
  const { dir, db } = buildPreMigrationDb();
  try {
    const client = db.$client as InstanceType<typeof Database>;
    for (const id of ["a", "b", "c"]) {
      client
        .prepare(
          `INSERT INTO posts (id, workspace_id, title, slug, body_json, status, kind, updated_at, version, ext)
           VALUES (?, 'ws-1', ?, ?, '{}', 'draft', 'post', '2026-01-01T00:00:00.000Z', 1, '{}')`
        )
        .run(id, `Post ${id}`, `post-${id}`);
    }

    apply0024(db);

    const count = client.prepare("SELECT COUNT(*) AS n FROM posts").get() as { n: number };
    assert.equal(count.n, 3, "a table-rebuild migration must not drop or duplicate rows");

    const indexNames = (client.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'posts'").all() as Array<{ name: string }>).map(
      (r) => r.name
    );
    assert.ok(indexNames.includes("posts_workspace_slug_unique"), "the unique slug index must survive the rebuild");
    assert.ok(indexNames.includes("idx_posts_workspace"), "the workspace index must survive the rebuild");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// The CHECK constraint itself (posts_body_format_shape), against a fully-migrated fresh database.
// ---------------------------------------------------------------------------

function insertRawPost(db: ContentDb, overrides: Partial<Record<string, unknown>>): void {
  const base = {
    id: "raw-1",
    workspace_id: "ws-1",
    title: "T",
    slug: "t",
    body_json: JSON.stringify({ type: "doc", content: [] }),
    body_format: "doc",
    body_html: null,
    status: "draft",
    kind: "post",
    updated_at: "2026-01-01T00:00:00.000Z",
    version: 1,
    ext: "{}",
  };
  const row = { ...base, ...overrides };
  const columns = Object.keys(row);
  const client = db.$client as InstanceType<typeof Database>;
  client
    .prepare(`INSERT INTO posts (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
    .run(...columns.map((c) => row[c as keyof typeof row]));
}

test("posts_body_format_shape CHECK: rejects a body_format value that is neither 'doc' nor 'html'", () => {
  const db = openContentDb(":memory:");
  assert.throws(
    () => insertRawPost(db, { body_format: "markdown" }),
    /CHECK constraint failed/,
    "an unrecognized body_format must be rejected at the DB level, not just by application code"
  );
});

test("posts_body_format_shape CHECK: rejects a 'doc' row that also carries body_html", () => {
  const db = openContentDb(":memory:");
  assert.throws(
    () => insertRawPost(db, { body_format: "doc", body_html: "<p>x</p>" }),
    /CHECK constraint failed/
  );
});

test("posts_body_format_shape CHECK: rejects an 'html' row that still carries body_json", () => {
  const db = openContentDb(":memory:");
  assert.throws(
    () =>
      insertRawPost(db, {
        body_format: "html",
        body_html: "<p>x</p>",
        body_json: JSON.stringify({ type: "doc", content: [] }),
      }),
    /CHECK constraint failed/
  );
});

test("posts_body_format_shape CHECK: rejects an 'html' row with no body_html at all", () => {
  const db = openContentDb(":memory:");
  assert.throws(
    () => insertRawPost(db, { body_format: "html", body_html: null, body_json: null }),
    /CHECK constraint failed/
  );
});

test("posts_body_format_shape CHECK: accepts a valid 'doc' row and a valid 'html' row, and both round-trip", () => {
  const db = openContentDb(":memory:");
  const client = db.$client as InstanceType<typeof Database>;

  assert.doesNotThrow(() =>
    insertRawPost(db, { id: "doc-row", slug: "doc-row", body_format: "doc", body_json: JSON.stringify({ type: "doc", content: [] }), body_html: null })
  );
  assert.doesNotThrow(() =>
    insertRawPost(db, {
      id: "html-row",
      slug: "html-row",
      kind: "page",
      body_format: "html",
      body_json: null,
      body_html: "<section data-agent-element=\"hero\">Hi</section>",
    })
  );

  const docRow = client.prepare("SELECT * FROM posts WHERE id = 'doc-row'").get() as Record<string, unknown>;
  const htmlRow = client.prepare("SELECT * FROM posts WHERE id = 'html-row'").get() as Record<string, unknown>;

  assert.equal(docRow.body_format, "doc");
  assert.ok(docRow.body_json);
  assert.equal(docRow.body_html, null);

  assert.equal(htmlRow.body_format, "html");
  assert.equal(htmlRow.body_json, null);
  assert.equal(htmlRow.body_html, "<section data-agent-element=\"hero\">Hi</section>");
});
