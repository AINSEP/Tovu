#!/usr/bin/env node
// P0.5b census: methods of interfaces and object-type members declared in the publish feature folders
// (production files) whose parameters are not `(required: {...}, optional?: ...)`.
// Conforming: no parameters; or first parameter is a named object type (type literal / *Input|*Deps|... name /
// a Pick|Omit of one), and the second, when present, is optional (`?`) or defaulted.
// Usage: node cloud-results/publish-p0-port-census.mjs [--list]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");
const ROOTS = ["apps/website/src/features/publish-content", "apps/website/src/features/publish-trust"];
const SKIP = /(__tests__|\/ui\/|\.test\.)/;
const BAG = /(Input|Inputs|Deps|Args|Params|Options|Config|Context|Ctx|Request|Spec|Ports?|Required|Bag|Env)$/;
const files = ROOTS.flatMap((r) => fs.readdirSync(r, { recursive: true }).map(String).filter((f) => f.endsWith(".ts") && !SKIP.test(`/${f}`)).map((f) => path.join(r, f)));
const isObjType = (t) => !!t && (ts.isTypeLiteralNode(t) || (ts.isTypeReferenceNode(t) && (BAG.test(t.typeName.getText()) || /^(Pick|Omit|Partial|Required|Readonly)$/.test(t.typeName.getText()))) || (ts.isIntersectionTypeNode(t) && t.types.every(isObjType)));
function classify(params) {
  const ps = params.filter((p) => !(ts.isIdentifier(p.name) && p.name.text === "this"));
  if (ps.length === 0) return null;
  const [a, b] = ps;
  const first = ts.isObjectBindingPattern(a.name) || isObjType(a.type);
  if (!first) return ps.length === 1 ? "positional" : "two-positional";
  if (ps.length === 1) return "no-optional";
  if (ps.length === 2 && (b.questionToken || b.initializer)) return null;
  return ps.length > 2 ? "too-many" : "second-required";
}
const rows = [];
for (const file of files) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const visit = (node, owner) => {
    if (ts.isInterfaceDeclaration(node)) owner = node.name.text;
    if (ts.isTypeAliasDeclaration(node)) owner = node.name.text;
    let params = null, name = null;
    if (ts.isMethodSignature(node)) { params = node.parameters; name = node.name.getText(); }
    else if (ts.isPropertySignature(node) && node.type && ts.isFunctionTypeNode(node.type)) { params = node.type.parameters; name = node.name.getText(); }
    if (params && owner) {
      const kind = classify(params);
      if (kind) rows.push({ file: path.relative("apps/website/src/features", file), line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, owner, name, kind, params: params.map((p) => p.getText().replace(/\s+/g, " ").slice(0, 70)).join(" | ") });
    }
    ts.forEachChild(node, (c) => visit(c, owner));
  };
  visit(sf, null);
}
console.log(`non-conforming port methods ${rows.length}`);
const by = {}; for (const r of rows) by[r.kind] = (by[r.kind] ?? 0) + 1;
console.log(JSON.stringify(by));
if (process.argv.includes("--list")) for (const r of rows) console.log(`${r.kind}\t${r.file}:${r.line}\t${r.owner}.${r.name}\t${r.params}`);
