import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config — generates content.db migrations from the code-first schema.
 * Run `npm run db:generate` after changing `src/infra/db/schema.ts`.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/infra/db/schema.ts",
  out: "./drizzle",
});
