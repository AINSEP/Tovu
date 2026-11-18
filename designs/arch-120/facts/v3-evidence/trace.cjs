// node trace.cjs <root> <ast.tsv> : for each imported name, follow re-export chains to origin
const ts = require(process.argv[2] + '/node_modules/typescript');
const fs = require('fs'), path = require('path');
const root = process.argv[2];
function resolve(from, spec) {
  let p;
  if (spec.startsWith('#src/')) p = 'apps/website/src/' + spec.slice(5);
  else if (spec.startsWith('.')) p = path.normalize(path.join(path.dirname(from), spec));
  else return 'PKG:' + spec;
  p = p.replace(/\.js$/, '.ts');
  if (!/\.tsx?$/.test(p)) { if (fs.existsSync(path.join(root, p + '.ts'))) p += '.ts'; else p += '/index.ts'; }
  return p;
}
const cache = {};
function parse(f) { if (!cache[f]) cache[f] = ts.createSourceFile(f, fs.readFileSync(path.join(root, f), 'utf8'), ts.ScriptTarget.Latest, true); return cache[f]; }
function origin(file, name, depth = 0) {
  if (file.startsWith('PKG:')) return file.slice(4);
  if (depth > 8) return '?deep';
  const sf = parse(file);
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st) && st.moduleSpecifier) {
      const tgt = resolve(file, st.moduleSpecifier.text);
      if (!st.exportClause) { // export *
        const r = tgt.startsWith('PKG:') ? null : origin(tgt, name, depth + 1);
        if (r && r !== '?missing') return r; continue;
      }
      for (const e of st.exportClause.elements || []) if (e.name.text === name) return origin(tgt, e.propertyName ? e.propertyName.text : name, depth + 1);
    }
    if (ts.isImportDeclaration(st) && st.importClause && st.importClause.namedBindings && st.importClause.namedBindings.elements) {
      // import {X} from ...; export {X}  pattern
      for (const e of st.importClause.namedBindings.elements) if (e.name.text === name) {
        const re = sf.statements.some(s => ts.isExportDeclaration(s) && !s.moduleSpecifier && s.exportClause.elements.some(x => x.name.text === name));
        if (re) return origin(resolve(file, st.moduleSpecifier.text), e.propertyName ? e.propertyName.text : name, depth + 1);
      }
    }
    const mods = st.modifiers || [];
    if (mods.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      if (st.name && st.name.text === name) return 'LOCAL:' + file;
      if (ts.isVariableStatement(st) && st.declarationList.declarations.some(d => d.name.text === name)) return 'LOCAL:' + file;
    }
  }
  return '?missing';
}
const rows = fs.readFileSync(process.argv[3], 'utf8').trim().split('\n').map(l => l.split('\t'));
for (const [src, tgt, line, kind, names] of rows) {
  const res = names.split(',').map(n => n.replace(/^type /, '').replace(/^\* as .*/, '*').split(' as ')[0].trim()).filter(Boolean).map(n => n + '=' + (n === '*' || n === 'import()' ? 'NS' : origin(tgt, n.split('.')[0])).replace('apps/website/src/features/', ''));
  console.log([src.replace('apps/website/src/features/', ''), tgt.replace('apps/website/src/features/', ''), line, kind, res.join(' ')].join('\t'));
}
