// Read-only census of Tovu importers of the C3t facades (B1 ruling 2026-11-15: delete the facades, no exception).
// Usage: node tovu-facade-census.cjs <tovuRoot> > C3t.repoint.raw.tsv
// Rows: file line kind old_spec names facade
// kind: import | export-from (a barrel line: DROP) | import-type-node | dynamic | mock | star
// Follows `export ... from` / `export *` chains inside Tovu, so names reached via kernel/index.ts are included.
const ts = require('/Users/la/Programming/jini-terra-base/node_modules/typescript');
const fs = require('fs'); const path = require('path');
const ROOT = process.argv[2];
const W = 'apps/website/src/platform/db/';
const FACADES = new Set([W + 'kernel/port.ts', W + 'kernel/dialect.ts', W + 'migrations/step.ts'].map(f => path.join(ROOT, f)));
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
// `#src/…` is the website's subpath-import alias (8,900+ uses); missing it dropped ~50 importers (sheets-fix2).
const res = (from, spec) => spec.startsWith('.') ? tryFile(path.resolve(path.dirname(from), spec))
  : spec.startsWith('#src/') ? tryFile(path.join(ROOT, 'apps/website/src', spec.slice(5))) : null;
const parsed = new Map();
function parse(f) {
  if (parsed.has(f)) return parsed.get(f);
  const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  parsed.set(f, sf); return sf;
}
// exports map of a non-facade file: name -> [file, name] for export-from; '*' list
function origin(file, name, seen = new Set()) {
  if (FACADES.has(file)) return { file, name };
  const key = file + '#' + name; if (seen.has(key)) return null; seen.add(key);
  const sf = parse(file);
  for (const st of sf.statements) {
    if (!ts.isExportDeclaration(st) || !st.moduleSpecifier) continue;
    const t = res(file, st.moduleSpecifier.text); if (!t) continue;
    if (!st.exportClause) { const o = origin(t, name, seen); if (o) return o; continue; }
    if (ts.isNamedExports(st.exportClause)) for (const el of st.exportClause.elements) {
      if (el.name.text === name) return origin(t, (el.propertyName || el.name).text, seen);
    }
  }
  return null;
}
const out = [];
const rel = f => path.relative(ROOT, f);
for (const f of files) {
  if (FACADES.has(f)) continue;
  let sf; try { sf = parse(f); } catch { continue; }
  const line = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const emit = (n, kind, spec, names, fac) => out.push([rel(f), line(n), kind, spec, names.join(','), [...new Set(fac)].map(x => rel(x).replace(W, '')).join(',')]);
  function handleNamed(st, kind, spec, t, elements, typeOnlyAll) {
    const hit = [], fac = [];
    for (const el of elements) {
      const imported = (el.propertyName || el.name).text;
      const o = origin(t, imported); if (!o) continue;
      const tOnly = typeOnlyAll || el.isTypeOnly;
      const alias = el.propertyName ? ` as ${el.name.text}` : '';
      hit.push(`${tOnly ? 'type ' : ''}${o.name === imported ? imported : imported + '[=' + o.name + ']'}${alias}`); fac.push(o.file);
    }
    if (hit.length) emit(st, kind, spec, hit, fac);
  }
  function visit(n) {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const spec = n.moduleSpecifier.text, t = res(f, spec);
      if (t) {
        const c = n.importClause;
        if (c) {
          if (c.namedBindings && ts.isNamespaceImport(c.namedBindings) && (FACADES.has(t) || origin(t, '__any__') !== undefined)) {
            if (FACADES.has(t)) emit(n, 'namespace', spec, ['*ns:' + c.namedBindings.name.text], [t]);
          } else if (c.namedBindings && ts.isNamedImports(c.namedBindings)) handleNamed(n, 'import', spec, t, c.namedBindings.elements, c.isTypeOnly);
          if (c.name && FACADES.has(t)) emit(n, 'default', spec, ['default'], [t]);
        }
      }
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const spec = n.moduleSpecifier.text, t = res(f, spec);
      if (t) {
        if (!n.exportClause) { if (FACADES.has(t)) emit(n, 'star', spec, ['*'], [t]); }
        else if (ts.isNamedExports(n.exportClause)) handleNamed(n, 'export-from', spec, t, n.exportClause.elements, n.isTypeOnly);
      }
    } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
      const spec = n.argument.literal.text, t = res(f, spec);
      if (t && n.qualifier) { const nm = ts.isIdentifier(n.qualifier) ? n.qualifier.text : n.qualifier.getText(sf).split('.')[0]; const o = origin(t, nm); if (o) emit(n, 'import-type-node', spec, ['type ' + nm], [o.file]); }
    } else if (ts.isCallExpression(n) && n.arguments.length && ts.isStringLiteral(n.arguments[0])) {
      const callee = n.expression.getText(sf);
      if (/^(import|require|vi\.mock|vi\.doMock|vi\.importActual|mock\.module|jest\.mock)$/.test(callee) || n.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const spec = n.arguments[0].text, t = res(f, spec);
        if (t && FACADES.has(t)) emit(n, callee.includes('mock') ? 'mock' : 'dynamic', spec, ['dynamic'], [t]);
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
}
console.log(['file', 'line', 'kind', 'old_spec', 'names', 'facade'].join('\t'));
for (const r of out) console.log(r.join('\t'));
