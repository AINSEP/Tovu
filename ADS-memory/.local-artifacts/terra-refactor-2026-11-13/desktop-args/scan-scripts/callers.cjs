// Read-only AST caller scan (BEFORE a conversion). Syntax only, no type info.
// Usage: node callers.cjs <root> <items.tsv> <out.tsv> [extraFile ...]
//   root      = repo root (or an extracted tree) that contains apps/desktop
//   items.tsv = id <TAB> repo-relative-from-apps/desktop path <TAB> name <TAB> fn|member|type
//   extra     = more repo-relative files to scan (e.g. development/e2e/support/start-journey-site.mjs)
// For fn: resolves named / aliased (`as`) / namespace imports of the def file; reports calls AND
// by-reference uses (.map(fn), slot: fn, a ?? fn, export { fn as x }) — the class grep misses.
// For member/type: reports `.name(` calls, `.name` by-reference reads, `name:`/`name(){}` implementations
// and type references; a file is tagged `imp` when it imports the def file or IS it (generic names: trust `imp` rows).
const fs = require('fs'), path = require('path'), cp = require('child_process');
const [root, itemsPath, outPath, ...extra] = process.argv.slice(2);
const ts = require(require.resolve('typescript', { paths: [root, '/Users/la/Programming/tovu-codex-trial-terra'] }));
const DESK = 'apps/desktop';
const walk = (d, o = []) => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/(^|\/)(node_modules|dist|release|build|coverage)$/.test(p)) walk(p, o); } else if (/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) o.push(p); } return o; };
const files = [...walk(DESK), ...extra.filter((f) => fs.existsSync(path.join(root, f)))];
const items = fs.readFileSync(itemsPath, 'utf8').trim().split('\n').map((l) => { const [id, file, name, mode] = l.split('\t'); return { id, file: path.join(DESK, file), name, mode, hits: [] }; });
const strip = (p) => p.replace(/\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/, '').replace(/\/index$/, '');
const kind = (f) => (/x$/.test(f) ? ts.ScriptKind.TSX : /\.(js|mjs|cjs)$/.test(f) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
for (const f of files) {
  const text = fs.readFileSync(path.join(root, f), 'utf8');
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, kind(f));
  const imports = new Map(); const nsImports = new Map(); const importedMods = new Set();
  const addSpec = (spec) => { if (!spec.startsWith('.')) return null; const r = strip(path.normalize(path.join(path.dirname(f), spec))); importedMods.add(r); return r; };
  const visitImp = (n) => {
    if (ts.isImportDeclaration(n) || (ts.isExportDeclaration(n) && n.moduleSpecifier)) {
      const mod = addSpec(n.moduleSpecifier.text); const cl = n.importClause;
      if (mod && cl && cl.namedBindings) {
        if (ts.isNamedImports(cl.namedBindings)) for (const el of cl.namedBindings.elements) imports.set(el.name.text, { orig: (el.propertyName || el.name).text, mod });
        else if (ts.isNamespaceImport(cl.namedBindings)) nsImports.set(cl.namedBindings.name.text, mod);
      }
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) addSpec(n.arguments[0].text);
    ts.forEachChild(n, visitImp);
  };
  visitImp(sf);
  const ln = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const snippet = (n) => n.getText(sf).replace(/\s+/g, ' ').slice(0, 110);
  for (const it of items) {
    const defMod = strip(it.file); const isDef = strip(f) === defMod; const imp = isDef || importedMods.has(defMod);
    if (!text.includes(it.name)) continue;
    const visit = (n) => {
      if (it.mode === 'fn' && ts.isIdentifier(n)) {
        const im = imports.get(n.text);
        const bound = (im && im.orig === it.name && im.mod === defMod) || (isDef && n.text === it.name && !im);
        if (bound) {
          const p = n.parent;
          const decl = p && p.name === n && (ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p) || ts.isImportSpecifier(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p) || ts.isMethodSignature(p));
          const propName = p && ts.isPropertyAccessExpression(p) && p.name === n;
          const typeRef = p && (ts.isTypeQueryNode(p) || ts.isTypeReferenceNode(p) || ts.isQualifiedName(p));
          if (!decl && !propName && !typeRef && !(p && ts.isImportSpecifier(p))) {
            const isCall = (ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression === n;
            it.hits.push({ f, line: ln(n), how: isCall ? 'call' : (ts.isExportSpecifier(p) ? 'export' : 'BYREF'), imp, s: snippet(isCall ? p : p) });
          }
        }
      }
      if (it.mode === 'fn' && ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && nsImports.get(n.expression.text) === defMod && n.name.text === it.name) {
        const p = n.parent; const isCall = ts.isCallExpression(p) && p.expression === n;
        it.hits.push({ f, line: ln(n), how: isCall ? 'call' : 'BYREF', imp: true, s: snippet(p) });
      }
      if (it.mode === 'member') {
        if (ts.isPropertyAccessExpression(n) && n.name.text === it.name) {
          const p = n.parent; const isCall = ts.isCallExpression(p) && p.expression === n;
          it.hits.push({ f, line: ln(n), how: isCall ? 'm-call' : 'm-BYREF', imp, s: snippet(p) });
        } else if ((ts.isPropertyAssignment(n) || ts.isMethodDeclaration(n) || ts.isShorthandPropertyAssignment(n) || ts.isPropertySignature(n) || ts.isMethodSignature(n)) && n.name && ts.isIdentifier(n.name) && n.name.text === it.name) {
          it.hits.push({ f, line: ln(n), how: ts.isPropertySignature(n) || ts.isMethodSignature(n) ? 'type' : 'impl', imp, s: snippet(n) });
        } else if (ts.isBindingElement(n) && ((n.propertyName && n.propertyName.getText(sf) === it.name) || (!n.propertyName && n.name.getText(sf) === it.name))) {
          it.hits.push({ f, line: ln(n), how: 'destructure', imp, s: snippet(n.parent.parent || n) });
        }
      }
      if (it.mode === 'type' && ts.isTypeReferenceNode(n) && n.typeName.getText(sf) === it.name) it.hits.push({ f, line: ln(n), how: 'typeref', imp, s: snippet(n.parent) });
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
}
const out = ['id\tdef\tname\tmode\tfile:line\thow\timp\tsnippet'];
for (const it of items) for (const h of it.hits) out.push([it.id, it.file, it.name, it.mode, `${h.f}:${h.line}`, h.how, h.imp ? 'imp' : '-', h.s].join('\t'));
fs.writeFileSync(outPath, out.join('\n') + '\n');
for (const it of items) {
  const fl = [...new Set(it.hits.filter((h) => it.mode === 'fn' || h.imp).map((h) => h.f))];
  const tests = fl.filter((x) => /\.test\.|__tests__|test-support|harness/.test(x)).length;
  const byref = it.hits.filter((h) => /BYREF|export/.test(h.how) && (it.mode === 'fn' || h.imp)).length;
  console.log(`${it.id}\t${it.name}\thits ${it.hits.filter((h) => it.mode === 'fn' || h.imp).length}\tfiles ${fl.length} (tests ${tests})\tbyref ${byref}\t${fl.map((x) => x.replace(DESK + '/', '')).join(' ')}`);
}
