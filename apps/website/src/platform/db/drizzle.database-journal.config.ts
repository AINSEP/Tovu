import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config for the sidecar `ops/database-journal.db` (ADR-041 §2) — a physically
 * separate SQLite file from `content.db`, so it needs its own generate target rather than
 * sharing `drizzle.config.ts`. Run `npm run db:generate:database-journal` after changing
 * `src/platform/db/sqlite/database-journal-schema.ts`.
 *
 * As with its sibling, the paths below resolve against the CWD drizzle-kit runs in (the
 * repo root), not this file's directory — which is why they read
 * `./apps/website/src/platform/db/...` from inside `apps/website/src/platform/db/`.
 * Verified against drizzle-kit 0.30.6.
 *
 * 2026-09-02: repointed from `./src/platform/db/...` to `./apps/website/src/...`, the same
 * defect fixed in its sibling `drizzle.config.ts` in commit 7fb47f55 but missed there — the
 * apps/website restructure moved the tree but not these two strings, so
 * `db:generate:database-journal` failed with "No schema files found for path config", meaning
 * NO migration could be generated for `ops/database-journal.db` by anyone.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./apps/website/src/platform/db/sqlite/database-journal-schema.ts",
  out: "./apps/website/src/platform/db/drizzle-database-journal",
});
