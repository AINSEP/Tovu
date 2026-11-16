const ts = require('/opt/node-tools/node_modules/typescript');
const fs = require('fs');
const [file, fnName] = process.argv.slice(2);
const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
let fn;
sf.forEachChild((n) => { if (ts.isFunctionDeclaration(n) && n.name && n.name.text === fnName) fn = n; });
const decls = new Map();
const addName = (name, node) => {
  if (ts.isIdentifier(name)) decls.set(name.text, node);
  else name.elements.forEach((e) => { if (!ts.isOmittedExpression(e)) addName(e.name, node); });
};
for (const st of fn.body.statements) {
  if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => addName(d.name, st));
}
const out = new Map();
const visit = (node, depth, shadow) => {
  if (ts.isFunctionLike(node) && node !== fn) {
    depth += 1; shadow = new Set(shadow);
    node.parameters.forEach((p) => { const add = (n) => { if (ts.isIdentifier(n)) shadow.add(n.text); else n.elements.forEach((e) => { if (!ts.isOmittedExpression(e)) add(e.name); }); }; add(p.name); });
  }
  if (ts.isIdentifier(node) && depth > 0 && decls.has(node.text) && !shadow.has(node.text)) {
    const p = node.parent;
    const isProp = (ts.isPropertyAccessExpression(p) && p.name === node) || (ts.isPropertyAssignment(p) && p.name === node)
      || (ts.isBindingElement(p)) || (ts.isParameter(p)) || (ts.isVariableDeclaration(p) && p.name === node) || ts.isTypeNode(p) || ts.isTypeQueryNode(p) || ts.isQualifiedName(p)
      || (ts.isMethodDeclaration(p) && p.name === node) || (ts.isPropertySignature(p));
    const d = decls.get(node.text);
    if (!isProp && d.getStart(sf) > node.getStart(sf)) {
      const k = node.text + '(' + line(d) + ')';
      if (!out.has(k)) out.set(k, new Set());
      out.get(k).add(line(node));
    }
  }
  node.forEachChild((c) => visit(c, depth, shadow));
};
visit(fn.body, 0, new Set());
for (const [k, v] of [...out].sort((a, b) => [...a[1]][0] - [...b[1]][0])) console.log(k + ' <- ' + [...v].join(','));
