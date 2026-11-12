// jscpd JSON → duplication.tsv + per-repo duplicated-line totals (line ranges unioned per file).
import fs from "node:fs";
const D = "/home/user/Tovu/development/cloud/quality-1111/static";
const j = JSON.parse(fs.readFileSync(`${D}/raw/jscpd/jscpd-report.json`, "utf8"));
const repo = (n) => n.split("/")[0].toLowerCase(); const rel = (n) => n.split("/").slice(1).join("/");
const rows = j.duplicates.map((d) => {
  const a = d.firstFile, b = d.secondFile; const ra = repo(a.name), rb = repo(b.name);
  const kind = ra === rb ? `${ra}-${ra}` : "tovu-jini";
  return [kind, d.format, d.lines, d.tokens, ra, rel(a.name), a.startLoc.line, a.endLoc.line, rb, rel(b.name), b.startLoc.line, b.endLoc.line];
}).sort((x, y) => y[2] - x[2] || y[3] - x[3]);
fs.writeFileSync(`${D}/duplication.tsv`, "kind\tformat\tlines\ttokens\trepo_a\tfile_a\tstart_a\tend_a\trepo_b\tfile_b\tstart_b\tend_b\n" + rows.map((r) => r.join("\t")).join("\n") + "\n");
const lineSets = { tovu: new Map(), jini: new Map() };
for (const d of j.duplicates) for (const f of [d.firstFile, d.secondFile]) {
  const r = repo(f.name); const m = lineSets[r]; const s = m.get(f.name) ?? new Set();
  for (let l = f.startLoc.line; l <= f.endLoc.line; l++) s.add(l); m.set(f.name, s);
}
const totalLines = { tovu: 0, jini: 0 };
for (const r of ["tovu", "jini"]) { const list = fs.readFileSync(`${D}/raw/files-${r}.txt`, "utf8").split("\n").filter(Boolean);
  const base = r === "tovu" ? "/home/user/Tovu/" : "/home/user/Jini/";
  for (const f of list) totalLines[r] += fs.readFileSync(base + f, "utf8").split("\n").length; }
const kinds = {}; for (const r of rows) { const k = (kinds[r[0]] ??= { clones: 0, lines: 0 }); k.clones++; k.lines += r[2]; }
const out = { overall: j.statistics.total, byKind: kinds };
for (const r of ["tovu", "jini"]) { const dup = [...lineSets[r].values()].reduce((a, s) => a + s.size, 0);
  out[r] = { prodLines: totalLines[r], duplicatedLinesUnion: dup, pct: +(100 * dup / totalLines[r]).toFixed(2), filesWithClones: lineSets[r].size }; }
// files by duplicated lines
const byFile = [...Object.entries(lineSets)].flatMap(([r, m]) => [...m].map(([f, s]) => [r, rel(f), s.size])).sort((a, b) => b[2] - a[2]);
fs.writeFileSync(`${D}/raw/duplication-by-file.tsv`, "repo\tfile\tduplicated_lines\n" + byFile.map((x) => x.join("\t")).join("\n") + "\n");
fs.writeFileSync(`${D}/raw/duplication-summary.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out));
