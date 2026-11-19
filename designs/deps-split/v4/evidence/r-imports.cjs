// Design-time: names R's phase bodies read (imports, module helpers, sheet functions) and the deps.ts imports
// left with no use after R. node r-imports.cjs <deps.after-sheets.ts> <phases.json> <rest.json> <B-census.json>
const ts = require('/opt/node-tools/node_modules/typescript'); const fs = require('fs');
const [F, pF, rF, bF] = process.argv.slice(2);
const src = fs.readFileSync(F, 'utf8'); const lines = src.split('\n');
const prog = ts.createProgram([F], { noResolve: true, noLib: true, types: [] }); const sf = prog.getSourceFile(F); const ck = prog.getTypeChecker();
const L = (p) => sf.getLineAndCharacterOfPosition(p).line + 1;
const PH = JSON.parse(fs.readFileSync(pF, 'utf8')).phases; const R = JSON.parse(fs.readFileSync(rF, 'utf8')); const B = JSON.parse(fs.readFileSync(bF, 'utf8'));
const importOf = new Map(); const topDecl = new Map();
for (const s of sf.statements) {
  if (ts.isImportDeclaration(s) && s.importClause) { const spec = s.moduleSpecifier.text, c = s.importClause; if (c.name) importOf.set(c.name.text, { spec, type: c.isTypeOnly });
    if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) importOf.set(c.namedBindings.name.text, { spec, type: c.isTypeOnly });
    if (c.namedBindings && ts.isNamedImports(c.namedBindings)) c.namedBindings.elements.forEach((e) => importOf.set(e.name.text, { spec, type: c.isTypeOnly || e.isTypeOnly })); continue; }
  if (s.name) topDecl.set(s.name.text, s); else if (ts.isVariableStatement(s)) s.declarationList.declarations.forEach((d) => topDecl.set(d.name.getText(), s));
}
// module declarations gone from deps.ts by R time (moved by M1-M3, B01, B16, L3)
const gone = new Set([...R.M.flatMap((m) => m.names), 'agentPluginIdentityAdmission', 'AgentPluginIdentityAdmission', 'compositionSiteKeySources', 'resolveSiteBackupSources', 'readTovuVersion', 'applyAdminPasswordResetFromEnvIfConfigured', 'createSiteDisplayNameSource', 'compositionSiteDisplaySources']);
const sheetFn = new Map(); B.forEach((c) => c.range && sheetFn.set(c.fn, `./${c.name}.js`));
R.L.forEach((l) => l.fns.forEach((f) => sheetFn.set(f.fn, `./${l.name}.js`)));
sheetFn.set('compositionProjectKeys', './project-keys.js'); sheetFn.set('compositionCommerce', './shared-oauth-commerce.js'); sheetFn.set('configureSiteSharing', './site-sharing.js'); sheetFn.set('configureSiteImports', './site-imports.js');
const inPhase = (line) => PH.some((p) => line >= p.startLine && line <= p.endLine);
const inGone = (node) => { const top = sf.statements.find((s) => s.pos <= node.pos && node.end <= s.end); return top && top.name && gone.has(top.name.text); };
const uses = new Map(); // name -> {phase:n, other:n, kind}
(function v(n) { if (ts.isIdentifier(n) && !ts.isImportSpecifier(n.parent) && !ts.isImportClause(n.parent) && !ts.isNamespaceImport(n.parent)) {
  const p = n.parent; if (!((ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || (ts.isQualifiedName(p) && p.right === n) || (p.name === n && (ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p) || ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isPropertySignature(p) || ts.isParameter(p) || ts.isBindingElement(p))))) {
    const sym = (ts.isShorthandPropertyAssignment(p) ? ck.getShorthandAssignmentValueSymbol(p) : null) || ck.getSymbolAtLocation(n);
    const d = sym && sym.declarations && sym.declarations[0];
    let kind = null;
    if (d && (ts.isImportSpecifier(d) || ts.isImportClause(d) || ts.isNamespaceImport(d))) kind = 'import';
    else if (d && (d.parent === sf || (ts.isVariableDeclaration(d) && d.parent.parent.parent === sf))) kind = 'top';
    else if (!d && sheetFn.has(n.text)) kind = 'sheet';
    if (kind) { const u = uses.get(n.text) || { phase: 0, other: 0, kind }; if (inPhase(L(n.getStart()))) u.phase++; else if (!inGone(n)) u.other++; uses.set(n.text, u); } } }
  ts.forEachChild(n, v); })(sf);
const out = { phaseImports: [], phaseTop: [], phaseSheet: [], depsUnused: [] };
for (const [n, u] of [...uses].sort()) {
  if (u.phase && u.kind === 'import') out.phaseImports.push({ n, ...importOf.get(n), alsoOutside: u.other > 0 });
  if (u.phase && u.kind === 'top') out.phaseTop.push({ n, line: L(topDecl.get(n).getStart()), alsoOutside: u.other > 0 });
  if (u.phase && u.kind === 'sheet') out.phaseSheet.push({ n, from: sheetFn.get(n), alsoOutside: u.other > 0 });
}
for (const [n, i] of importOf) { const u = uses.get(n); if (!u || (u.other === 0)) out.depsUnused.push({ n, spec: i.spec, usedByPhases: !!(u && u.phase) }); }
fs.writeFileSync(process.argv[6] || 'r-imports.json', JSON.stringify(out, null, 1));
console.log('phase imports', out.phaseImports.length, 'top', JSON.stringify(out.phaseTop), 'sheet fns', out.phaseSheet.length, out.phaseSheet.filter((x) => x.alsoOutside).map((x) => x.n));
console.log('deps.ts imports with no use after R:', out.depsUnused.length, '(of which used by phases:', out.depsUnused.filter((x) => x.usedByPhases).length + ')');
