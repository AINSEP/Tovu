import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "../../schema.sqlite.js";
import type { ContentDb } from "../../sqlite/content-db.js";

/**
 * @file "No template chosen" = bare page (2026-09-23) data migration test fixture: a real SQLite
 * database migrated up to, but not including, the migration that reclassifies every pre-existing
 * `template_choice = ''` html Page as `NULL` before the behavior switch (see
 * `ADS-memory/.local-artifacts/no-template-bare-plan-2026-09-23.md`, slice S1). Same real-files,
 * real-migrator technique as `helpers/pre-site-title-marker-db.ts` and
 * `posts-body-format-migration.test.ts`'s `buildPreMigrationDb`: copy the REAL migration files (not
 * fabricated ones) into a scratch folder, run the REAL `drizzle-orm` migrator against a real temp-file
 * SQLite database, so `__drizzle_migrations` is populated exactly the way `content-db.ts` populates it
 * in production.
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

export const EMPTY_TEMPLATE_CHOICE_MIGRATION_TAG_SUFFIX = "_page_empty_template_choice_to_null";

export function readRealJournal(): Journal {
  return JSON.parse(fs.readFileSync(path.join(REAL_MIGRATIONS_DIR, "meta", "_journal.json"), "utf8")) as Journal;
}

/** The data migration's own journal entry. Throws when it is absent, so a fixture can never silently
 *  build a post-feature database and call it pre-existing. */
export function emptyTemplateChoiceMigrationEntry(journal: Journal = readRealJournal()): JournalEntry {
  const entry = journal.entries.find((candidate) => candidate.tag.endsWith(EMPTY_TEMPLATE_CHOICE_MIGRATION_TAG_SUFFIX));
  if (!entry) throw new Error(`no migration tagged *${EMPTY_TEMPLATE_CHOICE_MIGRATION_TAG_SUFFIX} in the real journal`);
  return entry;
}

/**
 * Creates the database at `dbPath` with every migration before the data migration, runs `populate`
 * against it (insert the pre-existing rows here, while the migration has not run yet), and closes it.
 *
 * @returns The last applied journal entry.
 */
export function migrateToBeforeEmptyTemplateChoiceMigration(dbPath: string, populate?: (db: ContentDb) => void): JournalEntry {
  const journal = readRealJournal();
  const target = emptyTemplateChoiceMigrationEntry(journal);
  const preEntries = journal.entries.filter((entry) => entry.idx < target.idx);
  const lastPreEntry = preEntries[preEntries.length - 1];
  if (!lastPreEntry) throw new Error("the data migration cannot be the first migration");

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "empty-template-choice-pre-migrations-"));
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
      populate?.(db);
    } finally {
      sqlite.close();
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  return lastPreEntry;
}
