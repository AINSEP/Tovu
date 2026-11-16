// Jini package-level graph from @jini-ai/* specifiers in production src (static import/export-from + dynamic import()).
import ts from 'typescript'; import fs from 'node:fs'; import path from 'node:path';
import { scc } from './graph-lib.mjs';
const root = process.argv[2]; const pk = path.join(root, 'packages');
const edges = new Map();
const walk = (dir, acc) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (['node_modules', 'dist', '__tests__'].includes(e.name)) continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, acc); else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|d)\.tsx?$/.test(e.name)) acc.push(p); } return acc; };
for (const pkg of fs.readdirSync(pk)) { const src = path.join(pk, pkg, 'src'); if (!fs.existsSync(src)) continue;
  for (const f of walk(src, [])) { const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.ES2022, true);
    const add = (spec, type) => { const m = /^@jini-ai\/([^/]+)/.exec(spec); if (!m || m[1] === pkg) return; const k = pkg + '>' + m[1]; const r = edges.get(k) || { rt: 0, ty: 0 }; type ? r.ty++ : r.rt++; edges.set(k, r); };
    const visit = (n) => { if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) { const ic = n.importClause; const nb = ic?.namedBindings; const allType = !!ic && (ic.isTypeOnly || (!ic.name && nb && ts.isNamedImports(nb) && nb.elements.length > 0 && nb.elements.every((e) => e.isTypeOnly))); add(n.moduleSpecifier.text, allType); }
      else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) add(n.moduleSpecifier.text, n.isTypeOnly || (n.exportClause && ts.isNamedExports(n.exportClause) && n.exportClause.elements.length > 0 && n.exportClause.elements.every((e) => e.isTypeOnly)));
      else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) add(n.arguments[0].text, false);
      else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) add(n.argument.literal.text, true);
      ts.forEachChild(n, visit); }; visit(sf); } }
for (const [label, f] of [['runtime', (r) => r.rt > 0], ['all', () => true]]) { const adj = new Map(); const nodes = new Set();
  for (const [k, r] of edges) if (f(r)) { const [a, b] = k.split('>'); nodes.add(a); nodes.add(b); if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); }
  const comps = scc([...nodes], adj).filter((c) => c.length > 1); console.log(label, 'package edges', [...edges.values()].filter(f).length, 'SCCs', comps.length, comps.map((c) => c.sort().join(' ')).join(' | ')); }
