#!/usr/bin/env node
/* Revision 2 sidecars, built from the TypeScript AST (not regexes). Run from the Tovu CODE worktree root:
 *   node <lanes>/scripts/symbols.cjs <lanes dir>
 * Per sheet (<lane>/<id>.files.tsv must exist; run gen.py first) it writes:
 *   <id>.importers.tsv  symbol-level importer list: direct importers AND importers that reach a moved name
 *                       through a re-exporting barrel (feature index.ts, up to 4 hops), with the imported names.
 *   <id>.tools.tsv      real tool registrations: keys of the `handlers` object literal(s), cross-checked against
 *                       catalog ids and <x>DerivedRisk keys. Nested callbacks (prepare/describe/run) are NOT rows.
 *   <id>.fnsize.tsv     every function over 40 code lines (blank and comment lines not counted, like the eslint gate)
 *                       and each file's total line count.
 */
const fs = require('fs'), path = require('path'), cp = require('child_process');
let ts; try { ts = require('typescript'); } catch { ts = require('/opt/node-tools/node_modules/typescript'); }
const OUT = process.argv[2];
const ALL = cp.execSync('git ls-files apps development scripts packages', { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n')
  .filter(f => /\.(ts|tsx|mts|mjs|js|cjs)$/.test(f) && !f.includes('node_modules'));
const SET = new Set(ALL);
const isTest = p => p.includes('__tests__') || /\.test\.|\.spec\.|\/testing\/|__fixtures__/.test(p);
function resolve(src, spec) {
  let base;
  if (spec.startsWith('#src/')) base = 'apps/website/src/' + spec.slice(5);
  else if (spec.startsWith('@/') && src.startsWith('apps/admin/')) base = 'apps/admin/src/' + spec.slice(2);
  else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(src), spec));
  else return null;
  base = base.replace(/\.(js|mjs|jsx)$/, '');
  for (const c of [base, base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx', base + '.mjs', base + '.js']) if (SET.has(c)) return c;
  return null;
}
const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
const info = new Map(); // file -> { imports, reexports, exports, sf? }
function scan(f, keep) {
  let text; try { text = fs.readFileSync(f, 'utf8'); } catch { return; }
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
  const rec = { imports: [], reexports: [], exports: new Set() };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const names = []; const ic = st.importClause;
      if (ic) { if (ic.name) names.push('default');
        if (ic.namedBindings) { if (ts.isNamespaceImport(ic.namedBindings)) names.push('*'); else for (const e of ic.namedBindings.elements) names.push((e.propertyName || e.name).text); } }
      else names.push('<side-effect>');
      rec.imports.push({ line: lineOf(sf, st.getStart()), spec: st.moduleSpecifier.text, names });
    } else if (ts.isExportDeclaration(st)) {
      if (st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
        const names = st.exportClause && ts.isNamedExports(st.exportClause) ? st.exportClause.elements.map(e => [(e.propertyName || e.name).text, e.name.text]) : '*';
        rec.reexports.push({ line: lineOf(sf, st.getStart()), spec: st.moduleSpecifier.text, names });
      } else if (st.exportClause && ts.isNamedExports(st.exportClause)) for (const e of st.exportClause.elements) rec.exports.add(e.name.text);
    } else if (st.modifiers && st.modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) { if (ts.isIdentifier(d.name)) rec.exports.add(d.name.text); }
      else if (st.name) rec.exports.add(st.name.text);
    }
  }
  if (/mock|import\(/.test(text)) (function walk(n) { // vi.mock / mock.module / dynamic import / importActual
    if (ts.isCallExpression(n) && n.arguments.length && ts.isStringLiteral(n.arguments[0])) {
      const callee = n.expression.getText(sf);
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword) rec.imports.push({ line: lineOf(sf, n.getStart()), spec: n.arguments[0].text, names: ['<dynamic import>'] });
      else if (/(^|\.)(mock|doMock|module|importActual|unmock)$/.test(callee)) rec.imports.push({ line: lineOf(sf, n.getStart()), spec: n.arguments[0].text, names: ['<mock:' + callee + '>'] });
    }
    ts.forEachChild(n, walk);
  })(sf);
  info.set(f, rec); if (keep) rec.sf = sf, rec.text = text;
}
const sheetFiles = {}; // id -> {lane, files[]}
for (const lane of ['K', 'T']) for (const ft of fs.readdirSync(path.join(OUT, lane)).filter(x => x.endsWith('.files.tsv')).sort())
  sheetFiles[ft.replace('.files.tsv', '')] = { lane, files: fs.readFileSync(path.join(OUT, lane, ft), 'utf8').split('\n').slice(1).filter(Boolean).map(l => l.split('\t')[0]) };
const movedAll = new Set(Object.values(sheetFiles).flatMap(s => s.files));
for (const f of ALL) scan(f, movedAll.has(f) || /agent-tools\.ts$/.test(f));
// reverse re-export edges: target -> [{from, names}]
const rex = new Map();
for (const [f, r] of info) for (const e of r.reexports) { const t = resolve(f, e.spec); if (t) (rex.get(t) || rex.set(t, []).get(t)).push({ from: f, names: e.names, line: e.line }); }
const codeLines = (text, a, b) => text.split('\n').slice(a - 1, b).filter(l => { const s = l.trim(); return s && !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*'); }).length;

for (const [id, { lane, files }] of Object.entries(sheetFiles)) {
  const M = new Set(files); const base = path.join(OUT, lane, id);
  // carrier[file] = Map(visibleName -> origin "file#name")
  const carrier = new Map();
  for (const m of M) carrier.set(m, new Map([...(info.get(m)?.exports || [])].map(n => [n, m + '#' + n])));
  let frontier = [...M];
  for (let hop = 0; hop < 4 && frontier.length; hop++) { const next = [];
    for (const t of frontier) for (const e of rex.get(t) || []) { if (M.has(e.from)) continue;
      const src = carrier.get(t); const dst = carrier.get(e.from) || carrier.set(e.from, new Map()).get(e.from); const before = dst.size;
      if (e.names === '*') for (const [n, o] of src) dst.set(n, o); else for (const [orig, vis] of e.names) if (src.has(orig)) dst.set(vis, src.get(orig));
      if (dst.size > before) next.push(e.from); }
    frontier = next; }
  const rows = [];
  for (const [f, r] of info) for (const im of r.imports) { const t = resolve(f, im.spec); if (!t || !carrier.has(t)) continue;
    const avail = carrier.get(t); const special = im.names.filter(n => n === '*' || n.startsWith('<'));
    const hit = im.names.filter(n => avail.has(n));
    if (!hit.length && !special.length) continue; if (!hit.length && special.length && !avail.size) continue;
    rows.push([f, im.line, isTest(f) ? 'test' : 'prod', M.has(f) ? 'moves-too' : M.has(t) ? 'direct' : 'barrel:' + t, im.spec, [...hit, ...special].join(','), [...new Set(hit.map(n => avail.get(n).split('#')[0]))].join(',') || t]); }
  for (const [t, m] of carrier) if (!M.has(t)) for (const e of rex.get([...M].find(x => (rex.get(x) || []).some(y => y.from === t)) || '') || []) if (e.from === t)
    rows.push([t, e.line, 'barrel', 're-export', '-', e.names === '*' ? '*' : e.names.map(x => x[1]).join(','), 'DELETE this re-export line in the Tovu commit (no forwarders)']);
  rows.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]);
  fs.writeFileSync(base + '.importers.tsv', 'importer\tline\tkind\tvia\tspecifier\tnames\torigin_or_action\n' + rows.map(r => r.join('\t')).join('\n') + '\n');
  // tools + fn sizes
  const tools = [], sizes = []; const catalog = new Map(), risk = new Map();
  const dirs = new Set(files.map(f => path.posix.dirname(f)));
  const catFiles = [...info.keys()].filter(f => /agent-tools\.ts$/.test(f) && dirs.has(path.posix.dirname(f)) || (M.has(f) && /tool/.test(f)));
  for (const f of new Set(catFiles)) { const r = info.get(f); if (!r.sf) continue; (function walk(n) {
    if (ts.isObjectLiteralExpression(n)) { const p = Object.fromEntries(n.properties.filter(x => ts.isPropertyAssignment(x) && x.name).map(x => [x.name.getText(r.sf), x.initializer]));
      const idNode = p.id || p.name;
      if (idNode && ts.isStringLiteralLike(idNode) && p.description && (p.inputSchema || p.sideEffects || p.sideEffect)) catalog.set(idNode.text, (p.sideEffects ? p.sideEffects.getText(r.sf) : p.sideEffect ? 'sideEffect(singular!)=' + p.sideEffect.getText(r.sf) : '-').replace(/\s+/g, ' ')); }
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && /DerivedRisk$/.test(n.name.text) && n.initializer) { let o = n.initializer; while (o && (ts.isAsExpression(o) || ts.isSatisfiesExpression(o) || ts.isParenthesizedExpression(o))) o = o.expression;
      if (o && ts.isObjectLiteralExpression(o)) for (const x of o.properties) if (x.name) risk.set(x.name.getText(r.sf).replace(/["']/g, ''), ts.isPropertyAssignment(x) ? x.initializer.getText(r.sf) : '?');
      if (o && ts.isNewExpression(o) && o.arguments && o.arguments[0] && ts.isArrayLiteralExpression(o.arguments[0])) for (const x of o.arguments[0].elements)
        if (ts.isArrayLiteralExpression(x) && x.elements.length === 2) risk.set(x.elements[0].getText(r.sf).replace(/["']/g, ''), x.elements[1].getText(r.sf)); }
    ts.forEachChild(n, walk); })(r.sf); }
  for (const f of files) { const r = info.get(f); if (!r || !r.sf) continue; const sf = r.sf;
    sizes.push([f, '(file)', r.text.split('\n').length - 1, '']);
    (function walk(n, owner) {
      let name = owner;
      if (ts.isFunctionDeclaration(n) && n.name) name = n.name.text;
      else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) name = n.name.text;
      else if ((ts.isPropertyAssignment(n) || ts.isMethodDeclaration(n)) && n.name) name = owner + '.' + n.name.getText(sf).replace(/["']/g, '');
      if ((ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n)) && n.body) {
        const a = lineOf(sf, n.getStart()), b = lineOf(sf, n.getEnd()); const c = codeLines(r.text, a, b); if (c > 40) sizes.push([f, name, c, a + '-' + b]); }
      const isHandlers = (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'handlers') || (ts.isPropertyAssignment(n) && n.name.getText(sf) === 'handlers');
      if (isHandlers && n.initializer) { let o = n.initializer; while (o && (ts.isAsExpression(o) || ts.isSatisfiesExpression(o))) o = o.expression;
        if (o && ts.isObjectLiteralExpression(o)) for (const p of o.properties) {
          if (ts.isSpreadAssignment(p)) { tools.push([f, 'SPREAD ' + p.expression.getText(sf).slice(0, 60).replace(/\s+/g, ' '), lineOf(sf, p.getStart()), lineOf(sf, p.getEnd()), '', 'spread', '', '', '']); continue; }
          const key = p.name ? p.name.getText(sf).replace(/["'\[\]]/g, '') : '?'; const a = lineOf(sf, p.getStart()), b = lineOf(sf, p.getEnd());
          const init = ts.isPropertyAssignment(p) ? p.initializer : p; const wrap = ts.isCallExpression(init) ? init.expression.getText(sf) : ts.isIdentifier(init) ? 'ref:' + init.text : 'inline';
          tools.push([f, key, a, b, codeLines(r.text, a, b), wrap, catalog.has(key) ? 'y' : 'NOT-IN-CATALOG', risk.get(key) || 'NO-RISK-ROW', catalog.get(key) || '']); } }
      ts.forEachChild(n, c => walk(c, name));
    })(sf, path.posix.basename(f)); }
  const wired = new Set(tools.map(t => t[1]));
  for (const [cid, se] of catalog) if (!wired.has(cid)) tools.push(['(catalog only)', cid, '', '', '', 'NOT-WIRED-HERE', 'y', risk.get(cid) || 'NO-RISK-ROW', se]);
  if (tools.some(t => t[0] !== '(catalog only)')) fs.writeFileSync(base + '.tools.tsv', 'file\ttool_id\tfirst_line\tlast_line\tcode_lines\twrapper\tin_catalog\trisk\tsideEffects\n' + tools.map(r => r.join('\t')).join('\n') + '\n');
  fs.writeFileSync(base + '.fnsize.tsv', 'file\tfunction\tcode_lines\tlines\n' + sizes.map(r => r.join('\t')).join('\n') + '\n');
  const real = tools.filter(t => t[5] !== 'spread' && t[5] !== 'NOT-WIRED-HERE');
  console.log(id, 'files', files.length, '| importers direct', rows.filter(r => r[3] === 'direct').length, 'barrel', rows.filter(r => String(r[3]).startsWith('barrel:')).length,
    '| tools', real.length, 'maxHandler', Math.max(0, ...real.map(t => t[4] || 0)), 'catalogOnly', tools.filter(t => t[5] === 'NOT-WIRED-HERE').length,
    '| fn>50:', sizes.filter(s => s[1] !== '(file)' && s[2] > 50).map(s => s[1].split('.').slice(-1)[0] + '=' + s[2]).slice(0, 6).join(' '), '| file>500:', sizes.filter(s => s[1] === '(file)' && s[2] > 500).map(s => path.posix.basename(s[0]) + '=' + s[2]).join(' '));
}
