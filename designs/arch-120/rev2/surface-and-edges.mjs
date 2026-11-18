// Evidence generator for REVISION-2 (plan tooling, never a gate). Reads the JSON of the exact
// dependency-cruiser command `check-architecture.ts` runs (`cruise()`, --no-config) and prints,
// with the gate's own `moduleOf()` / `isTestFile()` rules, either
//   edges   : every cross-feature file edge  "<src> -> <tgt>\t<type|value>"
//   surface : every exposed private file     "<file>\t<first importer from another module>"
// It prints the two totals on stderr; they must equal the gate's printed numbers, or the run is void.
//   node surface-and-edges.mjs <edges|surface> <raw-depcruise.json>
import fs from "node:fs";
const [mode, file] = process.argv.slice(2);
const SRC = "apps/website/src";
const isTest = f => /__tests__|\.test\.|\.spec\./.test(f);
const moduleOf = f => { if (!f.startsWith(`${SRC}/`)) return null; const p = f.slice(SRC.length + 1).split("/"); if (p.length < 2) return null; return p[0] === "features" && p.length > 2 ? `features/${p[1]}` : p[0]; };
const { modules } = JSON.parse(fs.readFileSync(file, "utf8"));
if (!modules?.length) { console.error("empty depcruise output"); process.exit(1); }
const edges = new Map(), exposed = new Map();
for (const m of modules) {
  if (!m.source.startsWith(`${SRC}/`) || isTest(m.source)) continue;
  for (const d of m.dependencies) {
    const t = d.resolved;
    if (!t.startsWith(`${SRC}/`) || isTest(t) || t === m.source) continue;
    const a = moduleOf(m.source), b = moduleOf(t);
    const type = d.dependencyTypes.includes("type-only") || d.dependencyTypes.includes("type-import");
    if (a?.startsWith("features/") && b?.startsWith("features/") && a !== b) {
      const k = `${m.source} -> ${t}`; edges.set(k, edges.get(k) === "value" || !type ? "value" : "type");
    }
    if (a && b && a !== b && t !== `${SRC}/${b}/index.ts` && !exposed.has(t)) exposed.set(t, m.source);
  }
}
console.error(`cross-feature edges=${edges.size} api-surface=${exposed.size}`);
const rows = mode === "edges" ? [...edges].map(([k, v]) => `${k}\t${v}`) : [...exposed].map(([k, v]) => `${k}\t${v}`);
console.log(rows.sort().join("\n"));
