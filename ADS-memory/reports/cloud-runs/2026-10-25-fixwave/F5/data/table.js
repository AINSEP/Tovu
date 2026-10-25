// Per-file before -> after table for agent-plugins (before = ap-before + ap-before2, after = ap-after).
const load = n => { try { return require('/root/stryker/reports/' + n + '.json').files; } catch { return {}; } };
const score = v => { const c = { K: 0, S: 0, N: 0 }; for (const m of v.mutants) { if (m.status === 'Killed' || m.status === 'Timeout') c.K++; else if (m.status === 'Survived') c.S++; else if (m.status === 'NoCoverage') c.N++; } const d = c.K + c.S + c.N; return { d, ...c, p: d ? 100 * c.K / d : NaN }; };
const before = { ...load('ap-before'), ...load('ap-before2') };
// memo-line files appear in both before reports with different ranges: merge mutants
for (const [f, v] of Object.entries(load('ap-before'))) if (load('ap-before2')[f]) before[f] = { mutants: [...v.mutants, ...load('ap-before2')[f].mutants] };
const after = load('ap-after');
let tb = { d: 0, K: 0 }, ta = { d: 0, K: 0 };
console.log('| file (mutated range) | mutants | before score (surv) | after score (surv) |\n|---|---|---|---|');
for (const f of Object.keys(after).sort()) {
  const a = score(after[f]); const b = before[f] ? score(before[f]) : null;
  tb.d += b ? b.d : 0; tb.K += b ? b.K : 0; ta.d += a.d; ta.K += a.K;
  console.log(`| ${f} | ${a.d} | ${b ? b.p.toFixed(2) + ' % (' + (b.S + b.N) + ')' : 'n/a'} | **${a.p.toFixed(2)} %** (${a.S + a.N}) |`);
}
console.log(`| **all** | ${ta.d} | ${(100 * tb.K / tb.d).toFixed(2)} % | **${(100 * ta.K / ta.d).toFixed(2)} %** |`);
