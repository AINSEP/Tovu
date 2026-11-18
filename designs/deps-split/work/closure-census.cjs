#!/usr/bin/env node
// Statement census of composeSiteRouteDeps in apps/website/src/server/runtime/composition/deps.ts.
// Usage: node designs/deps-split/work/closure-census.cjs <tovu-root> [--json]
// Prints one row per top-level statement of the closure: index, lines (code start-end), code lines,
// declared names, eager reads of closure bindings, deferred reads (inside a nested function),
// forward reads (binding declared by a LATER statement = late-bound), writes to `let` cells, await.
// Identifier matching is by name with shadowing by nested params/locals removed (approximation; the
// design re-checks every forward read by hand, see DESIGN.md §1.4).
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(process.argv[2] || ".");
const ts = require(require.resolve("typescript", { paths: [root] }));
const file = path.join(root, "apps/website/src/server/runtime/composition/deps.ts");
const text = fs.readFileSync(file, "utf8");
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
const line = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
let fn;
sf.forEachChild((n) => { if (ts.isFunctionDeclaration(n) && n.name && n.name.text === "composeSiteRouteDeps") fn = n; });
if (!fn) { console.error("composeSiteRouteDeps not found"); process.exit(2); }
const stmts = fn.body.statements;
function bindingNames(b, out) {
  if (!b) return out;
  if (ts.isIdentifier(b)) out.push(b.text);
  else if (ts.isObjectBindingPattern(b) || ts.isArrayBindingPattern(b)) b.elements.forEach((e) => { if (!ts.isOmittedExpression(e)) bindingNames(e.name, out); });
  return out;
}
function declared(s) {
  const out = [];
  if (ts.isVariableStatement(s)) s.declarationList.declarations.forEach((d) => bindingNames(d.name, out));
  else if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name) out.push(s.name.text);
  return out;
}
const isLet = new Set();
const owner = new Map();
stmts.forEach((s, i) => {
  declared(s).forEach((n) => owner.set(n, i));
  if (ts.isVariableStatement(s) && !(s.declarationList.flags & ts.NodeFlags.Const)) declared(s).forEach((n) => isLet.add(n));
});
const isFnLike = (n) => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);
function localNames(fnNode) {
  const out = new Set();
  (fnNode.parameters || []).forEach((p) => bindingNames(p.name, []).forEach((x) => out.add(x)));
  const walk = (n) => {
    if (ts.isVariableDeclaration(n)) bindingNames(n.name, []).forEach((x) => out.add(x));
    if (ts.isFunctionDeclaration(n) && n.name && n !== fnNode) out.add(n.name.text);
    if (n !== fnNode && isFnLike(n)) (n.parameters || []).forEach((p) => bindingNames(p.name, []).forEach((x) => out.add(x)));
    ts.forEachChild(n, walk);
  };
  if (fnNode.body) walk(fnNode.body);
  return out;
}
function isRef(id) {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isPropertyAssignment(p) && p.name === id) return false;
  if ((ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p)) && p.name === id) return false;
  if (ts.isBindingElement(p) && p.propertyName === id) return false;
  if (ts.isVariableDeclaration(p) && p.name === id) return false;
  if (ts.isParameter(p) && p.name === id) return false;
  if (ts.isTypeReferenceNode(p) || ts.isQualifiedName(p) || ts.isTypeQueryNode(p)) return false;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return false;
  if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false;
  return true;
}
function codeLines(s) {
  const body = text.slice(s.getStart(sf), s.end);
  return body.split("\n").filter((l) => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); }).length;
}
const rows = stmts.map((s, i) => {
  const eager = new Set(), deferred = new Set(), forward = new Set(), writes = new Set();
  let awaits = false;
  const visit = (n, depth, shadow) => {
    if (isFnLike(n) && n !== s) { const loc = localNames(n); shadow = new Set([...shadow, ...loc]); depth += 1; }
    if (ts.isAwaitExpression(n) && depth === 0) awaits = true;
    if (ts.isTypeNode(n)) return;
    if (ts.isIdentifier(n) && owner.has(n.text) && !shadow.has(n.text) && isRef(n)) {
      const o = owner.get(n.text);
      if (o !== i) {
        (depth === 0 ? eager : deferred).add(n.text);
        if (o > i) forward.add(n.text);
      }
      const p = n.parent;
      if (ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && isLet.has(n.text) && o !== i) writes.add(n.text);
    }
    ts.forEachChild(n, (c) => visit(c, depth, shadow));
  };
  visit(s, 0, new Set());
  const kind = ts.isVariableStatement(s) ? "Var" : ts.SyntaxKind[s.kind];
  return { i, from: line(s.getStart(sf)), to: line(s.end), lead: line(s.getFullStart()) + 1, code: codeLines(s), kind, decl: declared(s), eager: [...eager], deferred: [...deferred], forward: [...forward], writes: [...writes], awaits, let: declared(s).filter((d) => isLet.has(d)) };
});
if (process.argv.includes("--json")) { console.log(JSON.stringify({ fn: { from: line(fn.getStart(sf)), to: line(fn.end), statements: stmts.length }, rows }, null, 1)); process.exit(0); }
console.log(`# composeSiteRouteDeps ${line(fn.getStart(sf))}-${line(fn.end)}, ${stmts.length} top-level statements`);
console.log(["#", "lines", "code", "kind", "declares", "await", "let", "writes-let", "forward(late)", "deferred", "eager"].join("\t"));
for (const r of rows) console.log([r.i, `${r.from}-${r.to}`, r.code, r.kind.replace("Statement", ""), r.decl.join(","), r.awaits ? "await" : "", r.let.join(","), r.writes.join(","), r.forward.join(","), r.deferred.join(","), r.eager.join(",")].join("\t"));
