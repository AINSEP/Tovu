// R-BARRELS census (wave C, owner ruling d + b: no Tovu re-export shells of Jini, @tovu/sdk included).
// Usage: node rbarrels-census.cjs <jiniRoot> <tovuRoot> <outDir> [--forwarder <tovuFile>:<line> ...]
//   Roots are plain trees (e.g. `git archive integ/wave-b` extracts); nothing is written outside outDir.
// A Tovu "Jini re-export" is an export element whose name, followed through Tovu files only, leaves Tovu
// through a `@jini-ai/...` specifier (export-from, `import {X} ...; export {X}`, `export * from '@jini-ai/..'`).
// Outputs (outDir):
//   rows.tsv      repo file old_spec names new_spec rename phase note   (applier rows: importer moves, then DROPs)
//   hand.tsv      hand edits the applier cannot do (local `export { X }` of an imported Jini binding,
//                 namespace/dynamic imports and vi.mock of a barrel that reaches a Jini name, empty files)
//   stats.txt     counts
// Importer rows point at the Jini specifier written at the LAST Tovu hop (the barrel author's choice) and
// the name exported there; a different name becomes a rename `Local->JiniName`.
const ts = require('/Users/la/Programming/jini-terra-base/node_modules/typescript');
const fs = require('fs');
const path = require('path');
const [JINI, TOVU, OUT] = process.argv.slice(2, 5).map((p) => path.resolve(p));
const forwarders = []; // extra Tovu->Tovu forwarders named by the coordinator: file:line
for (let i = 5; i < process.argv.length; i++) if (process.argv[i] === '--forwarder') forwarders.push(process.argv[++i]);
fs.mkdirSync(OUT, { recursive: true });

const isTest = (rel) => /(^|\/)(__tests__|tests?|e2e|__mocks__)\//.test(rel) || /\.(test|spec)\.[cm]?tsx?$/.test(rel) || /test-utils|testing\//.test(rel);
function tryFile(base) {
  const noJs = base.replace(/\.(js|mjs|cjs|jsx)$/, '');
  for (const c of [base, noJs + '.ts', noJs + '.tsx', noJs + '.mts', noJs + '.d.ts', path.join(base, 'index.ts'), path.join(base, 'index.tsx'), path.join(noJs, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}
// ---- Jini package exports ----
const jpkgs = new Map();
for (const d of fs.readdirSync(path.join(JINI, 'packages'))) {
  const pj = path.join(JINI, 'packages', d, 'package.json');
  if (!fs.existsSync(pj)) continue;
  const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
  jpkgs.set(j.name, { dir: path.join(JINI, 'packages', d), exports: j.exports || {} });
}
function distToSrc(dir, rel) {
  const r = rel.replace(/^\.\//, '');
  if (r.startsWith('src/')) return tryFile(path.join(dir, r));
  return tryFile(path.join(dir, r.replace(/^dist\//, 'src/').replace(/\.d\.ts$/, '.ts')));
}
function exportTarget(p, key) {
  let target = p.exports[key];
  if (!target) for (const [k, v] of Object.entries(p.exports)) {
    if (!k.includes('*')) continue;
    const [pre, post] = k.split('*');
    if (key.startsWith(pre) && key.endsWith(post)) { const mid = key.slice(pre.length, key.length - post.length); target = JSON.parse(JSON.stringify(v).split('*').join(mid)); break; }
  }
  if (!target) return null;
  const rel = typeof target === 'string' ? target : (target.import || target.default || target.types);
  return typeof rel === 'string' ? distToSrc(p.dir, rel) : null;
}
function resolveJini(spec) {
  const m = spec.match(/^(@jini-ai\/[^/]+)(\/.*)?$/);
  const p = m && jpkgs.get(m[1]);
  return p ? exportTarget(p, '.' + (m[2] || '')) : null;
}
// ---- Tovu resolution ----
const tpkgs = new Map();
for (const d of ['packages/contracts', 'packages/sdk']) {
  const pj = path.join(TOVU, d, 'package.json');
  if (fs.existsSync(pj)) { const j = JSON.parse(fs.readFileSync(pj, 'utf8')); tpkgs.set(j.name, { dir: path.join(TOVU, d), exports: j.exports || {} }); }
}
const ADMIN_ALIAS = {
  '@tovu/headless': 'apps/website/src/contracts/headless/index.ts',
  '@tovu/theme-layout': 'apps/website/src/features/theme/theme-layout.ts',
  '@tovu/publish-content-ui': 'apps/website/src/features/publish-content/ui/index.ts',
  '@tovu/assistant-run-events': 'apps/website/src/contracts/core/assistant-run-events.ts',
};
/** -> {repo:'tovu'|'jini', file} | null */
function resolve(from, spec) {
  if (spec.startsWith('@jini-ai/')) { const f = resolveJini(spec); return f ? { repo: 'jini', file: f } : null; }
  const inJini = from.startsWith(JINI + '/');
  let f = null;
  if (spec.startsWith('.')) f = tryFile(path.resolve(path.dirname(from), spec));
  else if (inJini) return null;
  else if (spec.startsWith('#src/')) f = tryFile(path.join(TOVU, 'apps/website/src', spec.slice(5)));
  else if (spec.startsWith('@/') && from.startsWith(path.join(TOVU, 'apps/admin') + '/')) f = tryFile(path.join(TOVU, 'apps/admin/src', spec.slice(2)));
  else if (ADMIN_ALIAS[spec]) f = tryFile(path.join(TOVU, ADMIN_ALIAS[spec]));
  else { const m = spec.match(/^(@tovu\/[^/]+)(\/.*)?$/); const p = m && tpkgs.get(m[1]); if (p) f = exportTarget(p, '.' + (m[2] || '')); }
  return f ? { repo: inJini ? 'jini' : 'tovu', file: f } : null;
}
// ---- parse ----
const parsed = new Map();
function parse(file) {
  if (parsed.has(file)) return parsed.get(file);
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const local = new Set(); const imports = new Map(); const reexp = new Map(); const stars = [];
  for (const st of sf.statements) {
    const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) || [] : [];
    const isExp = mods.some((x) => x.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isImportDeclaration(st) && st.importClause && ts.isStringLiteral(st.moduleSpecifier)) {
      const nb = st.importClause.namedBindings;
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) imports.set(el.name.text, { spec: st.moduleSpecifier.text, name: (el.propertyName || el.name).text });
    } else if (ts.isExportDeclaration(st)) {
      const spec = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
      if (!st.exportClause) { if (spec) stars.push({ spec, node: st }); }
      else if (ts.isNamedExports(st.exportClause)) for (const el of st.exportClause.elements) {
        const inner = (el.propertyName || el.name).text;
        reexp.set(el.name.text, spec ? { spec, name: inner, node: st, el } : { localRef: inner, node: st, el });
      }
    } else if (isExp) {
      if (st.name && st.name.text) local.add(st.name.text);
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) local.add(d.name.text);
    }
  }
  const r = { sf, text, local, imports, reexp, stars };
  parsed.set(file, r);
  return r;
}
// Does a Jini module export `name` (any chain)?
const jMemo = new Map();
function jiniHas(file, name, depth = 0) {
  const k = file + '#' + name; if (jMemo.has(k)) return jMemo.get(k);
  jMemo.set(k, false); if (depth > 40) return false;
  const p = parse(file); let res = false;
  if (p.local.has(name) || p.reexp.has(name)) res = true;
  else for (const s of p.stars) { const t = resolve(file, s.spec); if (t && jiniHas(t.file, name, depth + 1)) { res = true; break; } }
  jMemo.set(k, res); return res;
}
// Trace a name exported by a Tovu file. -> null (Tovu-declared / unknown) | {spec, name, hops:[{file, kind, node, el}]}
const tMemo = new Map();
const reachMemo = new Map();
function trace(file, name, depth = 0) {
  const k = file + '#' + name; if (tMemo.has(k)) return tMemo.get(k);
  tMemo.set(k, null); if (depth > 40) return null;
  const p = parse(file); let res = null;
  const via = (spec, inner, hop) => {
    if (spec.startsWith('@jini-ai/')) return { spec, name: inner, hops: [hop] };
    const t = resolve(file, spec); if (!t || t.repo !== 'tovu') return null;
    const r = trace(t.file, inner, depth + 1); return r ? { ...r, hops: [hop, ...r.hops] } : null;
  };
  if (p.local.has(name)) res = null;
  else if (p.reexp.has(name)) {
    const e = p.reexp.get(name);
    if (e.spec) res = via(e.spec, e.name, { file, kind: 'export-from', spec: e.spec, node: e.node, el: e.el, name });
    else if (p.imports.has(e.localRef)) { const i = p.imports.get(e.localRef); res = via(i.spec, i.name, { file, kind: 'local-export', spec: i.spec, node: e.node, el: e.el, name }); }
  } else for (const s of p.stars) {
    if (s.spec.startsWith('@jini-ai/')) { const t = resolveJini(s.spec); if (t && jiniHas(t, name)) { res = { spec: s.spec, name, hops: [{ file, kind: 'star', spec: s.spec, node: s.node, name }] }; break; } }
    else { const t = resolve(file, s.spec); if (!t || t.repo !== 'tovu') continue; const r = trace(t.file, name, depth + 1); if (r) { res = { ...r, hops: [{ file, kind: 'tovu-star', spec: s.spec, node: s.node, name }, ...r.hops] }; break; } if (parse(t.file).local.has(name) || parse(t.file).reexp.has(name)) break; }
  }
  tMemo.set(k, res); return res;
}
// ---- walk Tovu ----
function walkDir(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'build', 'coverage', '.next', 'out', 'data.nosync', '.turbo', 'ADS-memory'].includes(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(f, acc);
    else if (/\.(ts|tsx|mts|cts)$/.test(e.name) && !e.name.endsWith('.d.ts')) acc.push(f);
  }
  return acc;
}
const files = walkDir(TOVU, []);
const rel = (f) => path.relative(TOVU, f);
const lineOf = (p, node) => p.sf.getLineAndCharacterOfPosition(node.getStart(p.sf)).line + 1;
const rows = []; const drops = []; const hand = [];
const stat = { barrelFiles: new Set(), barrelFilesNonTest: new Set(), stmts: new Set(), stmtsNonTest: new Set(), jiniStar: 0, localExport: 0 };
// 1. Barrel census: every Tovu export element that leaves Tovu through @jini-ai (directly or via Tovu hops).
const dropByStmt = new Map(); // file|pos -> {file, spec, kind, names:[], line}
for (const f of files) {
  const p = parse(f); const r = rel(f);
  for (const [name, e] of p.reexp) {
    const t = trace(f, name); if (!t) continue;
    const key = r + '|' + e.node.pos;
    if (!dropByStmt.has(key)) dropByStmt.set(key, { file: r, spec: e.spec, local: !e.spec, typeOnly: e.node.isTypeOnly, names: [], line: lineOf(p, e.node) });
    dropByStmt.get(key).names.push((e.el.isTypeOnly ? 'type ' : '') + (e.el.propertyName ? `${e.el.propertyName.text} as ${name}` : name));
  }
  for (const s of p.stars) if (s.spec.startsWith('@jini-ai/')) {
    const key = r + '|' + s.node.pos;
    dropByStmt.set(key, { file: r, spec: s.spec, star: true, names: ['*'], line: lineOf(p, s.node) });
  }
}
for (const d of dropByStmt.values()) {
  stat.barrelFiles.add(d.file); stat.stmts.add(d.file + ':' + d.line);
  if (!isTest(d.file)) { stat.barrelFilesNonTest.add(d.file); stat.stmtsNonTest.add(d.file + ':' + d.line); }
  if (d.star) { stat.jiniStar++; drops.push(['tovu', d.file, 'export * from ' + d.spec, '*', 'DROP', '', 'wave', `R-BARRELS: Jini star re-export, line ${d.line}`]); continue; }
  const names = d.names.map((n) => (d.typeOnly && !n.startsWith('type ') ? 'type ' + n : n));
  if (d.local) { stat.localExport++; hand.push([d.file, d.line, 'local-export', names.join(','), 'delete these names from the local `export { ... }` (the import stays only if the file still uses it; else delete it too)']); continue; }
  const jini = d.spec.startsWith('@jini-ai/');
  drops.push(['tovu', d.file, 'export-from ' + d.spec, names.join(','), 'DROP', '', 'wave', `R-BARRELS: ${jini ? 'Jini' : 'Tovu-chain (Jini name)'} re-export, line ${d.line}`]);
}
// 2. Importers.
const groups = new Map();
function addRow(f, oldSpec, nameStr, t, origName) {
  const key = [rel(f), oldSpec, t.spec].join('\t');
  if (!groups.has(key)) groups.set(key, { names: [], renames: [], file: rel(f), oldSpec, newSpec: t.spec });
  const g = groups.get(key); g.names.push(nameStr);
  if (t.name !== origName && !g.renames.includes(`${origName}->${t.name}`)) g.renames.push(`${origName}->${t.name}`);
}
for (const f of files) {
  const p = parse(f); const r = rel(f);
  const handle = (spec, elements, typeAll, isExport) => {
    const tgt = resolve(f, spec); if (!tgt || tgt.repo !== 'tovu') return;
    for (const el of elements) {
      const imported = (el.propertyName || el.name).text;
      const t = trace(tgt.file, imported); if (!t) continue;
      if (isExport) continue; // export-from of a Jini-traced name = DROP row (step 1)
      let s = el.propertyName ? `${imported} as ${el.name.text}` : imported;
      if (typeAll || el.isTypeOnly) s = 'type ' + s;
      addRow(f, spec, s, t, imported);
    }
  };
  ts.forEachChild(p.sf, function v(n) {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const ic = n.importClause; const spec = n.moduleSpecifier.text;
      if (ic && ic.namedBindings && ts.isNamedImports(ic.namedBindings)) handle(spec, ic.namedBindings.elements, ic.isTypeOnly, false);
      else if (ic && ic.namedBindings && ts.isNamespaceImport(ic.namedBindings)) { const t = resolve(f, spec); if (t && t.repo === 'tovu' && reaches(t.file)) { const ns = ic.namedBindings.name.text; const used = jiniUses(t.file, nsAccesses(p.sf, ns)); if (used.length) hand.push([r, lineOf(p, n), 'namespace-import', `* as ${ns} from '${spec}'`, `${ns}.{${used.join(', ')}} are Jini names: import them from ${[...new Set(used.map((u) => trace(t.file, u).spec))].join(' / ')} and use them bare`]); } }
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) && n.exportClause && ts.isNamedExports(n.exportClause)) {
      handle(n.moduleSpecifier.text, n.exportClause.elements, n.isTypeOnly, true);
    } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal) && n.qualifier) {
      const spec = n.argument.literal.text; const tgt = resolve(f, spec);
      const nm = ts.isIdentifier(n.qualifier) ? n.qualifier.text : leftmost(n.qualifier).text;
      const t = tgt && tgt.repo === 'tovu' ? trace(tgt.file, nm) : null;
      if (t) addRow(f, `import('${spec}')`, 'type ' + nm, t, nm);
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      const spec = n.arguments[0].text; const t = resolve(f, spec);
      if (t && t.repo === 'tovu' && reaches(t.file)) { const names = dynNames(n); const used = names ? jiniUses(t.file, names) : null; if (!used || used.length) hand.push([r, lineOf(p, n), 'dynamic-import', `import('${spec}')`, used ? `reads Jini names {${used.join(', ')}}: take them from ${[...new Set(used.map((u) => trace(t.file, u).spec))].join(' / ')}` : 'names read could not be determined: check by hand']); }
    }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && ['vi', 'jest'].includes(n.expression.expression.text) && ['mock', 'doMock'].includes(n.expression.name.text) && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      const spec = n.arguments[0].text; const t = resolve(f, spec);
      if (t && t.repo === 'tovu' && reaches(t.file)) { const keys = mockKeys(n); const used = keys ? jiniUses(t.file, keys) : null; if (used === null || used.length) hand.push([r, lineOf(p, n), 'vi.mock', `${n.expression.name.text}('${spec}')`, used ? `factory supplies Jini names {${used.join(', ')}} that the code under test will import from ${[...new Set(used.map((u) => trace(t.file, u).spec))].join(' / ')}: move them to a vi.mock of that spec` : 'factory shape not readable: check whether it supplies Jini names']); }
    }
    ts.forEachChild(n, v);
  });
}

function jiniUses(barrel, names) { return [...new Set(names)].filter((x) => trace(barrel, x)).sort(); }
function nsAccesses(sf, ns) { const out = []; (function w(n) { if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === ns) out.push(n.name.text); if (ts.isQualifiedName(n) && ts.isIdentifier(n.left) && n.left.text === ns) out.push(n.right.text); ts.forEachChild(n, w); })(sf); return out; }
function dynNames(call) { // names read from `await import(x)`; null = unknown
  let n = call.parent; if (ts.isAwaitExpression(n)) n = n.parent; while (ts.isParenthesizedExpression(n)) n = n.parent;
  if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name)) return n.name.elements.map((e) => (e.propertyName || e.name).getText());
  if (ts.isPropertyAccessExpression(n)) return [n.name.text];
  if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) { const id = n.name.text; const sf = call.getSourceFile(); const acc = nsAccesses(sf, id); return acc.length ? acc : null; }
  if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'then') return null;
  return null;
}
function mockKeys(call) { // property names a vi.mock factory returns; [] = no factory (automock: keys = all exports, Jini ones included)
  const fac = call.arguments[1]; if (!fac) return null;
  const keys = []; let spread = false;
  (function w(n) { if (ts.isObjectLiteralExpression(n)) for (const pr of n.properties) { if (ts.isSpreadAssignment(pr)) spread = true; else if (pr.name && (ts.isIdentifier(pr.name) || ts.isStringLiteral(pr.name))) keys.push(pr.name.text); } ts.forEachChild(n, w); })(fac);
  return keys;
}
function leftmost(q) { return ts.isQualifiedName(q) ? leftmost(q.left) : q; }
function reaches(file) { // does this Tovu module export any Jini-traced name?
  if (reachMemo.has(file)) return reachMemo.get(file);
  reachMemo.set(file, false);
  const p = parse(file); let res = [...p.reexp.keys()].some((n) => trace(file, n)) || p.stars.some((s) => s.spec.startsWith('@jini-ai/'));
  if (!res) for (const s of p.stars) { const t = resolve(file, s.spec); if (t && t.repo === 'tovu' && reaches(t.file)) { res = true; break; } }
  reachMemo.set(file, res); return res;
}
// 3. Coordinator-named Tovu->Tovu forwarders (not Jini names): importers move to the forwarded Tovu module.
for (const fw of forwarders) {
  const [fr, ln] = fw.split(':'); const ff = path.join(TOVU, fr); const p = parse(ff);
  for (const [name, e] of p.reexp) {
    if (!e.spec || lineOf(p, e.node) !== Number(ln) || e.spec.startsWith('@jini-ai/')) continue;
    const real = resolve(ff, e.spec); if (!real) continue;
    drops.push(['tovu', fr, 'export-from ' + e.spec, name, 'DROP', '', 'wave', `R-BARRELS: Tovu forwarder (coordinator 2026-11-15), line ${ln}`]);
    for (const f of files) {
      const q = parse(f);
      for (const st of q.sf.statements) {
        if (!(ts.isImportDeclaration(st) && st.importClause && st.importClause.namedBindings && ts.isNamedImports(st.importClause.namedBindings))) continue;
        const spec = st.moduleSpecifier.text; const t = resolve(f, spec); if (!t || t.file !== ff) continue;
        for (const el of st.importClause.namedBindings.elements) {
          if ((el.propertyName || el.name).text !== e.name && (el.propertyName || el.name).text !== name) continue;
          let to = path.relative(path.dirname(f), real.file).replace(/\.tsx?$/, '.js'); if (!to.startsWith('.')) to = './' + to;
          if (spec.startsWith('#src/')) to = '#src/' + path.relative(path.join(TOVU, 'apps/website/src'), real.file).replace(/\.tsx?$/, '');
          const s = (st.importClause.isTypeOnly || el.isTypeOnly ? 'type ' : '') + (el.propertyName ? `${el.propertyName.text} as ${el.name.text}` : el.name.text);
          rows.push(['tovu', rel(f), spec, s, to, name !== e.name ? `${name}->${e.name}` : '', 'wave', 'R-BARRELS: Tovu forwarder importer']);
        }
      }
    }
  }
}
// 3b. Alias forwarders the applier cannot see: `export type A = B;` / `export const A = B;` where B is a Jini binding
// (imported from @jini-ai, or from a Tovu barrel that re-exports it). Hand items; their importers are listed too.
const aliasFw = [];
for (const f of files) {
  const p = parse(f); const r = rel(f);
  const jiniBinding = (id) => { const i = p.imports.get(id); if (!i) return null; if (i.spec.startsWith('@jini-ai/')) return { spec: i.spec, name: i.name }; const t = resolve(f, i.spec); return t && t.repo === 'tovu' ? trace(t.file, i.name) : null; };
  for (const st of p.sf.statements) {
    const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) || [] : [];
    if (!mods.some((x) => x.kind === ts.SyntaxKind.ExportKeyword)) continue;
    let a = null, b = null;
    if (ts.isTypeAliasDeclaration(st) && !st.typeParameters && ts.isTypeReferenceNode(st.type) && ts.isIdentifier(st.type.typeName) && !st.type.typeArguments) { a = st.name.text; b = st.type.typeName.text; }
    else if (ts.isVariableStatement(st) && st.declarationList.declarations.length === 1) { const d = st.declarationList.declarations[0]; if (ts.isIdentifier(d.name) && d.initializer && ts.isIdentifier(d.initializer) && !d.type) { a = d.name.text; b = d.initializer.text; } }
    if (!a) continue;
    const j = jiniBinding(b); if (!j) continue;
    aliasFw.push({ file: r, abs: f, line: lineOf(p, st), a, j });
  }
}
for (const fw of aliasFw) {
  const users = [];
  for (const f of files) { const q = parse(f); for (const [, i] of q.imports) { if (i.name !== fw.a) continue; const t = resolve(f, i.spec); if (t && t.file === fw.abs) users.push(rel(f)); } }
  hand.push([fw.file, fw.line, 'alias-forwarder', `${fw.a} = ${fw.j.name} (${fw.j.spec})`, `delete the alias; uses in this file and importers [${[...new Set(users)].join(' ')}] take ${fw.j.name} from ${fw.j.spec} (rename ${fw.a}->${fw.j.name} unless a local name clashes)`]);
}
// 3c. Files left with no statements but imports after the DROP rows and local-export hand edits: delete them (hand).
const droppedNames = new Map();
for (const d of dropByStmt.values()) { if (!droppedNames.has(d.file)) droppedNames.set(d.file, new Map()); droppedNames.get(d.file).set(d.line, d.star ? Infinity : d.names.length); }
for (const [fr, byLine] of droppedNames) {
  const p = parse(path.join(TOVU, fr)); let left = 0;
  for (const st of p.sf.statements) {
    if (ts.isImportDeclaration(st)) continue;
    if (ts.isExportDeclaration(st)) { const n = byLine.get(lineOf(p, st)); const total = st.exportClause && ts.isNamedExports(st.exportClause) ? st.exportClause.elements.length : Infinity; if (n !== undefined && (n === Infinity || n >= total)) continue; }
    left++;
  }
  if (left === 0) {
    const users = files.filter((f) => { const q = parse(f); return [...q.sf.statements].some((st) => (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) && (() => { const t = resolve(f, st.moduleSpecifier.text); return t && t.file === path.join(TOVU, fr); })()); }).map(rel);
    hand.push([fr, 0, 'empty-file', 'only Jini re-exports', `after the applier: git rm it if nothing but imports/comments remain; remaining references: [${users.join(' ')}] (each must be gone after the rows; a leftover = STOP)`]);
  }
}
// 4. Package deps: does the importer's package declare the Jini package?
function pkgOf(f) { let d = path.dirname(f); while (d.startsWith(TOVU)) { const pj = path.join(d, 'package.json'); if (fs.existsSync(pj) && !d.includes('__tests__')) return pj; d = path.dirname(d); } return path.join(TOVU, 'package.json'); }
const depCache = new Map();
function deps(pj) { if (!depCache.has(pj)) { const j = JSON.parse(fs.readFileSync(pj, 'utf8')); depCache.set(pj, new Set(Object.keys({ ...j.dependencies, ...j.devDependencies, ...j.peerDependencies }))); } return depCache.get(pj); }
const missingDeps = new Map();
for (const g of groups.values()) {
  const pkg = g.newSpec.match(/^@jini-ai\/[^/]+/)[0]; const pj = pkgOf(path.join(TOVU, g.file));
  const note = ['R-BARRELS importer'];
  if (!deps(pj).has(pkg)) { note.push(`DEP: ${rel(pj)} lacks ${pkg}`); const k = rel(pj) + ' ' + pkg; missingDeps.set(k, (missingDeps.get(k) || 0) + 1); }
  rows.push(['tovu', g.file, g.oldSpec, g.names.join(','), g.newSpec, g.renames.join(','), 'wave', note.join('; ')]);
}
rows.sort((a, b) => (a[1] + '\t' + a[2]).localeCompare(b[1] + '\t' + b[2]));
drops.sort((a, b) => a[1].localeCompare(b[1]));
const head = ['repo', 'file', 'old_spec', 'names', 'new_spec', 'rename', 'phase', 'note'];
fs.writeFileSync(path.join(OUT, 'rows.tsv'), [head, ...rows, ...drops].map((r) => r.join('\t')).join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'hand.tsv'), [['file', 'line', 'kind', 'what', 'do'], ...hand.sort((a, b) => a[0].localeCompare(b[0]))].map((r) => r.join('\t')).join('\n') + '\n');
const importerFiles = new Set(rows.map((r) => r[1]));
const lines = [
  `barrel files (any): ${stat.barrelFiles.size}; non-test: ${stat.barrelFilesNonTest.size}`,
  `re-export statements (any): ${stat.stmts.size}; non-test: ${stat.stmtsNonTest.size}; jini star: ${stat.jiniStar}; local export {X}: ${stat.localExport}`,
  `importer rows: ${rows.length} in ${importerFiles.size} files; drop rows: ${drops.length}; hand items: ${hand.length}`,
  `renamed importer rows: ${rows.filter((r) => r[5]).length}`,
  'missing deps (package Jini-pkg: rows):', ...[...missingDeps].map(([k, v]) => `  ${k}: ${v}`),
];
fs.writeFileSync(path.join(OUT, 'stats.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
