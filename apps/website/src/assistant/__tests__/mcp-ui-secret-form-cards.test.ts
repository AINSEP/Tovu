import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

import { SECRET_FORM_CARD_DEFINITIONS, SECRET_FORM_TOOL_IDS } from "../../contracts/headless/secret-form-cards.js";
import { isMcpUiToolCallAllowed, isMcpUiToolCallPermitted } from "../mcp-ui-tool-calls.js";

test("every secret card requires an exchange, including cards added to the field definitions", () => {
  const expected = Object.entries(SECRET_FORM_CARD_DEFINITIONS)
    .filter(([, card]) => card.secretField.secret)
    .map(([toolId]) => toolId);
  assert.deepEqual([...SECRET_FORM_TOOL_IDS].sort(), expected.sort());
  for (const toolId of expected) {
    assert.equal(isMcpUiToolCallAllowed(toolId), true, toolId);
    assert.equal(isMcpUiToolCallPermitted(toolId, false), false, toolId);
    assert.equal(isMcpUiToolCallPermitted(toolId, true), true, toolId);
  }
  assert.equal(isMcpUiToolCallPermitted("content_post_search", false), true);
  assert.equal(isMcpUiToolCallPermitted("unknown_secret_card", true), false);
});

const SRC_ROOT = path.resolve(import.meta.dirname, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === "__tests__" || entry.name === "node_modules") return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.(test|d)\.[cm]?[jt]sx?$/.test(entry.name) ? [full] : [];
  });
}

/** A local secret flag would bypass the derived gate. Comments and strings are not declarations. */
function scanFormFields(file: string, text: string) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const formBuilders = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const binding of bindings.elements) {
      if ((binding.propertyName ?? binding.name).text === "buildFormSurface") formBuilders.add(binding.name.text);
    }
  }
  const violations: string[] = [];
  const used = new Set<string>();
  let buildsForm = false;
  const lifecycles = new Map<ts.Node, { opens: boolean; secret: boolean }>();
  // Group by the containing declaration: a neighboring non-secret dialog is a separate lifecycle.
  const lifecycle = (node: ts.Node) => {
    let unit = node;
    while (unit.parent && !ts.isSourceFile(unit.parent)) unit = unit.parent;
    let state = lifecycles.get(unit);
    if (!state) { state = { opens: false, secret: false }; lifecycles.set(unit, state); }
    return state;
  };
  const walk = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && formBuilders.has(node.expression.text)) buildsForm = true;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "open"
      && node.expression.expression.getText(source).endsWith("surfaceExchanges")) lifecycle(node).opens = true;
    if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      if ((ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) && node.name.text === "secret") {
        lifecycle(node).secret = true;
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        violations.push(`${file}:${line}: secret fields must use SECRET_FORM_CARD_DEFINITIONS`);
      }
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === "secretField" && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "SECRET_FORM_CARD_DEFINITIONS") {
      used.add(node.expression.name.text);
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
  // Engine specs may describe secret fields, but only Jini may render them and own their exchange.
  const copiedLifecycle = [...lifecycles.values()].some(state => state.opens && state.secret);
  if (copiedLifecycle) violations.push(`${file}: secret-card exchange lifecycle must be owned by Jini`);
  return { violations: buildsForm || copiedLifecycle ? violations : [], used };
}

test("guard rejects a newly introduced secret form without a registered card definition", () => {
  const scan = scanFormFields("new-card.ts", `import { buildFormSurface as form } from '@jini-ai/ui/mcp-ui/surfaces';
    form({ toolName: 'new_secret_card', fields: [{ name: 'key', secret: true }] });`);
  assert.deepEqual(scan.violations, ["new-card.ts:2: secret fields must use SECRET_FORM_CARD_DEFINITIONS"]);
});

test("secret specs may share a file with a separate non-secret exchange, but cannot copy the lifecycle", () => {
  const separate = scanFormFields("separate.ts", `function confirm() { surfaces.surfaceExchanges.open({}); }
    function secretSpec() { return { secret: true }; }`);
  assert.deepEqual(separate.violations, []);
  const copied = scanFormFields("copied.ts", `function card() {
    surfaces.surfaceExchanges.open({}); return { fields: [{ secret: true }] };
  }`);
  assert.equal(copied.violations.includes("copied.ts: secret-card exchange lifecycle must be owned by Jini"), true);
});

test("all production secret forms use the card definitions that drive the exchange-only gate", () => {
  const violations: string[] = [];
  const used = new Set<string>();
  for (const file of sourceFiles(SRC_ROOT)) {
    const scan = scanFormFields(path.relative(SRC_ROOT, file), readFileSync(file, "utf8"));
    violations.push(...scan.violations);
    for (const toolId of scan.used) {
      used.add(toolId);
      assert.equal(SECRET_FORM_TOOL_IDS.has(toolId), true, `${file}: unregistered secret card ${toolId}`);
      assert.equal(isMcpUiToolCallPermitted(toolId, false), false, toolId);
    }
  }
  assert.deepEqual(violations, []);
  assert.deepEqual([...used].sort(), [...SECRET_FORM_TOOL_IDS].sort(), "every registered secret marker must belong to a rendered card");
});
