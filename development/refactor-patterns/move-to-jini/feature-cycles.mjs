#!/usr/bin/env node
// Feature-level import-cycle check for apps/website/src/features (and admin features).
// Why a home-grown script: the codebase-memory graph's TS import edges are wrong, and
// dependency-cruiser only reports module cycles, not the feature-level SCC this refactor
// must drive to zero. Regex parsing is enough here: specifiers are static strings.
//
// Usage: node development/refactor-patterns/move-to-jini/feature-cycles.mjs [--app website|admin]
//          [--edges] [--all-edges] [--json] [--max-scc N]
//   default: runtime edges only (import type / export type / all-`type` named lists dropped),
//   prints every feature SCC (size > 1) and the mutual feature pairs.
//   --edges      also print each feature->feature edge inside an SCC with file:line evidence.
//   --all-edges  print every cross-feature runtime edge (not only SCC ones).
//   --max-scc N  exit 1 when the largest SCC has more than N features (stage gate). Default: report only.
//   --max-pairs N exit 1 when there are more than N mutual feature pairs.
//   --drop a->b,...  planning aid: pretend these feature edges are gone, print the resulting SCCs.
//   --assert-no-edge a->b,...  exit 1 while any listed feature edge still exists (stage gate).
//   --include-type   count import-type edges too (the stricter target; default is runtime only).
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const app = opt("--app", "website");
const root = resolve(process.cwd());
const srcRoot = join(root, "apps", app, "src");
const featRoot = join(srcRoot, "features");

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const IMPORT_RE = /(^|\n)\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g;
const SIDE_RE = /(^|\n)\s*import\s*['"]([^'"]+)['"]/g;
// `import("x").Name` in a type position is a type reference, not a dynamic import (only `.then` is runtime).
const DYN_RE = /import\(\s*['"]([^'"]+)['"]\s*\)(\.(\w+))?/g;

function typeOnlyClause(kw, typeKw, clause) {
  if (typeKw) return true;
  const m = clause.match(/^\{([\s\S]*)\}$/);
  if (!m) return false; // default/namespace import => runtime
  const parts = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((s) => s.startsWith("type "));
}

// Aliases: root package.json "imports" maps `#src/*` -> apps/website/src/*; apps/admin/tsconfig.json
// maps `@/*` -> apps/admin/src/*. Without these the graph misses most cross-feature edges.
function aliasBase(spec) {
  if (spec.startsWith("#src/")) return join(root, "apps", "website", "src", spec.slice(5));
  if (app === "admin" && spec.startsWith("@/")) return join(root, "apps", "admin", "src", spec.slice(2));
  return null;
}

function resolveSpec(fromFile, spec) {
  const aliased = aliasBase(spec);
  if (!aliased && !spec.startsWith(".")) return null;
  const base = aliased ?? resolve(dirname(fromFile), spec);
  const noJs = base.replace(/\.(js|mjs|jsx)$/, "");
  const cands = [base, noJs + ".ts", noJs + ".tsx", noJs + ".mts", join(base, "index.ts"), join(base, "index.tsx"), join(noJs, "index.ts")];
  for (const c of cands) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

function featureOf(file) {
  const rel = relative(featRoot, file);
  if (rel.startsWith("..")) return null;
  return rel.split("/")[0];
}

const files = walk(srcRoot, []);
const edges = new Map(); // "a->b" => [{from,to,line,type}]
for (const f of files) {
  const fa = featureOf(f);
  if (!fa) continue;
  const text = readFileSync(f, "utf8");
  const found = [];
  for (const m of text.matchAll(IMPORT_RE)) found.push({ spec: m[5], type: typeOnlyClause(m[2], m[3], m[4].trim()), idx: m.index });
  for (const m of text.matchAll(SIDE_RE)) found.push({ spec: m[2], type: false, idx: m.index });
  for (const m of text.matchAll(DYN_RE)) found.push({ spec: m[1], type: Boolean(m[3] && m[3] !== "then"), idx: m.index, dyn: true });
  for (const s of found) {
    const target = resolveSpec(f, s.spec);
    if (!target) continue;
    const fb = featureOf(target);
    if (!fb || fb === fa) continue;
    const key = `${fa}->${fb}`;
    const line = text.slice(0, s.idx).split("\n").length + (text[s.idx] === "\n" ? 1 : 0);
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push({ from: relative(root, f), to: relative(root, target), line, type: s.type, dyn: !!s.dyn });
  }
}

const runtimeOnly = !flag("--include-type");
// --drop a->b,c->d : planning aid, simulates removing feature edges (what a stage will cut).
const dropped = new Set((opt("--drop", "") || "").split(",").filter(Boolean));
const adj = new Map();
for (const [key, list] of edges) {
  if (dropped.has(key)) continue;
  const live = runtimeOnly ? list.filter((e) => !e.type) : list;
  if (!live.length) continue;
  const [a, b] = key.split("->");
  if (!adj.has(a)) adj.set(a, new Set());
  adj.get(a).add(b);
}

// Tarjan SCC
let index = 0; const st = []; const on = new Set(); const idx = new Map(); const low = new Map(); const sccs = [];
const nodes = new Set([...adj.keys(), ...[...adj.values()].flatMap((s) => [...s])]);
function strong(v) {
  idx.set(v, index); low.set(v, index); index++; st.push(v); on.add(v);
  for (const w of adj.get(v) ?? []) {
    if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
    else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
  }
  if (low.get(v) === idx.get(v)) { const c = []; let w; do { w = st.pop(); on.delete(w); c.push(w); } while (w !== v); if (c.length > 1) sccs.push(c.sort()); }
}
for (const v of nodes) if (!idx.has(v)) strong(v);
sccs.sort((a, b) => b.length - a.length);

const pairs = [];
for (const [a, set] of adj) for (const b of set) if (a < b && adj.get(b)?.has(a)) pairs.push([a, b]);

const live = (k) => (runtimeOnly ? edges.get(k).filter((e) => !e.type) : edges.get(k));
if (flag("--json")) {
  console.log(JSON.stringify({ app, sccs, pairs, edges: Object.fromEntries([...edges].map(([k]) => [k, live(k)]).filter(([, v]) => v.length)) }, null, 1));
} else {
  console.log(`app=${app} runtimeOnly=${runtimeOnly} features-with-edges=${nodes.size} sccs=${sccs.length} sizes=[${sccs.map((s) => s.length).join(",")}] mutual-pairs=${pairs.length}`);
  sccs.forEach((s, i) => console.log(`SCC${i + 1} (${s.length}): ${s.join(" ")}`));
  console.log("mutual pairs: " + pairs.map((p) => p.join("<->")).join("  "));
  const inScc = new Map(); sccs.forEach((s, i) => s.forEach((f) => inScc.set(f, i)));
  if (flag("--edges") || flag("--all-edges")) {
    for (const [k] of [...edges].sort()) {
      const [a, b] = k.split("->"); const l = live(k);
      if (!l.length) continue;
      if (!flag("--all-edges") && !(inScc.has(a) && inScc.get(a) === inScc.get(b))) continue;
      console.log(`${k}\t${l.length}\t${l.map((e) => `${e.from}:${e.line} -> ${e.to}${e.dyn ? " (dynamic)" : ""}`).join(" | ")}`);
    }
  }
}
// --assert-no-edge a->b,... : stage gate, exit 1 if any listed feature edge still has a file edge
// (runtime, or any kind with --include-type). Prints the offending file:line so the fix is obvious.
const mustBeGone = (opt("--assert-no-edge", "") || "").split(",").filter(Boolean);
let edgeFail = false;
for (const k of mustBeGone) {
  const l = edges.has(k) ? live(k) : [];
  if (l.length) { edgeFail = true; console.error(`FAIL: edge ${k} still present: ${l.map((e) => `${e.from}:${e.line}`).join(", ")}`); }
}
if (edgeFail) process.exit(1);
const maxScc = opt("--max-scc", null); const maxPairs = opt("--max-pairs", null);
const largest = sccs[0]?.length ?? 0;
if (maxScc !== null && largest > Number(maxScc)) { console.error(`FAIL: largest feature SCC ${largest} > ${maxScc}`); process.exit(1); }
if (maxPairs !== null && pairs.length > Number(maxPairs)) { console.error(`FAIL: mutual pairs ${pairs.length} > ${maxPairs}`); process.exit(1); }
