// D0c3 gate tool: package names of every NON-type external import of the given files (one per line, sorted).
// usage: node <plan>/desktop-extraction/tools/runtime-externals.mjs <file>...
import { createRequire } from "node:module";
import fs from "node:fs";
// typescript comes from the Tovu checkout the command runs in (cwd), so this file can live in the plan checkout.
const ts = (() => { try { return createRequire(process.cwd() + "/")("typescript"); } catch { return createRequire(import.meta.url)("typescript"); } })();
const pkgs = new Set();
for (const f of process.argv.slice(2)) {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true);
  for (const n of sf.statements) {
    if (!(ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) || !n.moduleSpecifier) continue;
    const c = ts.isImportDeclaration(n) ? n.importClause : undefined;
    const typeOnly = ts.isImportDeclaration(n) ? (c?.isTypeOnly || (c && !c.name && c.namedBindings && ts.isNamedImports(c.namedBindings) && c.namedBindings.elements.length > 0 && c.namedBindings.elements.every(e => e.isTypeOnly))) : n.isTypeOnly;
    const s = n.moduleSpecifier.text;
    if (typeOnly || s.startsWith(".") || s.startsWith("node:") || s.startsWith("#")) continue;
    pkgs.add(s.startsWith("@") ? s.split("/").slice(0, 2).join("/") : s.split("/")[0]);
  }
}
console.log([...pkgs].sort().join("\n"));
