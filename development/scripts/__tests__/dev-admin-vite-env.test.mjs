import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminViteEnv,
  deriveDevScheme,
  isDevTlsExplicitlyDisabled,
  resolveDevTlsActive,
} from "../dev.mjs";

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

test("buildAdminViteEnv points TOVU_API_URL at https:// when the API is terminating TLS itself", () => {
  // Regression for the printed/handed-down-URL bug: before this change every URL this script
  // produced was hardcoded http://, including this one, so the admin Vite child's own `/api` proxy
  // default would have disagreed with an API that was actually speaking TLS.
  const env = buildAdminViteEnv({ apiPort: 3000, vitePort: 5173, apiScheme: "https" });
  assert.deepEqual(env, { TOVU_API_URL: "https://localhost:3000", TOVU_ADMIN_DEV_PORT: "5173" });
});

test("deriveDevScheme: true -> https, false -> http", () => {
  assert.equal(deriveDevScheme(true), "https");
  assert.equal(deriveDevScheme(false), "http");
});

test("resolveDevTlsActive: true only when both cert and key exist and TLS is not disabled", () => {
  const paths = { certPath: "/repo/.certs/localhost.pem", keyPath: "/repo/.certs/localhost-key.pem" };
  assert.equal(
    resolveDevTlsActive({ ...paths, disableFlag: undefined }, { existsSync: () => true }),
    true
  );
});

test("resolveDevTlsActive: false when the cert file is missing", () => {
  const paths = { certPath: "/repo/.certs/localhost.pem", keyPath: "/repo/.certs/localhost-key.pem" };
  assert.equal(
    resolveDevTlsActive({ ...paths, disableFlag: undefined }, { existsSync: (p) => p !== paths.certPath }),
    false
  );
});

test("resolveDevTlsActive: false when disableFlag is true, even with both files present", () => {
  // The Playwright/E2E escape hatch — see vite.config.ts's matching comment for the full rationale.
  // `disableFlag` here is already-parsed boolean (see isDevTlsExplicitlyDisabled below) — main()
  // parses TOVU_DISABLE_DEV_TLS before ever calling resolveDevTlsActive.
  const paths = { certPath: "/repo/.certs/localhost.pem", keyPath: "/repo/.certs/localhost-key.pem" };
  assert.equal(
    resolveDevTlsActive({ ...paths, disableFlag: true }, { existsSync: () => true }),
    false
  );
});

/**
 * REGRESSION (2026-09-05 audit finding): `resolveDevTlsActive`'s `disableFlag` used to be the raw
 * `TOVU_DISABLE_DEV_TLS` string, checked with a bare `if (disableFlag)` — so ANY non-empty string,
 * including the literal `"false"` or `"0"`, disabled TLS, inverting an operator's explicit intent to
 * keep it on. The fix moves parsing to `isDevTlsExplicitlyDisabled` (mirroring
 * `apps/website/src/server/runtime/boot/dev-tls.ts`'s and `apps/admin/vite.config.ts`'s own copies of
 * this same parse), called at `main()`'s call site before `resolveDevTlsActive` ever sees the value.
 */
test("isDevTlsExplicitlyDisabled: \"false\" and \"0\" do NOT count as disabled", () => {
  assert.equal(isDevTlsExplicitlyDisabled("false"), false);
  assert.equal(isDevTlsExplicitlyDisabled("0"), false);
});

test("isDevTlsExplicitlyDisabled: \"1\", \"true\", \"TRUE\" all count as disabled", () => {
  assert.equal(isDevTlsExplicitlyDisabled("1"), true);
  assert.equal(isDevTlsExplicitlyDisabled("true"), true);
  assert.equal(isDevTlsExplicitlyDisabled("TRUE"), true);
});

test("isDevTlsExplicitlyDisabled: undefined (unset) does not count as disabled", () => {
  assert.equal(isDevTlsExplicitlyDisabled(undefined), false);
});
