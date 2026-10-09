import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const original = readdirSync(path.join(root, "development/e2e"))
  .filter((name) => name.endsWith(".spec.ts") && name !== "desktop-shell.spec.ts");

// Fails on the pre-migration tree. These are collection/ownership invariants, not selector mocks.
test("all web bug pins are collected once by the journeys harness", () => {
  assert.equal(original.length, 0, `Unmigrated web specs: ${original.join(", ")}`);
  const files = readdirSync(path.join(root, "development/e2e/journeys")).filter((name) => name.endsWith(".pins.journey.ts"));
  assert.ok(files.length > 0);
  const source = files.map((name) => read(`development/e2e/journeys/${name}`)).join("\n");
  assert.equal([...source.matchAll(/Migrated from .*\.spec\.ts/g)].length, 73);
  for (const name of files) {
    const code = read(`development/e2e/journeys/${name}`);
    assert.match(code, /support\/bug-pin-fixtures\.js/);
    const ast = ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true);
    assert.equal((ast as ts.SourceFile & { parseDiagnostics: unknown[] }).parseDiagnostics.length, 0, name);
  }
});

test("live services are opt-in and old web configs are retired", () => {
  const config = read("development/playwright.journeys.config.ts");
  assert.match(config, /TOVU_E2E_REAL_SERVICES/);
  assert.match(config, /@real-service/);
  const configs = new Set(readdirSync(path.join(root, "development")));
  const retired = JSON.parse(read("development/e2e/__tests__/fixtures/retired-web-configs.json")) as string[];
  for (const name of retired) assert.ok(!configs.has(name), `Retired config remains: ${name}`);
  for (const name of ["playwright.desktop-journeys.config.ts", "playwright.desktop-shell.config.ts", "playwright.journeys.config.ts"]) assert.ok(configs.has(name));
  const pkg = JSON.parse(read("package.json"));
  for (const name of ["e2e:journeys", "e2e:journeys:real", "e2e:desktop", "e2e:desktop:app"]) assert.equal(typeof pkg.scripts[name], "string");
  assert.match(pkg.scripts["e2e:journeys:real"], /TOVU_E2E_REAL_SERVICES=1/);
  assert.match(read("apps/desktop/RELEASING.md"), /TOVU_E2E_DESKTOP_APP=.*npm run e2e:desktop:app/);
});

interface OriginalPin {
  name: string; destination: string; titles: string[]; comments: string[];
  superseded?: {
    reference: string;
    originalTitles?: string[];
    whyComments?: Array<{ hash: string; comment: string }>;
  };
}
const intents = JSON.parse(read("development/e2e/__tests__/fixtures/bug-pin-intents.json")) as OriginalPin[];

function registeredTitles(node: ts.Node, ast: ts.SourceFile): string[] {
  const result: string[] = [];
  function visit(current: ts.Node) {
    if (ts.isCallExpression(current) && /^test(?:\.(?:skip|fixme|only))?$/.test(current.expression.getText(ast)) && current.arguments.length > 1) {
      const last = current.arguments.at(-1)!;
      if (ts.isArrowFunction(last) || ts.isFunctionExpression(last)) result.push(current.arguments[0].getText(ast));
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return result;
}

test("migration retains all pins, reviewed declaration revisions and why comments", () => {
  // Static review corrected intentionally superseded UI contracts after migration. Pin the
  // reviewed replacement text as strictly as the original, retaining historical why text too.
  assert.equal(intents.reduce((count, pin) => count + (pin.superseded?.originalTitles ?? pin.titles).length, 0), 282);
  assert.equal(intents.reduce((count, pin) => count + pin.titles.length, 0), 285);
  for (const pin of intents) {
    const source = read(`development/e2e/journeys/${pin.destination}`);
    const ast = ts.createSourceFile(pin.destination, source, ts.ScriptTarget.Latest, true);
    const wrappers = ast.statements.filter((statement) => ts.isExpressionStatement(statement)
      && ts.isCallExpression(statement.expression)
      && statement.expression.arguments[0]?.getText(ast) === JSON.stringify(`Bug pin: ${pin.name.replace(".spec.ts", "")}`));
    assert.equal(wrappers.length, 1, `Exactly one registration for ${pin.name}`);
    assert.deepEqual(registeredTitles(wrappers[0], ast), pin.titles, `All reviewed test declarations in ${pin.name}`);
    const hashes = new Set<string>();
    function comments(node: ts.Node) {
      const ranges = [...(ts.getLeadingCommentRanges(source, node.pos) ?? []), ...(ts.getTrailingCommentRanges(source, node.end) ?? [])];
      for (const range of ranges) hashes.add(createHash("sha256").update(source.slice(range.pos, range.end)).digest("hex"));
      ts.forEachChild(node, comments);
    }
    comments(ast);
    for (const hash of pin.comments) assert.ok(hashes.has(hash), `A reviewed comment was lost from ${pin.name} (${hash})`);
    if (pin.superseded) {
      assert.equal(pin.superseded.reference, "ADS-memory/.local-artifacts/e2e-consolidation/STATIC-REVIEW.md");
      for (const { hash, comment } of pin.superseded.whyComments ?? []) {
        assert.equal(createHash("sha256").update(comment).digest("hex"), hash, `Historical why text changed in ${pin.name}`);
      }
    }
  }
});

test("every known paid path carries the real-service tag", () => {
  const livePins = new Set(["admin-capability-discovery.spec.ts", "destructive-path.spec.ts", "surface-live-agent.spec.ts",
    "live-publish-e2e.spec.ts", "byok-google-live-smoke.spec.ts", "assistant-chat-regressions.spec.ts"]);
  for (const pin of intents) {
    const source = read(`development/e2e/journeys/${pin.destination}`);
    const ast = ts.createSourceFile(pin.destination, source, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node, inheritedLive: boolean) {
      let live = inheritedLive;
      if (ts.isCallExpression(node) && /^test(?:\.describe(?:\.serial)?)?$/.test(node.expression.getText(ast))) {
        live ||= node.arguments.some((argument) => ts.isObjectLiteralExpression(argument) && /@real-service/.test(argument.getText(ast)));
        const title = node.arguments[0]?.getText(ast) ?? "";
        if (title === JSON.stringify(`Bug pin: ${pin.name.replace(".spec.ts", "")}`) && livePins.has(pin.name)) assert.ok(live, pin.name);
        if (/^test$/.test(node.expression.getText(ast)) && /LIVE AGENT:|LEVEL 3:|chat attaches/.test(title)) assert.ok(live, `Paid path: ${pin.name}: ${title}`);
      }
      ts.forEachChild(node, (child) => visit(child, live));
    }
    visit(ast, false);
  }
});
