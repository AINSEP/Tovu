#!/usr/bin/env node
// Symbol-aware importer census of composition/deps.ts (static import/export, dynamic import(), require()).
// Resolves relative specifiers and the `#src/*` alias; also lists files that only MENTION deps.ts as text
// (source-reading tests, tools). Usage: node designs/deps-split/work/deps-importers.cjs <tovu-root> [--rows]
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(process.argv[2] || ".");
const ts = require(require.resolve("typescript", { paths: [root] }));
const target = path.join(root, "apps/website/src/server/runtime/composition/deps.ts");
const srcRoot = path.join(root, "apps/website/src");
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(c|m)?[jt]sx?$/.test(e.name)) files.push(p); } };
["apps", "development", "scripts", "src", "tests", "e2e"].forEach((d) => { const p = path.join(root, d); if (fs.existsSync(p)) walk(p); });
const resolveSpec = (from, spec) => {
  let base;
  if (spec.startsWith("#src/")) base = path.join(srcRoot, spec.slice(5));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  base = base.replace(/\.(js|ts|mjs|cjs)$/, "");
  return base + ".ts";
};
const rows = []; const textOnly = [];
for (const f of files) {
  if (f === target) continue;
  const text = fs.readFileSync(f, "utf8");
  if (!text.includes("deps")) continue;
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
  let hit = false;
  const add = (node, spec, names, kind) => { if (resolveSpec(f, spec) === target) { hit = true; rows.push({ file: path.relative(root, f), line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, kind, names }); } };
  const v = (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const names = [];
      const c = n.importClause;
      if (c?.name) names.push("default");
      if (c?.namedBindings && ts.isNamedImports(c.namedBindings)) c.namedBindings.elements.forEach((e) => names.push((e.propertyName || e.name).text));
      if (c?.namedBindings && ts.isNamespaceImport(c.namedBindings)) names.push("*");
      if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause)) n.exportClause.elements.forEach((e) => names.push((e.propertyName || e.name).text));
      add(n, n.moduleSpecifier.text, names, ts.isImportDeclaration(n) ? (c?.isTypeOnly ? "import-type" : "import") : "re-export");
    }
    if (ts.isCallExpression(n) && n.arguments.length && ts.isStringLiteralLike(n.arguments[0]) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require"))) add(n, n.arguments[0].text, ["(dynamic)"], "dynamic");
    if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) add(n, n.argument.literal.text, [n.qualifier ? n.qualifier.getText(sf) : "*"], "type-query");
    ts.forEachChild(n, v);
  };
  v(sf);
  if (!hit && /composition\/deps(\.ts|\.js)?["'`]|composition\/deps\.ts\b|["'`]deps\.ts["'`]/.test(text)) textOnly.push(path.relative(root, f));
}
const isTest = (f) => /__tests__|\.test\.|\/tests?\/|\/e2e\/|fixture|helpers\//.test(f);
const bySym = new Map();
for (const r of rows) for (const n of r.names) { if (!bySym.has(n)) bySym.set(n, { prod: new Set(), test: new Set() }); bySym.get(n)[isTest(r.file) ? "test" : "prod"].add(r.file); }
const files2 = new Set(rows.map((r) => r.file));
console.log(`# importers of composition/deps.ts: ${files2.size} files (${[...files2].filter((f) => !isTest(f)).length} production, ${[...files2].filter(isTest).length} test/support); text-only mentions: ${textOnly.length}`);
console.log("symbol\tprod-files\ttest-files\tprod-list");
for (const [s, v] of [...bySym].sort()) console.log(`${s}\t${v.prod.size}\t${v.test.size}\t${[...v.prod].join(" ")}`);
if (process.argv.includes("--rows")) { console.log("# rows: file\tline\tkind\tnames"); for (const r of rows) console.log(`${r.file}\t${r.line}\t${r.kind}\t${r.names.join(",")}`); console.log("# text-only"); textOnly.forEach((f) => console.log(f)); }
