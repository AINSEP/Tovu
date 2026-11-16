// Read-only census of Tovu importers that reach a Jini name through a Tovu re-export barrel line (no-shells rule).
// Usage: node tovu-barrel-census.cjs <tovuRoot> <barrel.ts>[,<barrel.ts>...]   (barrel paths relative to tovuRoot)
// A barrel line is `export { … } from '<non-relative spec>'` (or a relative chain to such a line inside Tovu).
// Rows: file line kind old_spec names barrel jini_spec      (jini_spec = the spec the barrel line re-exports from)
const ts = require('/Users/la/Programming/jini-terra-base/node_modules/typescript');
const fs = require('fs'); const path = require('path');
const ROOT = process.argv[2];
const BARRELS = new Set(process.argv[3].split(',').map(f => path.join(ROOT, f)));
const pkgDirs = new Map();
for (const top of ['packages', 'apps']) for (const d of fs.existsSync(path.join(ROOT, top)) ? fs.readdirSync(path.join(ROOT, top)) : []) {
  const pj = path.join(ROOT, top, d, 'package.json'); if (!fs.existsSync(pj)) continue;
  const j = JSON.parse(fs.readFileSync(pj, 'utf8')); pkgDirs.set(j.name, { dir: path.join(ROOT, top, d), exports: j.exports || {} });
}
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.') || e.name.endsWith('.nosync')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(ts|tsx|mts|cts)$/.test(e.name) && !e.name.endsWith('.d.ts')) files.push(p);
  }
})(ROOT);
function tryFile(base) {
  const noJs = base.replace(/\.(js|mjs|cjs|jsx)$/, '');
  for (const c of [base, noJs + '.ts', noJs + '.tsx', path.join(base, 'index.ts'), path.join(noJs, 'index.ts')])
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}
function res(from, spec) {
  if (spec.startsWith('.')) return tryFile(path.resolve(path.dirname(from), spec));
  if (spec.startsWith('#src/')) return tryFile(path.join(ROOT, 'apps/website/src', spec.slice(5))); // website alias (sheets-fix2)
  for (const [name, p] of pkgDirs) {
    if (spec !== name && !spec.startsWith(name + '/')) continue;
    const sub = '.' + spec.slice(name.length);
    const t = p.exports[sub]; const tgt = typeof t === 'string' ? t : t && (t.types || t.default || t.import);
    if (tgt) return tryFile(path.join(p.dir, tgt.replace(/^\.\/dist\//, 'src/').replace(/\.d\.ts$/, '.ts')));
    return tryFile(path.join(p.dir, 'src', sub === '.' ? 'index.ts' : sub));
  }
  return null;
}
const parsed = new Map();
const parse = f => { if (!parsed.has(f)) parsed.set(f, ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)); return parsed.get(f); };
function barrelHit(file, name) { // name re-exported by a barrel from a non-relative spec?
  for (const st of parse(file).statements) {
    if (!ts.isExportDeclaration(st) || !st.moduleSpecifier || st.moduleSpecifier.text.startsWith('.') || !st.exportClause || !ts.isNamedExports(st.exportClause)) continue;
    for (const el of st.exportClause.elements) if (el.name.text === name) return { file, name, spec: st.moduleSpecifier.text };
  }
  return null;
}
function origin(file, name, seen = new Set()) {
  const key = file + '#' + name; if (seen.has(key)) return null; seen.add(key);
  if (BARRELS.has(file)) { const h = barrelHit(file, name); if (h) return h; }
  for (const st of parse(file).statements) {
    if (!ts.isExportDeclaration(st) || !st.moduleSpecifier) continue;
    const t = res(file, st.moduleSpecifier.text); if (!t) continue;
    if (!st.exportClause) { const o = origin(t, name, seen); if (o) return o; continue; }
    if (ts.isNamedExports(st.exportClause)) for (const el of st.exportClause.elements) if (el.name.text === name) return origin(t, (el.propertyName || el.name).text, seen);
  }
  return null;
}
const rel = f => path.relative(ROOT, f);
console.log(['file', 'line', 'kind', 'old_spec', 'names', 'barrel', 'jini_spec'].join('\t'));
for (const f of files) {
  let sf; try { sf = parse(f); } catch { continue; }
  const line = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  function named(st, kind, spec, t, els, typeAll) {
    const by = new Map();
    for (const el of els) {
      const imported = (el.propertyName || el.name).text; const o = origin(t, imported); if (!o) continue;
      const k = rel(o.file) + '\t' + o.spec; if (!by.has(k)) by.set(k, []);
      by.get(k).push(`${typeAll || el.isTypeOnly ? 'type ' : ''}${imported}${el.propertyName ? ' as ' + el.name.text : ''}`);
    }
    for (const [k, ns] of by) console.log([rel(f), line(st), kind, spec, ns.join(','), k].join('\t'));
  }
  (function visit(n) {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const t = res(f, n.moduleSpecifier.text); const c = n.importClause;
      if (t && c && c.namedBindings) {
        if (ts.isNamedImports(c.namedBindings)) named(n, 'import', n.moduleSpecifier.text, t, c.namedBindings.elements, c.isTypeOnly);
        else if (BARRELS.has(t)) console.log([rel(f), line(n), 'namespace', n.moduleSpecifier.text, '*ns:' + c.namedBindings.name.text, rel(t), ''].join('\t'));
      }
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) && !BARRELS.has(f)) {
      const t = res(f, n.moduleSpecifier.text);
      if (t && n.exportClause && ts.isNamedExports(n.exportClause)) named(n, 'export-from', n.moduleSpecifier.text, t, n.exportClause.elements, n.isTypeOnly);
      else if (t && !n.exportClause && BARRELS.has(t)) console.log([rel(f), line(n), 'star', n.moduleSpecifier.text, '*', rel(t), ''].join('\t'));
    } else if (ts.isCallExpression(n) && n.arguments.length && ts.isStringLiteral(n.arguments[0]) && /^(import|vi\.mock|vi\.doMock|vi\.importActual|mock\.module)$/.test(n.expression.getText(sf))) {
      const t = res(f, n.arguments[0].text); if (t && BARRELS.has(t)) console.log([rel(f), line(n), 'dynamic', n.arguments[0].text, 'dynamic', rel(t), ''].join('\t'));
    }
    ts.forEachChild(n, visit);
  })(sf);
}
// the barrel lines themselves
for (const b of BARRELS) { const sf = parse(b);
  for (const st of sf.statements) if (ts.isExportDeclaration(st) && st.moduleSpecifier && !st.moduleSpecifier.text.startsWith('.') && st.exportClause && ts.isNamedExports(st.exportClause))
    console.log([rel(b), sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1, 'barrel-line', st.moduleSpecifier.text, st.exportClause.elements.map(e => (st.isTypeOnly || e.isTypeOnly ? 'type ' : '') + e.name.text).join(','), rel(b), st.moduleSpecifier.text].join('\t'));
}
