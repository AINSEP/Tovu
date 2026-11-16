// Usage: node closure.cjs <pkgSrcDir> <entryFile> Name1 Name2 ...
// Prints the transitive closure of type declarations (inside pkgSrcDir) referenced by the roots.
const ts = require('/Users/la/Programming/jini-terra-base/node_modules/typescript');
const path = require('path');
const [srcDir, entry, ...roots] = process.argv.slice(2);
const program = ts.createProgram([entry], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true, noEmit: true, types: ['node'] });
const checker = program.getTypeChecker();
const sf = program.getSourceFile(entry);
const modSym = checker.getSymbolAtLocation(sf);
const exportsByName = new Map(checker.getExportsOfModule(modSym).map(s => [s.name, s]));
const seen = new Map(); const external = new Map();
function resolve(sym) { while (sym && (sym.flags & ts.SymbolFlags.Alias)) sym = checker.getAliasedSymbol(sym); return sym; }
function visitSym(sym, from) {
  sym = resolve(sym); if (!sym || !sym.declarations) return;
  for (const d of sym.declarations) {
    const file = d.getSourceFile().fileName;
    if (!file.startsWith(srcDir)) { if (!file.includes('/typescript/lib/')) { const k = sym.name + ' @ ' + file.replace(/.*node_modules\//, 'nm:').replace(/.*packages\//, 'pk:'); external.set(k, from); } continue; }
    if (ts.isTypeParameterDeclaration(d) || ts.isParameter(d) || ts.isPropertySignature(d) || ts.isPropertyDeclaration(d) || ts.isMethodSignature(d)) continue;
    const key = path.relative(srcDir, file) + ':' + (d.getSourceFile().getLineAndCharacterOfPosition(d.getStart()).line + 1) + ' ' + sym.name;
    if (seen.has(key)) continue;
    const kind = ts.SyntaxKind[d.kind];
    seen.set(key, kind + ' <- ' + from);
    if (!(ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d) || ts.isEnumDeclaration(d))) continue; // values/classes: record, do not walk
    walk(d, sym.name);
  }
}
function walk(node, from) {
  ts.forEachChild(node, function v(n) {
    if (ts.isTypeReferenceNode(n) || ts.isExpressionWithTypeArguments(n) || ts.isTypeQueryNode(n)) {
      const id = ts.isTypeReferenceNode(n) ? n.typeName : ts.isTypeQueryNode(n) ? n.exprName : n.expression;
      const s = checker.getSymbolAtLocation(ts.isQualifiedName(id) ? id.right : id);
      if (s) visitSym(s, from);
    }
    if (ts.isImportTypeNode(n)) { const t = checker.getTypeAtLocation(n); if (t.symbol) visitSym(t.symbol, from); if (t.aliasSymbol) visitSym(t.aliasSymbol, from); }
    ts.forEachChild(n, v);
  });
}
for (const r of roots) { const s = exportsByName.get(r); if (!s) { console.log('MISSING root', r); continue; } visitSym(s, 'ROOT'); }
const rows = [...seen.entries()].sort();
for (const [k, v] of rows) console.log(k, '\t', v);
console.log('--- external refs'); for (const [k, v] of external) console.log(k, '\t<-', v);
