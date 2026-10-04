import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

/**
 * @file Pins that every test file known to spawn a real Node child process actually calls
 * `childProcessCoverageEnv` (`core/child-process-coverage-env.ts`), not merely that the helper
 * itself works in isolation (that is `child-process-coverage-env.unit.test.ts`'s job).
 *
 * The gap this closes: a helper that exists but isn't wired into its call sites leaves every one
 * of those sites still leaking its child's V8 coverage profile into the runner's aggregation
 * directory — exactly the corruption the helper was written to stop — while the unit test for the
 * helper itself stays green throughout, because it never looks at the call sites at all. Each
 * entry below is parsed and every spawn environment is traced to a helper call, so swapping
 * the call back out for a bare `{ ...process.env }` (or a helper that's imported but never
 * invoked) fails this test even though every other suite in the file would stay green.
 *
 * Static text inspection, not a behavioral spawn-and-inspect probe: the property under test here
 * is "does this file's source route its spawn(s) through the shared redirect", which is a
 * property of the source text itself. A behavioral probe would mean re-running each of these
 * (already expensive, some minutes-long) integration files just to observe an env var, once per
 * file, on every test run -- the source-level check gives the same guarantee for a fraction of
 * the cost.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../../..");

/** Non-CLI integration spawners and the original CLI list; CLI discovery below also covers future files. */
const NODE_CHILD_SPAWNING_FILES = [
  "apps/website/src/cli/__tests__/integration/export-command.integration.test.ts",
  "apps/website/src/cli/__tests__/integration/theme-validate-command.integration.test.ts",
  "apps/website/src/cli/__tests__/integration/theme-normalize-build-command.integration.test.ts",
  "apps/website/src/cli/__tests__/integration/theme-migrate-command.integration.test.ts",
  "apps/website/src/cli/__tests__/integration/introspect-command.integration.test.ts",
  "apps/website/src/cli/__tests__/integration/init-command.integration.test.ts",
  "apps/website/src/cli/__tests__/integration/help-and-unknown-command.integration.test.ts",
  "apps/website/src/features/theme/__tests__/astro-real-bundler-conformance.test.ts",
  "apps/website/src/platform/db/__tests__/schema-postgres-drift.test.ts",
  "apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts",
  "apps/website/src/server/inbound/assistant/__tests__/integration/daemon-boots.integration.test.ts",
  "apps/website/src/platform/site-dir/__tests__/integration/init-site-fault-injection.integration.test.ts",
  "apps/website/src/__tests__/integration/port-in-use.integration.test.ts",
];

const IMPORTS_HELPER = /from\s+["']#src\/contracts\/core\/child-process-coverage-env["']/;
function uncoveredSpawns(source: string): string[] {
  const parsed = ts.createSourceFile("test.ts", source, ts.ScriptTarget.Latest, true);
  const bindings = new Map<string, ts.Expression>();
  const functions = new Map<string, ts.FunctionDeclaration>();
  const spawns: ts.CallExpression[] = [];
  function collect(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) bindings.set(node.name.text, node.initializer);
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    if (ts.isCallExpression(node) && ["spawn", "spawnSync", "execFile", "execFileSync"].includes(ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText(parsed))) spawns.push(node);
    ts.forEachChild(node, collect);
  }
  collect(parsed);
  function protectedEnv(node: ts.Expression | undefined, seen = new Set<string>()): boolean {
    if (!node) return false;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === "childProcessCoverageEnv") return true;
      const fn = functions.get(node.expression.text);
      if (fn && !seen.has(node.expression.text)) {
        seen.add(node.expression.text);
        return fn.body?.statements.some((stmt) => ts.isReturnStatement(stmt) && protectedEnv(stmt.expression, seen)) ?? false;
      }
    }
    if (ts.isIdentifier(node) && !seen.has(node.text)) {
      seen.add(node.text);
      return protectedEnv(bindings.get(node.text), seen);
    }
    if (ts.isObjectLiteralExpression(node)) return node.properties.some((property) => ts.isSpreadAssignment(property) && protectedEnv(property.expression, new Set(seen)));
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return protectedEnv(node.expression, seen);
    return false;
  }
  assert.ok(spawns.length > 0, "the guard must find the actual child-process call");
  return spawns.filter((spawn) => {
    const options = spawn.arguments[2];
    if (!options || !ts.isObjectLiteralExpression(options)) return true;
    const env = options.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(parsed) === "env");
    return !env || !ts.isPropertyAssignment(env) || !protectedEnv(env.initializer);
  }).map((spawn) => spawn.getText(parsed));
}

test("the wiring guard rejects commented or unused helper calls and checks every spawn", () => {
  assert.equal(uncoveredSpawns(`// childProcessCoverageEnv(dir)
    spawn(process.execPath, [], { env: process.env });`).length, 1);
  assert.equal(uncoveredSpawns(`const unused = childProcessCoverageEnv(dir);
    spawn(process.execPath, [], { env: process.env });`).length, 1);
  assert.equal(uncoveredSpawns(`spawn(process.execPath, [], { env: childProcessCoverageEnv(dir) });
    spawn(process.execPath, [], { env: process.env });`).length, 1);
  assert.deepEqual(uncoveredSpawns(`const childEnv = { ...childProcessCoverageEnv(dir), PORT: "4321" };
    spawn(process.execPath, [], { env: childEnv });`), []);
});

// Discover new CLI integration spawners automatically; retain the explicit non-CLI guards above.
const cliIntegrationDir = "apps/website/src/cli/__tests__/integration";
const discoveredCliSpawners = fs.readdirSync(path.join(REPO_ROOT, cliIntegrationDir))
  .filter((name) => name.endsWith(".test.ts"))
  .map((name) => path.join(cliIntegrationDir, name))
  .filter((relativePath) => {
    const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
    const parsed = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);
    let found = false;
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) &&
          ["spawn", "spawnSync", "execFile", "execFileSync"].includes(ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText(parsed)) &&
          node.arguments[0]?.getText(parsed) === "process.execPath") found = true;
      ts.forEachChild(node, visit);
    }
    visit(parsed);
    return found;
  });

test("CLI spawner discovery includes the previously omitted adopt and serve lifecycle entry points", () => {
  assert.ok(discoveredCliSpawners.includes(`${cliIntegrationDir}/adopt-command.integration.test.ts`));
  assert.ok(discoveredCliSpawners.includes(`${cliIntegrationDir}/serve-command-boot-lifecycle.integration.test.ts`));
});

for (const relativePath of new Set([...NODE_CHILD_SPAWNING_FILES, ...discoveredCliSpawners])) {
  test(`${relativePath}: every child spawn feeds childProcessCoverageEnv into its environment`, () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
    assert.match(source, IMPORTS_HELPER, `${relativePath} must import the real coverage helper`);
    assert.deepEqual(uncoveredSpawns(source), [], `${relativePath} has a spawn whose environment bypasses the coverage helper`);
  });
}
