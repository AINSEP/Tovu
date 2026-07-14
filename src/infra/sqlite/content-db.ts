import path from "node:path";

import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "../db/schema";

/**
 * @file Per-site content.db bootstrap (Drizzle over better-sqlite3).
 *
 * Purpose:
 * Opens the SQLite file that backs one site's content, applies pragmas, runs the
 * generated Drizzle migrations, and (if the caller supplies seed data) seeds
 * first-run demo content.
 *
 * How it relates to the project:
 * - The composition root (`server/deps.ts`) opens the db here, passing in its own
 *   `server/seed.ts` demo data, and injects the typed Drizzle handle into the
 *   per-feature `repo.sqlite.ts` adapters.
 * - Schema is code-first (`infra/db/schema.ts`) → `infra/drizzle/` migrations, so
 *   same schema maps cleanly to a future Postgres adapter (ADR-006 rule-of-two,
 *   Payload's shared-schema shape).
 * - ADR-042 item 3: this file previously imported `seededWorkspace`/`seededPosts`/
 *   `seededPresentation` directly from `server/seed.ts` — infra depending on
 *   server, a layer-direction violation with no discovered justification. Seed
 *   data is now a parameter the composition root supplies (dependency inversion,
 *   the same seam every port in this codebase already uses), not a value this
 *   file reaches up to fetch itself.
 *
 * Architectural role:
 * Infrastructure. Only adapters and the composition root touch Drizzle/SQLite;
 * domain/slice code stays provider-agnostic.
 */
export type ContentDb = BetterSQLite3Database<typeof schema>;

/** Generated migrations live at `src/infra/drizzle/` (resolved from this file). */
const MIGRATIONS_DIR = path.resolve(__dirname, "../drizzle");

/** First-run demo content a caller may supply to `openContentDb`/`seedContentDb`. */
export interface ContentDbSeedData {
  workspace: typeof schema.workspaces.$inferInsert;
  posts: Array<Omit<typeof schema.posts.$inferInsert, "bodyJson"> & { bodyJson: unknown }>;
  presentation: typeof schema.presentationSettings.$inferInsert;
}

/** Open (or create) the content.db, apply pragmas, migrate, and seed if empty and `seed` is given. */
export function openContentDb(filePath: string, seed?: ContentDbSeedData): ContentDb {
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  if (seed) seedContentDb(db, seed);
  return db;
}

/**
 * Seed the demo workspace/posts/presentation exactly once.
 *
 * Guarded by workspace slug so a persisted db (with the operator's own edits) is
 * never re-seeded or overwritten on restart.
 */
export function seedContentDb(db: ContentDb, seed: ContentDbSeedData): void {
  const existing = db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, seed.workspace.slug))
    .all();
  if (existing.length > 0) return;

  db.transaction((tx) => {
    tx.insert(schema.workspaces).values(seed.workspace).run();
    for (const post of seed.posts) {
      tx.insert(schema.posts)
        .values({ ...post, bodyJson: JSON.stringify(post.bodyJson) })
        .run();
    }
    tx.insert(schema.presentationSettings).values(seed.presentation).run();
  });
}
