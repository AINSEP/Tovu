// Read-only: every production import from one @jini-ai package into another.
// Usage: node edges.mjs <jini-root> <out-dir>
// Production = the same file set as scripts/lib/package-sources.ts (src/, no __tests__, no *.test.*), plus CSS @import.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
const [root, out] = process.argv.slice(2);
const ts = createRequire(join(root, 'package.json'))('typescript');

function packages(dir) {
  const res = []; const apc = join(dir, 'agent-plugins');
  (function visit(d) {
    if (d === apc) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory() || ['node_modules', 'dist', '.git'].includes(e.name)) continue;
      const c = join(d, e.name); const m = join(c, 'package.json');
      if (existsSync(m)) { const j = JSON.parse(readFileSync(m, 'utf8')); if (j.name?.startsWith('@jini-ai/')) res.push({ dir: c, m: j }); }
      if (!['src', 'docs'].includes(e.name)) visit(c);
    }
  })(dir);
  return res;
}
function files(dir) {
  const r = [];
  (function v(d) {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (['__tests__', 'node_modules', 'dist', '.git'].includes(e.name)) continue;
      const c = join(d, e.name);
      if (e.isDirectory()) v(c); else if (/\.(ts|tsx|mts|cts|css)$/.test(e.name) && !/\.test\./.test(e.name)) r.push(c);
    }
  })(join(dir, 'src'));
  return r.sort();
}
const BASE = new Set(['core', 'protocol']);
const pk = packages(join(root, 'packages'));
const sites = [];
for (const { dir, m } of pk) {
  const owner = m.name.slice(9);
  for (const f of files(dir)) {
    const src = readFileSync(f, 'utf8'); const loc = src.split('\n').length;
    const sp = relative(dir, f); const rel = relative(root, f);
    const isReactFile = f.endsWith('.tsx') || /(^|\/)react(\/|$)/.test(sp) || /embed-widget\/react/.test(sp);
    const push = (spec, line, kind, names) => {
      if (!spec.startsWith('@jini-ai/')) return;
      const target = spec.slice(9).split('/')[0];
      if (target === owner) return; // self-import of a public entry
      sites.push({ owner, target, spec, file: rel, sp, line, kind, names, loc, isReactFile });
    };
    if (f.endsWith('.css')) {
      src.split('\n').forEach((l, i) => { const mm = l.match(/@import\s+(?:url\()?["']([^"']+)["']/); if (mm) push(mm[1], i + 1, 'css', ''); });
      continue;
    }
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const lineOf = n => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
    (function visit(n) {
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text; let typeOnly = false; let names = [];
        if (ts.isImportDeclaration(n)) {
          const c = n.importClause;
          if (!c) typeOnly = false; // side-effect import
          else if (c.isTypeOnly) typeOnly = true;
          else {
            const nb = c.namedBindings;
            const elems = nb && ts.isNamedImports(nb) ? nb.elements : [];
            typeOnly = !c.name && nb && ts.isNamedImports(nb) && elems.length > 0 && elems.every(e => e.isTypeOnly);
            if (c.name) names.push(c.name.text);
            if (nb && ts.isNamespaceImport(nb)) names.push('* as ' + nb.name.text);
          }
          const nb = c?.namedBindings; if (nb && ts.isNamedImports(nb)) names.push(...nb.elements.map(e => (e.propertyName ?? e.name).text));
        } else {
          typeOnly = n.isTypeOnly || (n.exportClause && ts.isNamedExports(n.exportClause) && n.exportClause.elements.length > 0 && n.exportClause.elements.every(e => e.isTypeOnly));
          if (n.exportClause && ts.isNamedExports(n.exportClause)) names.push(...n.exportClause.elements.map(e => (e.propertyName ?? e.name).text)); else names.push('*');
        }
        const kind = spec.endsWith('.css') ? 'css' : typeOnly ? 'type' : (isReactFile || /\/react(\/|$)/.test(spec)) ? 'react' : 'value';
        push(spec, lineOf(n), kind + (ts.isExportDeclaration(n) ? '+reexport' : ''), names.join(','));
      }
      if (ts.isCallExpression(n) && n.arguments[0] && ts.isStringLiteral(n.arguments[0]) &&
        (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) {
        push(n.arguments[0].text, lineOf(n), (isReactFile ? 'react' : 'value') + '+dynamic', '');
      }
      if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) push(n.argument.literal.text, lineOf(n), 'type+inline', n.qualifier ? n.qualifier.getText() : '');
      ts.forEachChild(n, visit);
    })(sf);
  }
}
// allowed under the strict rule: target in BASE only
const allowed = s => BASE.has(s.target) ? 'yes' : 'no';
writeFileSync(join(out, 'EDGES-sites.tsv'), ['owner\ttarget\tspec\tkind\tfile\tline\tfile_loc\tnames\tallowed']
  .concat(sites.map(s => [s.owner, s.target, s.spec, s.kind, s.file, s.line, s.loc, s.names, allowed(s)].join('\t'))).join('\n') + '\n');
const agg = new Map();
for (const s of sites) {
  const base = s.kind.split('+')[0];
  const k = [s.owner, s.target, s.spec, base].join('\t');
  const a = agg.get(k) ?? { files: new Set(), lines: 0, loc: 0, s };
  if (!a.files.has(s.file)) { a.files.add(s.file); a.loc += s.loc; }
  a.lines++; agg.set(k, a);
}
const rows = [...agg.entries()].map(([k, a]) => `${k}\t${a.files.size}\t${a.lines}\t${a.loc}\t${allowed(a.s)}`).sort();
writeFileSync(join(out, 'EDGES.tsv'), 'owner\ttarget\tsubpath\tkind\tfiles\timport_lines\tfile_loc\tallowed\n' + rows.join('\n') + '\n');
// manifest edges
const man = [];
for (const { m } of pk) for (const [field, obj] of [['dependencies', m.dependencies], ['peerDependencies', m.peerDependencies], ['devDependencies', m.devDependencies]])
  for (const n of Object.keys(obj ?? {})) if (n.startsWith('@jini-ai/') && n !== m.name) man.push([m.name.slice(9), n.slice(9), field, m.peerDependenciesMeta?.[n]?.optional ? 'optional' : '', BASE.has(n.slice(9)) || field === 'devDependencies' ? 'yes' : 'no'].join('\t'));
writeFileSync(join(out, 'EDGES-manifest.tsv'), 'owner\ttarget\tfield\toptional\tallowed\n' + man.sort().join('\n') + '\n');
console.log('packages', pk.length, 'sites', sites.length, 'edges', rows.length);
