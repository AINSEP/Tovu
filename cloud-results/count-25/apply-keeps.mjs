// Usage: node apply-keeps.mjs <planned.json> <rules.json> <outdir>  -> prints planner/true/rules, writes true-left.txt, matched-by-keep.txt
import fs from 'node:fs'; import path from 'node:path';
const [pl, rj, out] = process.argv.slice(2);
const planned = JSON.parse(fs.readFileSync(pl, 'utf8')).filter((x) => x.area !== 'theme' && x.area !== 'adm-themes');
const rules = JSON.parse(fs.readFileSync(rj, 'utf8')).map((r) => new RegExp(r.src));
const left = [], kept = [];
for (const x of planned) (rules.some((re) => re.test(x.f)) ? kept : left).push(x);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'true-left.txt'), left.map((x) => x.f + '\t' + x.area).sort().join('\n') + '\n');
fs.writeFileSync(path.join(out, 'kept-by-rules.txt'), kept.map((x) => x.f + '\t' + x.area).sort().join('\n') + '\n');
const by = {}; for (const x of left) by[x.area] = (by[x.area] || 0) + 1;
fs.writeFileSync(path.join(out, 'areas.txt'), Object.entries(by).sort((a, b) => b[1] - a[1]).map(([a, n]) => n + '\t' + a).join('\n') + '\n');
console.log(`planner=${planned.length} true=${left.length} rules=${rules.length}`);
