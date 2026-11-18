// Lists every cross-feature import in a Tovu tree with the imported names and whether the import
// is erased (type-only). Read-only; plan tooling for designs/arch-120, not product code.
//   node designs/arch-120/tools/cross-feature-imports.mjs <tovuRoot>  > out.tsv
// Columns: source, target, sourceFeature, targetFeature, kind (type|value), names (comma list; * = namespace/side-effect)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(process.argv[2] ?? ".");
const ts = createRequire(path.join(root, "package.json"))("typescript");
const FEATURES = "apps/website/src/features";
const TEST = /__tests__|\.test\.|\.spec\./;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "__tests__") walk(p, out); }
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts") && !TEST.test(p)) out.push(p);
  }
  return out;
}
function featureOf(rel) {
  if (!rel.startsWith(FEATURES + "/")) return null;
  const parts = rel.slice(FEATURES.length + 1).split("/");
  return parts.length > 1 ? parts[0] : null;
}
function resolve(fromAbs, spec) {
  let base;
  if (spec.startsWith("#src/")) base = path.join(root, "apps/website/src", spec.slice(5));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromAbs), spec);
  else return null;
  const noJs = base.replace(/\.(m?js|jsx)$/, "");
  for (const c of [noJs + ".ts", noJs + ".tsx", base, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}
const rows = [];
function record(fromAbs, spec, kind, names) {
  const to = resolve(fromAbs, spec);
  if (!to) return;
  const s = path.relative(root, fromAbs), t = path.relative(root, to);
  const a = featureOf(s), b = featureOf(t);
  if (!a || !b || a === b) return;
  rows.push([s, t, a, b, kind, names.join(",") || "*"]);
}
for (const file of walk(path.join(root, FEATURES))) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      if (ts.isImportDeclaration(node)) {
        const c = node.importClause;
        const names = [];
        let allType = !!c && (c.isTypeOnly ?? false);
        if (c) {
          if (c.name) { names.push("default"); }
          const nb = c.namedBindings;
          if (nb && ts.isNamespaceImport(nb)) names.push("*" + nb.name.text);
          if (nb && ts.isNamedImports(nb)) {
            for (const el of nb.elements) names.push((el.propertyName ?? el.name).text);
            if (!c.isTypeOnly) allType = nb.elements.length > 0 && !c.name && nb.elements.every((el) => el.isTypeOnly);
          }
        }
        record(file, spec, allType ? "type" : "value", names);
      } else {
        const names = [];
        let allType = node.isTypeOnly;
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) names.push((el.propertyName ?? el.name).text);
          if (!node.isTypeOnly) allType = node.exportClause.elements.length > 0 && node.exportClause.elements.every((el) => el.isTypeOnly);
        }
        record(file, spec, allType ? "type-reexport" : "value-reexport", names);
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      record(file, node.argument.literal.text, "type", [node.qualifier ? node.qualifier.getText() : "*"]);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      record(file, node.arguments[0].text, "value-dynamic", ["*"]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
for (const r of rows.sort((x, y) => (x[0] + x[1]).localeCompare(y[0] + y[1]))) console.log(r.join("\t"));
