// Consumer inventory for a move: who imports which names from a file. Reads a dump made WITH tests
// (`edges.mjs … --tests`), so test files, type pins and fixtures are listed too (lesson 2).
// Usage: node importers.mjs <edges.json> <target file, or a unique path suffix> [name ...]
// With names: only imports of those names (plus `*` and dynamic imports, which can reach any name).
import fs from 'node:fs';
const [inFile, target, ...names] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const isTest = (f) => /(^|\/)__tests__\/|\.(test|spec|typecheck)\.[cm]?tsx?$/.test(f);
const rows = d.edges.filter((e) => e.to.endsWith(target)).map((e) => ({ ...e, hit: e.names.filter((n) => !names.length || names.includes(n.name) || n.name === '*' || n.name.startsWith('(')) })).filter((e) => e.hit.length);
const byFile = new Map();
for (const e of rows) byFile.set(e.from, [...(byFile.get(e.from) ?? []), `:${e.line} ${e.form === 'export-from' ? 're-exports' : e.form === 'dynamic-import' ? 'import()' : e.kind} {${e.hit.map((n) => n.name).join(', ')}}`]);
const out = [...byFile].sort(([a], [b]) => Number(isTest(a)) - Number(isTest(b)) || a.localeCompare(b));
console.log(`${target}${names.length ? ' {' + names.join(', ') + '}' : ''}: ${out.filter(([f]) => !isTest(f)).length} production files, ${out.filter(([f]) => isTest(f)).length} test files`);
for (const [f, sites] of out) console.log(`  ${isTest(f) ? 'test' : 'prod'}  ${f.replace(d.srcRel + '/', '')}  ${sites.join(' ; ')}`);
