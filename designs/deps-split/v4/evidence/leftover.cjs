// Design-time: deps.ts imports with no use after R that no sheet's import table deletes ("move" rows).
// node leftover.cjs <B-census.json> <rest.json> <r-imports.json> <helpers.txt...>  (writes leftover-imports.json)
const fs = require('fs'); const [bF, rF, iF, ...helpers] = process.argv.slice(2);
const B = JSON.parse(fs.readFileSync(bF, 'utf8')), R = JSON.parse(fs.readFileSync(rF, 'utf8')), I = JSON.parse(fs.readFileSync(iF, 'utf8'));
const moved = new Set(); B.forEach((c) => c.range && c.imports.forEach((i) => !i.alsoOutside && moved.add(i.n)));
[...R.M, ...R.H, ...R.L].forEach((x) => x.imports.forEach((i) => !i.alsoOutside && moved.add(i.n)));
for (const h of helpers) { const t = fs.readFileSync(h, 'utf8'); JSON.parse(t.slice(0, t.indexOf('\n# '))).rows.forEach((r) => !r.alsoOutside && moved.add(r.n)); }
moved.delete('warnOnOrphanedChatRows'); // H1 keeps its user in deps.ts
const left = I.depsUnused.filter((x) => !moved.has(x.n) && !x.usedByPhases && x.n !== 'warnOnOrphanedChatRows');
fs.writeFileSync('leftover-imports.json', JSON.stringify(left, null, 1)); console.log(left.length);
