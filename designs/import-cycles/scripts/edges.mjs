// Import-edge extractor (read-only). Usage: node edges.mjs <repoRoot> <srcDirRel> <out.json> [--alias '#src/=apps/website/src/']
// Classifies every import/export-from/dynamic import/require/import-type edge between production .ts files as
//   runtime  : survives TS/esbuild erasure (side-effect import, or >=1 imported binding used in a value position, or export-from of values)
//   erased   : written as a value import, but every binding is used only in type positions (TS elides it; fragile)
//   type     : explicit `import type` / `export type … from` / all-inline-`type` specifiers / `import('x').T` type node
// plus dynamic=true for `import()` / `require()` (lazy; not part of static module-evaluation order).
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const [root, srcRel, out, ...rest] = process.argv.slice(2);
const aliases = [];
for (let i = 0; i < rest.length; i++) if (rest[i] === '--alias') { const [a, b] = rest[++i].split('='); aliases.push([a, b]); }
const includeTests = rest.includes('--tests');
const srcAbs = path.join(root, srcRel);

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!includeTests && e.name === '__tests__') continue; walk(p, acc); }
    else if (/\.(ts|tsx|mts)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      if (!includeTests && /\.test\.(ts|tsx)$/.test(e.name)) continue;
      acc.push(p);
    }
  }
  return acc;
}
const files = walk(srcAbs, []);
const fileSet = new Set(files);

function resolve(fromFile, spec) {
  let base = null;
  if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else for (const [a, b] of aliases) if (spec.startsWith(a)) { base = path.join(root, b, spec.slice(a.length)); break; }
  if (!base) return null;
  const cands = [base, base.replace(/\.(js|mjs)$/, '.ts'), base.replace(/\.(js|jsx)$/, '.tsx'), base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  for (const c of cands) if (fileSet.has(c)) return c;
  return { unresolved: base };
}

const edges = [];
const unresolved = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = []; // {spec, line, names:[{name, local, typeOnly}], sideEffect, declTypeOnly, kind}
  const localToImport = new Map(); // local name -> {imp, nameRec}
  const valueUsed = new Set();

  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const imp = { spec: st.moduleSpecifier.text, line: lineOf(st), names: [], sideEffect: !st.importClause, declTypeOnly: !!st.importClause?.isTypeOnly, form: 'import' };
      const ic = st.importClause;
      if (ic) {
        if (ic.name) imp.names.push({ name: 'default', local: ic.name.text, typeOnly: imp.declTypeOnly });
        if (ic.namedBindings) {
          if (ts.isNamespaceImport(ic.namedBindings)) imp.names.push({ name: '*', local: ic.namedBindings.name.text, typeOnly: imp.declTypeOnly });
          else for (const el of ic.namedBindings.elements) imp.names.push({ name: (el.propertyName ?? el.name).text, local: el.name.text, typeOnly: imp.declTypeOnly || el.isTypeOnly });
        }
      }
      for (const n of imp.names) localToImport.set(n.local, n);
      imports.push(imp);
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      const imp = { spec: st.moduleSpecifier.text, line: lineOf(st), names: [], sideEffect: false, declTypeOnly: !!st.isTypeOnly, form: 'export-from' };
      if (!st.exportClause) imp.names.push({ name: '*', local: '*', typeOnly: imp.declTypeOnly, reexport: true });
      else if (ts.isNamedExports(st.exportClause)) for (const el of st.exportClause.elements) imp.names.push({ name: (el.propertyName ?? el.name).text, local: el.name.text, typeOnly: imp.declTypeOnly || el.isTypeOnly, reexport: true });
      else imp.names.push({ name: '*', local: st.exportClause.name.text, typeOnly: imp.declTypeOnly, reexport: true });
      imports.push(imp);
    } else if (ts.isImportEqualsDeclaration(st) && ts.isExternalModuleReference(st.moduleReference) && ts.isStringLiteral(st.moduleReference.expression)) {
      imports.push({ spec: st.moduleReference.expression.text, line: lineOf(st), names: [{ name: '=', local: st.name.text, typeOnly: !!st.isTypeOnly, reexport: true }], sideEffect: false, declTypeOnly: !!st.isTypeOnly, form: 'import=' });
    }
  }

  const skipAsName = (node) => {
    const p = node.parent;
    if (!p) return false;
    if (ts.isPropertyAccessExpression(p) && p.name === node) return true;
    if (ts.isQualifiedName(p) && p.right === node) return true;
    if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodSignature(p) || ts.isEnumMember(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p)) && p.name === node) return true;
    if (ts.isBindingElement(p) && p.propertyName === node) return true;
    if (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) return true;
    if (ts.isJsxAttribute(p) && p.name === node) return true;
    return false;
  };

  const visit = (node, inType) => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isExportDeclaration(node)) {
      if (!node.moduleSpecifier && node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) {
          const local = (el.propertyName ?? el.name).text;
          if (!node.isTypeOnly && !el.isTypeOnly && localToImport.has(local)) valueUsed.add(local);
        }
      }
      return;
    }
    let nextInType = inType;
    if (ts.isHeritageClause(node)) {
      const cls = node.parent && (ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent));
      if (cls && node.token === ts.SyntaxKind.ExtendsKeyword) {
        for (const t of node.types) { visit(t.expression, false); t.typeArguments?.forEach((a) => visit(a, true)); }
        return;
      }
      nextInType = true;
    } else if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isTypeParameterDeclaration(node)) nextInType = true;
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      imports.push({ spec: node.argument.literal.text, line: lineOf(node), names: [{ name: node.qualifier ? node.qualifier.getText(sf) : '*', local: '', typeOnly: true }], sideEffect: false, declTypeOnly: true, form: 'import-type-node' });
    }
    if (ts.isCallExpression(node)) {
      const a0 = node.arguments[0];
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && a0 && ts.isStringLiteralLike(a0)) imports.push({ spec: a0.text, line: lineOf(node), names: [{ name: '(dynamic)', local: '', typeOnly: false, reexport: true }], sideEffect: false, declTypeOnly: false, form: 'dynamic-import', dynamic: true });
      else if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && a0 && ts.isStringLiteralLike(a0)) imports.push({ spec: a0.text, line: lineOf(node), names: [{ name: '(require)', local: '', typeOnly: false, reexport: true }], sideEffect: false, declTypeOnly: false, form: 'require', dynamic: true });
    }
    if (ts.isIdentifier(node) && !nextInType && localToImport.has(node.text) && !skipAsName(node)) valueUsed.add(node.text);
    ts.forEachChild(node, (c) => visit(c, nextInType));
  };
  visit(sf, false);

  for (const imp of imports) {
    const r = resolve(file, imp.spec);
    if (!r) continue; // external package / node builtin
    if (r.unresolved) { unresolved.push({ from: path.relative(root, file), spec: imp.spec, line: imp.line }); continue; }
    const names = imp.names.map((n) => ({ name: n.name, use: n.typeOnly ? 'type' : (n.reexport || valueUsed.has(n.local)) ? 'value' : 'erased' }));
    let kind;
    if (imp.sideEffect) kind = 'runtime';
    else if (names.some((n) => n.use === 'value')) kind = 'runtime';
    else if (names.length && names.every((n) => n.use === 'type')) kind = 'type';
    else kind = 'erased';
    edges.push({ from: path.relative(root, file), to: path.relative(root, r), line: imp.line, form: imp.form, kind, dynamic: !!imp.dynamic, sideEffect: imp.sideEffect, names });
  }
}
fs.writeFileSync(out, JSON.stringify({ root, srcRel, files: files.map((f) => path.relative(root, f)), edges, unresolved }));
const c = {}; for (const e of edges) { const k = e.kind + (e.dynamic ? '+dynamic' : ''); c[k] = (c[k] || 0) + 1; }
console.log(JSON.stringify({ files: files.length, edges: edges.length, byKind: c, unresolved: unresolved.length }));
