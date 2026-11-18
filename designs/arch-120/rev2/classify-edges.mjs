// Evidence generator for REVISION-2 (plan tooling, never a gate). Joins three outputs of the repo's
// OWN commands, one row per `NEW cross-feature edge` line:
//   1. `npm run check:architecture`                                  -> the edge list
//   2. `npx depcruise --config .dependency-cruiser.mjs apps/website/src --output-type json`
//      (the second half of `npm run check:boundaries`, JSON instead of text) -> kind + rule verdicts
//   3. development/boundaries/feature-ranks.json                     -> rank direction
// Fails closed: exit 1 if an edge line is missing from the depcruise graph, if the gate output
// holds no summary line, or if any input is empty.
//   node classify-edges.mjs <check-architecture.txt> <depcruise.json> <feature-ranks.json> <repo-root>
import fs from "node:fs";
import path from "node:path";

const [archPath, dcPath, ranksPath, root] = process.argv.slice(2);
if (!root) { console.error("usage: classify-edges.mjs <arch.txt> <dc.json> <ranks.json> <repo-root>"); process.exit(2); }
const arch = fs.readFileSync(archPath, "utf8");
if (!/cross-feature import edges \(all-import\)\s+\d+/.test(arch)) { console.error("gate output has no summary line"); process.exit(1); }
const edges = [...arch.matchAll(/NEW cross-feature edge: (\S+) -> (\S+)/g)].map(m => ({ src: m[1], tgt: m[2] }));
const dc = JSON.parse(fs.readFileSync(dcPath, "utf8"));
const ranks = JSON.parse(fs.readFileSync(ranksPath, "utf8"));
const bySource = new Map(dc.modules.map(m => [m.source, m]));
const feature = f => f.split("/")[4];
const stem = f => f.replace(/^apps\/website\/src\//, "").replace(/\.tsx?$/, "");

/** Imported names: the import/export-from statements of `src` whose specifier ends with the target stem. */
function names(src, tgt) {
  const text = fs.readFileSync(path.join(root, src), "utf8");
  const t = stem(tgt), tNoIndex = t.replace(/\/index$/, "");
  const out = [];
  for (const m of text.matchAll(/(?:import|export)\s+(type\s+)?(\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)\.(\w+)/g)) {
    const spec = (m[3] ?? m[4]).replace(/\.js$/, "");
    const abs = spec.startsWith("#src/") ? spec.slice(5) : spec.startsWith(".") ? path.posix.join(path.posix.dirname(stem(src)), spec) : null;
    if (abs !== t && abs !== tNoIndex) continue;
    const list = m[5] ? `type ${m[5]}` : m[2].replace(/[{}\s]+/g, " ").trim();
    out.push((m[1] ? "type " : "") + list);
  }
  return out.join("; ").replace(/\s*,\s*/g, ", ") || "?";
}

let missing = 0, id = 0;
console.log(["id", "kind", "rank", "dir", "door", "rules", "class", "names", "source", "target"].join("\t"));
for (const { src, tgt } of edges) {
  const dep = bySource.get(src)?.dependencies.find(d => d.resolved === tgt);
  if (!dep) { console.error(`not in depcruise graph: ${src} -> ${tgt}`); missing++; continue; }
  const type = dep.dependencyTypes.includes("type-only") || dep.dependencyTypes.includes("type-import");
  const [a, b] = [feature(src), feature(tgt)];
  if (!(a in ranks) || !(b in ranks)) { console.error(`unranked feature: ${a} or ${b}`); process.exit(1); }
  const dir = ranks[a] > ranks[b] ? "down" : ranks[a] === ranks[b] ? "same" : "UP";
  const rules = (dep.rules ?? []).map(r => `${r.name}:${r.severity}`).join(",") || "-";
  const door = tgt.endsWith("/index.ts") ? "index" : rules.includes("no-deep-imports") ? "DEEP" : "file";
  const cls = dir !== "down" ? (type ? "TANGLE-type-up" : "TANGLE-value-up") : rules.includes("no-deep-imports") ? "TANGLE-deep" : "LEGITIMATE";
  id++;
  console.log([`N${String(id).padStart(3, "0")}`, type ? "type" : "value", `${a}(${ranks[a]})->${b}(${ranks[b]})`, dir, door, rules, cls, names(src, tgt), src.replace("apps/website/src/features/", ""), tgt.replace("apps/website/src/features/", "")].join("\t"));
}
if (!edges.length || missing) { console.error(`edges=${edges.length} missing=${missing}`); process.exit(1); }
