// List Tovu-declared function TYPES (interface/type members, callback slots) with positional params.
const ts = require('/Users/la/Programming/tovu-codex-trial-terra/node_modules/typescript');
const fs = require('fs'), path = require('path');
const T = process.argv[2];
const files = require('child_process').execSync(`cd ${T} && find apps/desktop/src apps/desktop/scripts -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.mts' -o -name '*.cts' \\)`, { encoding: 'utf8' }).trim().split('\n')
  .filter(f => !/__tests__|\.test\.|\.d\.ts$|test-support/.test(f));
const PR = new Set(['string','number','boolean','unknown','any']);
function bad(p) {
  if (p.dotDotDotToken) return true;
  if (ts.isObjectBindingPattern(p.name)) return false;
  const t = p.type; if (!t) return true;
  if (ts.isTypeLiteralNode(t) || ts.isMappedTypeNode(t)) return false;
  if ([ts.SyntaxKind.StringKeyword, ts.SyntaxKind.NumberKeyword, ts.SyntaxKind.BooleanKeyword, ts.SyntaxKind.UnknownKeyword, ts.SyntaxKind.AnyKeyword].includes(t.kind)) return true;
  if (ts.isLiteralTypeNode(t) || ts.isArrayTypeNode(t) || ts.isFunctionTypeNode(t) || ts.isTupleTypeNode(t) || ts.isTypeOperatorNode(t)) return true;
  if (ts.isUnionTypeNode(t)) return !t.types.every(x => ts.isTypeLiteralNode(x));
  if (ts.isTypeReferenceNode(t)) { const n = t.typeName.getText(); if (/^(Array|ReadonlyArray|Set|Map|ReadonlyMap|Promise|Date|Buffer|URL|RegExp|Error|Dispatch|SetStateAction)$/.test(n)) return true; if (/^(Record|Partial|Readonly|Required|Pick|Omit)$/.test(n)) return false; return 'named'; }
  return 'other';
}
for (const f of files) {
  const sf = ts.createSourceFile(f, fs.readFileSync(path.join(T, f), 'utf8'), 99, true, f.endsWith('x') ? 4 : 3);
  const visit = n => {
    let ps = null, label = null;
    if ((ts.isMethodSignature(n) || ts.isPropertySignature(n) || ts.isFunctionTypeNode(n) || ts.isCallSignatureDeclaration(n))) {
      if (ts.isMethodSignature(n) || ts.isCallSignatureDeclaration(n)) ps = n.parameters;
      if (ts.isFunctionTypeNode(n)) ps = n.parameters;
      // owner name
      let p = n, chain = [];
      for (let i = 0; p && i < 8; i++, p = p.parent) {
        if ((ts.isPropertySignature(p) || ts.isMethodSignature(p) || ts.isParameter(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p)) && p.name && ts.isIdentifier(p.name)) chain.unshift(p.name.text); else if (ts.isParameter(p) && p.name && !ts.isIdentifier(p.name)) chain.unshift("<param>");
        if (ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isVariableStatement(p)) break;
      }
      label = [...new Set(chain)].join('.');
    }
    if (ps && ps.length) {
      const k = ps.filter(p => !(ts.isIdentifier(p.name) && p.name.text === 'this')).map(bad);
      if (ps.length > 2 || k.some(x => x === true)) {
        const exp = /export /.test(sf.getFullText().slice(0, 0)) ;
        console.log(`${f.replace('apps/desktop/','')}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}\t${label}\t(${ps.map(p => p.getText().replace(/\s+/g,' ')).join(', ').slice(0,120)})`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
