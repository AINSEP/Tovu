// AST-based counts over a prod file list: explicit `any` (as any / : any / other any), non-null `!`,
// functions > 80 lines, files > 500 lines, `await import(` / dynamic import().
// Usage: node ast-metrics.mjs <repoRoot> <fileList> <label> <outPrefix>
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const [root, list, label, outPrefix] = process.argv.slice(2);
const ts = createRequire("/home/user/Jini/package.json")("typescript");
const files = fs.readFileSync(list, "utf8").split("\n").filter(Boolean);
const hits = []; const longFns = []; const bigFiles = [];
const add = (k, f, sf, node) => hits.push([label, k, f, sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1]);
const fnName = (n) => {
  if (n.name) return n.name.getText();
  const p = n.parent;
  if (p && ts.isVariableDeclaration(p)) return p.name.getText();
  if (p && ts.isPropertyAssignment(p)) return p.name.getText();
  if (p && ts.isExportAssignment(p)) return "default";
  return "<anonymous>";
};
for (const f of files) {
  const text = fs.readFileSync(path.join(root, f), "utf8");
  const lines = text.split("\n").length;
  if (lines > 500) bigFiles.push([label, f, lines]);
  const kind = /\.tsx$|\.jsx$/.test(f) ? ts.ScriptKind.TSX : /\.(js|mjs|cjs)$/.test(f) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, kind);
  const visit = (n) => {
    if (n.kind === ts.SyntaxKind.AnyKeyword) {
      const p = n.parent;
      if (p && (ts.isAsExpression(p) || ts.isTypeAssertionExpression(p))) add("as_any", f, sf, n);
      else if (p && (ts.isParameter(p) || ts.isVariableDeclaration(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isFunctionLike(p)) && p.type === n) add("colon_any", f, sf, n);
      else add("other_any", f, sf, n);
    }
    if (ts.isNonNullExpression(n)) add("non_null_bang", f, sf, n);
    if (n.kind === ts.SyntaxKind.ImportKeyword && n.parent && ts.isCallExpression(n.parent)) add(ts.isAwaitExpression(n.parent.parent) ? "await_import" : "dynamic_import_other", f, sf, n.parent);
    if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n)) {
      if (n.body) {
        const s = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, e = sf.getLineAndCharacterOfPosition(n.end).line + 1;
        if (e - s + 1 > 80) longFns.push([label, f, fnName(n), s, e - s + 1]);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const cm = /@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable/g;
  // comment directives: scan comment ranges only
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, sf.languageVariant, text);
  let tok;
  while ((tok = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (tok === ts.SyntaxKind.SingleLineCommentTrivia || tok === ts.SyntaxKind.MultiLineCommentTrivia) {
      const c = scanner.getTokenText(); let m; cm.lastIndex = 0;
      while ((m = cm.exec(c))) hits.push([label, m[0].replace(/^@/, "").replace(/-/g, "_"), f, sf.getLineAndCharacterOfPosition(scanner.getTokenPos()).line + 1]);
    }
  }
}
const w = (name, head, rows) => fs.writeFileSync(`${outPrefix}-${name}.tsv`, [head, ...rows.map((r) => r.join("\t"))].join("\n") + "\n");
w("typesafety", "repo\tcheck\tfile\tline", hits);
w("long-functions", "repo\tfile\tfunction\tline\tlines", longFns.sort((a, b) => b[4] - a[4]));
w("big-files", "repo\tfile\tlines", bigFiles.sort((a, b) => b[2] - a[2]));
const c = {}; for (const h of hits) c[h[1]] = (c[h[1]] ?? 0) + 1;
console.log(JSON.stringify({ label, files: files.length, ...c, functions_gt80: longFns.length, files_gt500: bigFiles.length }));
