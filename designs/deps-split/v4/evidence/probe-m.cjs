// Probe: apply M1-M3 exactly as the sheets say, in a scratch worktree. node probe-m.cjs <repo> <rest.json>
const fs = require('fs'); const path = require('path'); const [REPO, rF] = process.argv.slice(2); const R = JSON.parse(fs.readFileSync(rF, 'utf8'));
const DIR = path.join(REPO, 'apps/website/src/server/runtime/composition'); const depsF = path.join(DIR, 'deps.ts');
let lines = fs.readFileSync(depsF, 'utf8').split('\n'); const tip = lines.slice();
const rel = (spec) => spec.startsWith('.') ? (spec.startsWith('./') ? '../' + spec.slice(2) : '../' + spec) : spec;
const del = new Set(); const files = {}; const depsImports = [];
for (const m of R.M) {
  const byspec = new Map(); for (const r of m.imports) { const k = rel(r.spec); (byspec.get(k) || byspec.set(k, []).get(k)).push((r.type ? 'type ' : '') + r.n); }
  for (const t of m.top) { const k = `./${R.M.find((x) => x.id === t.from).name}.js`; (byspec.get(k) || byspec.set(k, []).get(k)).push((t.n === 'CreateSiteRouteDepsOverrides' ? 'type ' : '') + t.n); }
  const types = m.decls.filter((d) => /Interface|TypeAlias/.test(d.kind)).map((d) => d.n);
  let out = [...byspec].map(([k, ns]) => `import { ${[...new Set(ns)].join(', ')} } from "${k}";`);
  for (const d of [...m.decls].sort((a, b) => a.a - b.a)) { const txt = tip.slice(d.a - 1, d.b); const exp = m.stillUsed.includes(d.n) || d.exported; if (exp && !/^export /.test(tip[d.start - 1])) { txt[d.start - d.a] = 'export ' + txt[d.start - d.a]; } out.push('', ...txt); for (let i = d.a; i <= d.b; i++) del.add(i); }
  files[m.name] = out.join('\n') + '\n';
  depsImports.push(`import { ${m.stillUsed.map((n) => (types.includes(n) ? 'type ' : '') + n).join(', ')} } from "./site-deps/${m.name}.js";`);
  for (const r of m.imports) if (!r.alsoOutside) { // delete the specifier from deps.ts's import
    const re = new RegExp(`(\\{[^}]*?)\\b(type\\s+)?${r.n}\\b\\s*,?\\s*`); const i = tip.findIndex((l) => l.startsWith('import ') && re.test(l) && l.includes(`"${r.spec}"`)); if (i < 0) { console.error('import line not found', r.n, r.spec); continue; }
    lines[i] = lines[i].replace(re, '$1'); if (/import (type )?\{\s*\} from/.test(lines[i])) lines[i] = ''; }
}
lines = lines.map((l, i) => del.has(i + 1) ? null : l).filter((l) => l !== null);
const lastRel = lines.reduce((acc, l, i) => (l.startsWith('import ') && / from "\.\//.test(l) ? i : acc), -1);
lines.splice(lastRel + 1, 0, ...depsImports);
fs.writeFileSync(depsF, lines.join('\n')); fs.mkdirSync(path.join(DIR, 'site-deps'), { recursive: true });
for (const [n, t] of Object.entries(files)) fs.writeFileSync(path.join(DIR, 'site-deps', n + '.ts'), t);
// importers
const t1 = path.join(DIR, '__tests__/deps-observability-wiring.integration.test.ts'); let s = fs.readFileSync(t1, 'utf8');
s = s.replace('import { createSiteRouteDeps, type CreateSiteRouteDepsOverrides } from "#src/server/runtime/composition/deps";', 'import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";\nimport type { CreateSiteRouteDepsOverrides } from "#src/server/runtime/composition/site-deps/overrides";'); fs.writeFileSync(t1, s);
const t2 = path.join(DIR, '__tests__/deps-provider-plugin-boot.integration.test.ts'); s = fs.readFileSync(t2, 'utf8');
s = s.replace('import { createSiteRouteDeps, siteIdentityFor } from "#src/server/runtime/composition/deps";', 'import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";\nimport { siteIdentityFor } from "#src/server/runtime/composition/site-deps/provider-identity";'); fs.writeFileSync(t2, s);
console.log('applied', Object.keys(files));
