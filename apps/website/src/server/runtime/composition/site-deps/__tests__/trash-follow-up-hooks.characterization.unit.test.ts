import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins what this slice must not change: its call sits where the moved statements sat, the moved
// statements keep their order, and inputs that are built later are only read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const SLICE = new URL("../trash-follow-up-hooks.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const firstLine = (node: ts.Node): string => node.getText().split("\n")[0].trim();
function bodyOf(file: ts.SourceFile, name: string): readonly ts.Statement[] {
  const found = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(found?.body, `${name} not found`);
  return found.body.statements;
}

test("B09: the call keeps the moved statements' place in composeSiteRouteDeps", () => {
  const body = bodyOf(parse(DEPS), "composeSiteRouteDeps");
  const at = body.findIndex((s) => ts.isVariableStatement(s) && s.declarationList.declarations.some((d) => d.initializer && ts.isCallExpression(d.initializer) && d.initializer.expression.getText() === "composeTrashFollowUpHooks"));
  assert.ok(at > 0, "slice call missing");
  assert.ok(firstLine(body[at - 1]).startsWith("const { trashRegistry, sqliteTrashDb, trashRepo, taxonomyFollowUpTermRepo, taxonomyFollowUpRevisions, taxonomyFollowUpOutbox, formDeliveryRepo } = composeTrashStores("));
});

test("B09: the moved statements keep their order", () => {
  const entriesA = bodyOf(parse(SLICE), "trashFollowUpHookEntriesA").find(ts.isReturnStatement)?.expression;
  const entriesB = bodyOf(parse(SLICE), "trashFollowUpHookEntriesB").find(ts.isReturnStatement)?.expression;
  assert.ok(entriesA && ts.isArrayLiteralExpression(entriesA));
  assert.ok(entriesB && ts.isArrayLiteralExpression(entriesB));
  assert.equal(entriesA.elements.length, 1);
  assert.ok(entriesA.elements[0].getText().startsWith('...(["form_submission", "form"] as const).map('));
  assert.deepEqual(entriesB.elements.map((entry) => {
    assert.ok(ts.isArrayLiteralExpression(entry));
    return entry.elements[0].getText();
  }), ['"widget"', '"menu"', '"term"', '"taxonomy"']);
  const assembled = bodyOf(parse(SLICE), "composeTrashFollowUpHooks").find(ts.isReturnStatement)?.getText();
  assert.equal(assembled, "return { trashFollowUpHooks: new Map<string, TrashFollowUpHooks>([...trashFollowUpHookEntriesA(required), ...trashFollowUpHookEntriesB(required)]) };");
});

test("B09: later-built inputs are only read lazily", () => {
  const getters: readonly string[] = ["mediaRepo","postRepo","assetBlobRepo","entryRefsRepo","routeDeps"];
  const eager: string[] = [];
  const visit = (node: ts.Node, nested: boolean): void => {
    const parent = node.parent;
    if (ts.isIdentifier(node) && getters.includes(node.text) && !nested && !(ts.isPropertyAccessExpression(parent) && parent.name === node) && !ts.isBindingElement(parent) && !ts.isPropertyAssignment(parent)) eager.push(node.text);
    ts.forEachChild(node, (child) => visit(child, nested || ts.isFunctionLike(child)));
  };
  for (const name of ["composeTrashFollowUpHooks", "trashFollowUpHookEntriesA", "trashFollowUpHookEntriesB"]) {
    for (const statement of bodyOf(parse(SLICE), name)) visit(statement, false);
  }
  assert.deepEqual(eager, []);
});
