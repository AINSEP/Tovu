#!/usr/bin/env node
// Module-level declarations of composition/deps.ts with line ranges (leading-comment start, code start, end),
// code lines, export flag, and which other module-level declarations each one references.
// Usage: node designs/deps-split/work/module-census.cjs <tovu-root>
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(process.argv[2] || ".");
const ts = require(require.resolve("typescript", { paths: [root] }));
const file = path.join(root, "apps/website/src/server/runtime/composition/deps.ts");
const text = fs.readFileSync(file, "utf8");
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
const ln = (p) => sf.getLineAndCharacterOfPosition(p).line + 1;
const decls = [];
let imports = 0, importEnd = 0;
sf.statements.forEach((s) => {
  if (ts.isImportDeclaration(s)) { imports++; importEnd = ln(s.end); return; }
  let name = "?";
  if (ts.isVariableStatement(s)) name = s.declarationList.declarations.map((d) => d.name.getText(sf)).join(",");
  else if (s.name) name = s.name.text;
  else if (ts.isExportDeclaration(s)) name = "export{…} from " + s.moduleSpecifier.getText(sf);
  decls.push({ s, name, exported: !!(ts.getCombinedModifierFlags(s) & ts.ModifierFlags.Export) || ts.isExportDeclaration(s) });
});
const names = new Set(decls.map((d) => d.name));
console.log(`# deps.ts: ${text.split("\n").length - 1} lines; ${imports} import declarations (last ends line ${importEnd}); ${decls.length} other top-level statements`);
console.log(["name", "comment-start", "code-start", "end", "code-lines", "export", "kind", "uses-module-decls"].join("\t"));
for (const d of decls) {
  const body = text.slice(d.s.getStart(sf), d.s.end);
  const code = body.split("\n").filter((l) => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); }).length;
  const uses = new Set();
  const v = (n) => { if (ts.isIdentifier(n) && names.has(n.text) && n.text !== d.name) uses.add(n.text); ts.forEachChild(n, v); };
  v(d.s);
  console.log([d.name, ln(d.s.getFullStart()) + 1, ln(d.s.getStart(sf)), ln(d.s.end), code, d.exported ? "export" : "", ts.SyntaxKind[d.s.kind].replace("FirstStatement", "VariableStatement"), [...uses].join(",")].join("\t"));
}
