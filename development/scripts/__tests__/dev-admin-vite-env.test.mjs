import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminViteEnv } from "../dev.mjs";

/**
 * @file Regression test for a real cross-wiring bug in `development/scripts/dev.mjs`: it computed
 * `API_PORT`/`VITE_PORT` for its own preflight port-collision check, then started the admin Vite
 * child with NO env at all (`{}`). `apps/admin/vite.config.ts`'s `/api` proxy and dev-server port
 * both fall back to hardcoded defaults (`http://localhost:3000`, `5173`) whenever their env vars are
 * unset — so any dev stack started with non-default ports (the only way past preflight's own
 * port-collision check for a SECOND stack on one machine) got an admin UI silently reading and
 * writing the FIRST stack's API on :3000 instead of its own, with no error anywhere. `dev.mjs`
 * itself runs a real boot sequence (preflight, real child-process spawns) as soon as it is imported
 * unless invoked with its own entrypoint guard skipped — safe here only because `buildAdminViteEnv`
 * is a pure function with no side effects, and the module's `main()` only runs when this file is
 * executed directly (`import.meta.url === pathToFileURL(process.argv[1]).href`), never on import.
 */

test("buildAdminViteEnv points the admin proxy at THIS stack's own preflight-checked API port, not the default", () => {
  const env = buildAdminViteEnv({ apiPort: 3001, vitePort: 5174 });
  assert.equal(env.TOVU_API_URL, "http://localhost:3001");
});

test("buildAdminViteEnv passes through the same admin dev port dev.mjs's own preflight checked", () => {
  const env = buildAdminViteEnv({ apiPort: 3001, vitePort: 5174 });
  assert.equal(env.TOVU_ADMIN_DEV_PORT, "5174");
});

test("buildAdminViteEnv still resolves to the documented defaults when dev.mjs runs unmodified", () => {
  // The single-stack case (no env overrides): must match apps/admin/vite.config.ts's own
  // `?? "http://localhost:3000"` / `?? 5173` fallbacks exactly, or a normal, non-cross-wired boot
  // would start disagreeing with itself.
  const env = buildAdminViteEnv({ apiPort: 3000, vitePort: 5173 });
  assert.deepEqual(env, { TOVU_API_URL: "http://localhost:3000", TOVU_ADMIN_DEV_PORT: "5173" });
});
