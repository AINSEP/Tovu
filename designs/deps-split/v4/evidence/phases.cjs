// Design-time: R's phase census on the synthesized post-sheet root (synth.cjs output). Writes phases.json,
// and deps.after-R.ts (root replaced by phase calls, phase functions appended) for measuring with ESLint.
// node phases.cjs <deps.after-sheets.ts> <B-census.json> <rest.json> <out-dir>
const ts = require('/opt/node-tools/node_modules/typescript'); const fs = require('fs'); const crypto = require('crypto');
const [F, bF, rF, OUT] = process.argv.slice(2);
const src = fs.readFileSync(F, 'utf8'); const lines = src.split('\n');
const prog = ts.createProgram([F], { noResolve: true, noLib: true, types: [] }); const sf = prog.getSourceFile(F); const ck = prog.getTypeChecker();
const L = (p) => sf.getLineAndCharacterOfPosition(p).line + 1;
const B = JSON.parse(fs.readFileSync(bF, 'utf8')); const R = JSON.parse(fs.readFileSync(rF, 'utf8'));
const fn = sf.statements.find((s) => s.name && s.name.text === 'composeSiteRouteDeps'); const root = fn.body.statements;
const rootDecl = new Map(); const lets = new Set();
const addNames = (n, f) => { if (ts.isIdentifier(n)) f(n); else if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) n.elements.forEach((e) => { if (!ts.isOmittedExpression(e)) addNames(e.name, f); }); };
fn.parameters.forEach((p) => addNames(p.name, (id) => rootDecl.set(id.parent, { name: id.text, idx: -1 })));
root.forEach((s, idx) => { if (ts.isVariableStatement(s)) { const isLet = !(s.declarationList.flags & ts.NodeFlags.Const); s.declarationList.declarations.forEach((d) => addNames(d.name, (id) => { rootDecl.set(id.parent, { name: id.text, idx, isLet }); if (isLet) lets.add(id.text); })); } });
function refs(node) { const out = []; const v = (n, inFn) => {
  if (ts.isIdentifier(n)) { const p = n.parent; if (p && ((ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || (ts.isQualifiedName(p) && p.right === n))) return;
    let sym = (p && ts.isShorthandPropertyAssignment(p)) ? ck.getShorthandAssignmentValueSymbol(p) : ck.getSymbolAtLocation(n);
    const d = sym && sym.declarations && sym.declarations.find((x) => rootDecl.has(x)); if (!d || d === p) return;
    if (ts.findAncestor(n, (x) => ts.isTypeNode(x))) return;
    out.push({ n: n.text, idx: rootDecl.get(d).idx, inFn, write: p && ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind === ts.SyntaxKind.EqualsToken }); return; }
  ts.forEachChild(n, (c) => v(c, inFn || ts.isFunctionLike(c))); }; v(node, false); return out; }
const first = (s) => s.getText().split('\n')[0].trim();
const P = [
  ['composeStoragePhase', 'const { assistantAgentInventory', 'const { resolvedUploadsDir'],
  ['composeSiteServicesPhase', 'logMediaProviderRefusals(', 'const { runtimeMode, siteDirForKeyring'],
  ['composeProviderLifecyclePhase', 'onStoreClose({ registration: async () => {', 'const { observability, tracker, aiTraceSink }'],
  ['composeInstrumentedContentPhase', 'flushLifecycleEvents(', 'const { postRepo, changeSets'],
  ['composePublishingPhase', 'const { mediaContentTypeStore', 'const { guardedOutboundHttpClient'],
  ['assembleRouteDepsPhase', 'const { adminSurfaceHandlersReady', 'routeDeps.pluginHost = createTovuPluginHost'],
  ['finishRouteDepsPhase', 'routeDeps.pluginRuntimeReady =', 'configureVisitorConsentAnalytics('],
];
const allRefs = root.map((s) => refs(s));
const declaredAt = (i) => { const s = root[i]; const n = []; if (ts.isVariableStatement(s)) s.declarationList.declarations.forEach((d) => addNames(d.name, (id) => n.push(id.text))); return n; };
const writesAt = new Map(); allRefs.forEach((rs, i) => rs.filter((r) => r.write).forEach((r) => (writesAt.get(r.n) || writesAt.set(r.n, []).get(r.n)).push(i)));
const phases = [];
for (const [name, a, b] of P) {
  const i0 = root.findIndex((s) => first(s).startsWith(a)), i1 = root.findIndex((s, i) => i >= i0 && first(s).startsWith(b));
  if (i0 < 0 || i1 < 0) throw new Error('phase bounds ' + name);
  const inside = new Set(); for (let i = i0; i <= i1; i++) declaredAt(i).forEach((n) => inside.add(n));
  const inputs = new Map(); const errs = [];
  for (let i = i0; i <= i1; i++) for (const r of allRefs[i]) { if (inside.has(r.n)) continue; if (r.write) errs.push('writes ' + r.n);
    const later = r.idx > i1; const reassignedLater = (writesAt.get(r.n) || []).some((w) => w > i0);
    const o = inputs.get(r.n) || { n: r.n, idx: r.idx, eager: false, deferred: false }; if (r.inFn) o.deferred = true; else o.eager = true;
    o.mode = later || (lets.has(r.n) && reassignedLater) ? 'getter' : 'value'; if (later && o.eager) errs.push('eager later ' + r.n); if (lets.has(r.n) && reassignedLater && o.eager) errs.push('eager let ' + r.n); inputs.set(r.n, o); }
  const outputs = [...inside].filter((n) => allRefs.some((rs, i) => (i < i0 || i > i1) && rs.some((r) => r.n === n)));
  const a0 = L(root[i0].getFullStart()) + 1, s0 = L(root[i0].getStart()), e1 = L(root[i1].end);
  const body = lines.slice(s0 - 1, e1); // statements and the comments between them, verbatim
  const code = body.filter((l) => l.trim() && !l.trim().startsWith('//')).length;
  phases.push({ name, i0, i1, startLine: s0, endLine: e1, first: lines[s0 - 1], last: lines[e1 - 1], inputs: [...inputs.values()].sort((x, y) => x.idx - y.idx || x.n.localeCompare(y.n)), outputs, code, errs, statements: i1 - i0 + 1 });
}
// declared-as text for each input (root statement line, or B/L/H/phase origin)
const bOut = new Map(); B.forEach((c) => c.range && c.outputs.forEach((o) => bOut.set(o, c)));
const pOut = new Map(); phases.forEach((p) => p.outputs.forEach((o) => pOut.set(o, p)));
for (const p of phases) for (const i of p.inputs) { const c = bOut.get(i.n); const q = pOut.get(i.n);
  i.from = i.idx < 0 ? 'root parameter' : q && q !== p ? `${q.name} output` : c ? `${c.id} output` : 'root statement';
  i.declText = i.idx < 0 ? '' : first(root[i.idx]).slice(0, 150); i.typeHint = q && q !== p && c ? `ReturnType<typeof ${c.fn}>["${i.n}"]` : c ? `ReturnType<typeof ${c.fn}>["${i.n}"]` : ''; }
// root text after R and the phase functions, for measuring
const call = (p) => `  const { ${p.outputs.join(', ')} } = ${p.name}({ ${p.inputs.map((i) => i.mode === 'getter' ? `${i.n}: () => ${i.n}` : i.n).join(', ')} });`;
const callNoOut = (p) => `  ${p.name}({ ${p.inputs.map((i) => i.mode === 'getter' ? `${i.n}: () => ${i.n}` : i.n).join(', ')} });`;
const rootStart = L(fn.getStart()), rootEnd = L(fn.end);
const newRoot = lines.slice(rootStart - 1, rootEnd); const off = rootStart;
for (const p of [...phases].reverse()) { const callText = p.outputs.length ? call(p) : callNoOut(p); p.callText = callText.trim(); newRoot.splice(p.startLine - off, p.endLine - p.startLine + 1, callText); }
const getterize = (text, getters) => { let t = text; for (const g of getters) t = t.replace(new RegExp(`(?<![.\\w$])${g}(?![\\w$])(?!\\s*:)`, 'g'), `${g}()`); return t; };
const fns = phases.map((p) => { const g = p.inputs.filter((i) => i.mode === 'getter').map((i) => i.n);
  const body = lines.slice(p.startLine - 1, p.endLine).map((l) => getterize(l, g));
  return [`export function ${p.name}(required: ${p.name[0].toUpperCase() + p.name.slice(1)}Required, _optional = {}) {`, `  const { ${p.inputs.map((i) => i.n).join(', ')} } = required;`, ...body, `  return { ${p.outputs.join(', ')} };`, '}'].join('\n'); });
const after = lines.slice(0, rootStart - 1).concat(newRoot, lines.slice(rootEnd), [''], fns).join('\n');
fs.writeFileSync(`${OUT}/deps.after-R.ts`, after);
fs.writeFileSync(`${OUT}/phases.json`, JSON.stringify({ phases, newRoot }, null, 1));
for (const p of phases) console.log(p.name, `stmts=${p.statements} code=${p.code} in=${p.inputs.length} getters=${p.inputs.filter((i) => i.mode === 'getter').map((i) => i.n).join(',')} out=${p.outputs.length}`, p.errs.join(';'));
