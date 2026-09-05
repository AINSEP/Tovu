import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @file Pins that `commit-site.ts` reaches `#src/platform/export/index` through the ordinary ESM
 * import graph, not through a call-time `require()`.
 *
 * Why this is a real property and not a style rule: under `tsx`, a `require()` of a first-party
 * `.ts` module is resolved by tsx's **CJS** hook, which transpiles that module — and everything it
 * imports — a second time, in esbuild's CommonJS format. The same files are already present in the
 * process as ESM modules, so the process ends up holding two instantiations of one file. With
 * `--experimental-test-coverage` active both instantiations report V8 coverage under the same
 * `SF:` path, their `FN:` tables concatenate, and the never-exercised CJS copy clobbers `DA:` line
 * hits — the dual-instantiation corruption `development/scripts/check-coverage-integrity.ts`
 * exists to catch. Measured 2026-09-05: running `commit-site.unit.test.ts` alone produced 45
 * contaminated first-party blocks, 28 of them SEVERE, entirely from this one `require()`
 * (`ADS-memory/reports/2026-09-05-coverage-dual-instantiation-routes-W-and-A.md`, "Route A").
 *
 * The `require()` was there to break a documented import cycle
 * (`commit-site.ts -> #src/platform/export/index -> ... -> server/app.ts -> ... -> src/assistant ->
 * ... -> commit-site.ts`). That cycle no longer exists: `platform/export/site-exporter.ts` dropped
 * its `server/app.ts` back-edge in the 2026-08-16 rework, and a dependency-cruiser reachability
 * pass over the export barrel's 67-module runtime closure (type-only edges excluded) found nothing
 * under `apps/website/src/server/**`, `apps/website/src/assistant/**`,
 * `features/source-control/**` or `features/deployments/**` in it. The same pass showed the static
 * import adds ZERO modules to `commit-site.ts`'s own runtime closure — every one of the barrel's
 * modules is already reachable from this file's other imports — so this is a change in how one
 * function is resolved, not in what gets loaded.
 *
 * Source-text inspection, not a behavioural probe, for the same reason
 * `contracts/core/__tests__/integration/child-process-coverage-env-wiring.test.ts` gives: the
 * property under test IS a property of the source. A behavioural probe would have to perform the
 * very `require()` this test forbids, recreating the defect inside the coverage run it protects.
 *
 * `features/deployments/static-publish/adapter.ts` carries the identical helper and is deliberately
 * NOT listed below: making its import static would pull 65 modules (better-sqlite3, drizzle,
 * handlebars, liquidjs and the whole theme/post/db graph) into its currently 7-module eager load
 * graph, which is an owner decision, not a mechanical one. It is known-open, not overlooked.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../..");

/** Files that must resolve first-party modules through `import`, never a call-time `require()`. */
const NO_FIRST_PARTY_REQUIRE_FILES = ["apps/website/src/features/source-control/commit-site.ts"];

/** Any `require("#src/...")` / `require("../…")`-shaped call naming a first-party specifier. Node
 *  builtins (`require("node:sea")`) and real npm packages are out of scope — they carry no second
 *  first-party instantiation. */
const FIRST_PARTY_REQUIRE = /require\(\s*["'](?:#src\/|\.\.?\/)/;

/** Comments are stripped before matching: the very doc comment in `commit-site.ts` that explains why
 *  the `require()` was removed quotes it verbatim, and a check that a file may not *describe* the
 *  construct it deliberately stopped using would be unusable — it would punish the explanation. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

for (const relativePath of NO_FIRST_PARTY_REQUIRE_FILES) {
  test(`${relativePath}: resolves first-party modules by import, never by a call-time require() (a require() is a second, CJS-transpiled instantiation under tsx)`, () => {
    const source = stripComments(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
    assert.doesNotMatch(
      source,
      FIRST_PARTY_REQUIRE,
      `${relativePath} require()s a first-party module. Under tsx that loads the module — and its whole import graph — a second time through the CJS hook, giving every one of those files two V8 coverage images that merge into one corrupted lcov block. See this file's header for the measurement and for why the cycle this used to work around is gone.`
    );
  });
}
