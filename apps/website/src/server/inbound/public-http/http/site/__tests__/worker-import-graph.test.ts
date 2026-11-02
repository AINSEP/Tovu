import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

/**
 * @file Guards the cold-start cost of the theme render sandbox: each render spawns a fresh worker
 * (see `worker-sandbox.ts`), and that worker loads its entry file's whole import graph under a
 * 64 MB heap before it can render a byte. When the workers imported `render.ts`'s value imports
 * through feature barrels (`#src/features/post/index`, `#src/features/media/index`,
 * `#src/features/theme/index`), every render also loaded the DB kernels (kysely, drizzle-orm,
 * better-sqlite3, pg, pglite), the S3 blob client and the CMS/agentic packages: ~990 modules and
 * 3.5-5.4s per render at load 10 (5.8-33s under heavier load), past the 5s render budget.
 *
 * A wall-clock assertion would be flaky under machine load, so this checks the cause instead: the
 * modules a worker entry actually loads, booted the same way the sandbox boots it (tsx's CJS
 * register, then `require` of the absolute `.ts` path). The entry throws its own "must run inside a
 * worker_threads Worker" error because it is not inside a worker thread; that runs after every
 * static import has evaluated, so the whole graph is in `require.cache` (minus the entry itself,
 * which Node evicts because its evaluation threw).
 */

const require = createRequire(import.meta.url);
const SITE_DIR = path.join(import.meta.dirname, "..");

/** Packages a template render never needs; any one of them means a barrel import leaked the server graph in. */
const FORBIDDEN_IN_WORKER = [
  "/node_modules/kysely/",
  "/node_modules/drizzle-orm/",
  "/node_modules/better-sqlite3/",
  "/node_modules/@electric-sql/pglite/",
  "/node_modules/pg/",
  "/node_modules/aws4fetch/",
  "/Jini/packages/db/",
  // Even verified-origin is unnecessary once render-time rules use pure leaves.
  "/Jini/packages/http-kit/",
  // The same packages as installed from npm (a deployed build has no `/Jini/packages/` checkout).
  "/node_modules/@jini-ai/db/",
  "/node_modules/@jini-ai/http-kit/",
];

// Pure handle leaves are render dependencies; the agent core/root barrels are not.
const FORBIDDEN_AGENTIC_BARRELS = /\/(?:packages\/agentic|node_modules\/@jini-ai\/agentic)\/(?:src|dist)\/(?:core\/)?index\.[jt]s$/;

/** Match both source-checkout and installed-package graphs, including submission/descriptor validation.
 * Render-time attribute rules live in the shared field registry, not the submission validator. */
const FORBIDDEN_FORM_SERVICES = /\/(?:packages\/cms|node_modules\/@jini-ai\/cms)\/(?:src|dist)\/forms\/(?:write-service\.|submit-service\.|repo[./]|forms\.|descriptor-rules\.)/;

/** Cloud 2026-10-28: 161 Handlebars / 119 Liquid, before removing forms/descriptor-rules above.
 * Added render dependencies: theme font-links/public-page-security-headers and their resource
 * contract (0e3cd2128), site-timezone date-label (70fdeb1a9), form field-length-caps (d6d0618b0),
 * and CMS plugin-export/consent-category/server-fragment (9ed0d7d5d). They produce or validate
 * rendered HTML; retain a small margin for them while banning non-rendering forms code explicitly.
 */
const WORKER_MODULE_BUDGETS = {
  "handlebars-worker.ts": 165,
  "liquid-worker.ts": 125,
} as const;

/** Loads one entry in a bounded child, preserving errors so incomplete graphs cannot pass.
 * Runtime edges include cached imports and transitive re-exports. Exits after flushing the graph
 * so feature timers cannot retain the child. O(m + e) bookkeeping for m modules and e load edges.
 */
function loadWorkerGraph(workerFile: string): { entryError: string; modules: string[]; rootBarrelImports: string[] } {
  const script = `
    require(${JSON.stringify(require.resolve("tsx/cjs/api"))}).register();
    // Observe actual runtime edges, including transitive re-exports and cached imports.
    const Module = require("node:module");
    const load = Module._load;
    const rootBarrelImports = [];
    Module._load = function(specifier, parent, ...args) {
      if (/^@jini-ai\\/[^/]+$/.test(specifier)) {
        rootBarrelImports.push(parent.filename + " -> " + specifier);
      }
      return load.call(this, specifier, parent, ...args);
    };
    let entryError = "";
    try { require(${JSON.stringify(path.resolve(SITE_DIR, workerFile))}); } catch (error) { entryError = String(error.message); }
    process.stdout.write(JSON.stringify({ entryError, modules: Object.keys(require.cache), rootBarrelImports }), () => process.exit(0));
  `;
  const out = execFileSync(process.execPath, ["-e", script], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
  return JSON.parse(out) as { entryError: string; modules: string[]; rootBarrelImports: string[] };
}

for (const workerFile of ["handlebars-worker.ts", "liquid-worker.ts"] as const) {
  test(`${workerFile} loads no database, blob-store or agent packages`, () => {
    const { entryError, modules, rootBarrelImports } = loadWorkerGraph(workerFile);
    // Any other error means an import failed part-way and the graph below would be incomplete.
    assert.equal(entryError, `${workerFile} must run inside a worker_threads Worker`);
    assert.deepEqual(rootBarrelImports, [],
      `${workerFile} loaded @jini-ai root barrels; use narrow export subpaths:\n${rootBarrelImports.join("\n")}`);
    assert.deepEqual(modules.filter((module) => FORBIDDEN_AGENTIC_BARRELS.test(module)), [],
      `${workerFile} loaded the agentic core/root barrel`);
    const leaked = FORBIDDEN_IN_WORKER.filter((needle) => modules.some((m) => m.includes(needle)));
    assert.deepEqual(leaked, [], `${workerFile} pulled in ${leaked.join(", ")} (${modules.length} modules loaded)`);
    const formServices = modules.filter((module) => FORBIDDEN_FORM_SERVICES.test(module));
    assert.deepEqual(formServices, [], `${workerFile} pulled in forms services: ${formServices.join(", ")}`);
    // tsx and its esbuild transpiler are development-loader overhead, absent from deployed JS workers.
    const renderingModules = modules.filter((module) => !/\/node_modules\/(?:tsx|esbuild)\//.test(module));
    const budget = WORKER_MODULE_BUDGETS[workerFile];
    assert.ok(renderingModules.length <= budget,
      `${workerFile} loaded ${renderingModules.length} rendering modules (budget ${budget})`);
  });
}

test("public page requests do not load feature-wide barrels or assistant tools", () => {
  const { entryError, modules, rootBarrelImports } = loadWorkerGraph("../../routes/site/pages.ts");
  assert.equal(entryError, "");
  assert.deepEqual(rootBarrelImports.filter((edge) => edge.includes("/apps/website/src/")), [],
    `public page requests loaded @jini-ai root barrels:\n${rootBarrelImports.join("\n")}`);
  const heavyBarrels = modules.filter((module) => /\/apps\/website\/src\/(?:assistant|features\/(?:post|members|media|theme|presentation|comments))\/index\.ts$/.test(module));
  assert.deepEqual(heavyBarrels, [], `public page requests loaded feature barrels:\n${heavyBarrels.join("\n")}`);
});

for (const entry of [
  "../../routes/site/products.ts", "../../routes/site/media-rendition.ts",
  "../../routes/site/member-pages.ts", "../../routes/content/posts/get-by-slug.ts",
  "../../middleware/site-consent.ts", "../../middleware/theme-preview-switcher.ts",
  "../../http/shared/post.ts", "../../routes/site/feed.ts", "../../middleware/theme-static-assets.ts",
  "../../middleware/theme-preview-refresh.ts", "../../routes/plugin-contributions.ts",
]) {
  test(`${entry} keeps public reads separate from feature-wide write/tool barrels`, () => {
    const { entryError, modules } = loadWorkerGraph(entry);
    assert.equal(entryError, "");
    const heavyBarrels = modules.filter((module) => /\/apps\/website\/src\/(?:assistant|features\/(?:post|members|media|theme|presentation))\/index\.ts$/.test(module));
    assert.deepEqual(heavyBarrels, [], `${entry} loaded feature barrels:\n${heavyBarrels.join("\n")}`);
    assert.deepEqual(modules.filter((module) => module.endsWith("/contracts/core/index.ts")), [],
      `${entry} loaded the entire core contract barrel`);
  });
}

test("visitor publication uses narrow package entries on public HTML responses", () => {
  const { entryError, rootBarrelImports } = loadWorkerGraph("../../middleware/published-webmcp.ts");
  assert.equal(entryError, "");
  const hostRoots = rootBarrelImports.filter((edge) => edge.includes("/apps/website/src/"));
  assert.deepEqual(hostRoots, [], `visitor publication loaded @jini-ai root barrels:\n${hostRoots.join("\n")}`);
});
