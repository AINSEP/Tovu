// Jini package-level graph. Reads the dump of `edges.mjs --packages packages --scope @jini-ai/`, so a package edge is
// "runtime" exactly when the compiler keeps the import statement (verbatimModuleSyntax keeps `import { type T } from "@jini-ai/x"`
// as `import {} from "@jini-ai/x"`, which still loads the package).  Usage: node jini-pkgs.mjs <jini-edges.json>
import fs from 'node:fs';
import { scc } from './graph-lib.mjs';
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const edges = new Map(); // "a>b" -> { runtime, runtimeEmpty, type }
for (const e of d.scoped) {
  const from = e.from.split('/')[1]; const to = /^@jini-ai\/([^/]+)/.exec(e.spec)?.[1];
  if (!to || to === from) continue;
  const r = edges.get(from + '>' + to) ?? { runtime: 0, runtimeEmpty: 0, type: 0 }; edges.set(from + '>' + to, r);
  if (e.kind !== 'runtime') r.type++; else if (e.empty || e.unused) r.runtimeEmpty++; else r.runtime++;
}
const views = [['runtime (statements the compiler keeps)', (r) => r.runtime + r.runtimeEmpty > 0], ['runtime, value-using statements only', (r) => r.runtime > 0], ['all (types included)', () => true]];
for (const [label, keep] of views) {
  const adj = new Map(); const nodes = new Set();
  for (const [k, r] of edges) if (keep(r)) { const [a, b] = k.split('>'); nodes.add(a); nodes.add(b); if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); }
  const comps = scc([...nodes], adj).filter((c) => c.length > 1);
  console.log(`${label}: package edges ${[...edges.values()].filter(keep).length}, SCCs ${comps.length}`, comps.map((c) => c.sort().join(' ')).join(' | '));
}
const onlyEmpty = [...edges].filter(([, r]) => r.runtime === 0 && r.runtimeEmpty > 0).map(([k, r]) => `${k} x${r.runtimeEmpty}`);
console.log('package edges that exist at runtime ONLY through empty/unused imports:', onlyEmpty.length, onlyEmpty.join(', '));
