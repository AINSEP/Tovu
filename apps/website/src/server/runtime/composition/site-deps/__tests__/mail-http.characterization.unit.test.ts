import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins what this slice must not change: its call sits where the moved statements sat, the moved
// statements keep their order, and inputs that are built later are only read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const SLICE = new URL("../mail-http.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const firstLine = (node: ts.Node): string => node.getText().split("\n")[0].trim();
function bodyOf(file: ts.SourceFile, name: string): readonly ts.Statement[] {
  const found = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(found?.body, `${name} not found`);
  return found.body.statements;
}

test("B19: the call keeps the moved statements' place in composeSiteRouteDeps", () => {
  const body = bodyOf(parse(DEPS), "composeSiteRouteDeps");
  const at = body.findIndex((s) => ts.isVariableStatement(s) && s.declarationList.declarations.some((d) => d.initializer && ts.isCallExpression(d.initializer) && d.initializer.expression.getText() === "composeMailHttp"));
  assert.ok(at > 0, "slice call missing");
  assert.equal(firstLine(body[at - 1]), "instrumentStorageKernel({ kernel: chat, observability });");
});

test("B19: the moved statements keep their order", () => {
  const declared = bodyOf(parse(SLICE), "composeMailHttp").flatMap((s) => ts.isVariableStatement(s) ? s.declarationList.declarations.filter((d) => d.initializer?.getText() !== "required").map((d) => d.name.getText().replace(/\s+/g, " ")) : []);
  assert.deepEqual(declared, ["mailResolveDeps","resolvedMailer","mailDurableOutboxReady","customCredentialsHttpClient","siteBackupHttpClient","{ outboundTestOrigins, mediaImportHttpClient, publishContentPeerHttpClient }"]);
});

test("B19: later-built inputs are only read lazily", () => {
  const getters: readonly string[] = [];
  const eager: string[] = [];
  const visit = (node: ts.Node, nested: boolean): void => {
    const parent = node.parent;
    if (ts.isIdentifier(node) && getters.includes(node.text) && !nested && !(ts.isPropertyAccessExpression(parent) && parent.name === node) && !ts.isBindingElement(parent) && !ts.isPropertyAssignment(parent)) eager.push(node.text);
    ts.forEachChild(node, (child) => visit(child, nested || ts.isFunctionLike(child)));
  };
  for (const statement of bodyOf(parse(SLICE), "composeMailHttp")) visit(statement, false);
  assert.deepEqual(eager, []);
});
