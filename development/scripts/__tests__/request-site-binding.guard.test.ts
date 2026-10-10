import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const sourceRoot = path.resolve(import.meta.dirname, "../../../apps/website/src");
const forbidden = new Set(["resolveAgentPluginLayout", "resolveSkillLayout", "resolveSiteRoot"]);

/** Uses the installed TypeScript parser so comments and strings cannot trigger the guard. */
function resolverCalls(input: { source: string }, _options = {}): string[] {
  const tree = ts.createSourceFile("handler.tsx", input.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(forbidden);
  for (const node of tree.statements) {
    if (!ts.isImportDeclaration(node)) continue;
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const specifier of bindings.elements) {
        if (forbidden.has((specifier.propertyName ?? specifier.name).text)) names.add(specifier.name.text);
      }
    }
  }
  const calls: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
      if (name && names.has(name)) calls.push(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return calls;
}

/** Installed trust discovery must come from a boot-bound owner, never a module default. */
function unboundLifecycleImports(input: { source: string }, _options = {}): string[] {
  const tree = ts.createSourceFile("handler.tsx", input.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const banned = new Set(["loadPluginContributions", "findTrustedPluginPackages", "agentPluginLifecycle"]);
  return tree.statements.flatMap(node => {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) return [];
    const specifier = node.moduleSpecifier;
    if (!specifier || !ts.isStringLiteral(specifier) || !/(?:agent-plugins\/lifecycle|^\.\/lifecycle)(?:\.js|\.ts)?$/.test(specifier.text)) return [];
    const bindings = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause;
    if (bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) {
      return bindings.elements.flatMap(binding => {
        const name = (binding.propertyName ?? binding.name).text;
        return banned.has(name) ? [name] : [];
      });
    }
    // A namespace/default import or wildcard re-export could hide the unbound owner.
    return ["namespace/default/wildcard lifecycle import"];
  });
}

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === "__tests__") return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(file) : /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

test("guard catches direct, aliased and namespace resolver calls but ignores documentation", () => {
  assert.deepEqual(resolverCalls({ source: 'import { resolveSkillLayout as layout } from "./layout.js"; layout(); site.resolveSiteRoot(); resolveAgentPluginLayout();' }), ["layout", "resolveSiteRoot", "resolveAgentPluginLayout"]);
  assert.deepEqual(resolverCalls({ source: '// resolveSkillLayout()\nconst note = "resolveSiteRoot()";' }), []);
});

test("request surfaces and their feature helpers use the booted site binding", () => {
  const directories = ["server/inbound", "assistant", "features"];
  const definitions = new Set(["features/agent-plugins/layout.ts", "features/skills/layout.ts"]);
  const files = directories.flatMap(dir => sources(path.join(sourceRoot, dir)));
  const violations = files.flatMap(file => {
    const relative = path.relative(sourceRoot, file);
    const source = readFileSync(file, "utf8");
    const resolvers = definitions.has(relative) ? [] : resolverCalls({ source });
    return [...resolvers, ...unboundLifecycleImports({ source })].map(name => `${relative}: ${name}`);
  });
  assert.deepEqual(violations, [], "Resolve layouts at boot and inject them into request handlers");
});

test("only composition can import site-dependent lifecycle operations", () => {
  const violations = sources(sourceRoot).flatMap(file => {
    const relative = path.relative(sourceRoot, file);
    if (relative.startsWith("server/runtime/composition/")) return [];
    return unboundLifecycleImports({ source: readFileSync(file, "utf8") }).map(name => `${relative}: ${name}`);
  });
  assert.deepEqual(violations, [], "Inject the boot-bound lifecycle rather than importing site-dependent module operations");
});

test("guard catches unbound lifecycle imports and re-exports, including aliases and namespaces", () => {
  assert.deepEqual(unboundLifecycleImports({ source: 'import { loadPluginContributions as load, findTrustedPluginPackages, agentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";' }), ["loadPluginContributions", "findTrustedPluginPackages", "agentPluginLifecycle"]);
  assert.deepEqual(unboundLifecycleImports({ source: 'import * as lifecycle from "../../agent-plugins/lifecycle.js";' }), ["namespace/default/wildcard lifecycle import"]);
  assert.deepEqual(unboundLifecycleImports({ source: 'export { loadPluginContributions as load } from "./lifecycle.js";' }), ["loadPluginContributions"]);
  assert.deepEqual(unboundLifecycleImports({ source: 'import { createTovuAgentPluginLifecycle, loadPluginContributionsFromSource, type LoadPluginContributions } from "#src/features/agent-plugins/lifecycle"; // loadPluginContributions' }), []);
});
