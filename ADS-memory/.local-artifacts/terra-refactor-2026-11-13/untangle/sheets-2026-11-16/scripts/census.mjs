// Read-only re-census of every Jini package-to-package import (2026-11-16 sheets).
// Same file set and classification as ../../scripts/edges.mjs (src/ only, no __tests__, no *.test.*;
// type-only, inline import('x') types, dynamic import()/require and CSS @import all count),
// plus: (a) TypeScript is loaded from the Jini root OR the global install, (b) each site is joined
// back to the 2026-11-15 census (EDGES-sites.tsv) by file+spec to recover its fix + contract lane,
// (c) each site gets its R lane by the scripts/lanes.py owner rule, (d) --tests adds a test-file census.
// Usage: node census.mjs <jini-root> <untangle-dir> <out-dir> [--tests]
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';
const [root, untangle, out, flag] = process.argv.slice(2);
let ts;
try { ts = createRequire(join(root, 'package.json'))('typescript'); }
catch { ts = createRequire(join(execSync('npm root -g').toString().trim(), 'x.js'))('typescript'); }
mkdirSync(out, { recursive: true });
const BASE = new Set(['core', 'protocol']);
function packages(dir) {
  const res = [];
  (function visit(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory() || ['node_modules', 'dist', '.git'].includes(e.name)) continue;
      const c = join(d, e.name); const m = join(c, 'package.json');
      if (existsSync(m)) { const j = JSON.parse(readFileSync(m, 'utf8')); if (j.name?.startsWith('@jini-ai/')) res.push({ dir: c, m: j }); }
      if (!['src', 'docs'].includes(e.name)) visit(c);
    }
  })(dir);
  return res;
}
const isTest = p => /(^|\/)__tests__\//.test(p) || /\.test\./.test(p);
function files(dir) {
  const r = [];
  (function v(d) {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git'].includes(e.name)) continue;
      const c = join(d, e.name);
      if (e.isDirectory()) v(c); else if (/\.(ts|tsx|mts|cts|css)$/.test(e.name)) r.push(c);
    }
  })(join(dir, 'src'));
  return r.sort();
}
const pk = packages(join(root, 'packages'));
const sites = [], testSites = [];
for (const { dir, m } of pk) {
  const owner = m.name.slice(9);
  for (const f of files(dir)) {
    const sp = relative(dir, f); const rel = relative(root, f); const test = isTest(sp);
    if (test && flag !== '--tests') continue;
    const src = readFileSync(f, 'utf8'); const loc = src.split('\n').length;
    const isReactFile = f.endsWith('.tsx') || /(^|\/)react(\/|$)/.test(sp) || /embed-widget\/react/.test(sp);
    const push = (spec, line, kind, names) => {
      if (!spec.startsWith('@jini-ai/')) return;
      const target = spec.slice(9).split('/')[0];
      if (target === owner) return;
      (test ? testSites : sites).push({ owner, target, spec, file: rel, line, kind, names, loc });
    };
    if (f.endsWith('.css')) { src.split('\n').forEach((l, i) => { const mm = l.match(/@import\s+(?:url\()?["']([^"']+)["']/); if (mm) push(mm[1], i + 1, 'css', ''); }); continue; }
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const lineOf = n => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
    (function visit(n) {
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text; let typeOnly = false; const names = [];
        if (ts.isImportDeclaration(n)) {
          const c = n.importClause; const nb = c?.namedBindings;
          if (c?.isTypeOnly) typeOnly = true;
          else if (c) { const el = nb && ts.isNamedImports(nb) ? nb.elements : []; typeOnly = !c.name && nb && ts.isNamedImports(nb) && el.length > 0 && el.every(e => e.isTypeOnly); if (c.name) names.push(c.name.text); if (nb && ts.isNamespaceImport(nb)) names.push('* as ' + nb.name.text); }
          if (nb && ts.isNamedImports(nb)) names.push(...nb.elements.map(e => (e.propertyName ?? e.name).text));
        } else {
          typeOnly = n.isTypeOnly || (n.exportClause && ts.isNamedExports(n.exportClause) && n.exportClause.elements.length > 0 && n.exportClause.elements.every(e => e.isTypeOnly));
          if (n.exportClause && ts.isNamedExports(n.exportClause)) names.push(...n.exportClause.elements.map(e => (e.propertyName ?? e.name).text)); else names.push('*');
        }
        const kind = spec.endsWith('.css') ? 'css' : typeOnly ? 'type' : (isReactFile || /\/react(\/|$)/.test(spec)) ? 'react' : 'value';
        push(spec, lineOf(n), kind + (ts.isExportDeclaration(n) ? '+reexport' : ''), names.join(','));
      }
      if (ts.isCallExpression(n) && n.arguments[0] && ts.isStringLiteral(n.arguments[0]) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require')))
        push(n.arguments[0].text, lineOf(n), (isReactFile ? 'react' : 'value') + '+dynamic', '');
      // vi.mock('@jini-ai/x') in tests: counted as its own kind so G-TESTS can see it
      if (test && ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && /^(mock|doMock)$/.test(n.expression.name.text) && n.arguments[0] && ts.isStringLiteral(n.arguments[0]))
        push(n.arguments[0].text, lineOf(n), 'vi.mock', '');
      if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) push(n.argument.literal.text, lineOf(n), 'type+inline', n.qualifier ? n.qualifier.getText() : '');
      ts.forEachChild(n, visit);
    })(sf);
  }
}
// R lane by owner rule (scripts/lanes.py)
function rlane(o, f) {
  if (['server', 'cli', 'sqlite', 'infra'].includes(o)) return 'R13';
  if (o === 'daemon') return f.includes('/src/http/') ? 'R7' : 'R8';
  if (o === 'cms' || o === 'cms-forms') return 'R9';
  if (o === 'provider-plugins') return 'R12';
  if (o === 'admin') return (f.includes('/react/') || f.endsWith('.tsx')) ? 'R1' : 'R2';
  if (o === 'user-management') return 'R3';
  if (o === 'chat') return 'R4';
  if (o === 'ui') return 'R5';
  if (o === 'commerce') return 'R6';
  if (o === 'agent-runtime' || o === 'analytics') return 'R10';
  return 'R11';
}
// join to the 2026-11-15 census
const old = new Map(); const oldPairs = new Map();
const oldPath = join(untangle, 'EDGES-sites.tsv');
if (existsSync(oldPath)) for (const l of readFileSync(oldPath, 'utf8').split('\n').slice(1)) {
  const c = l.split('\t'); if (c.length < 11) continue;
  if (c[8] === 'yes') continue;
  old.set(c[4] + '\t' + c[2], { fix: c[9], lane: c[10] });
  oldPairs.set(c[0] + '→' + c[1], (oldPairs.get(c[0] + '→' + c[1]) ?? 0) + 1);
}
const bad = sites.filter(s => !BASE.has(s.target));
const rows = bad.map(s => { const o = old.get(s.file + '\t' + s.spec); return { ...s, fix: o?.fix ?? 'NEW-SINCE-11-15', clane: o?.lane ?? 'NONE', rlane: rlane(s.owner, s.file) }; });
writeFileSync(join(out, 'CENSUS-sites.tsv'), 'owner\ttarget\tspec\tkind\tfile\tline\tfile_loc\tnames\tfix_11_15\tclane_11_15\trlane\n' + rows.map(r => [r.owner, r.target, r.spec, r.kind, r.file, r.line, r.loc, r.names, r.fix, r.clane, r.rlane].join('\t')).join('\n') + '\n');
const pairs = new Map();
for (const r of rows) { const k = r.owner + '→' + r.target; const p = pairs.get(k) ?? { sites: 0, files: new Set(), rl: new Set(), cl: new Set(), type: 0 }; p.sites++; p.files.add(r.file); p.rl.add(r.rlane); p.cl.add(r.clane); if (r.kind.startsWith('type')) p.type++; pairs.set(k, p); }
writeFileSync(join(out, 'CENSUS-pairs.tsv'), 'pair\tsites\tfiles\ttype_only_sites\trlanes\tclanes_11_15\tsites_11_15\n' + [...pairs.entries()].sort().map(([k, p]) => [k, p.sites, p.files.size, p.type, [...p.rl].join(','), [...p.cl].join(','), oldPairs.get(k) ?? 0].join('\t')).join('\n') + '\n');
const gone = [...oldPairs.keys()].filter(k => !pairs.has(k)).sort();
writeFileSync(join(out, 'CENSUS-pairs-gone.tsv'), 'pair\tsites_11_15\n' + gone.map(k => k + '\t' + oldPairs.get(k)).join('\n') + '\n');
const man = [];
for (const { m } of pk) for (const [field, obj] of [['dependencies', m.dependencies], ['peerDependencies', m.peerDependencies], ['devDependencies', m.devDependencies]])
  for (const n of Object.keys(obj ?? {})) if (n.startsWith('@jini-ai/') && n !== m.name) { const o = m.name.slice(9), t = n.slice(9); const used = bad.some(s => s.owner === o && s.target === t); man.push([o, t, field, m.peerDependenciesMeta?.[n]?.optional ? 'optional' : '', BASE.has(t) ? 'base' : field === 'devDependencies' ? 'dev' : used ? 'USED' : 'STALE'].join('\t')); }
writeFileSync(join(out, 'CENSUS-manifest.tsv'), 'owner\ttarget\tfield\toptional\tstatus\n' + man.sort().join('\n') + '\n');
if (flag === '--tests') {
  const tb = testSites.filter(s => !BASE.has(s.target) && !/\/(testing|conformance)(\/|$)/.test(s.spec));
  writeFileSync(join(out, 'CENSUS-test-sites.tsv'), 'owner\ttarget\tspec\tkind\tfile\tline\n' + tb.map(s => [s.owner, s.target, s.spec, s.kind, s.file, s.line].join('\t')).join('\n') + '\n');
  const byOwner = new Map(); for (const s of tb) { const o = byOwner.get(s.owner) ?? { files: new Set(), mocks: new Set() }; o.files.add(s.file); if (s.kind === 'vi.mock') o.mocks.add(s.file); byOwner.set(s.owner, o); }
  const mockAll = testSites.filter(s => s.kind === 'vi.mock');
  console.log('TESTS: files importing a non-base pkg outside /testing|/conformance:', new Set(tb.map(s => s.file)).size, '| files with vi.mock of any other @jini-ai pkg (incl. core):', new Set(mockAll.map(s => s.file)).size);
  console.log([...byOwner.entries()].sort((a, b) => b[1].files.size - a[1].files.size).map(([o, v]) => `${o} ${v.files.size} (mock ${v.mocks.size})`).join(', '));
}
const byR = new Map(); for (const r of rows) { const b = byR.get(r.rlane) ?? { s: 0, f: new Set(), nw: 0 }; b.s++; b.f.add(r.file); if (r.clane === 'NONE') b.nw++; byR.set(r.rlane, b); }
console.log('packages', pk.length, '| cross-package sites', sites.length, '| sites breaking B1', bad.length, 'in', new Set(bad.map(s => s.file)).size, 'files | owner→target pairs', pairs.size, '| pairs in 11-15 census', oldPairs.size, '| pairs gone', gone.length);
console.log([...byR.entries()].sort((a, b) => +a[0].slice(1) - +b[0].slice(1)).map(([k, v]) => `${k}: ${v.s} sites/${v.f.size} files (no 11-15 row: ${v.nw})`).join('\n'));
console.log('manifest: STALE', man.filter(l => l.endsWith('STALE')).length, 'USED', man.filter(l => l.endsWith('USED')).length);
