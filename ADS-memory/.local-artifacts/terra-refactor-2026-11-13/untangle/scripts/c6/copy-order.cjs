// Read-only: C6 §1 copy-order pass. For each new core file, the source ranges in copy order, the names each
// declares, and the import lines it needs from sibling core files / existing core / anything else (flagged).
const ts = require('/Users/la/Programming/jini-terra-base/node_modules/typescript');
const fs = require('fs'); const path = require('path');
const AR = '/Users/la/Programming/jini-terra-base/packages/agent-runtime/src/';
const PLAN = {
  'model-catalog.ts': [['model-contracts.ts', 1, 1e9], ['providers/types.ts', 1, 1e9], ['providers/connection-guard.ts', 106, 107], ['model-discovery-types.ts', 1, 72], ['core/model-discovery-shared.ts', 124, 125]],
  'native-tool-policy.ts': [['native-tool-policy.ts', 6, 16], ['native-tool-policy.ts', 52, 58], ['native-tool-policy.ts', 104, 109], ['native-tool-policy.ts', 112, 117]],
  'definition.ts': [['types.ts', 21, 701], ['types.ts', 771, 789]],
  'launch.ts': [['launch.ts', 12, 19], ['log-file.ts', 26, 31], ['prompt-file.ts', 15, 18], ['prompt-augmenter.ts', 8, 43], ['auth.ts', 78, 84]],
};
const declared = new Map(); const chunks = {};
for (const [target, ranges] of Object.entries(PLAN)) {
  chunks[target] = [];
  for (const [f, a, b] of ranges) {
    const lines = fs.readFileSync(AR + f, 'utf8').split('\n');
    const text = lines.slice(a - 1, Math.min(b, lines.length)).join('\n');
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
    const names = [];
    for (const st of sf.statements) {
      if (st.name && ts.isIdentifier(st.name)) names.push(st.name.text);
      if (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) names.push('!' + st.getText(sf).replace(/\s+/g, ' ').slice(0, 120));
    }
    for (const n of names) if (!n.startsWith('!')) declared.set(n, target);
    chunks[target].push({ f, a, b: Math.min(b, lines.length), sf, names });
  }
}
// imports the source files already have (to classify external refs)
const srcImports = new Map();
for (const ranges of Object.values(PLAN)) for (const [f] of ranges) {
  const sf = ts.createSourceFile(f, fs.readFileSync(AR + f, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const st of sf.statements) if (ts.isImportDeclaration(st) && st.importClause) {
    const b = st.importClause.namedBindings; if (b && ts.isNamedImports(b)) for (const e of b.elements) srcImports.set(e.name.text, `${st.moduleSpecifier.text} (in ${f})`);
  }
}
const GLOBAL = new Set(['Promise','Record','Readonly','ReadonlyArray','Partial','Pick','Omit','Error','AbortSignal','Array','Date','Map','Set','ReadonlySet','ReadonlyMap','Uint8Array','URL','Exclude','Extract','NonNullable','ReturnType','Parameters','Awaited','RequestInit','Response','Required','unknown','string','number','boolean','never','undefined','null','object','Symbol','JSON','Number','String','Boolean','Object','RegExp','console']);
for (const [target, cs] of Object.entries(chunks)) {
  console.log(`\n### core/contracts/agents/${target}`);
  const refs = new Map();
  for (const c of cs) {
    console.log(`- copy ${c.f}:${c.a}-${c.b}  declares: ${c.names.filter(n => !n.startsWith('!')).join(', ')}`);
    for (const n of c.names.filter(n => n.startsWith('!'))) console.log(`    NOTE statement inside range: ${n.slice(1)}`);
    const walk = (n) => { if (ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName)) refs.set(n.typeName.text, c.f);
      if (ts.isExpressionWithTypeArguments(n) && ts.isIdentifier(n.expression)) refs.set(n.expression.text, c.f);
      if (ts.isTypeQueryNode(n) && ts.isIdentifier(n.exprName)) refs.set(n.exprName.text, c.f);
      if (ts.isImportTypeNode(n)) console.log(`    NOTE inline import(): ${n.getText(c.sf).slice(0, 100)} (${c.f})`);
      ts.forEachChild(n, walk); };
    walk(c.sf);
  }
  const mine = new Set(cs.flatMap(c => c.names));
  const sib = {}; const ext = [];
  for (const [r, f] of refs) {
    if (mine.has(r) || GLOBAL.has(r)) continue;
    const t = declared.get(r);
    if (t) (sib[t] ||= new Set()).add(r);
    else ext.push(`${r} <- ${srcImports.get(r) ?? 'NOT IMPORTED (type param or local?)'} [used in ${f}]`);
  }
  for (const [t, s] of Object.entries(sib)) console.log(`  import type { ${[...s].sort().join(', ')} } from './${t.replace('.ts', '.js')}';`);
  for (const e of ext.sort()) console.log(`  EXTERNAL ${e}`);
}
