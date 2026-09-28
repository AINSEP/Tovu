import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "../../schema.sqlite.js";
import { openContentDb, type ContentDb } from "../../sqlite/content-db.js";

/**
 * @file SPEC-050 v0.2.0 (NC-3 = A) test fixture: a real SQLite database migrated up to, but not
 * including, the migration that records which workspaces existed before `core.site.title` shipped.
 * That is the schema every site had before this feature. Same real-files, real-migrator technique
 * as `posts-body-format-migration.test.ts`'s `buildPreMigrationDb`, truncated by journal index so
 * no later migration sneaks in.
 */

const REAL_MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../drizzle");

export interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

export const SITE_TITLE_MARKER_TAG_SUFFIX = "_site_title_preexisting_workspaces";

export function readRealJournal(): Journal {
  return JSON.parse(fs.readFileSync(path.join(REAL_MIGRATIONS_DIR, "meta", "_journal.json"), "utf8")) as Journal;
}

/** The marker migration's journal entry. Throws when it is absent, so a fixture can never silently
 *  build a post-feature database and call it pre-existing. */
export function siteTitleMarkerEntry(journal: Journal = readRealJournal()): JournalEntry {
  const entry = journal.entries.find((candidate) => candidate.tag.endsWith(SITE_TITLE_MARKER_TAG_SUFFIX));
  if (!entry) throw new Error(`no migration tagged *${SITE_TITLE_MARKER_TAG_SUFFIX} in the real journal`);
  return entry;
}

/**
 * Writes into `target` — a database on an OLDER schema — the rows `populate` writes into a fresh
 * database on today's schema, copying only `tables`, and only the columns `target` has.
 *
 * Why not run `populate` against `target` directly: Drizzle's INSERT names every column today's
 * schema declares, so it fails on an older schema as soon as a later migration adds a column to a
 * seeded table (0065 added `posts.created_by_principal_id` after the site-title marker, 0063). Every
 * such later column is nullable or defaulted, so leaving it out is what the older database held.
 *
 * @complexity O(R·C) for R copied rows of C columns.
 */
export async function copyRowsIntoOlderSchema(required: {
  target: ContentDb;
  tables: readonly string[];
  populate: (current: ContentDb) => void | Promise<void>;
}): Promise<void> {
  const current = openContentDb(":memory:");
  try {
    await required.populate(current);
    for (const table of required.tables) {
      const targetColumns = new Set(
        (required.target.$client.pragma(`table_info("${table}")`) as { name: string }[]).map((column) => column.name)
      );
      const columns = (current.$client.pragma(`table_info("${table}")`) as { name: string }[])
        .map((column) => column.name)
        .filter((name) => targetColumns.has(name));
      const list = columns.map((name) => `"${name}"`).join(", ");
      const rows = current.$client.prepare(`SELECT ${list} FROM "${table}"`).raw(true).all() as unknown[][];
      const insert = required.target.$client.prepare(
        `INSERT INTO "${table}" (${list}) VALUES (${columns.map(() => "?").join(", ")})`
      );
      for (const row of rows) insert.run(...row);
    }
  } finally {
    current.$client.close();
  }
}

/**
 * Creates (or extends) the database at `dbPath` with every migration before the marker, runs
 * `populate` against it (seed rows here, while the marker does not exist yet), and closes it.
 *
 * @returns The last applied journal entry, for a matching `.site-meta.json` stamp.
 */
export async function migrateToBeforeSiteTitleMarker(
  dbPath: string,
  populate?: (db: ContentDb) => void | Promise<void>
): Promise<JournalEntry> {
  const journal = readRealJournal();
  const marker = siteTitleMarkerEntry(journal);
  const preEntries = journal.entries.filter((entry) => entry.idx < marker.idx);
  const lastPreEntry = preEntries[preEntries.length - 1];
  if (!lastPreEntry) throw new Error("the marker migration cannot be the first migration");

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "site-title-pre-migrations-"));
  try {
    fs.mkdirSync(path.join(scratch, "meta"));
    for (const entry of preEntries) {
      fs.copyFileSync(path.join(REAL_MIGRATIONS_DIR, `${entry.tag}.sql`), path.join(scratch, `${entry.tag}.sql`));
    }
    fs.writeFileSync(path.join(scratch, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: preEntries }));

    const sqlite = new Database(dbPath);
    try {
      sqlite.pragma("journal_mode = WAL");
      const db = drizzle(sqlite, { schema }) as ContentDb;
      migrate(db, { migrationsFolder: scratch });
      await populate?.(db);
    } finally {
      sqlite.close();
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  return lastPreEntry;
}
