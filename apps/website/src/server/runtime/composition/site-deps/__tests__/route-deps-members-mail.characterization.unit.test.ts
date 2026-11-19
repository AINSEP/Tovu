import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins: each run's call sits in the routeDeps literal exactly where its entries sat (between the same
// neighbours, spreads included), each run returns its keys in tip order, and getters are read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const RUNS = new URL("../route-deps-members-mail.ts", import.meta.url);
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

test("L4: the run calls sit where their entries sat", () => {
  const items = literalItems();
  const at = items.findIndex((t) => t.startsWith("...routeDepsMembersMail("));
  assert.ok(at >= 0, "first run call missing");
  assert.ok(items[at - 1].startsWith("...identity"));
  const expected: readonly string[] = ["...routeDepsMembersMail(","...resolvedMailer.operations","...routeDepsMailFormsNewsletter(","siteAssistantRateLimiter: createRateLimiter({ profile: SITE_ASSISTANT_PER_IP, clock })"];
  expected.forEach((prefix, i) => assert.ok(items[at + i]?.startsWith(prefix), `item ${at + i}: ${items[at + i]}`));
});

test("L4: each run returns its keys in tip order", () => {
  const file = parse(RUNS);
  const keys: Record<string, readonly string[]> = {"routeDepsMembersMail":["principalRepo","removeUser","isInTrash","redirectRepo","redirectHitSink","originRegistry","redirectsWriteDeps","memberRepo","removeMember","memberTierRepo","memberSubscriptionRepo","memberSessionRepo","magicLinkRepo","mailer","settleMailer","mailStatus","setAgentPluginEnabled","mailProviderControl","mailDomainRequirements"],"routeDepsMailFormsNewsletter":["mailActivity","mailSuppressionAdmin","menuRepo","navLocationBindingRepo","removeMenu","webhookSubscriptionRepo","webhookDeliveryRepo","webhookSigner","mediaRepo","assetBlobRepo","assetRenditionRepo","mediaContentTypeStore","blobStore","documentTextExtractors","blobHydrationReady","adminPasswordResetReady","transformDefinitionRepo","imageTransformer","imageCodec","newsletterReady","newsletterCampaignRepo","newsletterListRepo","newsletterSubscriptionRepo","newsletterAudienceSnapshotRepo","newsletterSendRepo","newsletterConfirmationTokenRepo","membersConsentCapability","newsletterSubscriberDirectory","newsletterKeyring","newsletterHooks","formDefinitionRepo","formCollectionProviders","formSubmissionRepo","formSubmissionAttempts","removeFormSubmission","executeCommand","formsRateLimiter"]};
  for (const [name, expected] of Object.entries(keys)) {
    const ret = bodyOf(file, name).find((s): s is ts.ReturnStatement => ts.isReturnStatement(s));
    assert.ok(ret?.expression && ts.isObjectLiteralExpression(ret.expression), name);
    assert.deepEqual(ret.expression.properties.map((p) => p.name?.getText() ?? ""), expected);
  }
});

test("L4: getter inputs are only read lazily", () => {
  const file = parse(RUNS);
  for (const name of ["routeDepsMembersMail","routeDepsMailFormsNewsletter"]) assert.deepEqual(eagerReads(bodyOf(file, name), []), [], name);
});
