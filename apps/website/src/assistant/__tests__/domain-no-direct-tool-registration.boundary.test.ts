/** Tool registration stays in composition. Plugin consumers receive sibling services as ports.
 * Shared contracts and pure platform helpers remain ordinary imports; type-only sibling DTOs
 * cannot discover a service. Agent Plugins must not know assistant modules even through types.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const SRC_ROOT = path.join(REPO_ROOT, "apps", "website", "src");
const ASSISTANT_ROOT = path.join(REPO_ROOT, "apps", "website", "src", "assistant");

const GUARDED_TOP_LEVEL_DIRS = ["analytics", "features", "identity", "media", "navigation", "origin", "seo", "widgets"];

/** Per-file allowlist of the exact named symbols a file may value-import from
 *  `#src/assistant/index` — every other symbol (`registerToolContributor` above all) still fails
 *  the test for these files, same as for any non-exempt file. Each set is exactly what that file
 *  imports today; growing it back out to a real production need is a deliberate, reviewable edit
 *  here, not something a future rename or a copy-pasted import can slip past silently. */
const EXEMPT_FILE_SYMBOLS = new Map<string, Set<string>>([
  [path.join(SRC_ROOT, "features", "external-mcp", "tool-registrations.ts"),
    new Set(["notifyExternalMcpRosterChanged"])],
]);

const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "build", "coverage", "__tests__"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

interface ModuleEdge { specifier: string; names: string[] | null; typeOnly: boolean }

/** Split mixed clauses so a type specifier cannot hide a neighbouring value import. */
function namedEdges(elements: ts.NodeArray<ts.ImportSpecifier | ts.ExportSpecifier>, typeOnly: boolean): Pick<ModuleEdge, "names" | "typeOnly">[] {
  return [true, false].flatMap(kind => {
    const names = elements.filter(item => (typeOnly || item.isTypeOnly) === kind).map(item => (item.propertyName ?? item.name).text);
    return names.length ? [{ names, typeOnly: kind }] : [];
  });
}

function importEdges(node: ts.ImportDeclaration): Pick<ModuleEdge, "names" | "typeOnly">[] {
  const clause = node.importClause;
  if (!clause?.namedBindings) return [{ names: null, typeOnly: clause?.isTypeOnly ?? false }];
  const bindings = clause.namedBindings;
  if (ts.isNamespaceImport(bindings)) return [{ names: null, typeOnly: clause.isTypeOnly }];
  const edges = namedEdges(bindings.elements, clause.isTypeOnly);
  // Empty named imports still evaluate the module unless the whole clause is type-only.
  if (clause.name || bindings.elements.length === 0) edges.push({ names: null, typeOnly: clause.isTypeOnly });
  return edges;
}

function exportEdges(node: ts.ExportDeclaration): Pick<ModuleEdge, "names" | "typeOnly">[] {
  const clause = node.exportClause;
  return clause && ts.isNamedExports(clause) && clause.elements.length > 0 ? namedEdges(clause.elements, node.isTypeOnly) : [{ names: null, typeOnly: node.isTypeOnly }];
}

/** Literal module edges in declarations, re-exports, import types and lazy loading. O(AST nodes). */
function moduleEdges(source: string): ModuleEdge[] {
  const ast = ts.createSourceFile("fixture.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edges: ModuleEdge[] = [];
  const add = (specifier: ts.Node | undefined, clauses: Pick<ModuleEdge, "names" | "typeOnly">[]) => {
    if (specifier && ts.isStringLiteralLike(specifier)) edges.push(...clauses.map(clause => ({ specifier: specifier.text, ...clause })));
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) add(node.moduleSpecifier, importEdges(node));
    else if (ts.isExportDeclaration(node)) add(node.moduleSpecifier, exportEdges(node));
    else visitLazyEdge(node, add);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return edges;
}

function visitLazyEdge(node: ts.Node, add: (specifier: ts.Node | undefined, clauses: Pick<ModuleEdge, "names" | "typeOnly">[]) => void): void {
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    add(node.moduleReference.expression, [{ names: null, typeOnly: node.isTypeOnly }]);
  } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    add(node.argument.literal, [{ names: null, typeOnly: true }]);
  } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
    ts.isIdentifier(node.expression) && node.expression.text === "require")) {
    add(node.arguments[0], [{ names: null, typeOnly: false }]);
  }
}

function runtimeEdges(source: string): Array<{ specifier: string; names: string[] | null }> {
  return moduleEdges(source).filter(edge => !edge.typeOnly).map(({ specifier, names }) => ({ specifier, names }));
}

function collectProductionFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectProductionFiles(full, out);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
}

/** True when `child` is `parent` itself or lives beneath it. */
function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function resolvesToAssistant(fromFile: string, specifier: string): boolean {
  if (specifier === "#src/assistant" || specifier.startsWith("#src/assistant/")) return true;
  if (!specifier.startsWith(".")) return false;
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  return isInside(ASSISTANT_ROOT, resolved);
}

test("no production file under src/{analytics,features,identity,media,navigation,origin,seo,widgets}/ value-imports from src/assistant/ (type-only ToolContributor imports are fine)", () => {
  const files: string[] = [];
  for (const dirName of GUARDED_TOP_LEVEL_DIRS) {
    const dir = path.join(SRC_ROOT, dirName);
    if (fs.existsSync(dir)) collectProductionFiles(dir, files);
  }
  assert.ok(
    files.length > 200,
    `sanity check: expected hundreds of production files across ${GUARDED_TOP_LEVEL_DIRS.join(", ")}, found ${files.length} — a collector that silently walked nothing would make this test pass by scanning zero files`,
  );

  const offenders: string[] = [];
  for (const file of files) {
    const allowedSymbols = EXEMPT_FILE_SYMBOLS.get(file);
    const source = fs.readFileSync(file, "utf8");
    for (const { specifier, names: valueNames } of runtimeEdges(source)) {
      if (!resolvesToAssistant(file, specifier)) continue;

      if (allowedSymbols) {
        // A named `{...}` clause whose every imported symbol is on THIS file's own allowlist is
        // fine; anything else (an unlisted symbol, or a clause shape the allowlist cannot verify
        // per-symbol, e.g. a default/namespace import) still counts as an offense below.
        if (valueNames !== null && valueNames.every((name) => allowedSymbols.has(name))) continue;
        const disallowed = valueNames?.filter((name) => !allowedSymbols.has(name)) ?? null;
        offenders.push(
          `${path.relative(REPO_ROOT, file)} value-imports "${specifier}"` +
            (disallowed && disallowed.length > 0
              ? ` — symbol(s) not in this file's allowlist: ${disallowed.join(", ")}`
              : " — clause shape not verifiable per-symbol"),
        );
        continue;
      }

      offenders.push(`${path.relative(REPO_ROOT, file)} value-imports "${specifier}"`);
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `Domain/feature modules must not call assistant's tool-contribution registry directly — only server/tool-catalog-manifest.ts may. Offending edges:\n  ${offenders.join("\n  ")}`,
  );
});


test("plugin sign-in defaults and token persistence receive assistant effects from the host", () => {
  for (const name of ["apply-connect-defaults.ts", "access-token-tool.ts"]) {
    const file = path.join(SRC_ROOT, "features", "agent-plugins", name);
    assert.deepEqual(runtimeEdges(fs.readFileSync(file, "utf8")).filter(edge => resolvesToAssistant(file, edge.specifier)), [], name);
  }
});

test("the boundary sees each runtime syntax and exempts only type-only edges", () => {
  for (const source of [
    'import { registerToolContributor } from "#src/assistant/index";',
    'export { registerToolContributor as register } from "#src/assistant/index";',
    'export * from "#src/assistant";',
    'await import("#src/assistant/index");',
    'require("#src/assistant");',
    'import registry = require("#src/assistant/index");',
    'import "#src/assistant";',
    'import * as registry from "../assistant/index";',
  ]) {
    const edges = runtimeEdges(source);
    assert.equal(edges.length, 1, source);
    assert.equal(resolvesToAssistant(path.join(SRC_ROOT, "features", "fixture.ts"), edges[0].specifier), true, source);
  }
  assert.deepEqual(runtimeEdges(`
    // await import("#src/assistant/index")
    const text = 'require("#src/assistant")';
    import type { ToolContributor } from "#src/assistant/index";
    export type { ToolContributor } from "#src/assistant/index";
    import { type ToolContributor } from "#src/assistant/index";
  `), []);
  assert.deepEqual(runtimeEdges('import { type ToolContributor, registerToolContributor as register } from "#src/assistant/index";'),
    [{ specifier: "#src/assistant/index", names: ["registerToolContributor"] }]);
});

/** Normalize both supported local spellings before comparing ownership, including `..` segments. */
function localModule(fromFile: string, specifier: string): string | undefined {
  if (specifier.startsWith("#src/")) return path.resolve(SRC_ROOT, specifier.slice(5));
  return specifier.startsWith(".") ? path.resolve(path.dirname(fromFile), specifier) : undefined;
}

function pluginDependencyOffenders(file: string, source: string): ModuleEdge[] {
  const ownRoot = path.join(SRC_ROOT, "features", "agent-plugins");
  const isAgentPlugin = isInside(ownRoot, file);
  const featureRoot = isAgentPlugin ? ownRoot : path.join(SRC_ROOT, "features", "plugin-runtime");
  return moduleEdges(source).filter(edge => {
    const target = localModule(file, edge.specifier);
    if (!target) return false;
    if (isInside(ASSISTANT_ROOT, target)) return isAgentPlugin || !edge.typeOnly;
    return !edge.typeOnly && isInside(path.join(SRC_ROOT, "features"), target) && !isInside(featureRoot, target);
  });
}

test("plugin production services cross feature boundaries only through injected ports", () => {
  const files: string[] = [];
  for (const name of ["agent-plugins", "plugin-runtime"]) collectProductionFiles(path.join(SRC_ROOT, "features", name), files);
  assert.ok(files.length > 75, `expected both production subtrees, found ${files.length}`);
  const offenders = files.flatMap(file => pluginDependencyOffenders(file, fs.readFileSync(file, "utf8"))
    .map(edge => `${path.relative(SRC_ROOT, file)} -> ${edge.specifier}${edge.typeOnly ? " (type)" : " (value)"}`));
  assert.deepEqual(offenders.sort(), [], `Plugin services must be injected by composition:\n${offenders.join("\n")}`);
});

test("plugin boundary rejects every runtime spelling, including mixed types and re-exports", () => {
  const file = path.join(SRC_ROOT, "features", "agent-plugins", "nested", "fixture.ts");
  for (const source of [
    'import { service } from "#src/features/settings/index";',
    'import { type Dto, service } from "../../settings/index.js";',
    'import * as service from "#src/features/plugin-runtime/install";',
    'import "#src/features/external-mcp/contracts";',
    'import {} from "#src/features/settings/index";',
    'export { type Dto, service } from "#src/features/settings/index";',
    'export * from "../../settings/index.js";',
    'export * as service from "#src/features/settings/index";',
    'export {} from "#src/features/settings/index";',
    'await import("#src/features/settings/index");',
    'await import(`#src/features/settings/index`);',
    'require("../../settings/index.js");',
    'import service = require("#src/features/settings/index");',
    'import { service } from "#src/assistant/index";',
    'export { service } from "../../../assistant/index.js";',
  ]) assert.equal(pluginDependencyOffenders(file, source).length, 1, source);
});

test("Agent Plugins reject assistant types while plugin-runtime permits type-only contracts", () => {
  for (const source of [
    'import type { Dto } from "#src/assistant/index";',
    'import { type Dto } from "../../assistant/index.js";',
    'export type { Dto } from "#src/assistant/index";',
    'export { type Dto } from "#src/assistant/index";',
    'export type * from "#src/assistant/index";',
    'import type service = require("#src/assistant/index");',
    'type Dto = import("#src/assistant/index").Dto;',
  ]) {
    assert.equal(pluginDependencyOffenders(path.join(SRC_ROOT, "features", "agent-plugins", "fixture.ts"), source).length, 1, source);
    assert.deepEqual(pluginDependencyOffenders(path.join(SRC_ROOT, "features", "plugin-runtime", "fixture.ts"), source), [], source);
  }
});

test("plugin boundary preserves owned modules, shared contracts, pure platform helpers and dependencies", () => {
  for (const name of ["agent-plugins", "plugin-runtime"]) {
    const file = path.join(SRC_ROOT, "features", name, "service-ports.ts");
    const source = `
      import { owned } from "./owned.js";
      export * from "#src/features/${name}/owned";
      import { contract } from "#src/contracts/core/contract";
      import { port } from "../../contracts/headless/index.js";
      import { markdown } from "#src/platform/markdown/frontmatter";
      import { html } from "#src/platform/html/slug";
      import { OAuthError } from "../../platform/oauth/errors.js";
      import { owner } from "@jini-ai/core";
      import fs from "node:fs";
      import type { Dto } from "../external-mcp/contracts.js";
      import { type PostRecord } from "../post/post.js";
      // require("#src/features/settings/index")
      const text = 'import("#src/assistant/index")';
    `;
    assert.deepEqual(pluginDependencyOffenders(file, source), [], name);
  }
});
