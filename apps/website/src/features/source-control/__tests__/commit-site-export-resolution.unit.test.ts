import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

/**
 * @file Pins that `commit-site.ts` reaches `#src/features/site-export/index` through the ordinary ESM
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
 * (`commit-site.ts -> #src/features/site-export/index -> ... -> server/app.ts -> ... -> src/assistant ->
 * ... -> commit-site.ts`). That cycle no longer exists: `features/site-export/site-exporter.ts` dropped
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
 * `features/deployments/static-publish/adapter.ts` carried the identical helper and was previously
 * excluded here, because importing `#src/features/site-export/index` statically would have pulled 65
 * modules (better-sqlite3, drizzle, handlebars, liquidjs and the whole theme/post/db graph) into
 * its 7-module eager load graph — a real cost on a module reached from
 * `assistant/tool-registrations.ts`, and an owner decision rather than a mechanical one.
 *
 * Resolved 2026-09-05 by removing the cost instead of paying it: `firstExportFailure` and its
 * `ExportFailureSummary` result type now live in the leaf module
 * `features/site-export/export-failure-summary.ts`, which imports nothing at runtime (its only
 * dependency, `ExportReport`, is an `import type` and therefore erased). `site-exporter.ts`
 * re-exports both, so the barrel's public surface and `features/site-export/__tests__/index.test.ts`'s
 * identity assertion are unchanged. `adapter.ts` imports the leaf directly, which adds ONE module
 * to its eager graph rather than 65. Both call sites are therefore listed below.
 *
 * Note for anyone extending this: `features/site-export` is NOT in `.dependency-cruiser.mjs`'s
 * `GUARDED_MODULES`, so there is no `no-deep-imports:export` rule and the leaf import needs no
 * exemption. The 2026-09-05 report predicted one would be required; that prediction was wrong,
 * verified by reading the config's module list.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../..");

/** Files that must resolve first-party modules through `import`, never a call-time `require()`. */
const NO_FIRST_PARTY_REQUIRE_FILES = [
  "apps/website/src/features/source-control/commit-site.ts",
  "apps/website/src/features/deployments/static-publish/adapter.ts",
];

function firstPartyRequires(source: string): string[] {
  const file = ts.createSourceFile("boundary.ts", source, ts.ScriptTarget.Latest, true);
  const loaders = new Set(["require"]);
  const constructors = new Set(["createRequire"]);
  const values = new Map<string, string>();
  function stringValue(node: ts.Expression): string | undefined {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isIdentifier(node)) return values.get(node.text);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = stringValue(node.left), right = stringValue(node.right);
      if (left !== undefined && right !== undefined) return left + right;
    }
  }
  function isLoader(node: ts.Expression): boolean {
    return ts.isIdentifier(node) && loaders.has(node.text)
      || ts.isCallExpression(node) && ts.isIdentifier(node.expression) && constructors.has(node.expression.text);
  }
  const matches: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && ["node:module", "module"].includes(node.moduleSpecifier.text)) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) {
        if ((item.propertyName ?? item.name).text === "createRequire") constructors.add(item.name.text);
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (isLoader(node.initializer)) loaders.add(node.name.text);
      const value = stringValue(node.initializer);
      if (value !== undefined) values.set(node.name.text, value);
    }
    if (ts.isCallExpression(node) && isLoader(node.expression) && node.arguments[0]) {
      const specifier = stringValue(node.arguments[0]);
      if (specifier && /^(?:#src\/|\.\.?\/)/.test(specifier)) matches.push(specifier);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return matches;
}

for (const relativePath of NO_FIRST_PARTY_REQUIRE_FILES) {
  test(`${relativePath}: resolves first-party modules by import, never by a call-time require()`, () => {
    assert.deepEqual(firstPartyRequires(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8")), [],
      `${relativePath} loads a first-party module through the CJS hook`);
  });
}

test("the require guard catches whitespace, templates, aliases and statically computed specifiers", () => {
  for (const source of [
    'require ("#src/features/site-export/index")',
    'require(`../site-export/index.js`)',
    'const load = require; load("./local.js")',
    'const prefix = "#src/"; require(prefix + "features/site-export/index")',
    'import { createRequire as makeRequire } from "node:module"; const load = makeRequire(import.meta.url); load("#src/x")',
    'createRequire(import.meta.url)("../local.js")',
  ]) assert.equal(firstPartyRequires(source).length, 1, source);
  assert.deepEqual(firstPartyRequires('// require("#src/x")\nimport x from "./x.js"; require("node:fs"); const text = `require("#src/x")`;'), []);
});
