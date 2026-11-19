import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins what this sheet must not change: the declarations move whole and in order, deps.ts keeps none of
// them, and deps.ts takes what it still uses from the new file (no re-export).
const DEPS = new URL("../../deps.ts", import.meta.url);
const MOVED = new URL("../overrides.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const declaredNames = (file: ts.SourceFile): string[] => file.statements.flatMap((s) => (ts.isFunctionDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) && s.name ? [s.name.text] : []);

test("M1: the declarations live only in site-deps/overrides.ts, in tip order", () => {
  const moved = ["CreateSiteRouteDepsOverrides","assertOverridesPairedOrAbsent","pluginFailureThresholdOverride","resolveThemesDirOverride","resolveSiteBindingOverride","resolveWorkspaceIdOverride"];
  assert.deepEqual(declaredNames(parse(MOVED)).filter((n) => moved.includes(n)), moved);
  assert.deepEqual(declaredNames(parse(DEPS)).filter((n) => moved.includes(n)), []);
});

test("M1: deps.ts imports exactly what it still uses from the new file", () => {
  const found = parse(DEPS).statements.find((s): s is ts.ImportDeclaration => ts.isImportDeclaration(s) && (s.moduleSpecifier as ts.StringLiteral).text === "./site-deps/overrides.js");
  assert.ok(found?.importClause?.namedBindings && ts.isNamedImports(found.importClause.namedBindings), "import missing");
  assert.deepEqual(found.importClause.namedBindings.elements.map((e) => e.name.text).sort(), ["CreateSiteRouteDepsOverrides","assertOverridesPairedOrAbsent","pluginFailureThresholdOverride","resolveSiteBindingOverride","resolveThemesDirOverride","resolveWorkspaceIdOverride"]);
});
