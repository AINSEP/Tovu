// usage: node score.js report.json [filter-substring]
const r = require(process.argv[2]); const f = process.argv[3] || '';
const rows = [];
for (const [file, v] of Object.entries(r.files)) {
  if (!file.includes(f)) continue;
  const c = { Killed: 0, Timeout: 0, Survived: 0, NoCoverage: 0 };
  for (const m of v.mutants) if (m.status in c) c[m.status]++;
  const k = c.Killed + c.Timeout, d = k + c.Survived + c.NoCoverage;
  rows.push([file, d, k, c.Survived, c.NoCoverage, d ? (100 * k / d).toFixed(2) : 'n/a']);
}
for (const row of rows) console.log(row.join('\t'));
if (process.argv[4] === 'survivors') for (const [file, v] of Object.entries(r.files)) { if (!file.includes(f)) continue; for (const m of v.mutants) if (m.status === 'Survived' || m.status === 'NoCoverage') console.log(file + ':' + m.location.start.line + ':' + m.location.start.column, m.status, m.mutatorName, '->', (m.replacement || '').replace(/\s+/g, ' ').slice(0, 90)); }
