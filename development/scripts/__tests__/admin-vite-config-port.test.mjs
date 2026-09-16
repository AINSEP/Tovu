import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Imported by absolute path out of `apps/admin`'s own tree: `vite` is that package's dependency,
// not `development/`'s.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ADMIN_ROOT = path.join(REPO_ROOT, "apps/admin");
const { resolveConfig } = await import(
  path.join(ADMIN_ROOT, "node_modules/vite/dist/node/index.js")
);

/**
 * @file The contract between how this directory's Playwright configs START the admin dev server and
 * what `apps/admin/vite.config.ts` bakes into the bundle it serves.
 *
 * Every `development/playwright.*.config.ts` runs `npx vite --port <suite port>` and sets no
 * `TOVU_ADMIN_DEV_PORT`. `--port` outranks `server.port` in the config file, so a
 * `__TOVU_ADMIN_DEV_PORT__` computed from the env var alone would tell those bundles "the admin dev
 * server is :5173" while Vite listens on the suite's port. `src/lib/admin-dev-origin.ts` compares
 * that constant against `window.location.port` to decide whether Vite is serving the document
 * itself, so the mismatch silently flips `src/lib/site-url.ts` to relative public-site links — which
 * resolve against Vite, which serves no site routes, and 404. `playwright.post-editor.config.ts` and
 * `playwright.theme-liquid-preview.config.ts` set `VITE_TOVU_SITE_URL` for exactly that branch.
 *
 * `vite.config.ts`'s `tovu:admin-dev-port-define` plugin closes it by reading the RESOLVED
 * `server.port`. That relies on Vite merging inline (CLI) config into the user config before it runs
 * plugin `config` hooks — an ordering nothing else in this repo depends on, which is what this file
 * pins across a Vite upgrade.
 *
 * Run with: `node --test development/scripts/__tests__/admin-vite-config-port.test.mjs` — plain
 * `node`, deliberately NOT vitest: `apps/admin/__tests__/vite-config-dev-tls.unit.test.ts`'s header
 * records that importing `vite.config.ts` from inside this repo's own (Vite-powered) vitest run
 * crashes on colliding esbuild service instances. Nothing in CI runs it, same as every other
 * `.test.mjs` in this directory.
 */

/** Resolves the real `apps/admin/vite.config.ts` the way `vite` itself would. No server is started. */
function resolveAdminConfig(inline = {}) {
  return resolveConfig(
    {
      configFile: path.join(ADMIN_ROOT, "vite.config.ts"),
      root: ADMIN_ROOT,
      logLevel: "silent",
      ...inline,
    },
    "serve"
  );
}

test("the injected dev port follows a CLI --port, which is how every Playwright config starts it", async () => {
  const config = await resolveAdminConfig({ server: { port: 7852, strictPort: true } });

  assert.equal(config.server.port, 7852);
  assert.equal(config.define.__TOVU_ADMIN_DEV_PORT__, JSON.stringify("7852"));
});

test("with no CLI port it is the port the config itself binds", async () => {
  const config = await resolveAdminConfig();

  assert.equal(config.define.__TOVU_ADMIN_DEV_PORT__, JSON.stringify(String(config.server.port)));
});

test("the version define survives the plugin's own define merge", async () => {
  // The plugin returns a `define` of its own; a merge that replaced the object rather than merging
  // it would drop `__TOVU_ADMIN_VERSION__` and throw `ReferenceError` in `lib/app-version.ts`.
  const config = await resolveAdminConfig();

  assert.ok(config.define.__TOVU_ADMIN_VERSION__, "__TOVU_ADMIN_VERSION__ must still be defined");
});

test("a build gets the define too — it is dead code there, but it must not be missing", async () => {
  const config = await resolveConfig(
    { configFile: path.join(ADMIN_ROOT, "vite.config.ts"), root: ADMIN_ROOT, logLevel: "silent" },
    "build"
  );

  assert.equal(typeof config.define.__TOVU_ADMIN_DEV_PORT__, "string");
});
