// Parse eslint JSON (complexity + sonarjs/cognitive-complexity) → TSV rows.
// Usage: node parse-complexity.mjs <repoLabel> <repoRoot> <eslint.json> <outCyclomatic.tsv> <outCognitive.tsv>
import fs from "node:fs"; import path from "node:path";
const [label, root, input, outCyc, outCog] = process.argv.slice(2);
const res = JSON.parse(fs.readFileSync(input, "utf8"));
const cyc = [], cog = []; const other = {}; let parseErrors = [];
for (const f of res) {
  const rel = path.relative(root, f.filePath);
  for (const m of f.messages) {
    if (m.ruleId === "complexity") {
      const mm = /^(.*?) has a complexity of (\d+)/.exec(m.message);
      cyc.push([label, rel, (mm?.[1] ?? "?").replace(/\t/g, " "), m.line, Number(mm?.[2] ?? 0)]);
    } else if (m.ruleId === "sonarjs/cognitive-complexity") {
      const mm = /from (\d+) to the 10/.exec(m.message);
      cog.push([label, rel, m.line, Number(mm?.[1] ?? 0)]);
    } else if (!m.ruleId) parseErrors.push(`${rel}:${m.line} ${m.message}`);
    else other[m.ruleId] = (other[m.ruleId] ?? 0) + 1;
  }
}
cyc.sort((a, b) => b[4] - a[4]); cog.sort((a, b) => b[3] - a[3]);
const w = (p, h, rows, append) => fs[append ? "appendFileSync" : "writeFileSync"](p, (append ? "" : h + "\n") + rows.map((r) => r.join("\t")).join("\n") + (rows.length ? "\n" : ""));
const append = process.env.APPEND === "1";
w(outCyc, "repo\tfile\tfunction\tline\tcomplexity", cyc, append);
w(outCog, "repo\tfile\tline\tcognitive", cog, append);
const n = (t) => cyc.filter((r) => r[4] > t).length;
console.log(JSON.stringify({ label, filesLinted: res.length, cyclomatic_gt10: n(10), gt15: n(15), gt25: n(25), max: cyc[0]?.[4], cognitive_gt10: cog.length, cog_gt25: cog.filter(r=>r[3]>25).length, parseErrors: parseErrors.length, otherRules: other }));
if (parseErrors.length) fs.writeFileSync(input.replace(/\.json$/, "-parse-errors.txt"), parseErrors.join("\n") + "\n");
