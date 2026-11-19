import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins: the calls keep their place in composeSiteRouteDeps, no root-level declaration of the moved
// functions remains, each is a module function with real inputs, and getter inputs are read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const firstLine = (node: ts.Node): string => node.getText().split("\n")[0].trim();
function bodyOf(file: ts.SourceFile, name: string): readonly ts.Statement[] {
  const found = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(found?.body, `${name} not found`);
  return found.body.statements;
}
function eagerReads(statements: readonly ts.Node[], getters: readonly string[]): string[] {
  const eager: string[] = [];
  const visit = (node: ts.Node, nested: boolean): void => {
    const parent = node.parent;
    if (ts.isIdentifier(node) && getters.includes(node.text) && !nested && !(ts.isPropertyAccessExpression(parent) && parent.name === node) && !ts.isBindingElement(parent) && !ts.isPropertyAssignment(parent)) eager.push(node.text);
    ts.forEachChild(node, (child) => visit(child, nested || ts.isFunctionLike(child)));
  };
  for (const statement of statements) visit(statement, false);
  return eager;
}
const FILES: Record<string, URL> = {"configureSiteImports":"../site-imports.ts"};

test("H4: the calls keep their place and the root declares none of the functions", () => {
  const body = bodyOf(parse(DEPS), "composeSiteRouteDeps");
  assert.deepEqual(body.filter((s) => ts.isFunctionDeclaration(s)).map((s) => (s as ts.FunctionDeclaration).name?.text).filter((n) => ["configureSiteImports"].includes(n ?? "")), []);
  { const at = body.findIndex((s) => firstLine(s).startsWith("configureSiteImports({")); assert.ok(at > 0, "configureSiteImports call missing"); assert.ok(firstLine(body[at - 1]).startsWith("function configureSiteSharing(_required: Record<string, never>, _options = {}): void {")); }
});

test("H4: each function is a module function whose first statement destructures its inputs", () => {
  for (const [name, url] of Object.entries(FILES)) {
    const first = bodyOf(parse(new URL(url, import.meta.url)), name)[0];
    assert.ok(first && ts.isVariableStatement(first) && first.getText().endsWith("= required;"), name);
  }
});

test("H4: getter inputs are only read lazily", () => {
  const getters: readonly string[] = [];
  for (const [name, url] of Object.entries(FILES)) assert.deepEqual(eagerReads(bodyOf(parse(new URL(url, import.meta.url)), name), getters), [], name);
});
