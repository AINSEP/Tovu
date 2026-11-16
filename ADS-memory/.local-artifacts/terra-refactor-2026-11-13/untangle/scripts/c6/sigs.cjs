const ts = require('/Users/la/Programming/jini-terra-base/node_modules/typescript');
const path = require('path');
const [srcDir, entry, ...roots] = process.argv.slice(2);
const program = ts.createProgram([entry], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true, noEmit: true, types: ['node'] });
const checker = program.getTypeChecker();
const sf = program.getSourceFile(entry);
const ex = new Map(checker.getExportsOfModule(checker.getSymbolAtLocation(sf)).map(s => [s.name, s]));
for (const r of roots) {
  let s = ex.get(r); if (!s) { console.log('MISSING', r); continue; }
  while (s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s);
  const d = s.declarations[0]; const f = path.relative(srcDir, d.getSourceFile().fileName); const line = d.getSourceFile().getLineAndCharacterOfPosition(d.getStart()).line + 1;
  const t = checker.getTypeOfSymbolAtLocation(s, d);
  const str = (s.flags & (ts.SymbolFlags.Function|ts.SymbolFlags.Variable|ts.SymbolFlags.Class)) ? checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation) : '(type)';
  console.log(`${r} @ ${f}:${line}\n   ${str}`);
}
