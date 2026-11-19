import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins what this slice must not change: its call sits where the moved statements sat, the moved
// statements keep their order, and inputs that are built later are only read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const SLICE = new URL("../content-resolvers-comments.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const firstLine = (node: ts.Node): string => node.getText().split("\n")[0].trim();
function bodyOf(file: ts.SourceFile, name: string): readonly ts.Statement[] {
  const found = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(found?.body, `${name} not found`);
  return found.body.statements;
}

test("B15: the call keeps the moved statements' place in composeSiteRouteDeps", () => {
  const body = bodyOf(parse(DEPS), "composeSiteRouteDeps");
  const at = body.findIndex((s) => ts.isVariableStatement(s) && s.declarationList.declarations.some((d) => d.initializer && ts.isCallExpression(d.initializer) && d.initializer.expression.getText() === "composeContentResolversComments"));
  assert.ok(at > 0, "slice call missing");
  assert.ok(firstLine(body[at - 1]).startsWith("let formCollectionProviders = () => createFormCollectionRegistry({});"));
});

test("B15: the moved statements keep their order", () => {
  const ordered = bodyOf(parse(SLICE), "composeContentResolversComments").flatMap((statement) => {
    if (ts.isVariableStatement(statement)) return statement.declarationList.declarations
      .filter((declaration) => declaration.initializer?.getText() !== "required")
      .map((declaration) => declaration.name.getText());
    if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)) return [statement.expression.expression.getText()];
    return [];
  });
  assert.deepEqual(ordered, ["formSubmissionRepo", "contentTypeRepo", "contentTypeIndexProvisioner", "wireCoreResolvers", "commentsModule", "commentsCapability"]);
});

test("B15: later-built inputs are only read lazily", () => {
  const getters: readonly string[] = ["mediaRepo","mediaContentTypeStore","postRepo","formCollectionProviders","routeDeps"];
  const eager: string[] = [];
  const visit = (node: ts.Node, nested: boolean): void => {
    const parent = node.parent;
    if (ts.isIdentifier(node) && getters.includes(node.text) && !nested && !(ts.isPropertyAccessExpression(parent) && parent.name === node) && !ts.isBindingElement(parent) && !ts.isPropertyAssignment(parent)) eager.push(node.text);
    ts.forEachChild(node, (child) => visit(child, nested || ts.isFunctionLike(child)));
  };
  for (const statement of bodyOf(parse(SLICE), "composeContentResolversComments")) visit(statement, false);
  assert.deepEqual(eager, []);
});
