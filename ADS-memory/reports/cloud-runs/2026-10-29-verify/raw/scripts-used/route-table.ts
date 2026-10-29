import { loadRouteCoverage, pct } from "/home/user/Tovu/development/scripts/route-coverage-lib.ts";
import { writeFileSync } from "node:fs";
const rows = loadRouteCoverage(process.argv[2]).map(f => ({
  file: f.file, lines: pct(f.lh, f.lf), branches: pct(f.brh, f.brf), funcs: pct(f.fnh, f.fnf), uncoveredLines: f.lf - f.lh, lf: f.lf, lh: f.lh, brf: f.brf, brh: f.brh, fnf: f.fnf, fnh: f.fnh }));
writeFileSync(process.argv[3], JSON.stringify(rows, null, 1));
const s = (k: "lf"|"lh"|"brf"|"brh"|"fnf"|"fnh") => rows.reduce((a, r) => a + r[k], 0);
console.log(JSON.stringify({ files: rows.length, lines: pct(s("lh"), s("lf")), branches: pct(s("brh"), s("brf")), funcs: pct(s("fnh"), s("fnf")), uncoveredLines: s("lf") - s("lh") }));
