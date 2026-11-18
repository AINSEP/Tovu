// node revidx.cjs <root> : TSV importer \t imported \t line \t kind \t names  (all apps/website/src .ts files, AST-resolved)
const ts = require(process.argv[2] + '/node_modules/typescript');
const fs = require('fs'), path = require('path');
const root = process.argv[2], base = 'apps/website/src';
function walk(d, out) { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const p = d + '/' + e.name; if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); } else if (/\.tsx?$/.test(e.name)) out.push(p); } return out; }
function resolve(from, spec) {
  let p;
  if (spec.startsWith('#src/')) p = base + '/' + spec.slice(5);
  else if (spec.startsWith('.')) p = path.normalize(path.join(path.dirname(from), spec));
  else return null;
  p = p.replace(/\.js$/, '.ts');
  if (!/\.tsx?$/.test(p)) { if (fs.existsSync(path.join(root, p + '.ts'))) p += '.ts'; else p += '/index.ts'; }
  return p;
}
for (const f of walk(base, [])) {
  const sf = ts.createSourceFile(f, fs.readFileSync(path.join(root, f), 'utf8'), ts.ScriptTarget.Latest, true);
  (function visit(n) {
    let spec, kind, names = '';
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      spec = n.moduleSpecifier.text; kind = ts.isExportDeclaration(n) ? 'reexport' : 'import';
      const c = n.importClause, ec = n.exportClause;
      const els = c && c.namedBindings && c.namedBindings.elements || ec && ec.elements;
      if (els) names = els.map(e => (e.propertyName ? e.propertyName.text : e.name.text)).join(',');
      if (c && c.name) names = c.name.text + (names ? ',' + names : '');
    } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) { spec = n.argument.literal.text; kind = 'import()-type'; names = n.qualifier ? n.qualifier.getText() : ''; }
    else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) { spec = n.arguments[0].text; kind = 'dynamic'; }
    if (spec) { const t = resolve(f, spec); if (t) console.log([f.slice(base.length + 1), t.slice(base.length + 1), sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, kind, names].join('\t')); }
    ts.forEachChild(n, visit);
  })(sf);
}
