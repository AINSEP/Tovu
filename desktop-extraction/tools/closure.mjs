// D0c3 census tool: runtime import closure of website files (relative + #src/ + dynamic import() with a literal), type-only imports skipped.
// usage (Tovu root): node <plan>/desktop-extraction/tools/closure.mjs [--static] <entry.ts>...   (--static: do not follow dynamic import())   prints "<lines> <file>", FILES/LINES, EXTERNAL, DYN
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path";
// typescript comes from the Tovu checkout the command runs in (cwd), so this file can live in the plan checkout.
const ts = (() => { try { return createRequire(process.cwd() + "/")("typescript"); } catch { return createRequire(import.meta.url)("typescript"); } })();
const root = process.cwd(); const STATIC = process.argv.includes("--static"); const entries = process.argv.slice(2).filter(a => a !== "--static");
const SRC = path.join(root, "apps/website/src");
const resolveFile = (p) => { for (const c of [p, p.replace(/\.js$/, ".ts"), p + ".ts", p + ".tsx", path.join(p, "index.ts")]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; return null; };
const seen = new Map(); const ext = new Set(); const dyn = [];
function specs(file) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true); const out = [];
  const walk = (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) {
      const typeOnly = ts.isImportDeclaration(n) ? (n.importClause?.isTypeOnly || (n.importClause && !n.importClause.name && n.importClause.namedBindings && ts.isNamedImports(n.importClause.namedBindings) && n.importClause.namedBindings.elements.length > 0 && n.importClause.namedBindings.elements.every(e => e.isTypeOnly))) : n.isTypeOnly;
      if (!typeOnly) out.push({ s: n.moduleSpecifier.text, dyn: false });
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(n.arguments[0])) out.push({ s: n.arguments[0].text, dyn: true, line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1 });
    ts.forEachChild(n, walk);
  }; walk(sf); return out;
}
function visit(file) {
  if (seen.has(file)) return; seen.set(file, fs.readFileSync(file, "utf8").split("\n").length - 1);
  for (const { s, dyn: d, line } of specs(file)) {
    let t = null;
    if (s.startsWith("#src/")) t = resolveFile(path.join(SRC, s.slice(5)));
    else if (s.startsWith(".")) t = resolveFile(path.resolve(path.dirname(file), s));
    else { if (d && STATIC) { dyn.push(`${path.relative(root, file)}:${line} import(${s})`); continue; } ext.add(s); if (d) dyn.push(`${path.relative(root, file)}:${line} import(${s})`); continue; }
    if (d) dyn.push(`${path.relative(root, file)}:${line} import(${s})`);
    if (d && STATIC) continue;
    if (t) visit(t); else console.log("UNRESOLVED", s, "from", file);
  }
}
for (const e of entries) visit(path.resolve(root, e));
let total = 0; for (const [f, n] of [...seen].sort()) { total += n; console.log(String(n).padStart(5), path.relative(root, f)); }
console.log(`FILES ${seen.size} LINES ${total}`); console.log("EXTERNAL", [...ext].sort().join(" ")); for (const d of dyn) console.log("DYN", d);
