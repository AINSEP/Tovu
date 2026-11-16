// Read-only (desktop-args copy: ROOT/BASE/OUT_DIR from env; base = batch-1 conv.cjs): list functions whose signature changed to object shape in 9484d35f9..HEAD,
// then scan the whole repo for call sites that still look positional.
const ts = require(require('path').join(process.env.ROOT || '/Users/la/Programming/tovu-codex-trial-terra', 'node_modules/typescript'));
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = process.env.ROOT || '/Users/la/Programming/tovu-codex-trial-terra';
const OUT = process.env.OUT_DIR || __dirname; // write converted.json / scan.json here (use your scratchpad)
const BASE = process.env.BASE; if (!BASE) { console.error('set BASE=<commit before your lane>'); process.exit(2); }
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 1 << 30 });
const EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const changed = git('diff', '--name-only', '--diff-filter=M', BASE + '..HEAD').split('\n').filter(f => EXT.test(f) && !/node_modules|\/dist\//.test(f));
const kind = f => (f.endsWith('x') ? ts.ScriptKind.TSX : /\.(js|mjs|cjs)$/.test(f) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
const parse = (f, text) => ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, kind(f));

function nameOf(n) {
  if (ts.isConstructorDeclaration(n)) return n.parent && n.parent.name ? 'new ' + n.parent.name.text : null;
  if (n.name && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name))) return n.name.text;
  if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.parent) {
    const p = n.parent;
    if ((ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) && p.name && ts.isIdentifier(p.name)) return p.name.text;
  }
  if (ts.isFunctionTypeNode(n) && n.parent) {
    const p = n.parent;
    if ((ts.isPropertySignature(p) || ts.isTypeAliasDeclaration(p)) && p.name && ts.isIdentifier(p.name)) return p.name.text;
  }
  return null;
}
function collect(sf) {
  const out = new Map();
  const visit = n => {
    if (ts.isFunctionLike(n) && n.parameters) {
      const nm = nameOf(n);
      if (nm) {
        const key = nm;
        const params = n.parameters.map(p => p.getText(sf).replace(/\s+/g, ' '));
        const first = n.parameters[0];
        const info = {
          params, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
          firstObj: !!first && (ts.isObjectBindingPattern(first.name) || (first.type && ts.isTypeLiteralNode(first.type)) || /^_?required$/.test(first.name.getText(sf))),
          firstDefault: !!first && !!first.initializer,
          firstOptional: !!first && (!!first.initializer || !!first.questionToken),
          n: n.parameters.length,
          kind: ts.SyntaxKind[n.kind],
          exported: !!(n.modifiers && n.modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword)),
        };
        if (!out.has(key)) out.set(key, []);
        out.get(key).push(info);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
const converted = [];
for (const f of changed) {
  let base;
  try { base = git('show', BASE + ':' + f); } catch { continue; }
  const head = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const b = collect(parse(f, base)), h = collect(parse(f, head));
  for (const [nm, hs] of h) {
    const bs = b.get(nm);
    if (!bs) continue;
    if (hs.length !== 1 || bs.length !== 1) { // overloads / dup names: compare pairwise by index
      for (let i = 0; i < Math.min(hs.length, bs.length); i++) push(f, nm, bs[i], hs[i]);
      continue;
    }
    push(f, nm, bs[0], hs[0]);
  }
}
function push(f, nm, bi, hi) {
  if (bi.params.join('|') === hi.params.join('|')) return;
  if (!hi.firstObj && !(hi.n === 1 && hi.firstOptional)) return;
  if (bi.firstObj && bi.n === hi.n) return; // already object first
  converted.push({ file: f, name: nm, line: hi.line, kind: hi.kind, exported: hi.exported, before: bi.params, after: hi.params, firstOptional: hi.firstOptional });
}
fs.writeFileSync(path.join(OUT, 'converted.json'), JSON.stringify(converted, null, 1));
console.log('changed files', changed.length, 'converted sigs', converted.length);
const byKind = {};
for (const c of converted) byKind[c.kind] = (byKind[c.kind] || 0) + 1;
console.log(byKind);
