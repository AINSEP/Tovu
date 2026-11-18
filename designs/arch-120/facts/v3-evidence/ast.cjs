// Usage: node ast.cjs <repoRoot> <edgesFile>  -> TSV: src tgt line kind names
const ts = require(process.argv[2] + '/node_modules/typescript');
const fs = require('fs'), path = require('path');
const root = process.argv[2];
const edges = fs.readFileSync(process.argv[3], 'utf8').trim().split('\n').map(l => l.split(' -> '));
function resolve(from, spec) {
  let p;
  if (spec.startsWith('#src/')) p = 'apps/website/src/' + spec.slice(5);
  else if (spec.startsWith('.')) p = path.normalize(path.join(path.dirname(from), spec));
  else return null;
  p = p.replace(/\.js$/, '.ts');
  if (!/\.tsx?$/.test(p)) { if (fs.existsSync(path.join(root, p + '.ts'))) p += '.ts'; else p += '/index.ts'; }
  return p;
}
const out = [];
for (const [src, tgt] of edges) {
  const text = fs.readFileSync(path.join(root, src), 'utf8');
  const sf = ts.createSourceFile(src, text, ts.ScriptTarget.Latest, true);
  const hits = [];
  function visit(n) {
    let spec, names = [], kind;
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) {
      spec = n.moduleSpecifier.text;
      const isExp = ts.isExportDeclaration(n);
      if (isExp) {
        kind = n.isTypeOnly ? 'reexport-type' : 'reexport';
        if (n.exportClause && n.exportClause.elements) names = n.exportClause.elements.map(e => (e.isTypeOnly ? 'type ' : '') + e.name.text);
        else names = ['*'];
      } else {
        const c = n.importClause;
        if (!c) { kind = 'side-effect'; }
        else {
          let allType = c.isTypeOnly;
          if (c.name) names.push(c.name.text);
          if (c.namedBindings) {
            if (ts.isNamespaceImport(c.namedBindings)) names.push('* as ' + c.namedBindings.name.text);
            else { const els = c.namedBindings.elements; names.push(...els.map(e => (e.isTypeOnly ? 'type ' : '') + (e.propertyName ? e.propertyName.text + ' as ' : '') + e.name.text)); if (!c.isTypeOnly && !c.name && els.length && els.every(e => e.isTypeOnly)) allType = true; }
          }
          kind = allType ? 'type' : 'value';
        }
      }
    } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) {
      spec = n.argument.literal.text; kind = 'import()-type'; names = [n.qualifier ? n.qualifier.getText() : '?'];
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      spec = n.arguments[0].text; kind = 'dynamic'; names = ['import()'];
    }
    if (spec && resolve(src, spec) === tgt) hits.push([sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, kind, names.join(',')]);
    ts.forEachChild(n, visit);
  }
  visit(sf);
  if (!hits.length) out.push([src, tgt, '?', 'UNRESOLVED', ''].join('\t'));
  for (const h of hits) out.push([src, tgt, ...h].join('\t'));
}
console.log(out.join('\n'));
