// Builds coverage.tsv + coverage-totals.json from coverage-all-files.json reports (one per repo, produced by
// Tovu's own development/scripts/coverage-all-files.ts, which counts never-loaded files at 0% via AST estimates)
// and optional vitest json-summary files (for the statements metric; LCOV has no statements, so for
// node:test-only files statements = lines). Usage:
//   node build-coverage-table.mjs <outDir> <repo>=<repoRoot>=<coverage-all-files.json>[=<summaryGlobDir>] ...
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
const [outDir, ...specs] = process.argv.slice(2);
const pct = m => (m.total ? (m.covered * 100) / m.total : 100);
const rows = [];
function findSummaries(dir) {
  const out = [];
  if (!dir || !existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...findSummaries(p));
    else if (e === 'coverage-summary.json') out.push(p);
  }
  return out;
}
function area(repo, file) {
  const parts = file.split('/');
  if (repo === 'Jini') return parts[0] === 'packages' ? `packages/${parts[1]}` : parts[0];
  if (parts[0] === 'apps' || parts[0] === 'packages') return `${parts[0]}/${parts[1]}`;
  if (parts[0] === 'content') return `content/${parts[1]}`;
  if (parts[0] === 'development') return `development/${parts[1]}`;
  return parts[0];
}
for (const spec of specs) {
  const [repo, root, reportFile, summaryDir] = spec.split('=');
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  const stmts = new Map();
  for (const s of findSummaries(summaryDir)) {
    const j = JSON.parse(readFileSync(s, 'utf8'));
    for (const [k, v] of Object.entries(j)) if (k !== 'total') {
      const rel = path.relative(root, k);
      const prev = stmts.get(rel);
      if (!prev || v.statements.covered > prev.covered) stmts.set(rel, v.statements);
    }
  }
  for (const r of report.files) {
    const s = stmts.get(r.file);
    const statements = s ? { covered: s.covered, total: s.total } : { covered: r.lines.covered, total: r.lines.total };
    const m = { lines: r.lines, branches: r.branches, functions: r.functions, statements };
    const p = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, pct(v)]));
    const zero = r.status === 'NEVER-LOADED' || (r.lines.total > 0 && r.lines.covered === 0);
    rows.push({ repo, area: area(repo, r.file), file: r.file, status: r.status, ...p, m, statementsSource: s ? 'vitest' : 'lines',
      below99: Object.values(p).some(x => x < 99) ? 'yes' : 'no', zero: zero ? 'yes' : 'no' });
  }
}
rows.sort((a, b) => a.repo.localeCompare(b.repo) || a.file.localeCompare(b.file));
const f = x => x.toFixed(2);
writeFileSync(path.join(outDir, 'coverage.tsv'), ['repo\tarea\tfile\tstatus\tlines%\tbranches%\tfunctions%\tstatements%\tbelow99\tzero_coverage\tuncovered_lines\tstatements_source',
  ...rows.map(r => [r.repo, r.area, r.file, r.status, f(r.lines), f(r.branches), f(r.functions), f(r.statements), r.below99, r.zero, r.m.lines.total - r.m.lines.covered, r.statementsSource].join('\t'))].join('\n') + '\n');
const totals = {};
for (const r of rows) {
  for (const key of [`${r.repo} (all)`, `${r.repo}: ${r.area}`]) {
    const t = totals[key] ??= { files: 0, at99_all4: 0, below99: 0, zero_coverage: 0, never_loaded: 0, lines: [0, 0], branches: [0, 0], functions: [0, 0], statements: [0, 0] };
    t.files++; if (r.below99 === 'yes') t.below99++; else t.at99_all4++;
    if (r.zero === 'yes') t.zero_coverage++; if (r.status === 'NEVER-LOADED') t.never_loaded++;
    for (const k of ['lines', 'branches', 'functions', 'statements']) { t[k][0] += r.m[k].covered; t[k][1] += r.m[k].total; }
  }
}
for (const t of Object.values(totals)) for (const k of ['lines', 'branches', 'functions', 'statements']) t[k] = `${t[k][0]}/${t[k][1]} (${t[k][1] ? f(t[k][0] * 100 / t[k][1]) : '100.00'}%)`;
writeFileSync(path.join(outDir, 'coverage-totals.json'), JSON.stringify(totals, null, 2) + '\n');
console.log(Object.entries(totals).filter(([k]) => k.endsWith('(all)')).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n'));
