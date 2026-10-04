/**
 * @file Task 2 of the publish-content (Publish Content) feature — the architecture check plan §3
 * calls for: no runtime import edge from `features/post` into `type-registry.ts`.
 *
 * Modeled directly on `assistant/__tests__/domain-no-direct-tool-registration.boundary.test.ts` (see
 * that file's own header for the full rationale of "a test in ADDITION to `.dependency-cruiser.mjs`",
 * since `check:boundaries` is already red for unrelated reasons and cannot signal one more violation).
 *
 * Why this edge matters here specifically: plan §3's own stated trap is that `features/post ->
 * assistant` VALUE edges have previously closed real module cycles and had to be removed by
 * injecting the dependency instead (`duplicate-resource-registry.ts`'s header tells that exact
 * story). `contributePostPublish()`/`contributePagePublish()` (`features/post/publish-content.ts`)
 * must return DATA (a `PublishContentContributor`) for the composition root to register — if
 * `features/post` ever calls `registerPublishContentContributor` itself, it reopens the identical
 * cycle risk this feature was designed from the start to avoid.
 *
 * `import type { ... } from "../type-registry.js"` IS exempt, for the same reason the tool-contribution
 * boundary test exempts `import type { ToolContributor }`: a type-only edge is erased at compile time
 * (no runtime module edge — `check:architecture`'s own module-cycle metric is computed on the
 * runtime-only graph) and every `contribute*Transport()` genuinely needs the type to declare its own
 * return value.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../..");
const SRC_ROOT = path.join(REPO_ROOT, "apps", "website", "src");
const POST_ROOT = path.join(SRC_ROOT, "features", "post");
const REGISTRY_FILE = path.join(SRC_ROOT, "features", "publish-content", "type-registry.ts");

const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "build", "coverage", "__tests__"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

// F5.6: use the language parser so every runtime import form is visible.
function valueSpecifiers(source: string): string[] {
  const parsed = ts.createSourceFile("fixture.ts", source, ts.ScriptTarget.Latest, true);
  const specs: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const typeOnly = clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 && bindings.elements.every(e => e.isTypeOnly));
      if (!typeOnly) specs.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const bindings = node.exportClause;
      const typeOnly = node.isTypeOnly || (bindings && ts.isNamedExports(bindings) &&
        bindings.elements.length > 0 && bindings.elements.every(e => e.isTypeOnly));
      if (!typeOnly) specs.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      specs.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return specs;
}

function collectProductionFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectProductionFiles(full, out);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
}

/** True when a specifier from `fromFile` resolves to exactly `type-registry.ts` (not merely
 *  somewhere under `features/publish-content/`) — a value import of, say, a future
 *  `publish-content/blob-manifest.ts` helper is a different, unrestricted edge. */
function resolvesToRegistryFile(fromFile: string, specifier: string): boolean {
  if (specifier.startsWith("#src/features/publish-content/type-registry")) return true;
  if (!specifier.startsWith(".")) return false;
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  return resolved.replace(/\.(?:js|ts)$/, "") === REGISTRY_FILE.replace(/\.ts$/, "");
}

test("no production file under src/features/post/ value-imports type-registry.ts (type-only PublishContentContributor/Handler imports are fine)", () => {
  const files: string[] = [];
  collectProductionFiles(POST_ROOT, files);
  assert.ok(files.length > 5, `sanity check: expected several production files under features/post, found ${files.length}`);

  const offenders: string[] = [];
  for (const file of files) {
    for (const specifier of valueSpecifiers(fs.readFileSync(file, "utf8"))) {
      if (resolvesToRegistryFile(file, specifier)) {
        offenders.push(`${path.relative(REPO_ROOT, file)} value-imports "${specifier}"`);
      }
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `features/post must not call the publish-content registry directly — only a composition root may. Offending edges:\n  ${offenders.join("\n  ")}`,
  );
});

test("the registry boundary detects static, side-effect, re-export and dynamic .js edges", () => {
  const file = path.join(POST_ROOT, "fixture.ts");
  for (const source of [
    'import { x } from "../publish-content/type-registry.js";',
    'import "../publish-content/type-registry.js";',
    'export { x } from "../publish-content/type-registry.js";',
    'export * from "../publish-content/type-registry.js";',
    'await import("../publish-content/type-registry.js");',
  ]) {
    assert.deepEqual(valueSpecifiers(source).filter(spec => resolvesToRegistryFile(file, spec)),
      ["../publish-content/type-registry.js"]);
  }
  assert.deepEqual(valueSpecifiers('import type { X } from "../publish-content/type-registry.js";'), []);
  assert.deepEqual(valueSpecifiers('// import "../publish-content/type-registry.js";'), []);
});
