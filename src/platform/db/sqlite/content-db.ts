import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { eq, sql } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "../schema.js";

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
 * - Schema is code-first (`db/schema.ts`) → `db/drizzle/` migrations, so
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
/**
 * SPEC-016 (`core/gated-mutations`'s `db-ops.ts` adapter, ADR-041 §5): widened with `$client`
 * (the raw `better-sqlite3` `Database` instance `drizzle()` already returns at runtime) so a
 * restore-point capture can call the driver's online-backup API directly. Additive only — every
 * existing caller that only used the Drizzle query surface is unaffected.
 */
export type ContentDb = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/** Generated migrations live at `src/platform/db/drizzle/` (resolved from this file). */
const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");

/** First-run demo content a caller may supply to `openContentDb`/`seedContentDb`. */
export interface ContentDbSeedData {
  workspace: typeof schema.workspaces.$inferInsert;
  /**
   * `bodyJson` and (SPEC-005) `ext` are both JSON-text columns whose seed callers hand us the
   * parsed object — the same shape `PostRecord` carries — so both are widened here and serialized
   * on insert below. `ext` is optional: a seed entry without one gets the column's `'{}'` default.
   */
  posts: Array<
    Omit<typeof schema.posts.$inferInsert, "bodyJson" | "ext"> & { bodyJson: unknown; ext?: unknown }
  >;
  presentation: typeof schema.presentationSettings.$inferInsert;
}

/**
 * ADR-023 §2 — a caller-injected pre-open recovery hook, run against `filePath` BEFORE this
 * function opens its own connection (dependency inversion, same pattern `seed` already uses —
 * ADR-042 item 3's fix for exactly this "infra reaching up" shape: this file stays decoupled from
 * `features/plugins/*`; the composition root wires the concrete
 * `recoverIncompleteDataModuleMigrations` implementation). Optional and a no-op when omitted —
 * correct for `:memory:` connections (nothing to recover) and every hermetic test call site.
 */
export type ContentDbRecoveryHook = (filePath: string) => void;

/** Open (or create) the content.db, apply pragmas, migrate, and seed if empty and `seed` is given. */
export function openContentDb(filePath: string, seed?: ContentDbSeedData, recover?: ContentDbRecoveryHook): ContentDb {
  if (recover) recover(filePath);

  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // SPEC-033 — defense in depth alongside `store-plugin.ts`'s identical fix: this connection can
  // itself be the "second" connection relative to a separate one (e.g. the store plugin's own
  // dedicated handle) transiently holding a lock. Retry internally rather than throwing immediately.
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema }) as ContentDb;
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  ensureWatermarkRow(db);
  if (seed) seedContentDb({ db, seed });
  return db;
}

/**
 * SPEC-016 (`core/gated-mutations/watermark.ts`) — guarantees the `database_write_watermark`
 * singleton row (`id=1`) exists, independent of any demo-seed data. `INSERT OR IGNORE` keeps this
 * idempotent across restarts on a persisted db, matching `seedContentDb`'s own "never re-seed an
 * operator-edited db" guard, but for a bootstrap invariant rather than optional demo content.
 */
function ensureWatermarkRow(db: ContentDb): void {
  db.run(sql`INSERT OR IGNORE INTO ${schema.databaseWriteWatermark} (id, value, last_stamped_at) VALUES (1, 0, NULL)`);
}

/**
 * Seed the demo workspace/posts/presentation exactly once.
 *
 * Guarded by workspace slug so a persisted db (with the operator's own edits) is
 * never re-seeded or overwritten on restart.
 */
export function seedContentDb(
  required: { db: ContentDb; seed: ContentDbSeedData },
  _optional: Record<string, never> = {}
): void {
  const { db, seed } = required;
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
        .values({
          ...post,
          bodyJson: JSON.stringify(post.bodyJson),
          ext: JSON.stringify(post.ext ?? {}),
        })
        .run();
    }
    tx.insert(schema.presentationSettings).values(seed.presentation).run();
  });
}
