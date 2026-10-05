import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

/**
 * @file LAN-bind plan (2026-09-23), Slice 2: `index.ts` — the container/server entry point
 * (`npm run dev`/`dev:server`, `npm start`, Docker/Fly/Render's own CMD) — keeps its existing
 * default (Node's own all-interfaces bind) but must now honour an operator's `TOVU_HOST`, same as
 * `tovu serve` already does (Slice 1's `serve.ts`/`bind-host.ts`).
 *
 * `index.ts` is the one real top-level boot path — it is never imported by a test (its own file
 * header says so), and it runs a real `app.listen()` the moment it is imported, so there is no
 * lighter seam than reading its own source for this. Same shape and same reasoning as
 * `serve-command-wiring.unit.test.ts`'s coverage of `pinServedSiteDirIntoEnv`/`app.listen(port,
 * host)` in `serve.ts`.
 */

const INDEX_TS_PATH = path.resolve(import.meta.dirname, "../../../../index.ts");

function readSource(): string {
  return fs.readFileSync(INDEX_TS_PATH, "utf8");
}

test("index.ts resolves TOVU_HOST via resolveBindHost(process.env.TOVU_HOST, undefined) -- undefined is its OWN existing all-interfaces default, unchanged", () => {
  const source = readSource();
  assert.ok(
    source.includes("resolveBindHost(process.env.TOVU_HOST, undefined)"),
    "index.ts no longer resolves TOVU_HOST with resolveBindHost(process.env.TOVU_HOST, undefined) -- deleting or " +
      "rewording that call silently reverts every container/server boot to ignoring TOVU_HOST entirely " +
      "(see ADS-memory/.local-artifacts/lan-bind-plan-2026-09-23.md). index.ts has no --host flag, so it passes " +
      "the env value directly, unlike serve.ts's input.host ?? process.env.TOVU_HOST."
  );
  // Parse the declaration itself: comments and an unused resolver call cannot satisfy it.
  const ast = ts.createSourceFile(INDEX_TS_PATH, source, ts.ScriptTarget.Latest, true);
  const bindings: ts.VariableDeclaration[] = [];
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "bindHost") bindings.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(bindings.length, 1);
  const initializer = bindings[0].initializer;
  assert.ok(initializer && ts.isCallExpression(initializer));
  assert.equal(initializer.expression.getText(ast), "resolveBindHost");
  assert.deepEqual(initializer.arguments.map((argument) => argument.getText(ast)), ["process.env.TOVU_HOST", "undefined"]);
});

function parseIndex(): ts.SourceFile {
  return ts.createSourceFile(INDEX_TS_PATH, readSource(), ts.ScriptTarget.Latest, true);
}

function callsMatching(ast: ts.SourceFile, matches: (call: ts.CallExpression) => boolean): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && matches(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return found;
}

// bebc5736f replaced the two `.listen(port, bindHost, onListening)` calls (one per TLS branch) with
// ONE `server` (HTTPS or HTTP) bound once; the bind itself is `reserveBootListener`, tested against a
// real socket in `boot-listener.unit.test.ts`. What only index.ts's source can show is that it hands
// that ONE server the resolved `bindHost`, and that no other `.listen()` bypasses it.
test("index.ts binds its one boot server through reserveBootListener with the resolved bindHost", () => {
  const ast = parseIndex();
  const reserves = callsMatching(ast, (call) => call.expression.getText(ast) === "reserveBootListener");
  assert.equal(reserves.length, 1);
  const [required] = reserves[0].arguments;
  assert.ok(required && ts.isObjectLiteralExpression(required));
  const properties = Object.fromEntries(
    required.properties.map((property) => {
      assert.ok(ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property));
      const value = ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer;
      return [property.name.getText(ast), value.getText(ast)];
    }),
  );
  assert.deepEqual(properties, { server: "server", port: "port", bindHost: "bindHost" });
});

test("index.ts calls no .listen() of its own -- neither TLS branch can bind around reserveBootListener", () => {
  const ast = parseIndex();
  const listens = callsMatching(
    ast,
    (call) => ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "listen",
  );
  assert.deepEqual(listens.map((call) => call.getText(ast)), []);
});
