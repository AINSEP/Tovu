import { assertIsolatedCatalogPath, isolatedCatalogHome } from "../../../apps/website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

import { resolveAgentPluginLayout } from "../../../apps/website/src/features/agent-plugins/layout.js";
import { resolveSkillLayout } from "../../../apps/website/src/features/skills/layout.js";

/**
 * @file Test-site isolation guard. Since the shared sites home (1cffdf3cf), `resolveSiteRoot`
 * consults the user's home catalog (`~/Documents/Tovu`) before the `<cwd>/sites/` fallback, so a
 * test that passes only a temp `cwd` resolves to the owner's REAL site and writes into it
 * (2026-10-12: retire-bundled leaked `ws/11111111-…` into tovu-dev). A test that resolves a layout
 * without an explicit root must import `isolated-catalog-home`, which points HOME at a temp dir.
 */

const sourceRoot = path.resolve(import.meta.dirname, "../../../apps/website/src");
const resolvers = new Set(["resolveAgentPluginLayout", "resolveSkillLayout", "resolveSiteRoot"]);
const rootKeys = /\b(siteDir|homeDir|TOVU_SITE_DIR|TOVU_AGENT_PLUGINS_DIR|TOVU_SKILLS_DIR)\b/;
/** Read-only, opt-in acceptance checks that deliberately read this machine's real install. */
const realSiteReaders = new Set(["features/agent-plugins/__tests__/unit/resolve-agent-plugin-refs.real-install.unit.test.ts"]);

/**
 * Resolver calls that can reach the ambient home catalog. An explicit `env` object literal discards
 * `process.env`, so it is unbound unless it names a root; any other call reads `process.env` and is
 * bound only when the file sets a root variable there. Spread options come from catalog fixtures.
 */
function unboundResolverCalls(input: { source: string }, _options = {}): string[] {
  const tree = ts.createSourceFile("guarded.ts", input.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const fileSetsRoot = rootKeys.test(input.source);
  // A local wrapper of the same name (site-root.unit.test.ts) injects its own catalog home.
  const wrapped = new Set<string>();
  const declarations = (node: ts.Node): void => {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name && ts.isIdentifier(node.name)) wrapped.add(node.name.text);
    ts.forEachChild(node, declarations);
  };
  declarations(tree);
  const calls: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && resolvers.has(node.expression.text) && !wrapped.has(node.expression.text)) {
      const [first] = node.arguments;
      const literal = first && ts.isObjectLiteralExpression(first) ? first : undefined;
      const spread = literal?.properties.some(ts.isSpreadAssignment) ?? false;
      const envLiteral = literal?.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === "env" && ts.isObjectLiteralExpression(p.initializer));
      const bound = (first !== undefined && rootKeys.test(first.getText())) || spread || (envLiteral ? false : fileSetsRoot);
      if (!bound) calls.push(`${node.expression.text}:${tree.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return calls;
}

function testFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? (entry.name === "node_modules" ? [] : testFiles(file)) : /\.test\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

test("guard flags temp-cwd-only and env-less resolver calls, and accepts explicit roots", () => {
  assert.deepEqual(unboundResolverCalls({ source: "resolveAgentPluginLayout({ cwd, env: {} });\nresolveSkillLayout();" }), ["resolveAgentPluginLayout:1", "resolveSkillLayout:2"]);
  assert.deepEqual(unboundResolverCalls({ source: 'resolveAgentPluginLayout({ cwd, env: { TOVU_SITE: "x" } }); process.env.TOVU_AGENT_PLUGINS_DIR = dir;' }), ["resolveAgentPluginLayout:1"]);
  assert.deepEqual(unboundResolverCalls({ source: "resolveAgentPluginLayout({ siteDir }); resolveSiteRoot({ ...fixture.options }); resolveSiteRoot({ env: { TOVU_SITE_DIR: d } });" }), []);
  assert.deepEqual(unboundResolverCalls({ source: 'process.env.TOVU_AGENT_PLUGINS_DIR = dir; resolveAgentPluginLayout(); // resolveSkillLayout()\nconst s = "resolveSiteRoot()";' }), []);
  assert.deepEqual(unboundResolverCalls({ source: "const resolveSiteRoot = (o) => real({ ...o, homeDir }); resolveSiteRoot({ env: {} });" }), []);
});

test("every test that resolves a site layout without an explicit root isolates the home catalog", () => {
  const violations = testFiles(sourceRoot).flatMap((file) => {
    const relative = path.relative(sourceRoot, file);
    const source = readFileSync(file, "utf8");
    if (realSiteReaders.has(relative) || source.includes("isolated-catalog-home")) return [];
    return unboundResolverCalls({ source }).map((call) => `${relative}: ${call}`);
  });
  assert.deepEqual(violations, [], 'Import "platform/site-dir/__tests__/helpers/isolated-catalog-home.js" or pass an explicit siteDir/TOVU_*_DIR');
});

test("with the home catalog isolated, a temp-cwd layout stays inside its temp dir", (t) => {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "tovu-catalog-guard-")));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const root of [resolveAgentPluginLayout({ cwd, env: {} }).root, resolveSkillLayout({ cwd, env: {} }).root]) {
    assert.ok(root.startsWith(cwd + path.sep), `${root} escaped ${cwd}`);
  }
});

test("runtime guard rejects owner-home layouts and sibling-prefix escapes before disk reads", () => {
  const fixtureRoot = path.join(tmpdir(), "tovu-layout-fixture");
  assertIsolatedCatalogPath({ root: path.join(isolatedCatalogHome, "Documents", "Tovu", "test", "agent-plugins") });
  assertIsolatedCatalogPath({ root: fixtureRoot }, { fixtureRoot });
  assertIsolatedCatalogPath({ root: path.join(fixtureRoot, "skills") }, { fixtureRoot });
  for (const root of [path.resolve("/Users/fixture-owner/Documents/Tovu/tovu-dev/agent-plugins"), `${fixtureRoot}-other/agent-plugins`, path.join(fixtureRoot, "..", "agent-plugins")]) {
    assert.throws(() => assertIsolatedCatalogPath({ root }, { fixtureRoot }), {
      message: "Test site layout escaped its isolated fixture root.",
    });
  }
});
