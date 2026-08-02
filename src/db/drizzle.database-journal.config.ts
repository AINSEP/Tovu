import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config for the sidecar `ops/database-journal.db` (ADR-041 §2) — a physically
 * separate SQLite file from `content.db`, so it needs its own generate target rather than
 * sharing `drizzle.config.ts`. Run `npm run db:generate:database-journal` after changing
 * `src/infra/sqlite/database-journal-schema.ts`.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/infra/sqlite/database-journal-schema.ts",
  out: "./src/infra/drizzle-database-journal",
});
