#!/usr/bin/env node
// Counts functions that break the owner's argument rule: at most two parameters,
// (1) an object of required arguments, (2) an object of optional arguments.
// Why a script: the extraction survey never checked this rule; reviews need a
// repeatable number before and after the refactor.
//
// Usage: node development/scripts/args-object-audit.mjs <repoDir> [--json out.json] [--label NAME]
// Read-only. Skips tests, fixtures, dist, node_modules, vendored and the local site folder.
//
// Classification per function (declarations, methods, constructors, arrows/function
// expressions bound to a name or exported; inline callbacks passed to a call are skipped):
//   ok        — 0 params, or ≤2 params where each is an object binding pattern / object type
//   unsure    — a param typed with a named type we can't resolve cheaply (Options, Foo…)
//   violation — >2 params, or a param that is a primitive/untyped/array/function scalar
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const argv = process.argv.slice(2);
const ROOT = path.resolve(argv[0] ?? process.cwd());
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");

const SKIP_DIR = /(^|\/)(node_modules|dist|build|coverage|\.git|__tests__|__fixtures__|fixtures|vendor|test|tests|e2e|\.next|out)(\/|$)/;
const SKIP_FILE = /\.(test|spec|stories|d)\.(t|j)sx?$|\.test-support\.|\.support\.ts$/;
const LOCAL_SITE = /apps\/website\/src\/sites\/|\/plugins\/[^/]+\/\d+\.\d+\.\d+\//; // local site folder + built, versioned plugin bundles
const SOURCE_ROOTS = ["apps", "packages", "content", "scripts"]; // product source only (no ADS-memory, AI-Dev-Shop, development)
const PRIMS = new Set(["string", "number", "boolean", "bigint", "symbol", "unknown", "any", "never", "null", "undefined"]);
const OBJECTY_NAME = /(Options|Opts|Input|Inputs|Deps|Dependencies|Args|Params|Config|Props|Required|Optional|Context|Ctx|Request|Spec|Init|Settings|Ports?)$/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), rel = path.relative(ROOT, p);
    if (e.isDirectory()) { if (!SKIP_DIR.test(rel) && !LOCAL_SITE.test(rel + "/")) walk(p, out); }
    else if (/\.(ts|tsx|mts|cts|js|mjs|jsx)$/.test(e.name) && !SKIP_FILE.test(e.name) && !LOCAL_SITE.test(rel)) out.push(p);
  }
  return out;
}

function paramKind(p) {
  if (p.dotDotDotToken) return "violation";                       // rest params are positional
  if (ts.isObjectBindingPattern(p.name)) return "ok";
  if (ts.isArrayBindingPattern(p.name)) return "violation";
  const t = p.type;
  if (!t) return p.initializer && ts.isObjectLiteralExpression(p.initializer) ? "ok" : "violation";
  if (ts.isTypeLiteralNode(t) || ts.isMappedTypeNode(t)) return "ok";
  if (ts.isIntersectionTypeNode(t)) return t.types.every((x) => ts.isTypeLiteralNode(x) || ts.isTypeReferenceNode(x)) ? "unsure" : "violation";
  if (t.kind === ts.SyntaxKind.StringKeyword || t.kind === ts.SyntaxKind.NumberKeyword || t.kind === ts.SyntaxKind.BooleanKeyword
    || t.kind === ts.SyntaxKind.AnyKeyword || t.kind === ts.SyntaxKind.UnknownKeyword) return "violation";
  if (ts.isLiteralTypeNode(t) || ts.isArrayTypeNode(t) || ts.isFunctionTypeNode(t) || ts.isTupleTypeNode(t)) return "violation";
  if (ts.isUnionTypeNode(t)) return t.types.every((x) => ts.isTypeLiteralNode(x)) ? "ok" : "violation";
  if (ts.isTypeReferenceNode(t)) {
    const n = t.typeName.getText();
    if (PRIMS.has(n) || /^(Array|ReadonlyArray|Set|Map|Promise|Date|Buffer|URL|RegExp|Error)$/.test(n)) return "violation";
    if (/^(Record|Partial|Readonly|Required|Pick|Omit)$/.test(n)) return "ok";
    return OBJECTY_NAME.test(n) ? "ok" : "unsure";
  }
  return "unsure";
}

function classify(params) {
  const ps = params.filter((p) => !(ts.isIdentifier(p.name) && p.name.text === "this"));
  if (ps.length === 0) return { kind: "ok", n: 0 };
  if (ps.length > 2) return { kind: "violation", n: ps.length, why: ">2 params" };
  const kinds = ps.map(paramKind);
  if (kinds.includes("violation")) return { kind: "violation", n: ps.length, why: "scalar/positional param" };
  return { kind: kinds.includes("unsure") ? "unsure" : "ok", n: ps.length };
}

const isExported = (node) => !!(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export)
  || (node.parent && ts.isVariableDeclaration(node.parent) && node.parent.parent?.parent && (ts.getCombinedModifierFlags(node.parent.parent.parent) & ts.ModifierFlags.Export));

const rows = [];
for (const file of SOURCE_ROOTS.filter((d) => fs.existsSync(path.join(ROOT, d))).flatMap((d) => walk(path.join(ROOT, d)))) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = path.relative(ROOT, file);
  const visit = (node) => {
    let fn = null, name = null;
    if (ts.isFunctionDeclaration(node) && node.name) { fn = node; name = node.name.text; }
    else if ((ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) && node.body) { fn = node; name = ts.isConstructorDeclaration(node) ? "constructor" : node.name.getText(); }
    else if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.parent) {
      const par = node.parent;
      if (ts.isVariableDeclaration(par) && ts.isIdentifier(par.name)) { fn = node; name = par.name.text; }
      else if (ts.isPropertyAssignment(par) || ts.isPropertyDeclaration(par)) { fn = node; name = par.name.getText(); }
      // inline callbacks (args to a call, JSX handlers) are skipped: their shape is set by the caller's API
    }
    if (fn) {
      const c = classify(fn.parameters);
      // React components take one props object by convention; JSX return makes it a component
      const exported = isExported(fn);
      rows.push({ file: rel, line: sf.getLineAndCharacterOfPosition(fn.getStart()).line + 1, name, exported, ...c });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const top = (r) => { const parts = r.file.split("/"); return parts[0] === "packages" || parts[0] === "apps" ? parts.slice(0, 2).join("/") : parts[0]; };
const tally = (list) => ({ total: list.length, ok: list.filter((r) => r.kind === "ok").length, unsure: list.filter((r) => r.kind === "unsure").length, violation: list.filter((r) => r.kind === "violation").length });
const label = opt("--label") ?? path.basename(ROOT);
const all = tally(rows), exp = tally(rows.filter((r) => r.exported));
console.log(`# ${label}: functions ${all.total} — ok ${all.ok}, unsure ${all.unsure}, VIOLATION ${all.violation} (${(100 * all.violation / all.total).toFixed(1)}%)`);
console.log(`  exported: ${exp.total} — ok ${exp.ok}, unsure ${exp.unsure}, VIOLATION ${exp.violation} (${(100 * exp.violation / Math.max(1, exp.total)).toFixed(1)}%)`);
console.log(`  >2 params: ${rows.filter((r) => r.why === ">2 params").length}`);
const by = new Map();
for (const r of rows) { const k = top(r); by.set(k, [...(by.get(k) ?? []), r]); }
for (const [k, list] of [...by].sort((a, b) => tally(b[1]).violation - tally(a[1]).violation).slice(0, 15)) {
  const t = tally(list); console.log(`  ${k.padEnd(34)} ${String(t.violation).padStart(5)} violations / ${t.total} fns (exported ${tally(list.filter((r) => r.exported)).violation})`);
}
const out = opt("--json");
if (out) fs.writeFileSync(out, JSON.stringify(rows.filter((r) => r.kind !== "ok")));
