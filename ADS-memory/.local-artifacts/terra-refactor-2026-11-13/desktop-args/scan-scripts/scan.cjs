// Read-only scan (desktop-args copy: ROOT/OUT_DIR from env): positional call sites / by-reference uses of converted names.
const ts = require(require('path').join(process.env.ROOT || '/Users/la/Programming/tovu-codex-trial-terra', 'node_modules/typescript'));
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = process.env.ROOT || '/Users/la/Programming/tovu-codex-trial-terra';
const OUT = process.env.OUT_DIR || __dirname; // write converted.json / scan.json here (use your scratchpad)
const conv = JSON.parse(fs.readFileSync(path.join(OUT, 'converted.json'), 'utf8'));
const files = execFileSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8', maxBuffer: 1 << 30 }).split('\n')
  .filter(f => /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(f) && !/(^|\/)(node_modules|dist|vendor)\//.test(f) && !/^ADS-memory/.test(f) && !/\.d\.ts$/.test(f));
const kind = f => (f.endsWith('x') ? ts.ScriptKind.TSX : /\.(js|mjs|cjs)$/.test(f) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
const strip = p => p.replace(/\.(ts|tsx|mts|cts|js|mjs|cjs)$/, '').replace(/\/index$/, '');
// plain functions: name -> [defs]; methods/ports: name -> [defs]; ctors: class -> [defs]
const fnDefs = new Map(), methDefs = new Map(), ctorDefs = new Map();
const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
for (const c of conv) {
  if (c.kind === 'Constructor') add(ctorDefs, c.name.replace(/^new /, ''), c);
  else if (c.kind === 'FunctionDeclaration' || c.kind === 'ArrowFunction' || c.kind === 'FunctionExpression') { add(fnDefs, c.name, c); add(methDefs, c.name, c); }
  else if (c.kind === 'MethodSignature' || c.kind === 'MethodDeclaration' || c.kind === 'FunctionType') add(methDefs, c.name, c);
}
const fileText = new Map();
const readF = f => { if (!fileText.has(f)) { try { fileText.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { fileText.set(f, ''); } } return fileText.get(f); };
function resolveSpec(from, spec) {
  if (spec.startsWith('#src/')) return strip('apps/website/src/' + spec.slice(5));
  if (!spec.startsWith('.')) return null;
  return strip(path.normalize(path.join(path.dirname(from), spec)));
}
function importMatches(from, spec, defFile, name) {
  const d = strip(defFile);
  const r = resolveSpec(from, spec);
  if (r) {
    if (r === d || r === strip(defFile.replace(/\/index\.(ts|tsx)$/, ''))) return true;
    // one-hop barrel
    for (const ext of ['.ts', '.tsx', '/index.ts', '.js']) {
      const t = readF(r + ext);
      if (t && new RegExp('export\\s*(\\*|\\{[^}]*\\b' + name + '\\b)').test(t) && (t.includes(path.basename(strip(defFile))) || t.includes(path.basename(path.dirname(defFile)) + '/'))) return true;
    }
    return false;
  }
  // package specifier: suffix match on last two path segments
  const tail = d.split('/').slice(-2).join('/');
  return spec.replace(/\.(js|ts)$/, '').endsWith(tail);
}
const out = { high: [], ident: [], method: [], byref: [], spread: [] };
const firstParamName = c => (c.before[0] || '').replace(/^\.\.\./, '').split(/[?:=\s]/)[0];
function judge(call, sf, f, c, via) {
  const args = call.arguments || [];
  const ln = sf.getLineAndCharacterOfPosition(call.getStart(sf)).line + 1;
  const txt = call.getText(sf).replace(/\s+/g, ' ').slice(0, 160);
  const rec = { at: `${f}:${ln}`, def: `${c.file}:${c.line} ${c.name}`, after: c.after.join(', ').slice(0, 120), call: txt, via };
  if (args.some(a => ts.isSpreadElement(a))) { out.spread.push(rec); return; }
  if (args.length === 0) { if (!c.firstOptional) (via === 'method' ? out.method : out.high).push({ ...rec, why: 'no args, first param required' }); return; }
  if (args.length > 2) { (via === 'method' ? out.method : out.high).push({ ...rec, why: '>2 args' }); return; }
  const a0 = args[0];
  if (ts.isObjectLiteralExpression(a0)) return;
  if (ts.isStringLiteral(a0) || ts.isNumericLiteral(a0) || ts.isNoSubstitutionTemplateLiteral(a0) || ts.isTemplateExpression(a0) || ts.isArrayLiteralExpression(a0) || ts.isArrowFunction(a0) || ts.isFunctionExpression(a0) || a0.kind === ts.SyntaxKind.TrueKeyword || a0.kind === ts.SyntaxKind.FalseKeyword || a0.kind === ts.SyntaxKind.NullKeyword || ts.isBinaryExpression(a0)) {
    (via === 'method' ? out.method : out.high).push({ ...rec, why: 'literal first arg' }); return;
  }
  const at = a0.getText(sf);
  if (at === firstParamName(c) || at.endsWith('.' + firstParamName(c))) { (via === 'method' ? out.method : out.high).push({ ...rec, why: 'first arg named like old positional param' }); return; }
  if (via !== 'method') out.ident.push({ ...rec, why: 'non-literal first arg' });
}
for (const f of files) {
  const text = readF(f);
  if (!text) continue;
  // quick prefilter
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, kind(f));
  // imports: local name -> {orig, spec}
  const imports = new Map();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause && st.importClause.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
      for (const el of st.importClause.namedBindings.elements) imports.set(el.name.text, { orig: (el.propertyName || el.name).text, spec: st.moduleSpecifier.text });
    }
  }
  const resolveFn = (local) => {
    const im = imports.get(local);
    const name = im ? im.orig : local;
    const defs = fnDefs.get(name);
    if (!defs) return null;
    for (const c of defs) {
      if (c.file === f && !im) return c;
      if (im && importMatches(f, im.spec, c.file, name)) return c;
    }
    return null;
  };
  const visit = n => {
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      if (ts.isIdentifier(e)) { const c = resolveFn(e.text); if (c) judge(n, sf, f, c, 'fn'); }
      else if (ts.isPropertyAccessExpression(e) && methDefs.has(e.name.text)) {
        const defs = methDefs.get(e.name.text);
        judge(n, sf, f, defs[0], 'method');
      }
    } else if (ts.isNewExpression(n) && ts.isIdentifier(n.expression)) {
      const local = n.expression.text; const im = imports.get(local); const name = im ? im.orig : local;
      const defs = ctorDefs.get(name);
      if (defs) for (const c of defs) if ((c.file === f && !im) || (im && importMatches(f, im.spec, c.file, name))) { judge(n, sf, f, { ...c, firstOptional: c.firstOptional }, 'new'); break; }
    } else if (ts.isIdentifier(n) && fnDefs.has((imports.get(n.text) || { orig: n.text }).orig)) {
      const p = n.parent;
      const isCallee = (ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression === n;
      const isDecl = (p.name === n) && (ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isPropertySignature(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isMethodSignature(p));
      const isImpExp = ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p);
      const isProp = ts.isPropertyAccessExpression(p) && p.name === n;
      const isType = ts.isTypeQueryNode(p) || ts.isQualifiedName(p) || ts.isTypeReferenceNode(p);
      if (!isCallee && !isDecl && !isImpExp && !isProp && !isType) {
        const c = resolveFn(n.text);
        if (c) out.byref.push({ at: `${f}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`, def: `${c.file}:${c.line} ${c.name}`, ctx: p.getText(sf).replace(/\s+/g, ' ').slice(0, 140) });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
fs.writeFileSync(path.join(OUT, 'scan.json'), JSON.stringify(out, null, 1));
for (const k of Object.keys(out)) console.log(k, out[k].length);
