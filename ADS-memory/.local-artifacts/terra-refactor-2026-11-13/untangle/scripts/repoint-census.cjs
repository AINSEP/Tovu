// Read-only import census for "move + delete, no shells" lanes (owner rule 2026-11-15).
// Usage: node repoint-census.cjs <moves.json> > <lane>.repoint.tsv
// moves.json: { "jini": "/abs/jini", "tovu": "/abs/tovu",
//   "moves": [ { "file": "packages/x/src/a.ts", "names": ["A","B"] | "*", "to": "@jini-ai/core/..." } ],
//   "exclude": ["packages/x/src/a.ts", ...]   // files deleted by the lane (not importers) }
// For every import/re-export/import('…') type in Jini packages/*/src and in the Tovu clone, resolves each
// imported name to the file that DECLARES it (following export-from and export * chains through barrels and
// @jini-ai/* package exports maps). A name whose declaring file+name is in `moves` produces one TSV row:
//   repo  file  old_spec  names  new_spec
// names: comma list; "type " prefix when type-only; "a as b" when aliased. Star re-exports and namespace /
// dynamic imports that reach a moved name are reported as names "*" / "*ns:<n>" / "dynamic" (manual review).
const ts = require('/Users/la/Programming/jini-terra-base/node_modules/typescript');
const fs = require('fs');
const path = require('path');
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const JINI = cfg.jini, TOVU = cfg.tovu;
const moved = new Map(); // abs file -> {names:Set|'*', to}
for (const m of cfg.moves) {
  const abs = path.join(JINI, m.file);
  const prev = moved.get(abs);
  if (prev) { for (const n of m.names) prev.push({ names: new Set([n]), to: m.to }); continue; }
  moved.set(abs, [{ names: m.names === '*' ? '*' : new Set(m.names), to: m.to }]);
}
const excluded = new Set((cfg.exclude || []).map(f => path.join(JINI, f)));
function movedTarget(file, name) {
  const list = moved.get(file); if (!list) return null;
  for (const e of list) if (e.names === '*' || e.names.has(name)) return e.to;
  return null;
}
// package name -> dir + exports
const pkgs = new Map();
for (const d of fs.readdirSync(path.join(JINI, 'packages'))) {
  const pj = path.join(JINI, 'packages', d, 'package.json');
  if (!fs.existsSync(pj)) continue;
  const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
  pkgs.set(j.name, { dir: path.join(JINI, 'packages', d), exports: j.exports || {} });
}
function tryFile(base) {
  const noJs = base.replace(/\.(js|mjs|cjs|jsx)$/, '');
  for (const c of [base, noJs + '.ts', noJs + '.tsx', noJs + '.d.ts', path.join(base, 'index.ts'), path.join(base, 'index.tsx'), path.join(noJs, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}
function distToSrc(dir, rel) {
  const r = rel.replace(/^\.\//, '');
  if (r.startsWith('src/')) return tryFile(path.join(dir, r));
  return tryFile(path.join(dir, r.replace(/^dist\//, 'src/').replace(/\.d\.ts$/, '.ts')));
}
function resolveSpec(from, spec) {
  if (spec.startsWith('.')) return tryFile(path.resolve(path.dirname(from), spec));
  // Tovu website subpath-import alias (sheets-fix2: without it, importers through Tovu barrels were missed)
  if (spec.startsWith('#src/')) return tryFile(path.join(TOVU, 'apps/website/src', spec.slice(5)));
  const m = spec.match(/^(@jini-ai\/[^/]+)(\/.*)?$/);
  if (!m) return null;
  const p = pkgs.get(m[1]); if (!p) return null;
  const key = '.' + (m[2] || '');
  let target = p.exports[key];
  if (!target) {
    for (const [k, v] of Object.entries(p.exports)) {
      if (!k.includes('*')) continue;
      const [pre, post] = k.split('*');
      if (key.startsWith(pre) && key.endsWith(post)) { const mid = key.slice(pre.length, key.length - post.length); target = JSON.parse(JSON.stringify(v).split('*').join(mid)); break; }
    }
  }
  if (!target) return null;
  const rel = typeof target === 'string' ? target : (target.import || target.default || target.types);
  if (typeof rel !== 'string') return null;
  return distToSrc(p.dir, rel);
}
const parsed = new Map();
function parse(file) {
  if (parsed.has(file)) return parsed.get(file);
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const local = new Set(); const imports = new Map(); const reexp = new Map(); const stars = [];
  for (const st of sf.statements) {
    const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) || [] : [];
    const isExp = mods.some(x => x.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isImportDeclaration(st) && st.importClause && ts.isStringLiteral(st.moduleSpecifier)) {
      const nb = st.importClause.namedBindings;
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) imports.set(el.name.text, { spec: st.moduleSpecifier.text, name: (el.propertyName || el.name).text });
    } else if (ts.isExportDeclaration(st)) {
      const spec = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
      if (!st.exportClause) { if (spec) stars.push(spec); }
      else if (ts.isNamedExports(st.exportClause)) for (const el of st.exportClause.elements) {
        const inner = (el.propertyName || el.name).text;
        reexp.set(el.name.text, spec ? { spec, name: inner } : { localRef: inner });
      }
    } else if (isExp) {
      if (st.name && st.name.text) local.add(st.name.text);
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) local.add(d.name.text);
    }
  }
  const r = { sf, text, local, imports, reexp, stars };
  parsed.set(file, r); return r;
}
const memo = new Map();
function origin(file, name, depth = 0) {
  const key = file + '#' + name; if (memo.has(key)) return memo.get(key);
  if (depth > 40) return null; memo.set(key, null);
  let res = null;
  const p = parse(file);
  if (p.local.has(name)) res = { file, name };
  else if (p.reexp.has(name)) {
    const e = p.reexp.get(name);
    if (e.spec) { const f = resolveSpec(file, e.spec); res = f ? origin(f, e.name, depth + 1) : null; }
    else if (p.imports.has(e.localRef)) { const i = p.imports.get(e.localRef); const f = resolveSpec(file, i.spec); res = f ? origin(f, i.name, depth + 1) : null; }
    else res = { file, name: e.localRef };
  } else for (const s of p.stars) { const f = resolveSpec(file, s); if (!f) continue; const o = origin(f, name, depth + 1); if (o) { res = o; break; } }
  memo.set(key, res); return res;
}
const starMemo = new Map();
function starReachesMoved(file, depth = 0) { // does module `file` export (via any chain) a moved name? returns names
  if (starMemo.has(file)) return starMemo.get(file);
  starMemo.set(file, []);
  const out = new Set(); const p = parse(file);
  if (moved.has(file)) { for (const n of p.local) if (movedTarget(file, n)) out.add(n); }
  for (const n of p.reexp.keys()) { const o = origin(file, n); if (o && movedTarget(o.file, o.name)) out.add(n); }
  if (depth < 30) for (const s of p.stars) { const f = resolveSpec(file, s); if (f) for (const n of starReachesMoved(f, depth + 1)) out.add(n); }
  const arr = [...out]; starMemo.set(file, arr); return arr;
}
function walkDir(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'build', 'coverage', '.next', 'out', 'data.nosync', '.turbo'].includes(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(f, acc);
    else if (/\.(ts|tsx|mts|cts)$/.test(e.name) && !e.name.endsWith('.d.ts')) acc.push(f);
  }
  return acc;
}
const roots = [];
for (const d of fs.readdirSync(path.join(JINI, 'packages'))) { const s = path.join(JINI, 'packages', d); if (fs.statSync(s).isDirectory()) roots.push(['jini', s]); }
for (const extra of ['scripts', 'examples']) if (fs.existsSync(path.join(JINI, extra))) roots.push(['jini', path.join(JINI, extra)]);
for (const d of fs.readdirSync(TOVU)) { if (['node_modules', '.git', 'ADS-memory'].includes(d)) continue; const s = path.join(TOVU, d); if (fs.statSync(s).isDirectory()) roots.push(['tovu', s]); }
const movedPkgDirs = new Set([...moved.keys()].map(f => f.split('/src/')[0]));
const movedPkgNames = [...pkgs.entries()].filter(([, v]) => movedPkgDirs.has(v.dir)).map(([k]) => k);
const rows = [];
function rowFor(repo, file, spec, names, to) { rows.push([repo, path.relative(repo === 'jini' ? JINI : TOVU, file), spec, names.join(','), to]); }
for (const [repo, root] of roots) for (const file of walkDir(root, [])) {
  if (excluded.has(file) || moved.has(file) && cfg.movedFilesDeleted) continue;
  const text = fs.readFileSync(file, 'utf8');
  const inMovedPkg = [...movedPkgDirs].some(d => file.startsWith(d + '/'));
  if (!inMovedPkg && !movedPkgNames.some(n => text.includes(n)) && !(cfg.extraNeedles || []).some(n => text.includes(n))) continue;
  const p = parse(file);
  const handle = (spec, elements, typeOnlyAll, isExport) => {
    const target = resolveSpec(file, spec); if (!target) return;
    const byTo = new Map();
    for (const el of elements) {
      const imported = (el.propertyName || el.name).text;
      const o = origin(target, imported); if (!o) continue;
      const to = movedTarget(o.file, o.name); if (!to) continue;
      let s = el.propertyName ? `${imported} as ${el.name.text}` : imported;
      if (o.name !== imported) s += ` [declared ${o.name}]`;
      if (typeOnlyAll || el.isTypeOnly) s = 'type ' + s;
      if (!byTo.has(to)) byTo.set(to, []);
      byTo.get(to).push(s);
    }
    for (const [to, names] of byTo) rowFor(repo, file, (isExport ? 'export-from ' : '') + spec, names, to);
  };
  ts.forEachChild(p.sf, function v(n) {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const ic = n.importClause; const spec = n.moduleSpecifier.text;
      if (ic && ic.namedBindings && ts.isNamedImports(ic.namedBindings)) handle(spec, ic.namedBindings.elements, ic.isTypeOnly, false);
      else if (ic && ic.namedBindings && ts.isNamespaceImport(ic.namedBindings)) { const f = resolveSpec(file, spec); if (f) { const r = starReachesMoved(f); if (r.length) rowFor(repo, file, spec, ['*ns:' + ic.namedBindings.name.text + ' (' + r.length + ' moved names reachable)'], 'MANUAL'); } }
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const spec = n.moduleSpecifier.text;
      if (n.exportClause && ts.isNamedExports(n.exportClause)) handle(spec, n.exportClause.elements, n.isTypeOnly, true);
      else if (!n.exportClause) { const f = resolveSpec(file, spec); if (f) { const r = starReachesMoved(f); if (r.length) rowFor(repo, file, 'export * from ' + spec, ['* (' + r.join(' ') + ')'], 'MANUAL'); } }
    } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
      const spec = n.argument.literal.text; const f = resolveSpec(file, spec);
      if (f && n.qualifier) { const nm = ts.isIdentifier(n.qualifier) ? n.qualifier.text : n.qualifier.left.getText(); const o = origin(f, nm); const to = o && movedTarget(o.file, o.name); if (to) rowFor(repo, file, `import('${spec}')`, ['type ' + nm], to); }
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      const spec = n.arguments[0].text; const f = resolveSpec(file, spec);
      if (f) { const r = starReachesMoved(f); if (r.length) rowFor(repo, file, `await import('${spec}')`, ['dynamic (' + r.length + ' moved names reachable)'], 'MANUAL'); }
    } else if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['vi', 'jest'].includes(n.expression.text)) { /* vi.mock handled below */ }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ['mock', 'doMock'].includes(n.expression.name.text) && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      const spec = n.arguments[0].text; const f = resolveSpec(file, spec);
      if (f && (moved.has(f) || starReachesMoved(f).length)) rowFor(repo, file, `vi.mock('${spec}')`, ['mock'], 'MANUAL');
    }
    ts.forEachChild(n, v);
  });
}
rows.sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]));
console.log(['repo', 'file', 'old_spec', 'names', 'new_spec'].join('\t'));
for (const r of rows) console.log(r.join('\t'));
