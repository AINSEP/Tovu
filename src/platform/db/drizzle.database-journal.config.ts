import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config for the sidecar `ops/database-journal.db` (ADR-041 §2) — a physically
 * separate SQLite file from `content.db`, so it needs its own generate target rather than
 * sharing `drizzle.config.ts`. Run `npm run db:generate:database-journal` after changing
 * `src/platform/db/sqlite/database-journal-schema.ts`.
 *
 * As with its sibling, the paths below resolve against the CWD drizzle-kit runs in (the
 * repo root), not this file's directory.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/platform/db/sqlite/database-journal-schema.ts",
  out: "./src/platform/db/drizzle-database-journal",
});
