/**
 * @file Enforces `src/features/INFO.md`'s standing rule: "Features must not import server/framework
 * code." Until this file existed the rule was documentation, and documentation does not fail a build.
 *
 * Why a test in ADDITION to `.dependency-cruiser.mjs`'s `feature-no-server-or-framework-imports`:
 * `npm run check:boundaries` reports 90 violations in other rule families today (deep-import warnings
 * that have not had their per-module triage yet). A gate that is already red cannot tell anyone that
 * violation #91 just landed — the exit code was non-zero before and stays non-zero after. This test
 * asserts EXACTLY ONE invariant and is green, so it can go red for exactly one reason. The cruiser
 * rule remains the machine-readable statement of the boundary and catches edges this scanner's source
 * roots do not cover; this test is what makes the boundary fail closed. Same division of labour, and
 * the same reasoning, as `src/platform/db/__tests__/pg-fixture-import-boundary.test.ts`.
 *
 * Why the boundary is worth enforcing at all: a feature that names `src/server/**`, Express, or the
 * admin app cannot be lifted, tested, or reasoned about without booting the HTTP process around it.
 * The dependency runs the other way by design — `server/` composes `features/` (443 edges), and
 * `features/` composes nothing of `server/` (0).
 *
 * Method: scan every production TypeScript/JavaScript file under `src/features/`, extract every import specifier,
 * and resolve it. A specifier is a violation when it names the `express` package, resolves inside
 * `src/server/`, or names `apps/admin`. `__tests__/` is excluded, on exactly the reasoning
 * `.dependency-cruiser.mjs` already applies to every one of its own boundary rules: an integration
 * test that boots a real Express app or `RouteDeps` bag to exercise route or tool wiring end-to-end
 * needs the real concrete internals, and that is orthogonal to this rule's production-layering
 * concern. There are 21 such test edges today and they are deliberately not counted here.
 *
 * `import type` is NOT exempt. A type-only edge still makes the feature name the thing it must not
 * know about, and this rule is a "knows-about" boundary rather than a runtime-construction one — the
 * distinction `.dependency-cruiser.mjs`'s `feature-no-server-or-framework-imports` comment draws
 * against `only-composition-constructs-concrete-adapters`, which polices construction and so does
 * exempt type-only edges. The two production violations this test was written against were both
 * `import type { Express } from "express"`.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import os from "node:os";
import { importSpecifiers } from "../../__tests__/support/import-specifiers.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const FEATURES_ROOT = path.join(REPO_ROOT, "apps", "website", "src", "features");
const SERVER_ROOT = path.join(REPO_ROOT, "apps", "website", "src", "server");

const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "build", "coverage", "__tests__"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);

/** `express` and `express/lib/...`, but not a package that merely starts with those letters. */
const EXPRESS_PACKAGE = /^express(?:\/|$)/;

function collectProductionFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectProductionFiles(full, out);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
}

/** True when `child` is `parent` itself or lives beneath it. Path-segment aware, so `src/servers/` does not match `src/server`. */
function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Classifies one import specifier as a boundary violation or not.
 *
 * @param fromFile - Absolute path of the importing file; relative specifiers resolve against its dir.
 * @param specifier - The raw specifier text as written in source.
 * @returns A short reason string when the edge crosses the boundary, otherwise `null`.
 * @complexity O(1) — string tests plus one path resolution, no I/O.
 */
function violationReason(fromFile: string, specifier: string): string | null {
  if (EXPRESS_PACKAGE.test(specifier)) return "imports the express package";
  if (specifier.includes("apps/admin")) return "imports admin-app code";
  // `#src/*` is this package's own subpath-imports map (package.json: `"#src/*": "./src/*.ts"`).
  if (specifier.startsWith("#src/server/")) return "imports src/server/ via the #src subpath map";
  if (!specifier.startsWith(".")) return null;
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  return isInside(SERVER_ROOT, resolved) ? "imports src/server/ via a relative path" : null;
}

test("no production file under src/features/ imports src/server/, Express, or the admin app", () => {
  const files: string[] = [];
  collectProductionFiles(FEATURES_ROOT, files);
  assert.ok(
    files.length > 200,
    `sanity check: expected hundreds of production files under src/features/, found ${files.length} — ` +
      `a collector that silently walked nothing would make this test pass by scanning zero files`,
  );

  const offenders: string[] = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const specifier of importSpecifiers({ source }, { fileName: file })) {
      const reason = violationReason(file, specifier);
      if (reason) offenders.push(`${path.relative(REPO_ROOT, file)} ${reason}: "${specifier}"`);
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `src/features/INFO.md: features must not import server/framework code. Offending edges:\n  ${offenders.join("\n  ")}`,
  );
});

test("the boundary scanner sees bare, static, re-export, dynamic and require imports", () => {
  const specifiers = importSpecifiers({ source: `
    import "express";
    import "#src/server/app";
    import type { Express } from "express/lib/types";
    export { boot } from "../../server/boot.js";
    const app = import("#src/server/lazy");
    const admin = require("apps/admin/widget");
    // import "express/comment";
    const text = 'import "express/string"';
  ` });
  assert.deepEqual(specifiers, ["express", "#src/server/app", "express/lib/types", "../../server/boot.js", "#src/server/lazy", "apps/admin/widget"]);
  const fromFile = path.join(FEATURES_ROOT, "example", "index.ts");
  assert.ok(specifiers.every((specifier) => violationReason(fromFile, specifier) !== null));
});

test("the shared scanner preserves TSX text and executable import expressions", () => {
  const source = `const note = <p>Don't call require("jsx-text")</p>;
    const panel = <div>{import("real-edge")}</div>;`;
  assert.deepEqual(importSpecifiers({ source }, { fileName: "fixture.tsx" }), ["real-edge"]);
});

test("runtime import scanning omits erased types while the feature boundary retains them", () => {
  const source = `
    import type { A } from "type-import";
    import { type B } from "named-type-import";
    export type { C } from "type-export";
    export { type D } from "named-type-export";
    import type E = require("type-import-equals");
    import F = require("value-import-equals");
    import { type G, value } from "mixed-import";
    export { type H, value } from "mixed-export";
    import "side-effect";
    const deferred = () => import(` + '`template-literal`' + `);
  `;
  assert.deepEqual(importSpecifiers({ source }), [
    "type-import", "named-type-import", "type-export", "named-type-export", "type-import-equals",
    "value-import-equals", "mixed-import", "mixed-export", "side-effect", "template-literal",
  ]);
  assert.deepEqual(importSpecifiers({ source }, { runtimeOnly: true }), [
    "value-import-equals", "mixed-import", "mixed-export", "side-effect", "template-literal",
  ]);
});

test("the collector scans JavaScript and module extensions while excluding test fixtures", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "feature-boundary-"));
  try {
    for (const name of ["a.js", "b.mts", "c.cts", "d.mjs", "e.cjs", "f.jsx", "g.ts", "h.tsx", "ignored.json"]) fs.writeFileSync(path.join(root, name), "");
    fs.mkdirSync(path.join(root, "__tests__"));
    fs.writeFileSync(path.join(root, "__tests__", "test.ts"), "");
    const files: string[] = [];
    collectProductionFiles(root, files);
    assert.deepEqual(files.map((file) => path.basename(file)).sort(), ["a.js", "b.mts", "c.cts", "d.mjs", "e.cjs", "f.jsx", "g.ts", "h.tsx"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
