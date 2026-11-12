// Import-cycle analysis from dependency-cruiser JSON + a regex-built Jini package graph.
// Writes cycles.tsv (every no-circular cycle path + every SCC), package/feature SCCs, summary JSON.
import fs from "node:fs"; import path from "node:path";
const D = "/home/user/Tovu/development/cloud/quality-1111/static";
const runs = [ // name, repo, cwd prefix (repo-relative)
  ["tovu-website", "tovu", ""], ["tovu-admin", "tovu", "apps/admin/"], ["tovu-desktop", "tovu", "apps/desktop/"],
  ["tovu-site-chat", "tovu", "apps/site-chat/"], ["tovu-packages-content", "tovu", ""], ["jini", "jini", ""],
];
const norm = (pfx, p) => path.posix.normalize(pfx + p);
function tarjan(nodes, adj) {
  let idx = 0; const st = [], on = new Set(), I = new Map(), L = new Map(), out = [];
  const sc = (v) => { // iterative
    const work = [[v, 0]]; I.set(v, idx); L.set(v, idx); idx++; st.push(v); on.add(v);
    while (work.length) {
      const top = work[work.length - 1]; const [u, i] = top; const ns = [...(adj.get(u) ?? [])];
      if (i < ns.length) { top[1]++; const w = ns[i];
        if (!I.has(w)) { I.set(w, idx); L.set(w, idx); idx++; st.push(w); on.add(w); work.push([w, 0]); }
        else if (on.has(w)) L.set(u, Math.min(L.get(u), I.get(w)));
      } else { work.pop(); if (work.length) { const p = work[work.length - 1][0]; L.set(p, Math.min(L.get(p), L.get(u))); }
        if (L.get(u) === I.get(u)) { const c = []; let w; do { w = st.pop(); on.delete(w); c.push(w); } while (w !== u); out.push(c); } }
    }
  };
  for (const n of nodes) if (!I.has(n)) sc(n);
  return out.filter((c) => c.length > 1 || (adj.get(c[0]) ?? new Set()).has(c[0]));
}
const rows = []; const summary = {}; const seenCycle = { tovu: new Set(), jini: new Set() }; const graphs = { tovu: new Map(), jini: new Map() }; const typeOnly = { tovu: new Set(), jini: new Set() };
for (const [name, repo, pfx] of runs) {
  const f = `${D}/raw/depcruise-${name}.json`; if (!fs.existsSync(f)) continue;
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  const seen = new Set();
  for (const v of j.summary.violations.filter((v) => v.type === "cycle")) {
    const cyc = [norm(pfx, v.from), ...v.cycle.map((c) => norm(pfx, c.name))];
    const allType = v.cycle.every((c) => c.dependencyTypes.includes("type-only")) ;
    const anyType = v.cycle.some((c) => c.dependencyTypes.includes("type-only")) || (v.dependencyTypes ?? []).includes("type-only");
    const key = [...new Set(cyc)].sort().join(">"); if (seenCycle[repo].has(key)) continue; seenCycle[repo].add(key); // dedupe across runs (desktop follows imports into website)
    rows.push([repo, name, "cycle-path", cyc.length - 1, anyType ? (allType ? "all-type-only" : "has-type-only-edge") : "runtime", cyc.join(" -> ")]);
  }
  const g = graphs[repo];
  for (const m of j.modules) {
    const s = norm(pfx, m.source); if (/node_modules|^\.\.|\/dist\//.test(s) || m.coreModule) continue;
    if (!g.has(s)) g.set(s, new Set());
    for (const d of m.dependencies) {
      if (d.coreModule || d.couldNotResolve || /node_modules/.test(d.resolved)) continue;
      const t = norm(pfx, d.resolved); if (/^\.\./.test(t)) continue;
      g.get(s).add(t); if (d.dependencyTypes.includes("type-only")) typeOnly[repo].add(s + ">" + t);
    }
  }
  summary[name] = { modules: j.modules.length, noCircularViolations: j.summary.violations.filter((v) => v.type === "cycle").length };
}
// SCCs per repo (module level), with/without type-only edges
const sccOut = {};
for (const repo of ["tovu", "jini"]) {
  const g = graphs[repo]; const sccs = tarjan([...g.keys()], g);
  const gr = new Map([...g].map(([k, v]) => [k, new Set([...v].filter((t) => !typeOnly[repo].has(k + ">" + t)))]));
  const sccsRuntime = tarjan([...gr.keys()], gr);
  sccs.sort((a, b) => b.length - a.length).forEach((c, i) => rows.push([repo, "module-scc", `scc-${i + 1}`, c.length, "incl-type-only", c.sort().join(" | ")]));
  sccsRuntime.sort((a, b) => b.length - a.length).forEach((c, i) => rows.push([repo, "module-scc-runtime", `rscc-${i + 1}`, c.length, "runtime-edges-only", c.sort().join(" | ")]));
  sccOut[repo] = { sccs: sccs.length, modulesInSccs: sccs.reduce((a, c) => a + c.length, 0), largest: sccs[0]?.length ?? 0, runtimeSccs: sccsRuntime.length, runtimeModulesInSccs: sccsRuntime.reduce((a, c) => a + c.length, 0) };
}
// Tovu feature <-> feature (website + admin features dirs)
const featOf = (p) => { const m = /^apps\/(website|admin)\/src\/features\/([^/]+)\//.exec(p); return m ? `${m[1]}:${m[2]}` : null; };
const fg = new Map(); const fedges = new Map();
for (const [s, ts] of graphs.tovu) { const a = featOf(s); if (!a) continue; if (!fg.has(a)) fg.set(a, new Set());
  for (const t of ts) { const b = featOf(t); if (!b || b === a) continue; fg.get(a).add(b); const k = a + ">" + b; fedges.set(k, (fedges.get(k) ?? []).concat(`${s} -> ${t}`)); } }
const fsccs = tarjan([...fg.keys()], fg);
const fgR = new Map(); for (const [s, ts] of graphs.tovu) { const a = featOf(s); if (!a) continue; if (!fgR.has(a)) fgR.set(a, new Set());
  for (const t of ts) { const b = featOf(t); if (b && b !== a && !typeOnly.tovu.has(s + ">" + t)) fgR.get(a).add(b); } }
const fsccsR = tarjan([...fgR.keys()], fgR).sort((a, b) => b.length - a.length);
fsccsR.forEach((c, i) => rows.push(["tovu", "feature-scc-runtime", `frscc-${i + 1}`, c.length, "runtime-imports-only", c.sort().join(" | ")]));
const fpairs = [];
for (const [k] of fedges) { const [a, b] = k.split(">"); if (a < b && fedges.has(b + ">" + a)) fpairs.push([a, b, fedges.get(k).length, fedges.get(b + ">" + a).length, fedges.get(k)[0], fedges.get(b + ">" + a)[0]]); }
fsccs.sort((a, b) => b.length - a.length).forEach((c, i) => rows.push(["tovu", "feature-scc", `fscc-${i + 1}`, c.length, "feature-level", c.sort().join(" | ")]));
fpairs.forEach((p) => rows.push(["tovu", "feature-pair", `${p[0]} <-> ${p[1]}`, 2, `${p[2]}/${p[3]} file edges`, `${p[4]} || ${p[5]}`]));
// Jini package graph from @jini-ai/<pkg> specifiers in prod files
const files = fs.readFileSync(`${D}/raw/files-jini.txt`, "utf8").split("\n").filter(Boolean);
const pg = new Map(); const pe = new Map();
const re = /(?:^|[\s;}])(import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s*)?["'](@jini-ai\/[a-z0-9-]+)[^"']*["']|import\(\s*["'](@jini-ai\/[a-z0-9-]+)/gm;
for (const f of files) {
  const a = f.split("/")[1]; if (!pg.has(a)) pg.set(a, new Set());
  const txt = fs.readFileSync(`/home/user/Jini/${f}`, "utf8"); let m; re.lastIndex = 0;
  while ((m = re.exec(txt))) { const b = (m[3] ?? m[4]).slice(9); if (b === a) continue; pg.get(a).add(b);
    const k = a + ">" + b; const e = pe.get(k) ?? { files: new Set(), typeOnly: true }; e.files.add(f); if (!m[2]) e.typeOnly = false; pe.set(k, e); }
}
const psccs = tarjan([...pg.keys()], pg).sort((a, b) => b.length - a.length);
psccs.forEach((c, i) => rows.push(["jini", "package-scc", `pscc-${i + 1}`, c.length, "package-level", c.sort().join(" | ")]));
const ppairs = [];
for (const [k, e] of pe) { const [a, b] = k.split(">"); const r = pe.get(b + ">" + a); if (a < b && r) ppairs.push([a, b, e, r]); }
ppairs.forEach(([a, b, e, r]) => rows.push(["jini", "package-pair", `${a} <-> ${b}`, 2, `${e.files.size}${e.typeOnly ? "T" : ""}/${r.files.size}${r.typeOnly ? "T" : ""} files`, `${[...e.files][0]} -> @jini-ai/${b} || ${[...r.files][0]} -> @jini-ai/${a}`]));
const pgRuntime = new Map([...pg].map(([a, s]) => [a, new Set([...s].filter((b) => !pe.get(a + ">" + b)?.typeOnly))]));
const psccsRt = tarjan([...pgRuntime.keys()], pgRuntime).sort((a, b) => b.length - a.length);
psccsRt.forEach((c, i) => rows.push(["jini", "package-scc-runtime", `prscc-${i + 1}`, c.length, "runtime-imports-only", c.sort().join(" | ")]));
fs.writeFileSync(`${D}/cycles.tsv`, "repo\tkind\tid_or_run\tsize\tedge_types\tmembers_or_path\n" + rows.map((r) => r.join("\t")).join("\n") + "\n");
fs.writeFileSync(`${D}/raw/jini-package-graph.json`, JSON.stringify(Object.fromEntries([...pe].map(([k, e]) => [k, { files: e.files.size, typeOnly: e.typeOnly }])), null, 1));
const out = { perRun: summary, moduleScc: sccOut, tovuFeatureSccs: fsccs.map((c) => c.length), tovuFeaturePairs: fpairs.length, tovuFeatureSccsRuntime: fsccsR.map((c) => c.length), jiniPackages: pg.size, jiniPackageEdges: pe.size, jiniPackageSccs: psccs.map((c) => c.length), jiniPackagePairs: ppairs.length, jiniPackageSccsRuntime: psccsRt.map((c) => c.length) };
fs.writeFileSync(`${D}/raw/cycles-summary.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out));
