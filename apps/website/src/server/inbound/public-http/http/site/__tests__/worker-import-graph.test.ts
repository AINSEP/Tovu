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
  "/Jini/packages/agentic/",
];

function loadWorkerGraph(workerFile: string): { entryError: string; modules: string[] } {
  const script = `
    require(${JSON.stringify(require.resolve("tsx/cjs/api"))}).register();
    let entryError = "";
    try { require(${JSON.stringify(path.join(SITE_DIR, workerFile))}); } catch (error) { entryError = String(error.message); }
    process.stdout.write(JSON.stringify({ entryError, modules: Object.keys(require.cache) }));
  `;
  const out = execFileSync(process.execPath, ["-e", script], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out) as { entryError: string; modules: string[] };
}

for (const workerFile of ["handlebars-worker.ts", "liquid-worker.ts"]) {
  test(`${workerFile} loads no database, blob-store or agent packages`, () => {
    const { entryError, modules } = loadWorkerGraph(workerFile);
    // Any other error means an import failed part-way and the graph below would be incomplete.
    assert.equal(entryError, `${workerFile} must run inside a worker_threads Worker`);
    const leaked = FORBIDDEN_IN_WORKER.filter((needle) => modules.some((m) => m.includes(needle)));
    assert.deepEqual(leaked, [], `${workerFile} pulled in ${leaked.join(", ")} (${modules.length} modules loaded)`);
  });
}
