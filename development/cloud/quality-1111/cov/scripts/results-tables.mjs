// Prints the Markdown tables RESULTS.md embeds (top-50 lists + per-area totals) from the .tsv/.json outputs.
// Usage: node results-tables.mjs <covDir>  > tables.md
import { readFileSync } from 'node:fs';
import path from 'node:path';
const dir = process.argv[2];
const tsv = f => { const [h, ...r] = readFileSync(path.join(dir, f), 'utf8').trim().split('\n').map(l => l.split('\t')); return r.map(x => Object.fromEntries(h.map((k, i) => [k, x[i]]))); };
const md = (cols, rows) => [`| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${cols.map(c => String(r[c] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`)].join('\n');
const out = [];
// coverage per area
const totals = JSON.parse(readFileSync(path.join(dir, 'coverage-totals.json'), 'utf8'));
out.push('### Coverage totals per app/package\n', md(['area', 'files', 'at99_all4', 'below99', 'zero_coverage', 'never_loaded', 'lines', 'branches', 'functions', 'statements'],
  Object.entries(totals).map(([area, t]) => ({ area, ...t }))));
const cov = tsv('coverage.tsv');
const below = cov.filter(r => r.below99 === 'yes').sort((a, b) => Number(b.uncovered_lines) - Number(a.uncovered_lines));
out.push(`\n### Top 50 files below 99% (by uncovered lines; full list: coverage.tsv, ${below.length} rows with below99=yes)\n`, md(['repo', 'file', 'status', 'lines%', 'branches%', 'functions%', 'statements%', 'uncovered_lines'], below.slice(0, 50)));
const zero = cov.filter(r => r.zero_coverage === 'yes').sort((a, b) => Number(b.uncovered_lines) - Number(a.uncovered_lines));
out.push(`\n### Top 50 zero-coverage files (full list: coverage.tsv zero_coverage=yes, ${zero.length} rows)\n`, md(['repo', 'file', 'status', 'uncovered_lines'], zero.slice(0, 50)));
// failures
const fails = tsv('failures.tsv');
const fc = {}; for (const f of fails) { const k = `${f.repo} / ${f.class} / ${f.basis}`; fc[k] = (fc[k] || 0) + 1; }
out.push(`\n### Failure totals (${fails.length})\n`, md(['repo / class / basis', 'count'], Object.entries(fc).sort().map(([k, v]) => ({ 'repo / class / basis': k, count: v }))));
const order = { PRODUCT: 0, 'TEST DRIFT': 1, ENV: 2 };
const fs = [...fails].sort((a, b) => order[a.class] - order[b.class] || a.file.localeCompare(b.file));
out.push(`\n### Failures, top 50 (PRODUCT and TEST DRIFT first; full list: failures.tsv)\n`, md(['repo', 'file', 'test', 'class', 'basis', 'error'], fs.slice(0, 50).map(f => ({ ...f, test: f.test.slice(0, 100), error: f.error.slice(0, 220) }))));
// test quality
const tq = tsv('test-quality.tsv');
const cols = ['tests', 'no_assert', 'weak_only', 'snapshot_only', 'indirect', 'mocks_uut', 'skip', 'only', 'todo'];
const tot = {}; for (const r of tq) { tot[r.repo] ??= { repo: r.repo, files: 0 }; tot[r.repo].files++; for (const c of cols) tot[r.repo][c] = (tot[r.repo][c] || 0) + Number(r[c] || 0); }
out.push('\n### Test-quality totals\n', md(['repo', 'files', ...cols], Object.values(tot)));
const worst = tq.map(r => ({ ...r, flagged: Number(r.no_assert) + Number(r.weak_only) + Number(r.snapshot_only) + Number(r.mocks_uut) + Number(r.skip) + Number(r.only) + Number(r.todo) })).filter(r => r.flagged > 0).sort((a, b) => b.flagged - a.flagged);
out.push(`\n### Test files with the most flagged tests, top 50 (${worst.length} files flagged; full list: test-quality.tsv)\n`, md(['repo', 'file', 'tests', 'no_assert', 'weak_only', 'snapshot_only', 'skip', 'todo', 'flagged'], worst.slice(0, 50)));
const ts = tsv('test-safety-all.tsv');
out.push(`\n### Message-less assert calls (full-tree run of the check:test-safety lint config), top 50 of ${ts.length} files\n`, md(['file', 'messageless_asserts'], ts.slice(0, 50)));
console.log(out.join('\n'));
