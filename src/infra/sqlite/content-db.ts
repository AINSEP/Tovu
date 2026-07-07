import path from "node:path";

import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { seededPosts, seededPresentation, seededWorkspace } from "../../server/seed";
import * as schema from "../db/schema";

/**
 * @file Per-site content.db bootstrap (Drizzle over better-sqlite3).
 *
 * Purpose:
 * Opens the SQLite file that backs one site's content, applies pragmas, runs the
 * generated Drizzle migrations, and seeds first-run demo content.
 *
 * How it relates to the project:
 * - The composition root (`server/deps.ts`) opens the db here and injects the
 *   typed Drizzle handle into the per-feature `repo.sqlite.ts` adapters.
 * - Schema is code-first (`infra/db/schema.ts`) → `drizzle/` migrations, so the
 *   same schema maps cleanly to a future Postgres adapter (ADR-006 rule-of-two,
 *   Payload's shared-schema shape).
 *
 * Architectural role:
 * Infrastructure. Only adapters and the composition root touch Drizzle/SQLite;
 * domain/slice code stays provider-agnostic.
 */
export type ContentDb = BetterSQLite3Database<typeof schema>;

/** Generated migrations live at repo-root `drizzle/` (resolved from this file). */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../drizzle");

/** Open (or create) the content.db, apply pragmas, migrate, and seed if empty. */
export function openContentDb(filePath: string): ContentDb {
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  seedContentDb(db);
  return db;
}

/**
 * Seed the demo workspace/posts/presentation exactly once.
 *
 * Guarded by workspace slug so a persisted db (with the operator's own edits) is
 * never re-seeded or overwritten on restart.
 */
export function seedContentDb(db: ContentDb): void {
  const existing = db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, seededWorkspace.slug))
    .all();
  if (existing.length > 0) return;

  db.transaction((tx) => {
    tx.insert(schema.workspaces).values(seededWorkspace).run();
    for (const post of seededPosts) {
      tx.insert(schema.posts)
        .values({ ...post, bodyJson: JSON.stringify(post.bodyJson) })
        .run();
    }
    tx.insert(schema.presentationSettings).values(seededPresentation).run();
  });
}
