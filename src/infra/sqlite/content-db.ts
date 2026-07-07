import Database from "better-sqlite3";

import { seededPosts, seededPresentation, seededWorkspace } from "../../server/seed";

/**
 * @file Per-site content.db bootstrap (better-sqlite3).
 *
 * Purpose:
 * Opens the single SQLite file that backs one site's content, applies pragmas,
 * runs idempotent migrations, and seeds first-run demo content.
 *
 * How it relates to the project:
 * - The composition root (`server/deps.ts`) opens the db here and injects the
 *   shared handle into the per-feature `repo.sqlite.ts` adapters.
 * - This is ADR-012's "site = folder": content.db is the site's store, sitting
 *   behind the same feature ports as the in-memory adapters (ADR-006).
 *
 * Architectural role:
 * Infrastructure. Only adapters and the composition root touch better-sqlite3;
 * domain/slice code stays provider-agnostic (dependency-cruiser gate, §24).
 */
export type ContentDb = Database.Database;

/** Open (or create) the content.db, apply pragmas, migrate, and seed if empty. */
export function openContentDb(filePath: string): ContentDb {
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  seedContentDb(db);
  return db;
}

/** Create tables if they do not exist. Additive only — never drops. */
export function runMigrations(db: ContentDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      slug       TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title        TEXT NOT NULL,
      slug         TEXT NOT NULL,
      body_json    TEXT NOT NULL,
      status       TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      version      INTEGER NOT NULL,
      UNIQUE (workspace_id, slug)
    );
    CREATE INDEX IF NOT EXISTS idx_posts_workspace ON posts (workspace_id);

    CREATE TABLE IF NOT EXISTS presentation_settings (
      workspace_id    TEXT PRIMARY KEY,
      active_theme_id TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
  `);
}

/**
 * Seed the demo workspace/posts/presentation exactly once.
 *
 * Guarded by workspace slug so a persisted db (with the operator's own edits)
 * is never re-seeded or overwritten on restart.
 */
export function seedContentDb(db: ContentDb): void {
  const already = db
    .prepare("SELECT 1 FROM workspaces WHERE slug = ?")
    .get(seededWorkspace.slug);
  if (already) return;

  const insertWorkspace = db.prepare(
    "INSERT INTO workspaces (id, name, slug, created_at) VALUES (@id, @name, @slug, @createdAt)"
  );
  const insertPost = db.prepare(
    `INSERT INTO posts (id, workspace_id, title, slug, body_json, status, updated_at, version)
     VALUES (@id, @workspaceId, @title, @slug, @bodyJson, @status, @updatedAt, @version)`
  );
  const insertPresentation = db.prepare(
    `INSERT INTO presentation_settings (workspace_id, active_theme_id, updated_at)
     VALUES (@workspaceId, @activeThemeId, @updatedAt)`
  );

  db.transaction(() => {
    insertWorkspace.run(seededWorkspace);
    for (const post of seededPosts) {
      insertPost.run({ ...post, bodyJson: JSON.stringify(post.bodyJson) });
    }
    insertPresentation.run(seededPresentation);
  })();
}
