// Graph analysis over edges.json. Usage: node graph.mjs <edges.json> <mode> [args]
import fs from 'node:fs';
const [inFile, mode, ...args] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const SRC = d.srcRel + '/';

export function unitOf(file, depthFor = {}) {
  const rel = file.slice(SRC.length);
  const p = rel.split('/');
  if (p[0] === 'features') return p.length > 2 ? 'features/' + p[1] : 'features/(root)';
  if (p.length === 1) return '(src-root)';
  if (p[0] === 'platform' || p[0] === 'server') return p.length > 2 ? p[0] + '/' + p[1] : p[0] + '/(root)';
  return p[0];
}

export function scc(nodes, adj) {
  let idx = 0; const index = new Map(), low = new Map(), on = new Set(), st = [], out = [];
  const strong = (v0) => {
    const work = [[v0, 0]];
    index.set(v0, idx); low.set(v0, idx); idx++; st.push(v0); on.add(v0);
    while (work.length) {
      const top = work[work.length - 1]; const [v, i] = top; const ns = adj.get(v) || [];
      if (i < ns.length) {
        top[1]++; const w = ns[i];
        if (!index.has(w)) { index.set(w, idx); low.set(w, idx); idx++; st.push(w); on.add(w); work.push([w, 0]); }
        else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
      } else {
        work.pop();
        if (work.length) { const u = work[work.length - 1][0]; low.set(u, Math.min(low.get(u), low.get(v))); }
        if (low.get(v) === index.get(v)) { const comp = []; let w; do { w = st.pop(); on.delete(w); comp.push(w); } while (w !== v); out.push(comp); }
      }
    }
  };
  for (const v of nodes) if (!index.has(v)) strong(v);
  return out;
}

// Exact minimum feedback arc set by DP over subsets (n <= 26). weights: Map "a>b" -> w.
export function minFAS(nodes, w) {
  const n = nodes.length; if (n > 26) throw new Error('too big for exact DP: ' + n);
  const id = new Map(nodes.map((x, i) => [x, i]));
  const outW = Array.from({ length: n }, () => new Int32Array(n));
  for (const [k, val] of w) { const [a, b] = k.split('>'); if (id.has(a) && id.has(b)) outW[id.get(a)][id.get(b)] = val; }
  const size = 1 << n; const dp = new Int32Array(size).fill(1e9); const ch = new Int8Array(size); dp[0] = 0;
  for (let S = 1; S < size; S++) {
    let best = 1e9, bc = -1;
    for (let v = 0; v < n; v++) if (S & (1 << v)) {
      const P = S ^ (1 << v); let c = dp[P];
      // v placed after all of P: edges v -> u (u in P) go backwards
      const row = outW[v]; let m = P; while (m) { const u = 31 - Math.clz32(m & -m); c += row[u]; m &= m - 1; }
      if (c < best) { best = c; bc = v; }
    }
    dp[S] = best; ch[S] = bc;
  }
  const order = []; let S = size - 1; while (S) { order.push(nodes[ch[S]]); S ^= 1 << ch[S]; } order.reverse();
  const pos = new Map(order.map((x, i) => [x, i])); const cut = [];
  for (const [k, val] of w) { const [a, b] = k.split('>'); if (pos.has(a) && pos.has(b) && pos.get(a) > pos.get(b)) cut.push([a, b, val]); }
  return { cost: dp[size - 1], order, cut };
}

function unitGraph(filter) {
  const agg = new Map(); // "a>b" -> {imports, files:Set, tofiles:Set, names:Map, dyn}
  for (const e of d.edges) {
    if (!filter(e)) continue;
    const a = unitOf(e.from), b = unitOf(e.to); if (a === b) continue;
    const k = a + '>' + b; let r = agg.get(k); if (!r) agg.set(k, r = { a, b, imports: 0, files: new Set(), tofiles: new Set(), names: new Map(), dyn: 0, stat: 0 });
    r.imports++; r.files.add(e.from); r.tofiles.add(e.to); if (e.dynamic) r.dyn++; else r.stat++;
    for (const n of e.names) if (n.use === 'value' || !filter.valueNamesOnly) r.names.set(n.name, (r.names.get(n.name) || 0) + 1);
  }
  return agg;
}
const isRuntime = (e) => e.kind === 'runtime';
const isRuntimeStatic = (e) => e.kind === 'runtime' && !e.dynamic;
const isType = (e) => e.kind !== 'runtime';
const any = () => true;

function adjOf(agg, nodeFilter = () => true) {
  const adj = new Map(); const nodes = new Set();
  for (const r of agg.values()) { if (!nodeFilter(r.a) || !nodeFilter(r.b)) continue; nodes.add(r.a); nodes.add(r.b); if (!adj.has(r.a)) adj.set(r.a, []); adj.get(r.a).push(r.b); }
  return { nodes: [...nodes].sort(), adj };
}
const featOnly = (u) => u.startsWith('features/');

if (mode === 'summary') {
  for (const [label, f, nf] of [['features-only runtime', isRuntime, featOnly], ['features-only runtime static', isRuntimeStatic, featOnly], ['features-only all(type incl)', any, featOnly], ['all-units runtime', isRuntime, () => true], ['all-units all', any, () => true]]) {
    const agg = unitGraph(f); const { nodes, adj } = adjOf(agg, nf);
    const comps = scc(nodes, adj).filter((c) => c.length > 1);
    let edgesN = 0, mutual = 0; for (const r of agg.values()) if (nf(r.a) && nf(r.b)) { edgesN++; if (r.a < r.b && agg.has(r.b + '>' + r.a)) mutual++; }
    console.log(`\n## ${label}: nodes=${nodes.length} edges=${edgesN} mutualPairs=${mutual} SCCs>1=${comps.length} sizes=${comps.map((c) => c.length).join(',')}`);
    for (const c of comps) console.log('  SCC:', c.sort().join(' '));
  }
  // file-level SCCs
  for (const [label, f] of [['file runtime(static+dynamic)', isRuntime], ['file runtime static', isRuntimeStatic], ['file all', any]]) {
    const adj = new Map(); const nodes = new Set(d.files);
    for (const e of d.edges) if (f(e)) { if (!adj.has(e.from)) adj.set(e.from, []); adj.get(e.from).push(e.to); }
    const comps = scc([...nodes], adj).filter((c) => c.length > 1);
    console.log(`\n## ${label}: SCCs>1=${comps.length} sizes=${comps.map((c) => c.length).sort((a, b) => b - a).join(',')}`);
    if (f !== any) for (const c of comps) console.log('  ', c.sort().map((x) => x.slice(SRC.length)).join('  '));
  }
}

if (mode === 'fas') {
  const which = args[0] || 'features';
  const nf = which === 'features' ? featOnly : () => true;
  const agg = unitGraph(isRuntime); const { nodes, adj } = adjOf(agg, nf);
  const comps = scc(nodes, adj).filter((c) => c.length > 1);
  for (const c of comps) {
    c.sort();
    const inC = new Set(c); const wU = new Map(), wI = new Map(), wF = new Map();
    for (const r of agg.values()) if (inC.has(r.a) && inC.has(r.b)) { wU.set(r.a + '>' + r.b, 1); wI.set(r.a + '>' + r.b, r.imports); wF.set(r.a + '>' + r.b, r.files.size); }
    console.log(`\nSCC size ${c.length}, internal edges ${wU.size}`);
    for (const [label, w] of [['unweighted (min #feature edges)', wU], ['weighted by import statements', wI], ['weighted by importing files', wF]]) {
      const r = minFAS(c, w);
      console.log(`  ${label}: cost=${r.cost} cutEdges=${r.cut.length}`);
      console.log('    order(low->high: later may import earlier): ' + r.order.join(' < '));
      for (const [a, b, v] of r.cut.sort()) console.log(`    CUT ${a} -> ${b} (${wI.get(a + '>' + b)} imports / ${wF.get(a + '>' + b)} files)`);
    }
  }
}

if (mode === 'edges') { // dump unit edges within the given SCC (runtime + type)
  const aggR = unitGraph(isRuntime), aggT = unitGraph(isType);
  const want = new Set(args);
  const rows = [];
  for (const [k, r] of aggR) if ((!want.size) || (want.has(r.a) && want.has(r.b))) rows.push(['runtime', r]);
  for (const [k, r] of aggT) if ((!want.size) || (want.has(r.a) && want.has(r.b))) rows.push(['type', r]);
  for (const [kind, r] of rows.sort((x, y) => (x[1].a + x[1].b).localeCompare(y[1].a + y[1].b))) console.log([r.a, r.b, kind, r.imports, r.files.size, r.dyn, [...r.names.keys()].join(',')].join('\t'));
}

if (mode === 'sites') { // file-level sites for unit edge a>b
  const [a, b] = args;
  for (const e of d.edges) if (unitOf(e.from) === a && unitOf(e.to) === b) console.log(`${e.kind}${e.dynamic ? '+dyn' : ''}\t${e.from.slice(SRC.length)}:${e.line}\t-> ${e.to.slice(SRC.length)}\t${e.names.map((n) => n.name + (n.use !== 'value' ? ':' + n.use : '')).join(',')}`);
}

if (mode === 'verify') { // args: list of "a>b" feature edges (without features/ prefix) to remove; prints remaining SCCs in features-only runtime graph
  const cut = new Set(args.map((x) => x.split('>').map((y) => 'features/' + y).join('>')));
  const agg = unitGraph(isRuntime); for (const k of cut) { if (!agg.has(k)) console.log('WARN no such edge', k); agg.delete(k); }
  const { nodes, adj } = adjOf(agg, featOnly);
  const comps = scc(nodes, adj).filter((c) => c.length > 1);
  console.log('remaining SCCs:', comps.length, comps.map((c) => c.sort().join(' ')).join(' | '));
  if (!comps.length) { // print a layering: longest-path depth (0 = imports nothing in graph)
    const depth = new Map(); const dfs = (v) => { if (depth.has(v)) return depth.get(v); let m = 0; for (const w of adj.get(v) || []) m = Math.max(m, 1 + dfs(w)); depth.set(v, m); return m; };
    for (const v of nodes) dfs(v);
    const by = {}; for (const [v, dd] of depth) (by[dd] ||= []).push(v.replace('features/', ''));
    for (const k of Object.keys(by).sort((a, b) => a - b)) console.log('  depth', k, ':', by[k].sort().join(', '));
  }
}
if (mode === 'closure') { // args: files (relative to src). prints runtime-reachable units and files outside the start unit
  const adj = new Map(); for (const e of d.edges) if (e.kind === 'runtime') { if (!adj.has(e.from)) adj.set(e.from, []); adj.get(e.from).push(e.to); }
  for (const a of args) {
    const start = SRC + a; const seen = new Set([start]); const q = [start];
    while (q.length) { const v = q.pop(); for (const w of adj.get(v) || []) if (!seen.has(w)) { seen.add(w); q.push(w); } }
    const units = {}; for (const f of seen) (units[unitOf(f)] ||= []).push(f.slice(SRC.length));
    console.log(`\n${a}: reaches ${seen.size - 1} files; units: ` + Object.entries(units).map(([u, fs2]) => `${u}(${fs2.length})`).sort().join(' '));
    const own = unitOf(start); console.log('   same-unit files: ' + (units[own] || []).map((x) => x.split('/').slice(2).join('/')).join(' '));
  }
}

if (mode === 'ranks') { // args: cut edges "a>b"; writes ranks json to stdout: {feature: rank} for ALL feature dirs (isolated = 0); also upward type-only edge stats
  const cut = new Set(args.map((x) => x.split('>').map((y) => 'features/' + y).join('>')));
  const agg = unitGraph(isRuntime); for (const k of cut) agg.delete(k);
  const { nodes, adj } = adjOf(agg, featOnly);
  const depth = new Map(); const dfs = (v) => { if (depth.has(v)) return depth.get(v); let m = 0; for (const w of adj.get(v) || []) m = Math.max(m, 1 + dfs(w)); depth.set(v, m); return m; };
  for (const v of nodes) dfs(v);
  const all = new Set(d.files.map(unitOf).filter(featOnly)); all.delete('features/(root)');
  const ranks = {}; for (const f of [...all].sort()) ranks[f.replace('features/', '')] = depth.get(f) ?? 0;
  const aggT = unitGraph(isType); let up = 0, upImports = 0; const ups = [];
  for (const r of aggT.values()) if (featOnly(r.a) && featOnly(r.b) && r.a !== 'features/(root)' && r.b !== 'features/(root)') { const ra = ranks[r.a.slice(9)], rb = ranks[r.b.slice(9)]; if (rb >= ra) { up++; upImports += r.imports; ups.push(`${r.a.slice(9)}(${ra})>${r.b.slice(9)}(${rb}):${r.imports}`); } }
  console.error('features', Object.keys(ranks).length, 'type-only feature edges total', [...aggT.values()].filter((r) => featOnly(r.a) && featOnly(r.b)).length, 'upward-or-same-rank type-only edges', up, 'imports', upImports);
  console.error(ups.join(' '));
  console.log(JSON.stringify(ranks));
}

if (mode === 'steps') { // cumulative cuts -> SCC size + mutual pairs + violations
  const agg = unitGraph(isRuntime); const report = (label) => { const { nodes, adj } = adjOf(agg, featOnly); const comps = scc(nodes, adj).filter((c) => c.length > 1); let mutual = 0; for (const r of agg.values()) if (featOnly(r.a) && featOnly(r.b) && r.a < r.b && agg.has(r.b + '>' + r.a)) mutual++; console.log(label, '| SCC sizes:', comps.map((c) => c.length).join(',') || 'none', '| mutual pairs:', mutual); };
  report('baseline');
  for (const x of args) { const k = x.split('>').map((y) => 'features/' + y).join('>'); agg.delete(k); report('after cut ' + x); }
}
