import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config — generates content.db migrations from the code-first schema.
 * Run `npm run db:generate` after changing `src/platform/db/schema.ts`.
 *
 * The paths below are relative to the CWD drizzle-kit runs in (the repo root, via the
 * npm script), NOT to this file's own directory — which is why they read `./src/platform/db/...`
 * from inside `src/platform/db/`. Verified against drizzle-kit 0.30.6.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/platform/db/schema.ts",
  out: "./src/platform/db/drizzle",
});
