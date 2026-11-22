import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins: each run's call sits in the routeDeps literal exactly where its entries sat (between the same
// neighbours, spreads included), each run returns its keys in tip order, and getters are read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const RUNS = new URL("../route-deps-site-providers.ts", import.meta.url);
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
function literalItems(): string[] {
  const statement = bodyOf(parse(DEPS), "composeSiteRouteDeps").find((s) => ts.isVariableStatement(s) && s.declarationList.declarations[0]?.name.getText() === "routeDeps");
  assert.ok(statement && ts.isVariableStatement(statement));
  const literal = statement.declarationList.declarations[0].initializer;
  assert.ok(literal && ts.isObjectLiteralExpression(literal));
  return literal.properties.map((p) => firstLine(p));
}

test("L3: the run calls sit where their entries sat", () => {
  const items = literalItems();
  const at = items.findIndex((t) => t.startsWith("...routeDepsSiteThemesTelemetry("));
  assert.ok(at >= 0, "first run call missing");
  assert.ok(items[at - 1].startsWith("...compositionConsentOptions({ workspaceId, loadContributions: agentPluginLifecycle.loadPluginContri"));
  const expected: readonly string[] = ["...routeDepsSiteThemesTelemetry(","...routeDepsProviderAnalytics(","...identity"];
  expected.forEach((prefix, i) => assert.ok(items[at + i]?.startsWith(prefix), `item ${at + i}: ${items[at + i]}`));
});

test("L3: each run returns its keys in tip order", () => {
  const file = parse(RUNS);
  const keys: Record<string, readonly string[]> = {"routeDepsSiteThemesTelemetry":["mailFeedbackRoute","siteTitlePreservationStore","siteDisplayName","siteTimeZone","changeSets","revertRegistry","themes","themesDir","packageThemesDir","siteBinding","createSite","federatedMcpPresetRegistry","agentPluginLayout","agentPluginLifecycle","skillLayout","siteBackupSources","siteStoragePaths","outbox","bus","observability","tracker","visitorTracker","observabilityEnabled","flushTelemetry","browserAnalytics","consentAdapters","telemetryStatus","sendTelemetryTest","aiTraceSink","providerConfig","reapplyProvider"],"routeDepsProviderAnalytics":["providerAppliesAt","projectKeys","legacyProviderCredential","publishTrustRevocations","clock","idGen","analyticsSink","analyticsConfig","analyticsProviders"]};
  for (const [name, expected] of Object.entries(keys)) {
    const ret = bodyOf(file, name).find((s): s is ts.ReturnStatement => ts.isReturnStatement(s));
    assert.ok(ret?.expression && ts.isObjectLiteralExpression(ret.expression), name);
    assert.deepEqual(ret.expression.properties.map((p) => p.name?.getText() ?? ""), expected);
  }
});

test("L3: getter inputs are only read lazily", () => {
  const file = parse(RUNS);
  for (const name of ["routeDepsSiteThemesTelemetry","routeDepsProviderAnalytics"]) assert.deepEqual(eagerReads(bodyOf(file, name), []), [], name);
});
