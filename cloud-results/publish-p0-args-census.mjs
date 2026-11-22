#!/usr/bin/env node
// Census of exported functions in the publish feature folders against the owner's argument rule
// `(required, optional = {})`. Reproduces design section 2.4 with the TypeScript AST (the design's
// regex census could not see exported arrow constants).
// Conforming: no parameters, OR first parameter is an object binding pattern (named required args)
// and the second, if present, is a parameter with an initializer `{}`; a lone required object with
// no options parameter is NOT conforming (the repo convention is `({ a }: T, _optional = {})`).
// Usage: node cloud-results/publish-p0-args-census.mjs [--json] [--list]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");
const ROOTS = ["apps/website/src/features/publish-content", "apps/website/src/features/publish-trust"];
const SKIP = /(__tests__|\/ui\/|\.test\.)/;
const files = ROOTS.flatMap((r) => fs.readdirSync(r, { recursive: true }).map(String).filter((f) => f.endsWith(".ts") && !SKIP.test(`/${f}`)).map((f) => path.join(r, f)));
const isEmptyObj = (e) => e && ts.isObjectLiteralExpression(e) && e.properties.length === 0;
const BAG = /(Input|Inputs|Deps|Args|Params|Options|Config|Context|Ctx|Request|Spec|Ports?|Required|Bag|Env)$/;
// A required-args object: a destructured pattern, an inline object type, or a named bag type.
function isRequiredObject(p) {
  if (ts.isObjectBindingPattern(p.name)) return true;
  const t = p.type;
  if (!t) return false;
  if (ts.isTypeLiteralNode(t)) return true;
  return ts.isTypeReferenceNode(t) && BAG.test(t.typeName.getText());
}
function classify(params) {
  const ps = params.filter((p) => !(ts.isIdentifier(p.name) && p.name.text === "this"));
  if (ps.length === 0) return null;
  const [a, b] = ps;
  if (ps.length === 1 && isEmptyObj(a.initializer)) return null; // optional-only: `({ x = 1 }: { x?: number } = {})`
  const objFirst = isRequiredObject(a);
  if (ps.length === 1) return objFirst ? "bag-no-options" : "positional";
  if (ps.length === 2) {
    if (objFirst && isEmptyObj(b.initializer)) return null;
    const neverType = b.type && /Record<string,\s*never>/.test(b.type.getText());
    if (neverType) return "never-options";
    if (!objFirst) return "two-positional";
    return "bag-bad-second";
  }
  return "too-many";
}
const rows = [];
for (const file of files) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const exported = (n) => !!(ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export);
  for (const st of sf.statements) {
    let fn = null, name = null;
    if (ts.isFunctionDeclaration(st) && st.name && exported(st)) { fn = st; name = st.name.text; }
    else if (ts.isVariableStatement(st) && exported(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) { fn = d.initializer; name = d.name.text; }
      }
    }
    if (!fn) continue;
    const kind = classify(fn.parameters);
    rows.push({ file: path.relative("apps/website/src/features", file), line: sf.getLineAndCharacterOfPosition(fn.getStart()).line + 1, name, kind, params: fn.parameters.map((p) => p.getText().replace(/\s+/g, " ").slice(0, 90)).join(" | ") });
  }
}
const bad = rows.filter((r) => r.kind);
console.log(`exported functions ${rows.length}; non-conforming ${bad.length}`);
const byKind = {}; for (const r of bad) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
console.log(JSON.stringify(byKind));
if (process.argv.includes("--list")) for (const r of bad) console.log(`${r.kind}\t${r.file}:${r.line}\t${r.name}\t${r.params}`);
