// Design-time census for the v4 sheets M1-M3, H2-H4, L1-L7 and R on the tip (not used by any sheet).
// node census-rest.cjs <deps.ts> <readers.txt> <B-census.json> <out.json>   (run from the Tovu root; CHECK_B=1 cross-checks B01-B25)
// Scope-aware: identifiers resolve through the TypeScript checker, so a local that shadows a root
// binding (e.g. `store` inside configureSiteSharing's objectStore) is not counted as an input.
const ts = require('/opt/node-tools/node_modules/typescript'); const fs = require('fs'); const crypto = require('crypto');
const [F, readersF, bF, outF] = process.argv.slice(2);
const src = fs.readFileSync(F, 'utf8'); const lines = src.split('\n');
const prog = ts.createProgram([F], { noResolve: true, noLib: true, allowJs: false, target: ts.ScriptTarget.Latest, types: [] });
const sf = prog.getSourceFile(F); const ck = prog.getTypeChecker();
const L = (p) => sf.getLineAndCharacterOfPosition(p).line + 1;
const isCode = (l) => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); };
const codeOf = (a, b, ls = lines) => ls.slice(a - 1, b).filter(isCode).length;
const sha = (a, b, ls = lines) => crypto.createHash('sha256').update(ls.slice(a - 1, b).join('\n') + '\n').digest('hex');
const B = JSON.parse(fs.readFileSync(bF, 'utf8'));
// ---- declarations
const importOf = new Map(); const topDecl = new Map(); // name -> {line,a,b,node}
for (const s of sf.statements) {
  if (ts.isImportDeclaration(s) && s.importClause) { const spec = s.moduleSpecifier.text; const c = s.importClause;
    if (c.name) importOf.set(c.name.text, { spec, type: c.isTypeOnly });
    if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) importOf.set(c.namedBindings.name.text, { spec, type: c.isTypeOnly, ns: true });
    if (c.namedBindings && ts.isNamedImports(c.namedBindings)) c.namedBindings.elements.forEach((e) => importOf.set(e.name.text, { spec, type: c.isTypeOnly || e.isTypeOnly })); continue; }
  const rng = { a: L(s.getFullStart()) + (src.slice(s.getFullStart(), s.getStart()).match(/^\s*\n/) ? 0 : 0), start: L(s.getStart()), b: L(s.end), node: s };
  if (s.name) topDecl.set(s.name.text, rng);
  else if (ts.isVariableStatement(s)) s.declarationList.declarations.forEach((d) => topDecl.set(d.name.getText(), rng));
}
// leading comment start for a top-level/root statement: first line after previous statement's end (skipping blank lines)
function leadStart(stmt, siblings) { const i = siblings.indexOf(stmt); let a = i > 0 ? L(siblings[i - 1].end) + 1 : L(stmt.getFullStart()); while (a < L(stmt.getStart()) && !lines[a - 1].trim()) a++; return a; }
const fn = sf.statements.find((s) => s.name && s.name.text === 'composeSiteRouteDeps');
const root = fn.body.statements;
const rootDecl = new Map(); // decl node -> {name, stmt, isLet, line}
const params = new Set();
function addNames(n, f) { if (ts.isIdentifier(n)) f(n); else if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) n.elements.forEach((e) => { if (!ts.isOmittedExpression(e)) addNames(e.name, f); }); }
fn.parameters.forEach((p) => addNames(p.name, (id) => { params.add(id.text); rootDecl.set(id.parent, { name: id.text, stmt: null, isLet: false, line: 'param' }); }));
for (const s of root) {
  if (ts.isVariableStatement(s)) { const isLet = !(s.declarationList.flags & ts.NodeFlags.Const); s.declarationList.declarations.forEach((d) => addNames(d.name, (id) => rootDecl.set(id.parent, { name: id.text, stmt: s, isLet, line: L(s.getStart()) }))); }
  else if (ts.isFunctionDeclaration(s)) rootDecl.set(s, { name: s.name.text, stmt: s, isLet: false, line: L(s.getStart()), fn: true });
}
const writesOf = new Map(); // let name -> lines written
function classify(id) {
  const sym = ck.getSymbolAtLocation(id); if (!sym || !sym.declarations) return null;
  for (const d of sym.declarations) {
    if (rootDecl.has(d)) return { kind: 'root', ...rootDecl.get(d) };
    if (ts.isImportSpecifier(d) || ts.isImportClause(d) || ts.isNamespaceImport(d)) return { kind: 'import', name: id.text };
    if (d.parent === sf || (ts.isVariableDeclaration(d) && d.parent.parent.parent === sf)) return { kind: 'top', name: id.text };
  }
  return null;
}
function refs(nodes, rootNode) { const out = [];
  const v = (n, inFn) => {
    if (ts.isIdentifier(n)) { const p = n.parent;
      if (p && ts.isPropertyAccessExpression(p) && p.name === n) return; if (p && ts.isPropertyAssignment(p) && p.name === n) return;
      if (p && ts.isQualifiedName(p) && p.right === n) return;
      const c = (p && ts.isShorthandPropertyAssignment(p)) ? (() => { const s = ck.getShorthandAssignmentValueSymbol(p); const d = s && s.declarations && s.declarations[0]; return d && rootDecl.has(d) ? { kind: 'root', ...rootDecl.get(d) } : (s && classify(n)); })() : classify(n);
      if (!c) return; if (c.kind === 'root' && (rootDecl.has(p) && (p.name === n))) return;
      const write = p && ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind === ts.SyntaxKind.EqualsToken;
      out.push({ ...c, declLine: c.line, n: n.text, inFn, write, line: L(n.getStart()), type: !!ts.findAncestor(n, (x) => ts.isTypeNode(x)), shorthand: p && ts.isShorthandPropertyAssignment(p) }); return; }
    const f = ts.isFunctionLike(n) && n !== rootNode; ts.forEachChild(n, (c) => v(c, inFn || f)); };
  nodes.forEach((n) => v(n, false)); return out; }
// writes to root lets anywhere in the root
for (const s of root) for (const r of refs([s], s)) if (r.kind === 'root' && r.write) { (writesOf.get(r.n) || writesOf.set(r.n, []).get(r.n)).push(r.line); }
const readerTexts = fs.readFileSync(readersF, 'utf8').trim().split('\n').map((p) => [p, fs.readFileSync(p, 'utf8')]);
function lits(t) { const out = new Set(); const re = /(["'`])((?:\\.|(?!\1).){12,}?)\1|\/((?:\\.|[^\/\n]){12,})\/[gimsuy]*/g; let m; while ((m = re.exec(t))) { const s = (m[2] || m[3] || ''); if (!/[a-z]/i.test(s)) continue; out.add(s.replace(/\\\\/g, '\\')); } return out; }
const readerLits = readerTexts.map(([p, t]) => [p, lits(t)]);
const readersIn = (a, b, ls = lines) => { const region = ls.slice(a - 1, b).join('\n'); return readerLits.map(([p, l]) => [p, [...l].filter((s) => region.includes(s))]).filter(([, h]) => h.length); };
function uniqueAnchor(a, b, ls = lines) { const cnt = new Map(); ls.forEach((l) => cnt.set(l, (cnt.get(l) || 0) + 1)); for (let i = a; i <= b; i++) { const l = ls[i - 1]; if (l.trim().length > 20 && cnt.get(l) === 1) return i; } return null; }
const declText = (r) => r.line === 'param' ? '' : lines[r.line - 1].trim().slice(0, 150);
// inputs of a unit. callAt: line at which the unit's code first runs (range start / call site).
function inputsOf(rs, { declared, callAt, lazyAll = false }) {
  const m = new Map(); const errs = [];
  for (const r of rs) { if (r.kind !== 'root' || r.type || declared.has(r.n)) continue;
    if (r.write) errs.push(`writes root cell ${r.n} at ${r.line}`);
    const later = r.declLine !== 'param' && r.declLine >= callAt && !r.fn;
    const o = m.get(r.n) || { n: r.n, decl: r.declLine, declText: declText({ line: r.declLine }), let: r.isLet, later, eager: false, deferred: false, fn: !!r.fn };
    if (r.inFn || lazyAll) o.deferred = true; else o.eager = true; m.set(r.n, o); }
  for (const o of m.values()) { const reassignedAfter = (writesOf.get(o.n) || []).some((w) => w >= callAt); o.mode = (o.later || (o.let && reassignedAfter && !o.eager)) ? 'getter' : 'value'; if (o.later && o.eager) errs.push(`eager read of later ${o.n}`); }
  return { inputs: [...m.values()].sort((x, y) => (x.decl === 'param' ? 0 : x.decl) - (y.decl === 'param' ? 0 : y.decl) || x.n.localeCompare(y.n)), errs };
}
function rootLine(r) { return r.line; }
function importRows(rs, outsideText) { const used = [...new Set(rs.filter((r) => r.kind === 'import').map((r) => r.n))].sort(); used.filter((n) => !importOf.has(n)).forEach((n) => console.error('unknown import', n));
  return used.filter((n) => importOf.has(n)).map((n) => ({ n, spec: importOf.get(n).spec, type: importOf.get(n).type, alsoOutside: new RegExp('\\b' + n + '\\b').test(outsideText.replace(/^import [\s\S]*?;$/mg, '')) })); }
const topRows = (rs) => [...new Set(rs.filter((r) => r.kind === 'top').map((r) => r.n))].sort().map((n) => ({ n, line: topDecl.get(n) ? topDecl.get(n).start : null }));
const outside = (spans) => lines.filter((_, i) => !spans.some(([a, b]) => i + 1 >= a && i + 1 <= b)).join('\n');
const res = { M: [], H: [], L: [], R: null };
// ---------------- M (module-level moves)
const M = [
  { id: 'M1', name: 'overrides', names: ['CreateSiteRouteDepsOverrides', 'assertOverridesPairedOrAbsent', 'pluginFailureThresholdOverride', 'resolveThemesDirOverride', 'resolveSiteBindingOverride', 'resolveWorkspaceIdOverride'] },
  { id: 'M2', name: 'open-store', names: ['hydrateContentDbIfNeeded', 'prepareCompositionStorage', 'StoreCloseRegistration', 'openCompositionStore', 'resolveChatDbPath', 'startOwnerSweeps', 'startOwnerChatExpirySweep'] },
  { id: 'M3', name: 'provider-identity', names: ['providerPluginBoot', 'composeProviderConfig', 'credentialProject', 'acceptedSiteId', 'siteIdentityFor', 'projectStoreFor'] },
];
const movedBefore = new Set();
for (const m of M) {
  const decls = m.names.map((n) => { const d = topDecl.get(n); const a = leadStart(d.node, sf.statements); return { n, a, start: d.start, b: d.b, exported: !!(ts.getCombinedModifierFlags(d.node) & ts.ModifierFlags.Export), code: codeOf(a, d.b), sha: sha(a, d.b), anchor: lines[d.start - 1], kind: ts.SyntaxKind[d.node.kind] }; });
  const spans = decls.map((d) => [d.a, d.b]);
  const rs = refs(decls.map((d) => topDecl.get(d.n).node), null);
  const out = outside(spans);
  const usedTop = topRows(rs).filter((t) => !m.names.includes(t.n));
  const stillUsed = m.names.filter((n) => new RegExp('\\b' + n + '\\b').test(out.replace(/^import [\s\S]*?;$/mg, '')));
  for (const d of decls) { const c = lines.filter((l) => l === d.anchor).length; if (c !== 1) d.anchorDup = c; }
  res.M.push({ ...m, decls, imports: importRows(rs, out), top: usedTop.map((t) => ({ ...t, from: [...movedBefore].find((x) => x.names.includes(t.n))?.id || 'deps.ts' })), stillUsed, code: decls.reduce((s, d) => s + d.code, 0), readers: readersIn(Math.min(...spans.map((s) => s[0])), Math.max(...spans.map((s) => s[1]))).filter(([p, h]) => h.some((x) => spans.some(([a, b]) => lines.slice(a - 1, b).join('\n').includes(x)))) });
  movedBefore.add(m);
}
// ---------------- H (hoisted closure functions → module functions with real inputs)
const fnDecl = (name) => root.find((s) => ts.isFunctionDeclaration(s) && s.name.text === name);
const callLineOf = (name) => { for (let i = 0; i < lines.length; i++) if (new RegExp('\\b' + name + '\\(').test(lines[i]) && !/function /.test(lines[i])) return i + 1; };
const H = [
  { id: 'H1', name: 'chat-orphans-project-keys', fns: ['warnCompositionChatOrphans', 'compositionProjectKeys'] },
  { id: 'H2', name: 'shared-oauth-commerce', fns: ['compositionSharedOAuth', 'compositionCommerce'] },
  { id: 'H3', name: 'site-sharing', fns: ['configureSiteSharing'] },
  { id: 'H4', name: 'site-imports', fns: ['configureSiteImports'] },
];
for (const h of H) {
  const fns = h.fns.map((name) => { const d = fnDecl(name); const a = leadStart(d, root); const callAt = callLineOf(name);
    const rs = refs([d], d); const { inputs, errs } = inputsOf(rs, { declared: new Set(), callAt });
    return { name, a, start: L(d.getStart()), b: L(d.end), code: codeOf(L(d.getStart()), L(d.end)), sha: sha(a, L(d.end)), anchor: lines[L(d.getStart()) - 1], callAt, callText: lines[callAt - 1], inputs, errs, rs }; });
  const spans = fns.map((f) => [f.a, f.b]); const out = outside(spans); const rs = fns.flatMap((f) => f.rs);
  res.H.push({ ...h, fns: fns.map(({ rs, ...f }) => f), imports: importRows(rs, out), top: topRows(rs), readers: readersIn(Math.min(...spans.map((s) => s[0])), Math.max(...spans.map((s) => s[1]))) });
}
// ---------------- L (literal runs), computed on the text after H2 (H2 rewrites the call inside the literal)
const lit = root.find((s) => ts.isVariableStatement(s) && s.declarationList.declarations[0].name.getText() === 'routeDeps');
const obj = lit.declarationList.declarations[0].initializer; const litStart = L(lit.getStart());
const linesAfterH2 = lines.slice(); const h2 = res.H.find((h) => h.id === 'H2').fns[0];
const h2Args = h2.inputs.map((i) => i.mode === 'getter' ? `${i.n}: () => ${i.n}` : i.n).join(', ');
linesAfterH2[h2.callAt - 1] = lines[h2.callAt - 1].replace('compositionSharedOAuth()', `compositionSharedOAuth({ ${h2Args} })`);
const runs = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'runs-2d82735a.json'), 'utf8'));
const LDEF = [ // sheet → runs (each run = one function), by tip start line
  { id: 'L1', name: 'route-deps-content-chat', fns: [[2136, 'routeDepsContentTrash'], [2187, 'routeDepsChatAgents']] },
  { id: 'L2', name: 'route-deps-assistant-mcp', fns: [[2210, 'routeDepsAssistantSettings'], [2261, 'routeDepsExternalMcpOAuth'], [2284, 'routeDepsExecutionPlugins']] },
  { id: 'L3', name: 'route-deps-site-providers', fns: [[2294, 'routeDepsSiteThemesTelemetry'], [2356, 'routeDepsProviderAnalytics']] },
  { id: 'L4', name: 'route-deps-members-mail', fns: [[2378, 'routeDepsMembersMail'], [2416, 'routeDepsMailFormsNewsletter']] },
  { id: 'L5', name: 'route-deps-comments-plugins', fns: [[2496, 'routeDepsTaxonomyComments'], [2568, 'routeDepsPluginsSiteApp']] },
  { id: 'L6', name: 'route-deps-publish-credentials', fns: [[2646, 'routeDepsPublishCredentials']] },
];
const propsByLine = new Map(); let prevEnd = L(obj.getStart()); for (const p of obj.properties) { propsByLine.set(prevEnd + 1, p); p._a = prevEnd + 1; prevEnd = L(p.end); }
for (const l of LDEF) {
  const fns = l.fns.map(([start, fname]) => { const run = runs.find((r) => !r.spread && r.a === start); const props = obj.properties.filter((p) => p._a >= run.a && L(p.end) <= run.b);
    const rs = refs(props, null).map((r) => r); // inFn true only inside closures within entries
    const { inputs, errs } = inputsOf(rs.filter((r) => !(r.n === 'routeDeps')).concat(rs.filter((r) => r.n === 'routeDeps').map((r) => ({ ...r, inFn: true }))), { declared: new Set(), callAt: litStart });
    // compositionSharedOAuth (H2) is a module function by then; its call passes the H2 inputs instead
    const hFn = (n) => res.H.flatMap((h) => h.fns).find((f) => f.name === n);
    const hCalls = inputs.filter((i) => hFn(i.n)).map((i) => i.n);
    for (const n of hCalls) { inputs.splice(inputs.findIndex((i) => i.n === n), 1); for (const j of hFn(n).inputs) if (!inputs.some((k) => k.n === j.n)) inputs.push(j); }
    inputs.sort((x, y) => (x.decl === 'param' ? 0 : x.decl) - (y.decl === 'param' ? 0 : y.decl) || x.n.localeCompare(y.n));
    const anchorAt = uniqueAnchor(run.a, run.b, linesAfterH2);
    return { fn: fname, a: run.a, b: run.b, code: run.code, entries: run.n, keys: run.keys, sha: sha(run.a, run.b, linesAfterH2), anchorAt, anchor: linesAfterH2[anchorAt - 1], inputs, hCalls, errs, rs, before: lines[run.a - 2], after: lines[run.b] };
  });
  const spans = fns.map((f) => [f.a, f.b]); const out = outside([[litStart, L(lit.end)]]); const rs = fns.flatMap((f) => f.rs);
  // a run's imports are "move" only if no other line of deps.ts (outside every L run) uses them
  res.L.push({ ...l, fns: fns.map(({ rs, ...f }) => f), imports: importRows(rs, lines.filter((_, i) => !runs.some((r) => !r.spread && i + 1 >= r.a && i + 1 <= r.b)).join('\n')), top: topRows(rs), readers: readersIn(Math.min(...spans.map((s) => s[0])), Math.max(...spans.map((s) => s[1])), linesAfterH2) });
}
// ---------------- R: the root after every sheet, as units
const owner = (s) => { const a = L(s.getStart()), b = L(s.end); const bb = B.find((c) => c.range && a >= c.range[0] && b <= c.range[1]); if (bb) return bb.id;
  if (s === lit) return 'LIT'; if (ts.isFunctionDeclaration(s) && ['warnCompositionChatOrphans', 'compositionProjectKeys', 'compositionSharedOAuth', 'compositionCommerce', 'configureSiteSharing', 'configureSiteImports'].includes(s.name.text)) return 'HDECL'; return null; };
const units = []; for (const s of root) { const o = owner(s); const a = L(s.getStart()), b = L(s.end);
  const hasAwait = (function v(n) { if (n !== s && ts.isFunctionLike(n)) return false; if (ts.isAwaitExpression(n)) return true; return ts.forEachChild(n, v) || false; })(s);
  const isLetDecl = ts.isVariableStatement(s) && !(s.declarationList.flags & ts.NodeFlags.Const);
  const letWrite = ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression) && ts.isIdentifier(s.expression.left) && writesOf.has(s.expression.left.text) && s.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken;
  if (o && o !== 'LIT' && o !== 'HDECL') { if (units.length && units.at(-1).id === o) { units.at(-1).b = b; continue; } units.push({ id: o, a, b, cost: 1 }); continue; }
  if (o === 'HDECL') continue;
  units.push({ id: o === 'LIT' ? 'LIT' : null, a, b, first: lines[a - 1].trim().slice(0, 110), cost: o === 'LIT' ? null : codeOf(a, b), await: hasAwait, letDecl: isLetDecl, letWrite, fnDecl: ts.isFunctionDeclaration(s) ? s.name.text : null }); }
res.R = { units, lets: [...writesOf.entries()], sigLines: L(fn.body.getStart()) - L(fn.getStart()) + 1 };
fs.writeFileSync(outF, JSON.stringify(res, null, 1));
for (const m of res.M) console.log(m.id, m.code, 'imports', m.imports.length, 'top', JSON.stringify(m.top), 'still', m.stillUsed.join(','), 'readers', m.readers.map((r) => r[0].split('/').pop()).join(','), m.decls.filter((d) => d.anchorDup).map((d) => d.n + ' DUP').join(','));
for (const h of res.H) for (const f of h.fns) console.log(h.id, f.name, f.a, f.b, 'code', f.code, 'call', f.callAt, 'in', f.inputs.length, f.inputs.filter((i) => i.mode === 'getter').map((i) => i.n).join(','), f.errs.join(';'));
for (const l of res.L) for (const f of l.fns) console.log(l.id, f.fn, f.a, f.b, 'code', f.code, 'in', f.inputs.length, 'get', f.inputs.filter((i) => i.mode === 'getter').map((i) => i.n).join(','), 'anchor', f.anchorAt, f.errs.join(';'));
// ---- cross-check of the B census (name-based) against this scope-aware census
if (process.env.CHECK_B) {
  for (const c of B) { if (!c.range) continue; const [A, Bn] = c.range;
    const nodes = root.filter((s) => L(s.getStart()) >= A && L(s.end) <= Bn);
    const declared = new Set(); nodes.forEach((s) => { if (ts.isVariableStatement(s)) s.declarationList.declarations.forEach((d) => addNames(d.name, (id) => declared.add(id.text))); else if (ts.isFunctionDeclaration(s)) declared.add(s.name.text); });
    const rs = refs(nodes, null); const { inputs, errs } = inputsOf(rs, { declared, callAt: L(nodes[0].getStart()) });
    // inputsOf's `later` uses callAt = range start; B's rule: later = declared after range end
    const mine = new Map(inputs.map((i) => [i.n, i])); const theirs = new Map(c.inputs.map((i) => [i.n, i]));
    const extra = [...theirs.keys()].filter((n) => !mine.has(n)), missing = [...mine.keys()].filter((n) => !theirs.has(n));
    const mode = [...mine.values()].filter((i) => theirs.has(i.n)).filter((i) => { const later = i.decl !== 'param' && i.decl > Bn; const reassignedAfter = (writesOf.get(i.n) || []).some((w) => w > Bn); const m = (later || (i.let && reassignedAfter && !i.eager)) ? 'getter' : 'value'; return m !== theirs.get(i.n).mode; }).map((i) => i.n);
    if (process.env.ALL || extra.length || missing.length || mode.length || errs.length) console.log(c.id, nodes.length, mine.size, theirs.size, 'extra(in sheet, not read):', extra.join(','), '| missing:', missing.join(','), '| mode differs:', mode.join(','), '|', errs.filter((e) => !e.startsWith('eager read of later')).join(';'));
  }
}
