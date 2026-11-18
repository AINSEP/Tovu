#!/usr/bin/env node
// Key sheet of the `routeDeps` object literal inside composeSiteRouteDeps (deps.ts), plus every
// post-assembly write `routeDeps.<key> = …`.
// Usage: node designs/deps-split/work/literal-keys.cjs <tovu-root>
// Columns: line, key (or ...spread), form, closure bindings read, group break before (blank/comment line).
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(process.argv[2] || ".");
const ts = require(require.resolve("typescript", { paths: [root] }));
const file = path.join(root, "apps/website/src/server/runtime/composition/deps.ts");
const text = fs.readFileSync(file, "utf8");
const lines = text.split("\n");
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
const ln = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
let fn; sf.forEachChild((n) => { if (ts.isFunctionDeclaration(n) && n.name?.text === "composeSiteRouteDeps") fn = n; });
const closureNames = new Set();
for (const s of fn.body.statements) {
  if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) {
    const walk = (b) => { if (ts.isIdentifier(b)) closureNames.add(b.text); else if (b.elements) b.elements.forEach((e) => e.name && walk(e.name)); };
    walk(d.name);
  } else if (ts.isFunctionDeclaration(s) && s.name) closureNames.add(s.name.text);
}
let lit;
for (const s of fn.body.statements) if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === "routeDeps") lit = d.initializer;
const reads = (node) => { const out = new Set(); const v = (n) => { if (ts.isIdentifier(n) && closureNames.has(n.text) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) out.add(n.text); ts.forEachChild(n, v); }; v(node); return [...out]; };
console.log(`# routeDeps literal ${ln(lit.getStart(sf))}-${ln(lit.end)}: ${lit.properties.length} properties`);
console.log(["line", "key", "form", "reads", "break-before"].join("\t"));
let prevEnd = ln(lit.getStart(sf));
for (const p of lit.properties) {
  const start = ln(p.getStart(sf));
  let brk = "";
  for (let l = prevEnd + 1; l < start; l++) { const t = lines[l - 1].trim(); if (t === "") brk = brk || "blank"; else if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) brk = "comment"; }
  const key = ts.isSpreadAssignment(p) ? "..." + p.expression.getText(sf).slice(0, 60).replace(/\s+/g, " ") : p.name.getText(sf);
  const form = ts.isSpreadAssignment(p) ? "spread" : ts.isShorthandPropertyAssignment(p) ? "shorthand" : ts.isMethodDeclaration(p) ? "method" : ts.isGetAccessor(p) ? "getter" : "assign";
  const r = ts.isShorthandPropertyAssignment(p) ? (closureNames.has(p.name.text) ? [p.name.text] : []) : reads(ts.isSpreadAssignment(p) ? p.expression : p.initializer ?? p);
  console.log([start, key, form, r.join(","), brk].join("\t"));
  prevEnd = ln(p.end);
}
console.log("# post-assembly writes routeDeps.<key> = … (after the literal)");
const v = (n) => { if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left) && n.left.expression.getText(sf) === "routeDeps" && n.pos > lit.end) console.log(`${ln(n.getStart(sf))}\twrite\t${n.left.name.text}`); ts.forEachChild(n, v); };
v(fn.body);
