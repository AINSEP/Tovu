import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

import { adminPanelsLiteral } from "../support/admin-panels-literal.js";
import { topLevelConstString } from "../support/top-level-const-string.js";

/**
 * @file The TS-parser readers that generate admin journeys from source (admin-visual.pins and
 * smoke). They must follow the real shapes and throw on any shape that could make a journey test a
 * stale or wrong manifest, instead of silently generating it.
 */
function parse(text: string): ts.SourceFile {
  return ts.createSourceFile("fixture.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

const PANELS = `const PANELS = [{ id: "posts", nav: { label: "Posts" } }, { id: "media" }];`;
const panelIds = (source: ts.SourceFile) => adminPanelsLiteral(source).elements.map((element) => element.getText(source));

test("adminPanelsLiteral follows the shipped render-only .map to the literal", () => {
  const source = parse(`${PANELS}\nexport const ADMIN_PANELS = PANELS.map(panel => ({ ...panel, render: (ctx) => panel.render(ctx) }));`);
  assert.deepEqual(panelIds(source), ['{ id: "posts", nav: { label: "Posts" } }', '{ id: "media" }']);
});

for (const [label, override] of [
  ["bare id", "id: panel.id + \"-v2\""],
  ["double-quoted id", "\"id\": panel.id + \"-v2\""],
  ["single-quoted nav", "'nav': { label: \"Other\" }"],
  ["computed string id", "[\"id\"]: panel.id + \"-v2\""],
  ["computed identifier key", "[key]: panel.id + \"-v2\""],
] as const) {
  test(`adminPanelsLiteral rejects a .map that overrides metadata (${label})`, () => {
    const source = parse(`${PANELS}\nconst key = "id";\nexport const ADMIN_PANELS = PANELS.map(panel => ({ ...panel, ${override} }));`);
    assert.throws(() => adminPanelsLiteral(source), /id\/nav-preserving \.map/);
  });
}

/** The identifier written in `const TABS = [<ref>, "site-key"]`, as the tab reader sees it. */
function tabReference(text: string): ts.Identifier {
  const source = parse(text);
  let reference: ts.Identifier | undefined;
  function visit(node: ts.Node): void {
    let initializer = ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "TABS" ? node.initializer : undefined;
    while (initializer && ts.isAsExpression(initializer)) initializer = initializer.expression;
    if (initializer && ts.isArrayLiteralExpression(initializer)) {
      const [first] = initializer.elements;
      if (first && ts.isIdentifier(first)) reference = first;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(reference, "fixture must write an identifier first in TABS");
  return reference;
}

test("topLevelConstString resolves the single top-level const string", () => {
  assert.equal(topLevelConstString(tabReference(`const ACCESS_TOKENS_TAB = "access-tokens";\nconst TABS = [ACCESS_TOKENS_TAB, "site-key"] as const;`)), "access-tokens");
});

test("topLevelConstString rejects a same-named const in an unrelated nested function", () => {
  const reference = tabReference(`const ACCESS_TOKENS_TAB = "access-tokens";\nconst TABS = [ACCESS_TOKENS_TAB, "site-key"] as const;\nfunction unrelated() { const ACCESS_TOKENS_TAB = "other"; return ACCESS_TOKENS_TAB; }`);
  assert.throws(() => topLevelConstString(reference), /bound 2 times/);
});

test("topLevelConstString rejects a nested const shadowing the reference's scope", () => {
  const reference = tabReference(`function tabs() { const ACCESS_TOKENS_TAB = "other"; const TABS = [ACCESS_TOKENS_TAB, "site-key"]; return TABS; }\nconst ACCESS_TOKENS_TAB = "access-tokens";`);
  assert.throws(() => topLevelConstString(reference), /bound 2 times/);
});

test("topLevelConstString rejects a parameter or import with the same name", () => {
  assert.throws(() => topLevelConstString(tabReference(`const ACCESS_TOKENS_TAB = "access-tokens";\nconst TABS = [ACCESS_TOKENS_TAB];\nfunction f(ACCESS_TOKENS_TAB: string) { return ACCESS_TOKENS_TAB; }`)), /bound 2 times/);
  assert.throws(() => topLevelConstString(tabReference(`import { ACCESS_TOKENS_TAB } from "./ids";\nconst TABS = [ACCESS_TOKENS_TAB];`)), /not a top-level const/);
});

test("topLevelConstString rejects a non-const, a nested-only const, a missing binding and a non-string value", () => {
  assert.throws(() => topLevelConstString(tabReference(`let ACCESS_TOKENS_TAB = "access-tokens";\nconst TABS = [ACCESS_TOKENS_TAB];`)), /not a top-level const/);
  assert.throws(() => topLevelConstString(tabReference(`function f() { const ACCESS_TOKENS_TAB = "x"; const TABS = [ACCESS_TOKENS_TAB]; return TABS; }`)), /not a top-level const/);
  assert.throws(() => topLevelConstString(tabReference(`const TABS = [ACCESS_TOKENS_TAB];`)), /bound 0 times/);
  assert.throws(() => topLevelConstString(tabReference(`const ACCESS_TOKENS_TAB = 1;\nconst TABS = [ACCESS_TOKENS_TAB];`)), /not initialized with a string literal/);
});
