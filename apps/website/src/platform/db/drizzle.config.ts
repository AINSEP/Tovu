import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config — generates content.db migrations from the code-first schema.
 * Run `npm run db:generate` after changing `src/platform/db/schema.sqlite.ts`.
 *
 * The paths below are relative to the CWD drizzle-kit runs in (the repo root, via the
 * npm script), NOT to this file's own directory — which is why they read
 * `./apps/website/src/platform/db/...` from inside `apps/website/src/platform/db/`.
 * Verified against drizzle-kit 0.30.6.
 *
 * 2026-09-02: repointed from `./src/platform/db/...` to `./apps/website/src/...`. The apps/website
 * restructure moved the tree but not these two strings, so `drizzle-kit generate` failed with
 * "No schema files found for path config" — meaning NO migration could be generated at all, and a
 * schema.sqlite.ts edit had no way to reach the database. Same dead-`./src/` rot the restructure left in
 * `development/scripts/{generate-seed-content,list-server-test-files,backfill-*}.ts`.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./apps/website/src/platform/db/schema.sqlite.ts",
  out: "./apps/website/src/platform/db/drizzle",
});
